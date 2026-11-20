// The live channel on Cloudflare: one Durable Object per company, holding its
// browsers' WebSockets with the Hibernation API — an idle connection keeps the
// object asleep and costs nothing but the socket; pings are answered without
// waking it. Every decision is the shared room's (live/room.ts); this file only
// hands it sockets, their attachments and the database.
//
// Bound in wrangler.toml as LIVE (class LiveRoomDO). The Worker (worker.ts)
// checks the ticket, sends the socket to the company's object, and after
// every write says "poke" to it. The same class, under the name "platform",
// is Curahold's own console's room (live/platform.ts).
import { postgresDb } from '../db/postgres';
import { slugFromHost } from '../app';
import { deskHostOf, type Config } from '../context';
import { consolePulse } from '../lib/console';
import { PLATFORM_ROOM, PlatformRoom, type PlatformConn, type PlatformState } from './platform';
import { CLOSE, PING, PONG, readTicket } from './protocol';
import { LiveRoom, hostAllows, type Conn, type ConnState, type Source } from './room';
import { dbSource } from './source';

// ------------------------------------------------- the Workers runtime's own types (only what is used)

interface CfSocket {
  send(s: string): void;
  close(code?: number, reason?: string): void;
  accept(): void;
  serializeAttachment(v: unknown): void;
  deserializeAttachment(): unknown;
}
interface DOState {
  acceptWebSocket(ws: CfSocket, tags?: string[]): void;
  getWebSockets(tag?: string): CfSocket[];
  setWebSocketAutoResponse(pair: unknown): void;
}
export interface DONamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(req: Request | string, init?: RequestInit): Promise<Response> };
}
declare const WebSocketPair: new () => { 0: CfSocket; 1: CfSocket };
declare const WebSocketRequestResponsePair: new (request: string, response: string) => unknown;

interface LiveEnv {
  HYPERDRIVE: { connectionString: string };
  AUTH_SECRET: string;
  LIVE?: DONamespace;
  /** Curahold's own people (the console's room lets go of anyone taken off the list). */
  SUPPORT_STAFF?: string;
}

const ORG_HEADER = 'x-curahold-live-org';
/** Says the object is Curahold's console's room ("platform"), not a company's. */
const KIND_HEADER = 'x-curahold-live-kind';

/** The console's fingerprint, over a connection for one look. */
async function consoleLook(env: LiveEnv): Promise<string> {
  const db = postgresDb(env.HYPERDRIVE.connectionString, { max: 1 });
  try {
    return await consolePulse({ db });
  } finally {
    await db.close();
  }
}

/** A database connection for one look, closed after it. */
function hyperdriveSource(env: LiveEnv): Source {
  const once = async <T>(fn: (s: Source) => Promise<T>) => {
    const db = postgresDb(env.HYPERDRIVE.connectionString, { max: 1 });
    try {
      return await fn(dbSource(db));
    } finally {
      await db.close();
    }
  };
  return {
    head: (o) => once((s) => s.head(o)),
    changes: (o, after, limit) => once((s) => s.changes(o, after, limit)),
  };
}

/**
 * The Durable Object holding one company's live room on Cloudflare (ADR 0007). Uses hibernatable sockets; ping/pong
 * is answered by the runtime, so an idle socket never wakes (and bills) the object.
 */
export class LiveRoomDO {
  private room: LiveRoom | null = null;
  private readonly conns = new WeakMap<CfSocket, Conn>();
  private console_: PlatformRoom | null = null;
  private readonly consoleConns = new WeakMap<CfSocket, PlatformConn>();

