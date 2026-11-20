// The one API address of the live channel: a ticket to open (or re-aim) a
// socket. Signed in like every other call; the boards, customers, tasks and
// sprints a page wants to follow are checked here, under the person's own
// rights (row-level security), and only those that pass go into the ticket.
// The socket itself then needs no database and no cookie: the ticket says
// which company and which person, for one minute.
import { Hono } from 'hono';
import { z } from 'zod';
import { run, type AppEnv } from '../context';
import { body } from '../lib/validate';
import { MAX_SCOPES, SCOPE_RE, TICKET_MS, signTicket, type Ticket } from './protocol';

export const liveRoutes = new Hono<AppEnv>();

const TABLE = { b: 'boards', a: 'accounts', t: 'tasks', p: 'sprints' } as const;

/**
 * A ticket for the live channel, for what the person asks to follow and may see now (checked under row security).
 * Previewing as someone else or support access does not count as being there.
 */
liveRoutes.post('/live/ticket', async (c) => {
  const auth = c.get('auth');
  const org = c.get('org');
  const input = await body(c, z.object({ w: z.array(z.string().regex(SCOPE_RE)).max(MAX_SCOPES).default([]) }));
  const asked = [...new Set(input.w)];
  const { seen, head } = await run(c, async (q) => {
    const seen = new Set<string>();
    for (const p of ['b', 'a', 't', 'p'] as const) {
      const ids = asked.filter((s) => s[0] === p).map((s) => s.slice(2));
      if (!ids.length) continue;
      const rows = await q.query<{ id: string }>(`select id from ${TABLE[p]} where id = any($1::uuid[])`, [ids]);
      for (const r of rows) seen.add(`${p}:${r.id}`);
    }
    const [h] = await q.query<{ seq: string }>('select seq from live_seq where org_id = app_org()');
    return { seen, head: h ? Number(h.seq) : 0 };
  });
  // Seeing through someone else's eyes (an administrator's preview, support with consent) is not being there.
  const quiet = !!c.get('previewBy') || !!c.get('supportBy');
  const t: Ticket = {
    o: org.id,
    s: org.slug,
    u: auth.userId,
    w: asked.filter((s) => seen.has(s)),
    e: Date.now() + TICKET_MS,
    ...(quiet ? { q: 1 as const } : {}),
  };
  c.header('cache-control', 'no-store');
  return c.json({ k: await signTicket(c.get('deps').config.authSecret, t), n: head, w: t.w });
});
