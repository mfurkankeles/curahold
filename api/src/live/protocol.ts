// The live channel's words, shared by both hosts (Cloudflare Durable Object and
// the Node server) and the browser. The channel carries no data: only "change
// number N touched tasks on board X", and who is looking at what (person ids).
// The data itself always comes through the API, with that API's own checks.

/** A change as the database numbered it (db/migrations/0060_live.sql). */
export interface Change {
  seq: number;
  kind: LiveKind;
  boards: string[];
  accounts: string[];
  users: string[];
}
export type LiveKind = 'tasks' | 'records' | 'accounts' | 'unread';

/**
 * What a connection may hear about, checked by the API when the ticket was
 * signed: `b:` boards and `a:` customers (their change signals), `t:` tasks,
 * `a:` customers and `p:` sprints (who is looking at them).
 */
export type Scope = `${'b' | 'a' | 't' | 'p'}:${string}`;
export const SCOPE_RE = /^[batp]:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_SCOPES = 24;

/** Signed by the API for one person in one company, for a minute. */
export interface Ticket {
  /** company id */
  o: string;
  /** company address (slug): the host the socket opens on must be this company's */
  s: string;
  /** person id */
  u: string;
  /** scopes, checked under the person's own rights */
  w: string[];
  /** expires (ms since epoch) */
  e: number;
  /** quiet: someone looking through another's eyes (preview, support) is not shown as present */
  q?: 1;
}

export const TICKET_MS = 60_000;

/** Where a page asks for its ticket. A POST, but it changes nothing: it only reads what the
 * person may follow. So the read-only ways in (an administrator's preview, a support visit
 * that may only look) let it through, and the ticket comes out quiet. */
export const TICKET_PATH = '/api/live/ticket';
/** Whether a request asks for a live ticket. */
export const asksForTicket = (method: string, path: string) => method === 'POST' && path === TICKET_PATH;

// ------------------------------------------------------------- messages

/** Browser → server. */
export type ClientMessage =
  /** New scopes (a page opened or closed): a fresh ticket for the same person and company. */
  | { t: 'w'; k: string }
  /** Here: looking at `on` (a t:/a:/p: scope, or null for nowhere), typing or not. */
  | { t: 'h'; on: string | null; y: 0 | 1 };

/** Server → browser. */
export type ServerMessage =
  /** Connected (or re-watched); the company is at change number n. */
  | { t: 'hi'; n: number }
  /** Changes f+1 … n. k: kinds this person should look at; b/a: their watched boards and customers among them. */
  | { t: 'c'; f: number; n: number; k?: LiveKind[]; b?: string[]; a?: string[] }
  /** Too far behind to replay one by one: reload what is shown. */
  | { t: 'reset'; n: number }
  /** Who is at `on` now: [person id, typing 0/1]. */
  | { t: 'p'; on: string; who: [string, 0 | 1][] };

/** Close codes a client acts on. */
export const CLOSE = {
  /** Ticket missing, wrong, for another company, or expired: get a new one. */
  ticket: 4401,
  /** The message could not be read. */
  bad: 4400,
  /** The server is going away: come back after a moment. */
  restart: 4503,
} as const;

export const PING = 'ping';
export const PONG = 'pong';
/** Largest message a browser may send (a ticket with every scope fits easily). */
export const MAX_IN = 4096;

// -------------------------------------------------------------- tickets

const enc = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

function key(secret: string) {
  let k = keys.get(secret);
  if (!k) {
    // A key of its own, derived from the server secret, so a ticket can never stand in for anything else that secret signs.
    k = crypto.subtle
      .importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      .then((base) => crypto.subtle.sign('HMAC', base, enc.encode('curahold live ticket v1')))
      .then((raw) => crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
    keys.set(secret, k);
  }
  return k;
}

const b64u = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** Signs a live ticket (company, person, what they may follow, expiry) for the socket to present. */
export async function signTicket(secret: string, t: Ticket): Promise<string> {
  const body = b64u(enc.encode(JSON.stringify(t)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(body)));
  return `${body}.${b64u(sig)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The ticket, if it is ours, whole and not expired; null otherwise. */
export async function readTicket(secret: string, raw: string | null | undefined, now = Date.now()): Promise<Ticket | null> {
  if (!raw || raw.length > 3000) return null;
  const dot = raw.indexOf('.');
  if (dot < 1) return null;
  const body = raw.slice(0, dot);
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(secret), unb64u(raw.slice(dot + 1)), enc.encode(body));
    if (!ok) return null;
    const t = JSON.parse(new TextDecoder().decode(unb64u(body))) as Ticket;
    if (typeof t.e !== 'number' || t.e < now) return null;
    if (!UUID.test(t.o) || !UUID.test(t.u) || typeof t.s !== 'string' || !Array.isArray(t.w)) return null;
    if (t.w.length > MAX_SCOPES || t.w.some((s) => typeof s !== 'string' || !SCOPE_RE.test(s))) return null;
    return t;
  } catch {
    return null;
  }
}
