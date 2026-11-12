// Support tickets from any tool that is not connected directly: sent with an
// API key (PUT /api/tickets/{source}/{id}) or posted to the company's inbound
// webhook address (POST /api/inbound/tickets/{token}). The same ticket sent
// again is updated, not duplicated. Each one is filed under the customer it
// belongs to — by id, web address, the requester's email domain or name —
// and is then like any other support ticket: on the customer page and
// timeline, in rollups and in the health score.
import { Hono } from 'hono';
import { z } from 'zod';
import { ticketPriorityOf, ticketStatusOf } from '../../../shared/src/records';
import type { AccountField } from '../../../shared/src/model';
import { nowOf, requirePerm, requireWriter, run, type AppEnv, type C } from '../context';
import type { Q, Row } from '../db';
import { audit } from '../lib/audit';
import { randomToken, sha256Hex } from '../lib/crypto';
import { fail } from '../lib/errors';
import { recomputeRollups } from '../lib/records';
import { uuid } from '../lib/validate';
import { createRecordType } from './records';

export const ticketRoutes = new Hono<AppEnv>();
/** Mounted before sign-in: the token in the address is the credential. */
export const inboundRoutes = new Hono<AppEnv>();

const when = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));
export const ticketInput = z.object({
  subject: z.string().trim().min(1).max(300),
  status: z.string().trim().max(60).optional(),
  priority: z.string().trim().max(60).optional(),
  openedAt: when.optional(),
  solvedAt: when.nullable().optional(),
  requester: z.string().trim().toLowerCase().email().max(254).optional(),
  channel: z.string().trim().max(60).optional(),
  url: z.string().trim().url().max(500).refine((u) => /^https:\/\//i.test(u)).optional(),
  account: z
    .object({
      id: uuid.optional(),
      domain: z.string().trim().max(253).optional(),
      name: z.string().trim().max(200).optional(),
    })
    .optional(),
});
type TicketInput = z.infer<typeof ticketInput>;
const sourceKey = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const externalKey = z.string().regex(/^[A-Za-z0-9._:-]{1,120}$/);

const hostOf = (v: string) =>
  v
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/:?#].*$/, '');
const PUBLIC_MAIL = /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|aol|proton|protonmail|yandex|mail|gmx)\./;

/** The customer a ticket belongs to: by id, then web address, then the requester's domain, then exact name. */
async function customerFor(q: Q, orgId: string, input: TicketInput): Promise<string | null> {
  const a = input.account ?? {};
  if (a.id) {
    const [hit] = await q.query('select id from accounts where id = $1 and org_id = $2 and archived_at is null', [a.id, orgId]);
    return hit?.id ?? null;
  }
  const [org] = await q.query('select account_fields from orgs where id = $1', [orgId]);
  const urlKeys = ((org?.account_fields ?? []) as AccountField[]).filter((f) => f.type === 'url').map((f) => f.key);
  const domains = [a.domain ? hostOf(a.domain) : null, input.requester ? input.requester.split('@')[1] : null].filter((d): d is string => !!d && !PUBLIC_MAIL.test(d));
  if (domains.length && urlKeys.length) {
    const [hit] = await q.query(
      `select a.id from accounts a where a.org_id = $1 and a.archived_at is null
          and exists (select 1 from jsonb_each_text(a.fields) f where f.key = any ($2::text[])
                       and lower(regexp_replace(regexp_replace(f.value, '^https?://(www\\.)?', '', 'i'), '[/:?#].*$', '')) = any ($3::text[]))
        order by a.created_at limit 1`,
      [orgId, urlKeys, domains],
    );
    if (hit) return hit.id;
  }
  if (a.name) {
    const [hit] = await q.query('select id from accounts where org_id = $1 and archived_at is null and name_fold = fold_text($2) order by created_at limit 1', [orgId, a.name]);
    if (hit) return hit.id;
  }
  return null;
}

const day = (v: string | null | undefined) => (v ? new Date(v.length === 10 ? `${v}T12:00:00Z` : v).toISOString().slice(0, 10) : null);

