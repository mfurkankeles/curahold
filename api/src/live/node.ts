// The live channel on a Node server (self-hosted, local development, the
// browser tests): WebSockets on the same port as the API, at /api/live, and a
// room per company that has someone connected. Postgres says when to look
// (LISTEN curahold_live, sent at commit by db/migrations/0060_live.sql).
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import postgres from 'postgres';
import { slugFromHost } from '../app';
import type { Config } from '../context';
import type { Db } from '../db';
import { CLOSE, readTicket } from './protocol';
import { LiveRoom, hostAllows, type Conn, type ConnState } from './room';
import { dbSource } from './source';
import { accept, refuse, type NodeSocket } from './ws';

export const LIVE_PATH = '/api/live';
export const NOTIFY_CHANNEL = 'curahold_live';
/** A browser says "ping" every 45 s; one silent for this long is gone. */
const SILENT_MS = 120_000;

/** Subscribe to the database's word; returns how to stop. `again` runs after a reconnect (anything may have been missed). */
export type Listen = (onOrg: (orgId: string) => void, again: () => void) => Promise<() => Promise<void>>;

/** LISTEN on its own connection, for a Postgres server (self-hosted). */
export function pgListen(url: string): Listen {
  return async (onOrg, again) => {
    const sql = postgres(url, { max: 1, prepare: false, onnotice: () => undefined, fetch_types: false });
    let first = true;
    await sql.listen(NOTIFY_CHANNEL, onOrg, () => {
      if (!first) again();
      first = false;
    });
    return () => sql.end({ timeout: 2 });
  };
}

interface Room {
  room: LiveRoom;
  conns: Set<NodeConn>;
}

class NodeConn implements Conn {
  state: ConnState | null = null;
  ws!: NodeSocket;
  send(text: string) {
    this.ws.send(text);
  }
  close(code: number, reason: string) {
    this.ws.close(code, reason);
  }
  get() {
    return this.state;
  }
  set(s: ConnState) {
    this.state = s;
  }
}

export interface LiveHub {
  /** Rooms open now and their connections (for tests and the health page). */
  size(): { rooms: number; conns: number };
  poke(orgId: string): Promise<void>;
  /** Let every connection go (as a restart does); they come back and catch up. */
  drop(): void;
  close(): Promise<void>;
}

export async function attachLive(server: Server, opts: { db: Db; config: Config; listen?: Listen }): Promise<LiveHub> {
  const { db, config } = opts;
  const source = dbSource(db);
  const rooms = new Map<string, Room>();

  const roomFor = (orgId: string): Room => {
    let r = rooms.get(orgId);
    if (!r) {
      const conns = new Set<NodeConn>();
      r = { conns, room: new LiveRoom({ orgId, secret: config.authSecret, source, conns: () => [...conns] }) };
      rooms.set(orgId, r);
    }
    return r;
  };
  const poke = async (orgId: string) => {
    await rooms.get(orgId)?.room.poke();
  };

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname !== LIVE_PATH) {
      refuse(socket, 404, 'Not Found');
      return;
    }
    const raw = url.searchParams.get('k');
    const sinceRaw = url.searchParams.get('n');
    const since = sinceRaw !== null && /^\d{1,15}$/.test(sinceRaw) ? Number(sinceRaw) : null;
    void (async () => {
      const t = await readTicket(config.authSecret, raw);
      const host = String(req.headers.host ?? '');
      const slug = config.singleTenantSlug ?? slugFromHost(host, config.baseDomain);
      const conn = new NodeConn();
      let r: Room | null = null;
      let org = '';
      const ws = accept(req, socket, head, {
        message: (text) => void r?.room.message(conn, text).catch(() => conn.close(CLOSE.bad, 'bad')),
        close: () => {
          if (!r) return;
          r.room.closed(conn);
          r.conns.delete(conn);
          if (!r.conns.size && rooms.get(org) === r) rooms.delete(org);
        },
      });
      if (!ws) return;
      conn.ws = ws;
      // The ticket names the company; the address the socket came to must be that company's.
      if (!t || !hostAllows(t, slug, !!config.devOrgHeader)) {
        ws.close(CLOSE.ticket, 'ticket');
        return;
      }
      org = t.o;
      r = roomFor(org);
      r.conns.add(conn);
      const ok = await r.room.open(conn, raw, since).catch(() => false);
      if (!ok) {
        r.conns.delete(conn);
        ws.close(CLOSE.ticket, 'ticket');
      }
    })();
  };
  server.on('upgrade', onUpgrade);

  // Connections nobody has heard from in two minutes are let go.
  const sweep = setInterval(() => {
    for (const r of rooms.values()) for (const c of r.conns) if (c.ws.quietFor() > SILENT_MS) c.close(1001, 'quiet');
  }, 30_000);
  sweep.unref();

  const stopListen = opts.listen
    ? await opts.listen(
        (orgId) => void poke(orgId).catch(() => undefined),
        () => {
          for (const id of rooms.keys()) void poke(id).catch(() => undefined);
        },
      )
    : null;

  return {
    size: () => ({ rooms: rooms.size, conns: [...rooms.values()].reduce((n, r) => n + r.conns.size, 0) }),
    poke,
    drop() {
      for (const r of rooms.values()) for (const c of r.conns) c.close(CLOSE.restart, 'restart');
    },
    async close() {
      clearInterval(sweep);
      server.off('upgrade', onUpgrade);
      for (const r of rooms.values()) for (const c of r.conns) c.close(CLOSE.restart, 'restart');
      rooms.clear();
      await stopListen?.();
    },
  };
}