  constructor(
    private readonly state: DOState,
    private readonly env: LiveEnv,
  ) {
    // "ping" → "pong" by the runtime itself: a kept-alive idle socket never wakes the object.
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  private conn(ws: CfSocket): Conn {
    let c = this.conns.get(ws);
    if (!c) {
      c = {
        send: (t) => ws.send(t),
        close: (code, reason) => ws.close(code, reason),
        get: () => (ws.deserializeAttachment() as ConnState | null) ?? null,
        set: (s) => ws.serializeAttachment(s),
      };
      this.conns.set(ws, c);
    }
    return c;
  }

  private consoleConn(ws: CfSocket): PlatformConn {
    let c = this.consoleConns.get(ws);
    if (!c) {
      c = {
        send: (t) => ws.send(t),
        close: (code, reason) => ws.close(code, reason),
        get: () => (ws.deserializeAttachment() as PlatformState | null) ?? null,
        set: (s) => ws.serializeAttachment(s),
      };
      this.consoleConns.set(ws, c);
    }
    return c;
  }

  /** Is this object the console's room? Said by the Worker; after a wake-up, by a socket's own state. */
  private isConsole(req?: Request, ws?: CfSocket): boolean {
    if (req) return req.headers.get(KIND_HEADER) === PLATFORM_ROOM;
    return (ws?.deserializeAttachment() as { p?: number } | null)?.p === 1;
  }

  private consoleRoom(): PlatformRoom {
    if (!this.console_) {
      const staff = (this.env.SUPPORT_STAFF || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      this.console_ = new PlatformRoom({
        secret: this.env.AUTH_SECRET,
        look: () => consoleLook(this.env),
        conns: () => this.state.getWebSockets().map((ws) => this.consoleConn(ws)),
        staff: () => staff,
      });
    }
    return this.console_;
  }

  /** The room, for the company this object is (named by the Worker; after a wake-up, read from a socket). */
  private roomFor(orgId: string | null): LiveRoom | null {
    if (this.room) return this.room;
    const o =
      orgId ??
      this.state
        .getWebSockets()
        .map((ws) => this.conn(ws).get()?.o)
        .find(Boolean) ??
      null;
    if (!o) return null;
    this.room = new LiveRoom({
      orgId: o,
      secret: this.env.AUTH_SECRET,
      source: hyperdriveSource(this.env),
      conns: () => this.state.getWebSockets().map((ws) => this.conn(ws)),
    });
    return this.room;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (this.isConsole(req)) {
      if (url.pathname === '/poke') {
        if (this.state.getWebSockets().length) await this.consoleRoom().poke();
        return new Response(null, { status: 204 });
      }
      const pair = new WebSocketPair();
      this.state.acceptWebSocket(pair[1]);
      await this.consoleRoom().open(this.consoleConn(pair[1]), url.searchParams.get('k'));
      return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
    }
    const orgId = req.headers.get(ORG_HEADER);
    if (url.pathname === '/poke') {
      // Nobody connected: nothing to read, nothing to send.
      if (this.state.getWebSockets().length) await this.roomFor(orgId)?.poke();
      return new Response(null, { status: 204 });
    }
    const room = this.roomFor(orgId);
    const pair = new WebSocketPair();
    const server = pair[1];
    this.state.acceptWebSocket(server);
    const n = url.searchParams.get('n');
    if (!room) server.close(CLOSE.ticket, 'ticket');
    else await room.open(this.conn(server), url.searchParams.get('k'), n !== null && /^\d{1,15}$/.test(n) ? Number(n) : null);
    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
  }

  async webSocketMessage(ws: CfSocket, msg: string | ArrayBuffer) {
    if (this.isConsole(undefined, ws)) {
      if (typeof msg !== 'string') return ws.close(CLOSE.bad, 'bad');
      return this.consoleRoom().message(this.consoleConn(ws), msg);
    }
    const room = this.roomFor(null);
    if (!room || typeof msg !== 'string') return ws.close(CLOSE.bad, 'bad');
    await room.message(this.conn(ws), msg);
  }

  async webSocketClose(ws: CfSocket, code: number) {
    if (!this.isConsole(undefined, ws)) this.roomFor(null)?.closed(this.conn(ws));
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws: CfSocket) {
    if (!this.isConsole(undefined, ws)) this.roomFor(null)?.closed(this.conn(ws));
  }
}

// ------------------------------------------------- the Worker's side

/** GET /api/live with a ticket: to the company's object, or closed at once (4401: get a new ticket). */
export async function liveUpgrade(req: Request, env: LiveEnv, config: Config): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('expected a WebSocket', { status: 426 });
  const url = new URL(req.url);
  const t = await readTicket(config.authSecret, url.searchParams.get('k'));
  const host = req.headers.get('host') ?? url.host;
  const slug = config.singleTenantSlug ?? slugFromHost(host, config.baseDomain);
  if (!env.LIVE || !t || !hostAllows(t, slug, false)) {
    const pair = new WebSocketPair();
    pair[1].accept();
    pair[1].close(CLOSE.ticket, 'ticket');
    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
  }
  const headers = new Headers(req.headers);
  headers.set(ORG_HEADER, t.o);
  return env.LIVE.get(env.LIVE.idFromName(t.o)).fetch(new Request(req.url, { headers }));
}

/**
 * GET /api/desk/live with a console ticket, on the desk host only: to the one "platform" object,
 * which checks the ticket itself. Anything else is closed at once (4401).
 */
export async function platformUpgrade(req: Request, env: LiveEnv, config: Config): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('expected a WebSocket', { status: 426 });
  const url = new URL(req.url);
  const host = (req.headers.get('host') ?? url.host).toLowerCase().split(':')[0];
  if (!env.LIVE || host !== deskHostOf(config)) {
    const pair = new WebSocketPair();
    pair[1].accept();
    pair[1].close(CLOSE.ticket, 'ticket');
    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
  }
  const headers = new Headers(req.headers);
  headers.set(KIND_HEADER, PLATFORM_ROOM);
  return env.LIVE.get(env.LIVE.idFromName(PLATFORM_ROOM)).fetch(new Request(req.url, { headers }));
}

/** After a write: the company's object looks for new changes (and sleeps on if nobody is connected); the console's object likewise. */
export function livePoker(env: LiveEnv): { poke(orgId: string): Promise<void>; platform(): Promise<void> } | undefined {
  const ns = env.LIVE;
  if (!ns) return undefined;
  return {
    async poke(orgId) {
      await ns.get(ns.idFromName(orgId)).fetch('https://live/poke', { method: 'POST', headers: { [ORG_HEADER]: orgId } });
    },
    async platform() {
      await ns.get(ns.idFromName(PLATFORM_ROOM)).fetch('https://live/poke', { method: 'POST', headers: { [KIND_HEADER]: PLATFORM_ROOM } });
    },
  };
}