/** Creates or updates one ticket. `q` is either the sender's own (RLS) or owner access for the webhook. */
export async function upsertTicket(q: Q, orgId: string, actorId: string | null, source: string, externalId: string, input: TicketInput, now: Date) {
  const accountId = await customerFor(q, orgId, input);
  if (!accountId) fail('validation', { fields: 'account' }, { fields: ['account'], reason: 'no_customer' });
  const [type] = await q.query(`select id from record_types where org_id = $1 and kind = 'ticket' and archived_at is null order by created_at limit 1`, [orgId]);
  const typeId = type?.id as string;
  const src = `api:${source}`;
  const [had] = await q.query('select id, account_id, fields from records where org_id = $1 and type_id = $2 and source = $3 and external_id = $4', [orgId, typeId, src, externalId]);
  // Sent again: only what was sent changes.
  const status = input.status !== undefined ? ticketStatusOf(input.status) : ((had?.fields?.status as string | undefined) ?? 'open');
  const today = now.toISOString().slice(0, 10);
  const done = status === 'solved' || status === 'closed';
  const fields: Record<string, unknown> = {
    status,
    ...(input.priority !== undefined || !had ? { priority: ticketPriorityOf(input.priority ?? 'normal') } : {}),
    ...(input.openedAt || !had ? { opened_at: day(input.openedAt) ?? today } : {}),
    solved_at: done ? (day(input.solvedAt ?? null) ?? (had?.fields?.solved_at as string | undefined) ?? today) : null,
    ...(input.requester ? { requester: input.requester } : {}),
    ...(input.channel ? { channel: input.channel } : {}),
    ...(input.url ? { url: input.url } : {}),
  };
  let row: Row;
  if (had) {
    [row] = await q.query(
      `update records set name = $2, account_id = $3, fields = fields || $4::jsonb, archived_at = null, updated_at = now() where id = $1 returning *`,
      [had.id, input.subject, accountId, JSON.stringify(fields)],
    );
    if (!row) fail('not_found');
  } else {
    [row] = await q.query(
      `insert into records (org_id, type_id, account_id, name, fields, source, external_id, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [orgId, typeId, accountId, input.subject, JSON.stringify(fields), src, externalId, actorId],
    );
  }
  const [org] = await q.query('select account_fields from orgs where id = $1', [orgId]);
  await recomputeRollups(q, orgId, org.account_fields ?? [], [accountId, had?.account_id ?? null]);
  return { id: row.id as string, accountId: accountId as string, created: !had, status };
}

/** The "Support ticket" kind, made the first time a ticket arrives. Owner access: the sender may not manage record kinds. */
async function ensureTicketType(c: C) {
  const org = c.get('org');
  await c.get('deps').db.system(async (q) => {
    const [have] = await q.query(`select id from record_types where org_id = $1 and kind = 'ticket' and archived_at is null`, [org.id]);
    if (!have) await createRecordType(q, org.id, null, { kind: 'ticket' });
  });
}

ticketRoutes.put('/tickets/:source/:externalId', async (c) => {
  requireWriter(c);
  const source = sourceKey.safeParse(c.req.param('source'));
  const externalId = externalKey.safeParse(c.req.param('externalId'));
  if (!source.success || !externalId.success) fail('validation', { fields: 'source, externalId' }, { fields: ['source', 'externalId'] });
  const parsed = ticketInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) fail('validation', { fields: parsed.error.issues.map((i) => i.path.join('.')).join(', ') }, { fields: parsed.error.issues.map((i) => i.path.join('.')) });
  await ensureTicketType(c);
  const org = c.get('org');
  const auth = c.get('auth');
  const out = await run(c, (q) => upsertTicket(q, org.id, auth.userId, source.data!, externalId.data!, parsed.data!, nowOf(c.get('deps'))));
  return c.json({ ticket: out }, out.created ? 201 : 200);
});

// ---------------------------------------------------------------- inbound webhook

const INBOUND = 'inbound';

inboundRoutes.post('/inbound/tickets/:token', async (c) => {
  const org = c.get('org');
  const deps = c.get('deps');
  const want = (org.settings as any)?.[INBOUND]?.hash as string | undefined;
  if (!want || (await sha256Hex(c.req.param('token'))) !== want) return c.json({ error: 'not_found' }, 404);
  const raw = await c.req.json().catch(() => null);
  const parsed = ticketInput.extend({ source: sourceKey, externalId: externalKey }).safeParse(raw);
  if (!parsed.success) return c.json({ error: 'validation', fields: parsed.error.issues.map((i) => i.path.join('.')) }, 400);
  await ensureTicketType(c);
  try {
    const out = await deps.db.system((q) => upsertTicket(q, org.id, null, parsed.data.source, parsed.data.externalId, parsed.data, nowOf(deps)));
    await deps.db.system((q) => q.query(`update orgs set settings = jsonb_set(settings, '{${INBOUND},lastAt}', to_jsonb(now()::text), true) where id = $1`, [org.id]));
    return c.json({ ticket: out }, out.created ? 201 : 200);
  } catch (e: any) {
    if (e?.code === 'validation') return c.json({ error: 'no_customer', message: 'No customer matches this ticket (account id, domain, requester or name).' }, 422);
    throw e;
  }
});

/** Settings → Developers: the inbound address (shown once), its last use, turning it off. */
ticketRoutes.get('/dev/inbound', async (c) => {
  requirePerm(c, 'connections.manage');
  const s = (c.get('org').settings as any)?.[INBOUND];
  return c.json({ enabled: !!s?.hash, prefix: s?.prefix ?? null, createdAt: s?.createdAt ?? null, lastAt: s?.lastAt ?? null });
});

ticketRoutes.post('/dev/inbound', async (c) => {
  requirePerm(c, 'connections.manage');
  const org = c.get('org');
  const auth = c.get('auth');
  const token = randomToken(24);
  const value = { hash: await sha256Hex(token), prefix: token.slice(0, 6), createdAt: new Date().toISOString(), lastAt: null };
  await c.get('deps').db.system(async (q) => {
    await q.query(`update orgs set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('${INBOUND}', $2::jsonb) where id = $1`, [org.id, JSON.stringify(value)]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'inbound.created', entity: 'org', entityId: org.id });
  });
  const base = new URL(c.req.url).origin;
  return c.json({ url: `${base}/api/inbound/tickets/${token}` }, 201);
});

ticketRoutes.delete('/dev/inbound', async (c) => {
  requirePerm(c, 'connections.manage');
  const org = c.get('org');
  const auth = c.get('auth');
  await c.get('deps').db.system(async (q) => {
    await q.query(`update orgs set settings = settings - '${INBOUND}' where id = $1`, [org.id]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'inbound.deleted', entity: 'org', entityId: org.id });
  });
  return c.json({ ok: true });
});
