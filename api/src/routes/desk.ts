// Curahold's own support desk: the queue of help requests across companies,
// one request with everything on it (the team's own notes included), an
// answer or a note, and the door incoming mail comes through.
//
// These addresses are central (no company in the host) and open only with
// the staff key; the mail door opens with its own key. Nothing here is
// reachable with a company's session, an API key or an app token.
import { Hono } from 'hono';
import { z } from 'zod';
import { HELP_STATUSES } from '../../../shared/src/help';
import type { AppEnv, C } from '../context';
import { safeEqual } from '../lib/crypto';
import { fail } from '../lib/errors';
import { addHelpMessage, takeMail } from '../lib/helpThread';
import { body } from '../lib/validate';

export const deskRoutes = new Hono<AppEnv>();

function staffOnly(c: C) {
  const key = c.get('deps').config.staffKey;
  const given = c.req.header('x-curahold-staff-key') ?? '';
  if (!key || key.length < 24 || !safeEqual(given, key)) fail('forbidden');
}
const REF = /^TW-\d{6,}$/;

/** The queue: whose turn it is decides the order. `status` narrows; `q` searches subjects and companies. */
deskRoutes.get('/requests', async (c) => {
  staffOnly(c);
  const status = c.req.query('status');
  const q = (c.req.query('q') ?? '').trim().slice(0, 100);
  if (status && !(HELP_STATUSES as readonly string[]).includes(status)) fail('validation', { fields: 'status' }, { fields: ['status'] });
  const rows = await c.get('deps').db.system((db) =>
    db.query(
      `select h.ref, h.subject, h.category, h.impact, h.status, h.created_at, h.last_message_at, h.needed_by,
              o.slug as org_slug, o.name as org_name, u.name as user_name, u.email as user_email,
              (select count(*)::int from help_messages m where m.request_id = h.id) as messages,
              (select count(*)::int from help_messages m where m.request_id = h.id and m.internal) as notes
         from help_requests h join orgs o on o.id = h.org_id left join users u on u.id = h.user_id
        where ($1::text is null or h.status = $1)
          and ($2 = '' or h.subject ilike '%' || $2 || '%' or o.name ilike '%' || $2 || '%' or h.ref = upper($2))
        order by case h.status when 'received' then 0 when 'answered' then 1 else 2 end,
                 (h.impact = 'blocking') desc nulls last, coalesce(h.last_message_at, h.created_at)
        limit 200`,
      [status ?? null, q],
    ),
  );
  return c.json({
    requests: rows.map((r) => ({
      ref: r.ref,
      subject: r.subject,
      category: r.category,
      impact: r.impact,
      status: r.status,
      createdAt: new Date(r.created_at).toISOString(),
      lastMessageAt: new Date(r.last_message_at ?? r.created_at).toISOString(),
      neededBy: r.needed_by ? new Date(r.needed_by).toISOString().slice(0, 10) : null,
      company: { slug: r.org_slug, name: r.org_name },
      from: { name: r.user_name ?? null, email: r.user_email ?? null },
      messages: r.messages,
      notes: r.notes,
    })),
  });
});

/** One request, whole: what was asked, the conversation, and the team's own notes among it. */
deskRoutes.get('/requests/:ref', async (c) => {
  staffOnly(c);
  const ref = c.req.param('ref');
  if (!REF.test(ref)) fail('not_found');
  const out = await c.get('deps').db.system(async (db) => {
    const [h] = await db.query(
      `select h.*, o.slug as org_slug, o.name as org_name, u.name as user_name, u.email as user_email
         from help_requests h join orgs o on o.id = h.org_id left join users u on u.id = h.user_id where h.ref = $1`,
      [ref],
    );
    if (!h) return null;
    const messages = await db.query(
      `select m.*, u.name as user_name from help_messages m left join users u on u.id = m.user_id where m.request_id = $1 order by m.created_at, m.id`,
      [h.id],
    );
    return { h, messages };
  });
  if (!out) fail('not_found');
  const { h, messages } = out!;
  return c.json({
    request: {
      ref: h.ref,
      subject: h.subject,
      description: h.description,
      steps: h.steps ?? null,
      pageUrl: h.page_url ?? null,
      category: h.category,
      impact: h.impact,
      status: h.status,
      createdAt: new Date(h.created_at).toISOString(),
      neededBy: h.needed_by ? new Date(h.needed_by).toISOString().slice(0, 10) : null,
      company: { slug: h.org_slug, name: h.org_name },
      from: { name: h.user_name ?? null, email: h.user_email ?? null },
      messages: messages.map((m) => ({
        id: m.id,
        author: m.author,
        name: m.author === 'support' ? m.staff : (m.user_name ?? null),
        body: m.body,
        internal: m.internal,
        via: m.via,
        createdAt: new Date(m.created_at).toISOString(),
      })),
    },
  });
});

/**
 * An answer to the company, or (internal: true) a note for the team only.
 * An answer hands the turn to the person who asked unless `status` says otherwise.
 */
deskRoutes.post('/requests/:ref/messages', async (c) => {
  staffOnly(c);
  const ref = c.req.param('ref');
  if (!REF.test(ref)) fail('not_found');
  const input = await body(
    c,
    z.object({
      body: z.string().trim().min(1).max(20000),
      staff: z.string().trim().min(2).max(200),
      internal: z.boolean().default(false),
      status: z.enum(HELP_STATUSES).optional(),
    }),
  );
  const deps = c.get('deps');
  const [h] = await deps.db.system((db) => db.query<{ id: string; org_id: string }>('select id, org_id from help_requests where ref = $1', [ref]));
  if (!h) fail('not_found');
  const msg = await addHelpMessage(deps, h.org_id, h.id, { author: 'support', staff: input.staff, body: input.body, internal: input.internal, via: 'desk', status: input.internal ? undefined : input.status });
  if (!msg) fail('not_found');
  return c.json({ message: { id: msg!.id, internal: msg!.internal, createdAt: new Date(msg!.created_at).toISOString() } }, 201);
});

/**
 * The door for incoming mail: whatever receives mail for the reply domain (the
 * email worker, or a mail server's webhook) hands each message over here.
 * Always answers 200 with what became of it, so a mail that is not for us is
 * dropped rather than retried.
 */
deskRoutes.post('/mail', async (c) => {
  const key = c.get('deps').config.support?.mailKey;
  const given = c.req.header('x-curahold-mail-key') ?? '';
  if (!key || key.length < 24 || !safeEqual(given, key)) fail('forbidden');
  const input = await body(
    c,
    z.object({
      from: z.string().trim().min(3).max(400),
      to: z.array(z.string().trim().min(3).max(400)).min(1).max(50),
      subject: z.string().max(1000).optional(),
      text: z.string().max(200_000),
      messageId: z.string().max(400).nullish(),
      inReplyTo: z.string().max(400).nullish(),
      references: z.array(z.string().max(400)).max(100).optional(),
      /** The sender's domain was checked by whoever received the mail (DMARC passed). */
      authenticated: z.boolean().optional(),
    }),
  );
  return c.json(await takeMail(c.get('deps'), input));
});
