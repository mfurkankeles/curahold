// A request sent twice does its work once.
//
// The app gives every change a key of its own (the Idempotency-Key header) and sends the same key
// again when it retries: after a lost answer, on a double click, or from the queue of changes made
// without a connection. API callers may do the same.
//
// How it holds together:
//   1. The key is written by the request's first transaction (context.ts, run), in the same
//      transaction as the change itself. If the change is rolled back, so is the key, and a retry
//      simply does the work.
//   2. When the request has answered, its answer is stored on the key (rememberAnswer).
//   3. The same key arriving again finds the row and gets that first answer back (Repeated, turned
//      into a response by app.onError). Two copies arriving at the same moment: the second waits
//      for the first to finish, because both try to write the same row.
//   4. The same key on a different request is refused (repeat_mismatch): a key means one change.
//
// Keys are per person and per company, and are cleared after two days (lib/scheduler.ts).
import type { Context } from 'hono';
import type { Q } from '../db';
import { sha256Hex } from './crypto';
import { fail } from './errors';

export interface RepeatKey {
  key: string;
  method: string;
  path: string;
  hash: string;
  /** Set once this request has written the key: the work is this request's to do. */
  claimed: boolean;
}

interface Stored {
  method: string;
  path: string;
  body_hash: string;
  status: number | null;
  response: unknown;
}

/** Thrown when the key was used before: carries the first answer, if it is there yet. */
export class Repeated extends Error {
  constructor(public first: Stored) {
    super('repeated request');
  }
}

const KEY = /^[\w.:-]{8,200}$/;

/** Reads the key of a change from the request, if it carries one. */
export async function repeatKeyOf(c: Context): Promise<RepeatKey | null> {
  const key = c.req.header('idempotency-key');
  const method = c.req.method;
  if (!key || method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;
  if (!KEY.test(key)) fail('validation');
  // What was asked: the text of the request, or for an upload its size and kind (a file is not read twice).
  const type = c.req.header('content-type') ?? '';
  const asked = /multipart\/form-data/i.test(type) ? `upload:${c.req.header('content-length') ?? ''}` : await c.req.raw.clone().text();
  return { key, method, path: new URL(c.req.url).pathname + new URL(c.req.url).search, hash: await sha256Hex(asked), claimed: false };
}

/** Inside the request's first transaction: this key is ours, or it was used before. */
export async function claimRepeat(q: Q, r: RepeatKey): Promise<void> {
  // If another copy of this request is still at work, this waits here until it has finished.
  const mine = await q.query(
    `insert into idempotency_keys (org_id, user_id, key, method, path, body_hash)
     values (app_org(), app_user(), $1, $2, $3, $4) on conflict do nothing returning key`,
    [r.key, r.method, r.path, r.hash],
  );
  if (mine.length) {
    r.claimed = true;
    return;
  }
  const first = await storedAnswer(q, r.key);
  if (!first) return; // cleared in between: do the work
  if (first.method !== r.method || first.path !== r.path || first.body_hash !== r.hash) fail('repeat_mismatch');
  throw new Repeated(first);
}

/** What is kept for a key (this person's own; row-level security sees to that). */
export const storedAnswer = async (q: Q, key: string): Promise<Stored | undefined> =>
  (await q.query<Stored>(`select method, path, body_hash, status, response from idempotency_keys where key = $1`, [key]))[0];

/** After the request has answered: keep the answer for whoever sends the key again. */
export async function rememberAnswer(q: Q, r: RepeatKey, res: Response): Promise<void> {
  let body: unknown = null;
  if ((res.headers.get('content-type') ?? '').includes('application/json')) {
    const text = await res.clone().text();
    // A very long answer is not kept; the repeat is then told only that the work was done.
    if (text.length <= 200_000) body = JSON.parse(text);
  }
  await q.query(`update idempotency_keys set status = $2, response = $3::jsonb where key = $1`, [r.key, res.status, body === null ? null : JSON.stringify(body)]);
}

/**
 * The first answer again, marked as a repeat. When the two copies arrived together, the first has
 * done its work but may not have stored its answer yet: `again` looks once more, for a moment.
 */
export async function repeatedAnswer(c: Context, first: Stored, again?: () => Promise<Stored | undefined>): Promise<Response> {
  for (let i = 0; again && first.status === null && i < 40; i++) {
    await new Promise((r) => setTimeout(r, 50));
    first = (await again()) ?? first;
  }
  c.header('idempotent-replayed', 'true');
  // The first request did its work but its answer was not kept (or is not kept yet): say so.
  if (first.status === null || (first.response === null && first.status !== 204)) return c.json({ ok: true, repeated: true }, (first.status ?? 200) as any);
  if (first.status === 204) return c.body(null, 204);
  return c.json(first.response as any, first.status as any);
}
