// The platform room: Curahold's own console (desk.<domain>) hears within a
// moment that something it shows has changed — a company joined, paid, failed
// to pay or left; a help request arrived, was answered, taken or closed. Like a
// company's room (room.ts) it carries no data: only "look again", with a short
// fingerprint of what the console shows, so a console that was away knows
// whether it missed anything. What it then shows comes through the desk's own
// addresses, with the staff check each of them makes.
//
// Who may join: someone on Curahold's staff list with a desk session, and a
// desk session exists only after the authenticator step (routes/desk.ts). A
// staff key (tooling) gets no ticket. The ticket is signed with a secret of its
// own, so a company's live ticket never opens this room, nor this ticket a
// company's. A session that ends, or a person taken off the list, is let go.
//
// Who says "look": every request that may have changed what the console shows
// (touchesConsole), once it succeeded — where a company's room is told too
// (app.ts); on Cloudflare also the mail door and the hourly jobs (worker.ts).
// Both hosts share this file: the Node server (live/node.ts) and a Durable
// Object named "platform" (live/do.ts).
import { sign, verify } from '../lib/crypto';
import { CLOSE, PING, PONG, TICKET_MS } from './protocol';

/** The socket's address (on the desk host only) and where its ticket comes from. */
export const PLATFORM_PATH = '/api/desk/live';
export const PLATFORM_TICKET_PATH = '/api/desk/live/ticket';
/** The Durable Object's name; a company's object is named by its id (a UUID), so they never meet. */
export const PLATFORM_ROOM = 'platform';

/** Signed by the desk for one staff member, for a minute; `s` is when their desk session ends. */
export interface PlatformTicket {
  dl: 1;
  e: string;
  s: number;
  x: number;
}

/** What a console connection is, kept with it (a Durable Object attachment). */
export interface PlatformState {
  p: 1;
  /** who (a staff address) */
  e: string;
  /** their desk session ends (ms since epoch) */
  s: number;
  /** the fingerprint this connection was last told */
  v: string;
}

export interface PlatformConn {
  send(text: string): void;
  close(code: number, reason: string): void;
  get(): PlatformState | null;
  set(s: PlatformState): void;
}

/** Server → console. `v` is a 16-character fingerprint, never a figure. */
export type PlatformMessage = { t: 'hi'; v: string } | { t: 'c'; v: string };

const ticketSecret = (authSecret: string) => `${authSecret}:desk-live`;

export async function signPlatformTicket(authSecret: string, staff: { email: string; until: number }, now = Date.now()): Promise<string> {
  const t: PlatformTicket = { dl: 1, e: staff.email, s: staff.until, x: now + TICKET_MS };
  return sign(t, ticketSecret(authSecret));
}

/** The ticket, if it is ours, whole, not expired and for a session that has not ended; null otherwise. */
export async function readPlatformTicket(authSecret: string, raw: string | null | undefined, now = Date.now()): Promise<PlatformTicket | null> {
  if (!raw || raw.length > 1000) return null;
  const t = await verify<PlatformTicket>(raw, ticketSecret(authSecret)).catch(() => null);
  if (!t || t.dl !== 1 || typeof t.e !== 'string' || typeof t.s !== 'number' || typeof t.x !== 'number') return null;
  return t.x >= now && t.s > now ? t : null;
}

/**
 * Writes that may change what the console shows: a company signing up, its
 * billing (the provider's notifications, a plan change, a cancellation), a help
 * request and its answers (from the company, from the desk, by email through
 * the desk's mail door, or with a staff key). Signing in to the desk is not one.
 */
const CONSOLE_WRITES = /^\/api\/(signup\/|trial\/|billing(\/|$)|inbound\/billing\/|help(\/|$)|support\/requests\/|desk\/(?!sign-|live\/))/;
export const touchesConsole = (method: string, path: string): boolean => method !== 'GET' && method !== 'HEAD' && CONSOLE_WRITES.test(path);

export interface PlatformRoomOptions {
  secret: string;
  /** The console's fingerprint now (lib/console.ts consolePulse). */
  look: () => Promise<string>;
  conns: () => PlatformConn[];
  /** The staff list now: someone taken off it is let go at the next look. */
  staff?: () => string[];
  now?: () => number;
}

const send = (c: PlatformConn, m: PlatformMessage) => {
  try {
    c.send(JSON.stringify(m));
  } catch {
    /* gone: its close will follow */
  }
};

export class PlatformRoom {
  private chain: Promise<unknown> = Promise.resolve();
  /** A look that is queued and has not started yet: a poke now is covered by it. */
  private pending: Promise<void> | null = null;
  private readonly now: () => number;

  constructor(private readonly o: PlatformRoomOptions) {
    this.now = o.now ?? Date.now;
  }

  /** One thing at a time: a connection opening and a look never interleave (none can miss a change). */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(fn, fn);
    this.chain = p.catch(() => undefined);
    return p;
  }

  private listed(email: string): boolean {
    return !this.o.staff || this.o.staff().includes(email);
  }

  /** A console connects with its ticket; it is told where things stand ("hi" and the fingerprint). */
  open(conn: PlatformConn, raw: string | null | undefined): Promise<boolean> {
    return this.serial(async () => {
      const t = await readPlatformTicket(this.o.secret, raw, this.now());
      if (!t || !this.listed(t.e)) {
        conn.close(CLOSE.ticket, 'ticket');
        return false;
      }
      const v = await this.o.look();
      conn.set({ p: 1, e: t.e, s: t.s, v });
      send(conn, { t: 'hi', v });
      return true;
    });
  }

  /**
   * "Look again": something the console shows may have changed. A look that is
   * already queued covers this poke too (it reads after this write), so a burst
   * of writes costs at most two looks, not one each.
   */
  poke(): Promise<void> {
    if (this.pending) return this.pending;
    const p = this.serial(async () => {
      this.pending = null;
      await this.lookOnce();
    });
    this.pending = p;
    return p;
  }

  private async lookOnce(): Promise<void> {
    if (!this.o.conns().some((c) => c.get())) return;
    const v = await this.o.look();
    const now = this.now();
    for (const c of this.o.conns()) {
      const s = c.get();
      if (!s) continue;
      if (s.s <= now || !this.listed(s.e)) {
        c.close(CLOSE.ticket, 'session');
        continue;
      }
      if (s.v === v) continue;
      c.set({ ...s, v });
      send(c, { t: 'c', v });
    }
  }

  /** Lets go of connections whose desk session has ended (the Node server's sweep). */
  sweep(): void {
    const now = this.now();
    for (const c of this.o.conns()) {
      const s = c.get();
      if (s && (s.s <= now || !this.listed(s.e))) c.close(CLOSE.ticket, 'session');
    }
  }

  /** A console only keeps its connection open ("ping"); anything else closes it. */
  message(conn: PlatformConn, text: string): void {
    if (text === PING) conn.send(PONG);
    else conn.close(CLOSE.bad, 'bad');
  }
}
