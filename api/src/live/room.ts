// One company's live room: the logic both hosts share. A Cloudflare Durable
// Object (live/do.ts) holds one room per company; the Node server (live/node.ts)
// keeps a room per company that has someone connected. Neither host decides
// anything itself: who may connect, what each connection hears, replay after a
// gap and presence are all here, and tested here (tests/live-room.test.ts).
//
// The room keeps nothing a hibernating Durable Object would lose: what each
// connection is owed lives in that connection's own state (its attachment),
// and the changes themselves are read from the database.
import { CLOSE, MAX_IN, PING, PONG, SCOPE_RE, readTicket, type Change, type ClientMessage, type LiveKind, type ServerMessage, type Ticket } from './protocol';

/** What a connection is, kept with it (a Durable Object attachment: a couple of hundred bytes). */
export interface ConnState {
  /** company */
  o: string;
  /** person */
  u: string;
  /** scopes the ticket allowed */
  w: string[];
  /** the last change number this connection has been told about */
  n: number;
  /** where the person is looking (a scope), and whether typing, since when */
  on: string | null;
  y: 0 | 1;
  ya: number;
  q?: 1;
}

export interface Conn {
  send(text: string): void;
  close(code: number, reason: string): void;
  get(): ConnState | null;
  set(s: ConnState): void;
}

/** Where the numbered changes are read from (live/source.ts: the database). */
export interface Source {
  head(orgId: string): Promise<number>;
  /** Changes after `after`, in order, at most `limit`. */
  changes(orgId: string, after: number, limit: number): Promise<Change[]>;
}

/** Longest gap replayed one change at a time; beyond it the client reloads what it shows. */
export const REPLAY_MAX = 1000;
/** Typing says so for this long after the last keystroke signal. */
export const TYPING_MS = 8000;

export interface RoomOptions {
  orgId: string;
  secret: string;
  source: Source;
  /** Every connection in this room, open or just closing. */
  conns: () => Conn[];
  now?: () => number;
}

const send = (c: Conn, m: ServerMessage) => {
  try {
    c.send(JSON.stringify(m));
  } catch {
    /* gone: its close will follow */
  }
};

/** What of these changes one connection hears: its own unread, its watched boards and customers. */
export function forConn(s: Pick<ConnState, 'u' | 'w'>, changes: Change[]): { k: LiveKind[]; b: string[]; a: string[] } {
  const k = new Set<LiveKind>();
  const b = new Set<string>();
  const a = new Set<string>();
  for (const ch of changes) {
    if (ch.kind === 'unread') {
      if (ch.users.includes(s.u)) k.add('unread');
      continue;
    }
    k.add(ch.kind);
    for (const id of ch.boards) if (s.w.includes(`b:${id}`)) b.add(id);
    for (const id of ch.accounts) if (s.w.includes(`a:${id}`)) a.add(id);
  }
  return { k: [...k], b: [...b], a: [...a] };
}

function batch(s: ConnState, from: number, to: number, changes: Change[]): ServerMessage {
  const { k, b, a } = forConn(s, changes);
  const m: ServerMessage = { t: 'c', f: from, n: to };
  if (k.length) m.k = k;
  if (b.length) m.b = b;
  if (a.length) m.a = a;
  return m;
}

export class LiveRoom {
  private chain: Promise<unknown> = Promise.resolve();
  /** The newest change number fanned out; null after a wake-up until the next look. */
  private last: number | null = null;
  private readonly now: () => number;

  constructor(private readonly o: RoomOptions) {
    this.now = o.now ?? Date.now;
  }

  /** One thing at a time: opening and fanning out never interleave. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(fn, fn);
    this.chain = p.catch(() => undefined);
    return p;
  }

  private open_(): ConnState[] {
    return this.o
      .conns()
      .map((c) => c.get())
      .filter((s): s is ConnState => !!s);
  }

  /** A ticket for this room's company, or null. */
  async ticket(raw: string | null | undefined): Promise<Ticket | null> {
    const t = await readTicket(this.o.secret, raw, this.now());
    return t && t.o === this.o.orgId ? t : null;
  }

  /**
   * A new connection, with its ticket and — after a lost connection — the last
   * number it had. It gets every change since then (or "reload" if that is too
   * far back), then "hi" with where the company stands.
   */
  open(conn: Conn, rawTicket: string | null | undefined, since: number | null): Promise<boolean> {
    return this.serial(async () => {
      const t = await this.ticket(rawTicket);
      if (!t) {
        conn.close(CLOSE.ticket, 'ticket');
        return false;
      }
      const head = await this.o.source.head(this.o.orgId);
      if (this.last === null) this.last = head;
      const state: ConnState = { o: t.o, u: t.u, w: t.w, n: head, on: null, y: 0, ya: 0, ...(t.q ? { q: 1 as const } : {}) };
      if (since !== null && Number.isSafeInteger(since) && since >= 0 && since !== head) {
        const gap = head - since;
        const rows = gap > 0 && gap <= REPLAY_MAX ? await this.o.source.changes(this.o.orgId, since, gap) : [];
        // Numbers have no gaps; fewer rows than the gap means some were cleared away.
        if (gap > 0 && rows.length === gap && rows[0].seq === since + 1) send(conn, batch(state, since, head, rows));
        else send(conn, { t: 'reset', n: head });
      }
      conn.set(state);
      send(conn, { t: 'hi', n: head });
      return true;
    });
  }

