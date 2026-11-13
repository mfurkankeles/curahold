// Taking in session recordings from the browser (rrweb), for Curahold's own
// support. The page records itself with every input masked, gzips each batch
// of events and posts it here; the support desk replays it to see what a
// person did before an error.
//
// A company never reads its own recordings, so these rows are written through
// the owner connection (deps.db.system), scoped in code to the signed-in
// person — not the tenant role, which has no grant on the replay tables at
// all. The recording is disclosed and the company can switch it off; a
// preview or a support visit is never recorded.
import { Hono } from 'hono';
import { z } from 'zod';
import { REPLAY_MAX_CHUNKS, REPLAY_MAX_CHUNK_CHARS, REPLAY_MAX_SESSIONS_PER_HOUR, REPLAY_MAX_SESSION_BYTES } from '../../../shared/src/replay';
import type { AppEnv } from '../context';
import { fail } from '../lib/errors';
import { recordsSessions } from '../lib/support';
import { body } from '../lib/validate';

export const replayRoutes = new Hono<AppEnv>();

const BASE64URL = /^[A-Za-z0-9_-]*$/;

const chunkInput = z.object({
  session: z.string().uuid(),
  seq: z.number().int().min(0).max(REPLAY_MAX_CHUNKS),
  page: z.string().max(2000).optional(),
  agent: z.string().max(300).optional(),
  error: z.boolean().optional(),
  count: z.number().int().min(1).max(10_000),
  events: z.string().max(REPLAY_MAX_CHUNK_CHARS).regex(BASE64URL),
});

/** A page without its query values or fragment: a recording keeps no secrets from the address. */
function cleanPage(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw, 'http://x');
    return (u.pathname + (u.search ? `?${[...new Set(new URLSearchParams(u.search).keys())].join('&')}` : '')).slice(0, 2000);
  } catch {
    return raw.split(/[?#]/)[0].slice(0, 2000);
  }
}

replayRoutes.post('/replay', async (c) => {
  const org = c.get('org');
  const auth = c.get('auth');
  // Off for this company, or this is support/preview looking: take it, drop it, and tell the
  // browser to stop (the header) so it is not recording something that is never kept.
  const off = () => {
    c.header('x-curahold-record', 'off');
    return c.body(null, 204);
  };
  if (!recordsSessions(org) || c.get('previewBy') || c.get('supportBy')) return off();

  const input = await body(c, chunkInput);
  const bytes = Math.floor((input.events.length * 3) / 4);
  const page = cleanPage(input.page);
  const deps = c.get('deps');

  const full = await deps.db.system(async (q) => {
    const [s] = await q.query<{ user_id: string; events: number; bytes: string }>('select user_id, events, bytes from replay_sessions where id = $1', [input.session]);
    if (s) {
      // A recording id belongs to the person who opened it; another person cannot add to it.
      if (s.user_id !== auth.userId) fail('forbidden');
      // Full: keep the recording as it stands and tell the browser to stop.
      if (Number(s.bytes) + bytes > REPLAY_MAX_SESSION_BYTES || s.events >= REPLAY_MAX_CHUNKS * 200) return true;
      await q.query(
        `update replay_sessions set last_at = now(), events = events + $2, bytes = bytes + $3,
                had_error = had_error or $4, page_last = coalesce($5, page_last) where id = $1`,
        [input.session, input.count, bytes, input.error ?? false, page],
      );
    } else {
      if (input.seq !== 0) fail('not_found');
      // Not too many recordings an hour: a loop or a runaway tab cannot fill the store.
      const [{ n }] = await q.query<{ n: number }>(`select count(*)::int as n from replay_sessions where org_id = $1 and user_id = $2 and started_at > now() - interval '1 hour'`, [org.id, auth.userId]);
      if (n >= REPLAY_MAX_SESSIONS_PER_HOUR) fail('too_many_requests');
      await q.query(
        `insert into replay_sessions (id, org_id, user_id, auth_session, page_first, page_last, events, bytes, had_error, agent)
         values ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9)`,
        [input.session, org.id, auth.userId, auth.sessionId, page, input.count, bytes, input.error ?? false, (input.agent ?? '').slice(0, 300) || null],
      );
    }
    // The events themselves. The same batch arriving twice (a retry) is written once.
    await q.query('insert into replay_chunks (session_id, org_id, seq, body) values ($1, $2, $3, $4) on conflict (session_id, seq) do nothing', [input.session, org.id, input.seq, input.events]);
    return false;
  });
  return full ? off() : c.body(null, 204);
});