  /** "Look again": something was written in this company. Each connection hears what it has not yet heard. */
  poke(): Promise<void> {
    return this.serial(async () => {
      const states = this.open_();
      if (!states.length) {
        this.last = null;
        return;
      }
      const after = this.last ?? Math.min(...states.map((s) => s.n));
      const rows = await this.o.source.changes(this.o.orgId, after, REPLAY_MAX);
      if (!rows.length) return;
      const top = rows[rows.length - 1].seq;
      this.last = top;
      for (const c of this.o.conns()) {
        const s = c.get();
        if (!s || s.n >= top) continue;
        const mine = rows.filter((r) => r.seq > s.n);
        if (mine.length && mine[0].seq === s.n + 1) send(c, batch(s, s.n, top, mine));
        else send(c, { t: 'reset', n: top });
        c.set({ ...s, n: top });
      }
      // More waiting than one read takes: go round again.
      if (rows.length === REPLAY_MAX) void this.poke();
    });
  }

  /**
   * A message from a browser, in the order they came: a new ticket ("w") is
   * checked before the "here" sent right after it is weighed against its scopes.
   * Unknown or oversized: the connection is closed.
   */
  message(conn: Conn, text: string): Promise<void> {
    if (text === PING) {
      conn.send(PONG);
      return Promise.resolve();
    }
    return this.serial(() => this.read(conn, text));
  }

  private async read(conn: Conn, text: string): Promise<void> {
    const s = conn.get();
    if (!s) return;
    let m: ClientMessage;
    try {
      if (text.length > MAX_IN) throw new Error('large');
      m = JSON.parse(text) as ClientMessage;
    } catch {
      conn.close(CLOSE.bad, 'bad');
      return;
    }
    if (m?.t === 'w') {
      const t = await this.ticket(m.k);
      // Same company (checked by ticket()), same person: only the scopes change.
      if (!t || t.u !== s.u) {
        conn.close(CLOSE.ticket, 'ticket');
        return;
      }
      const cur = conn.get() ?? s;
      const on = cur.on && t.w.includes(cur.on) ? cur.on : null;
      conn.set({ ...cur, w: t.w, on, y: on ? cur.y : 0 });
      if (cur.on && !on) this.tellPresence(cur.on);
      return;
    }
    if (m?.t === 'h') {
      const on = typeof m.on === 'string' && SCOPE_RE.test(m.on) && !m.on.startsWith('b:') && s.w.includes(m.on) && !s.q ? m.on : null;
      const y: 0 | 1 = on && m.y === 1 ? 1 : 0;
      if (on === s.on && y === s.y) {
        if (y) conn.set({ ...s, ya: this.now() });
        return;
      }
      const before = s.on;
      conn.set({ ...s, on, y, ya: y ? this.now() : 0 });
      if (before && before !== on) this.tellPresence(before);
      if (on) this.tellPresence(on);
      return;
    }
    conn.close(CLOSE.bad, 'bad');
  }

  /** A connection went away: whoever was looking with it is no longer there. */
  closed(conn: Conn): void {
    const s = conn.get();
    if (s?.on) this.tellPresence(s.on, conn);
  }

  /** Who is at one place: told to everyone at that place. */
  who(on: string, without?: Conn): [string, 0 | 1][] {
    const now = this.now();
    const people = new Map<string, 0 | 1>();
    for (const c of this.o.conns()) {
      if (c === without) continue;
      const s = c.get();
      if (!s || s.on !== on || s.q) continue;
      const typing: 0 | 1 = s.y && now - s.ya < TYPING_MS ? 1 : 0;
      people.set(s.u, (people.get(s.u) || typing) as 0 | 1);
    }
    return [...people.entries()];
  }

  private tellPresence(on: string, without?: Conn) {
    const who = this.who(on, without);
    for (const c of this.o.conns()) {
      if (c === without) continue;
      const s = c.get();
      if (s?.on === on) send(c, { t: 'p', on, who });
    }
  }
}

/** The company a socket's host names, for the ticket to match. */
export function hostAllows(t: Ticket, hostSlug: string | null, anyHost: boolean): boolean {
  if (hostSlug) return hostSlug === t.s;
  return anyHost;
}
