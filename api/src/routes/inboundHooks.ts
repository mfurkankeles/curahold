// Incoming webhooks, the screens' side: Settings → Data sources → Incoming webhooks. One hook per company and source:
// its address and secret, how the sender signs, what a delivery becomes and the mapping, a test screen and the log.
// People with connections.manage only. The receiver itself (POST /api/inbound/hooks/:id) is mounted before sign-in;
// the hook id in the address names it, the signature or token proves the sender.
import type { BoardsRow, InboundHooksRow } from '../db/rows.gen';
import { Hono } from 'hono';
import { z } from 'zod';
import { HOOK_RECIPES, HOOK_SCHEMES, HOOK_TARGETS, pathsOf, render, type HookDelivery, type HookMapping, type InboundHook } from '../../../shared/src/inboundHooks';
import { nowOf, requirePerm, run, secretsKey, todayOf, type AppEnv, type C } from '../context';
import type { Row } from '../db';
import { audit } from '../lib/audit';
import { randomToken, seal } from '../lib/crypto';
import { fail } from '../lib/errors';
import { hookSecretOf, MAX_HOOK_BODY, receive, type HookRow } from '../lib/inboundHooks';
import { iso } from '../lib/mappers';
import { body, param } from '../lib/validate';

export const inboundHookRoutes = new Hono<AppEnv>();
/** Mounted before sign-in. */
export const inboundHookReceiverRoutes = new Hono<AppEnv>();

const COLS = 'id, org_id, name, source, auth, salt, target, mapping, enabled, created_by, created_at, updated_at, last_delivery_at';
const tpl = z.string().max(500);
const authSchema = z
  .object({
    scheme: z.enum(HOOK_SCHEMES),
    header: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,60}$/).optional(),
    algo: z.enum(['sha256', 'sha1']).optional(),
    encoding: z.enum(['hex', 'base64']).optional(),
    prefix: z.string().max(20).optional(),
    field: z.string().regex(/^[\w$.[\]-]{1,100}$/).optional(),
    eventId: tpl.optional(),
    timestamp: tpl.optional(),
    maxAgeSec: z.number().int().min(30).max(7 * 86400).optional(),
    senderSecret: z.boolean().optional(),
  })
  .strict();
const mappingSchema = z
  .object({
    when: z.object({ value: tpl, equals: z.string().max(500) }).nullable().optional(),
    externalId: tpl.optional(),
    customer: z.object({ email: tpl.optional(), domain: tpl.optional(), name: tpl.optional(), id: tpl.optional() }).strict().optional(),
    boardId: z.string().uuid().optional(),
    title: tpl.optional(),
    description: z.string().max(2000).optional(),
    due: tpl.optional(),
    status: tpl.optional(),
    doneWords: z.string().max(300).optional(),
    assigneeEmail: tpl.optional(),
    subject: tpl.optional(),
    priority: tpl.optional(),
    requester: tpl.optional(),
    url: tpl.optional(),
    kind: z.enum(['note', 'call', 'meeting', 'email']).optional(),
    body: z.string().max(2000).optional(),
    happenedAt: tpl.optional(),
    minutes: tpl.optional(),
    durationUnit: z.enum(['minutes', 'seconds']).optional(),
    dealId: tpl.optional(),
    dealName: tpl.optional(),
  })
  .strict();

const hookUrl = (c: C, id: string) => `${new URL(c.req.url).origin}/api/inbound/hooks/${id}`;

async function toHook(c: C, r: Row, counts: { ok: number; failed: number; skipped: number }, sealedSet: boolean): Promise<InboundHook> {
  return {
    id: r.id,
    name: r.name,
    source: r.source,
    target: r.target,
    auth: r.auth ?? { scheme: 'curahold' },
    mapping: r.mapping ?? {},
    enabled: r.enabled,
    url: hookUrl(c, r.id),
    secret: r.auth?.senderSecret ? null : await hookSecretOf(c.get('deps'), r.org_id, r.id, r.salt),
    senderSecretSet: sealedSet,
    createdAt: iso(r.created_at)!,
    lastDeliveryAt: iso(r.last_delivery_at),
    counts,
  };
}

/** Whether each hook's own sender secret is set: the sealed column is read with owner access, only as a yes or no. */
async function sealedSet(c: C, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await c.get('deps').db.system((q) => q.query<{ id: string }>('select id from inbound_hooks where org_id = $1 and id = any($2::uuid[]) and sealed is not null', [c.get('org').id, ids]));
  return new Set(rows.map((r) => r.id));
}

/**
 * The company's incoming webhooks and the ready-made recipes (target, auth, field mapping, sample). Needs connections.manage.
 */
inboundHookRoutes.get('/inbound-hooks', async (c) => {
  requirePerm(c, 'connections.manage');
  const { rows, counts } = await run(c, async (q) => ({
    rows: await q.query(`select ${COLS} from inbound_hooks order by created_at`),
    counts: await q.query<{ hook_id: string; status: string; n: number }>(`select hook_id, status, count(*)::int as n from inbound_deliveries where received_at > now() - interval '7 days' group by hook_id, status`),
  }));
  const set = await sealedSet(c, rows.map((r) => r.id));
  const countOf = (id: string) => ({ ok: 0, failed: 0, skipped: 0, ...Object.fromEntries(counts.filter((x) => x.hook_id === id && x.status !== 'rejected').map((x) => [x.status, x.n])) }) as InboundHook['counts'];
  const failedOf = (id: string) => counts.filter((x) => x.hook_id === id && x.status === 'rejected').reduce((a, x) => a + x.n, 0);
  const hooks = await Promise.all(rows.map(async (r) => {
    const h = await toHook(c, r, countOf(r.id), set.has(r.id));
    h.counts.failed += failedOf(r.id);
    return h;
  }));
  return c.json({ hooks, recipes: HOOK_RECIPES.map((r) => ({ key: r.key, target: r.target, auth: r.auth, mapping: r.mapping, sample: r.sample })) });
});

/**
 * Creates an incoming webhook from a recipe; a task target needs a board the person can see. Needs connections.manage;
 * audited. Its secret is shown only in this response (201).
 */
inboundHookRoutes.post('/inbound-hooks', async (c) => {
  requirePerm(c, 'connections.manage');
  const input = await body(
    c,
    z
      .object({
        name: z.string().trim().min(1).max(120),
        recipe: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,39}$/).default('custom'),
        target: z.enum(HOOK_TARGETS).optional(),
        auth: authSchema.optional(),
        mapping: mappingSchema.optional(),
        senderSecret: z.string().trim().min(8).max(500).optional(),
      })
      .strict(),
  );
  const recipe = HOOK_RECIPES.find((r) => r.key === input.recipe) ?? HOOK_RECIPES.find((r) => r.key === 'custom')!;
  const auth = input.auth ?? recipe.auth;
  const mapping: HookMapping = input.mapping ?? recipe.mapping;
  const target = input.target ?? recipe.target;
  if (target === 'task' && !mapping.boardId) fail('validation', { fields: 'mapping.boardId' }, { fields: ['mapping.boardId'] });
  const org = c.get('org');
  const auth0 = c.get('auth');
  const deps = c.get('deps');
  const sealed = input.senderSecret ? await seal({ secret: input.senderSecret }, secretsKey(deps.config)) : null;
  const row = await run(c, async (q) => {
    if (mapping.boardId) {
      const [b] = await q.query<Pick<BoardsRow, 'id'>>('select id from boards where id = $1 and archived_at is null', [mapping.boardId]);
      if (!b) fail('validation', { fields: 'mapping.boardId' }, { fields: ['mapping.boardId'] });
    }
    const [r] = await q.query(
      `insert into inbound_hooks (org_id, name, source, auth, salt, target, mapping, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8) returning ${COLS}`,
      [org.id, input.name, recipe.key, JSON.stringify(auth), randomToken(18), target, JSON.stringify(mapping), auth0.userId],
    );
    await audit(q, { orgId: org.id, actorId: auth0.userId, action: 'inbound_hook.created', entity: 'org', entityId: org.id, meta: { hook: r.id, recipe: recipe.key, target } });
    return r;
  });
  if (sealed) await deps.db.system((q) => q.query('update inbound_hooks set sealed = $3 where id = $1 and org_id = $2', [row.id, org.id, sealed]));
  return c.json({ hook: await toHook(c, row, { ok: 0, failed: 0, skipped: 0 }, !!sealed) }, 201);
});

/** Changes an incoming webhook's mapping, target or on/off state. Needs connections.manage. */
inboundHookRoutes.patch('/inbound-hooks/:id', async (c) => {
  requirePerm(c, 'connections.manage');
  const id = param(c, 'id');
  const input = await body(
    c,
    z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        enabled: z.boolean().optional(),
        target: z.enum(HOOK_TARGETS).optional(),
        auth: authSchema.optional(),
        mapping: mappingSchema.optional(),
        senderSecret: z.string().trim().min(8).max(500).optional(),
        /** A new secret from Curahold (the old one stops at once). */
        rotate: z.boolean().optional(),
      })
      .strict(),
  );
  const org = c.get('org');
  const actor = c.get('auth');
  const deps = c.get('deps');
  const row = await run(c, async (q) => {
    const [had] = await q.query(`select ${COLS} from inbound_hooks where id = $1`, [id]);
    if (!had) fail('not_found');
    const mapping = input.mapping ?? had.mapping;
    if ((input.target ?? had.target) === 'task' && !mapping?.boardId) fail('validation', { fields: 'mapping.boardId' }, { fields: ['mapping.boardId'] });
    if (input.mapping?.boardId) {
      const [b] = await q.query<Pick<BoardsRow, 'id'>>('select id from boards where id = $1 and archived_at is null', [input.mapping.boardId]);
      if (!b) fail('validation', { fields: 'mapping.boardId' }, { fields: ['mapping.boardId'] });
    }
    const [r] = await q.query(
      `update inbound_hooks set name = coalesce($2, name), enabled = coalesce($3, enabled), target = coalesce($4, target), auth = coalesce($5::jsonb, auth), mapping = coalesce($6::jsonb, mapping),
              salt = case when $7::boolean then $8 else salt end, updated_at = now() where id = $1 returning ${COLS}`,
      [id, input.name ?? null, input.enabled ?? null, input.target ?? null, input.auth ? JSON.stringify(input.auth) : null, input.mapping ? JSON.stringify(input.mapping) : null, !!input.rotate, randomToken(18)],
    );
    await audit(q, { orgId: org.id, actorId: actor.userId, action: input.rotate ? 'inbound_hook.rotated' : 'inbound_hook.updated', entity: 'org', entityId: org.id, meta: { hook: id } });
    return r;
  });
  if (input.senderSecret) await deps.db.system(async (q) => q.query('update inbound_hooks set sealed = $3 where id = $1 and org_id = $2', [id, org.id, await seal({ secret: input.senderSecret }, secretsKey(deps.config))]));
  const set = await sealedSet(c, [id]);
  return c.json({ hook: await toHook(c, row, { ok: 0, failed: 0, skipped: 0 }, set.has(id)) });
});

/** Removes an incoming webhook; its address stops working. Needs connections.manage; audited. */
inboundHookRoutes.delete('/inbound-hooks/:id', async (c) => {
  requirePerm(c, 'connections.manage');
  const id = param(c, 'id');
  const org = c.get('org');
  const actor = c.get('auth');
  await run(c, async (q) => {
    const gone = await q.query<Pick<InboundHooksRow, 'id'>>('delete from inbound_hooks where id = $1 returning id', [id]);
    if (!gone.length) fail('not_found');
    await audit(q, { orgId: org.id, actorId: actor.userId, action: 'inbound_hook.deleted', entity: 'org', entityId: org.id, meta: { hook: id } });
  });
  return c.json({ ok: true });
});

/** An incoming webhook's recent deliveries with their outcome, for debugging. Needs connections.manage. */
inboundHookRoutes.get('/inbound-hooks/:id/deliveries', async (c) => {
  requirePerm(c, 'connections.manage');
  const id = param(c, 'id');
  const rows = await run(c, async (q) => {
    const [h] = await q.query<Pick<InboundHooksRow, 'id'>>('select id from inbound_hooks where id = $1', [id]);
    if (!h) fail('not_found');
    return q.query('select id, received_at, event_id, status, test, error, result, payload from inbound_deliveries where hook_id = $1 order by received_at desc limit 100', [id]);
  });
  const deliveries: HookDelivery[] = rows.map((r) => ({ id: r.id, receivedAt: iso(r.received_at)!, eventId: r.event_id ?? null, status: r.status, test: r.test, error: r.error ?? null, result: r.result ?? null, payload: r.payload ?? null }));
  return c.json({ deliveries });
});

/**
 * The test screen: with `dryRun`, what the mapping makes of a sample (nothing written); without, the sample goes
 * through the receiver as a test delivery (written for real, marked "test" in the log), skipping the signature.
 */
inboundHookRoutes.post('/inbound-hooks/:id/test', async (c) => {
  requirePerm(c, 'connections.manage');
  const id = param(c, 'id');
  const input = await body(c, z.object({ payload: z.unknown(), dryRun: z.boolean().optional() }).strict());
  const raw = JSON.stringify(input.payload ?? null);
  if (raw.length > MAX_HOOK_BODY) fail('validation', { fields: 'payload' }, { fields: ['payload'] });
  const deps = c.get('deps');
  const org = c.get('org');
  const [hook] = await deps.db.system((q) => q.query<HookRow>(`select ${COLS}, sealed from inbound_hooks where id = $1 and org_id = $2`, [id, org.id]));
  if (!hook) fail('not_found');
  if (input.dryRun) {
    const m = hook!.mapping ?? {};
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(m)) {
      if (typeof v === 'string' && k !== 'boardId' && k !== 'kind' && k !== 'doneWords' && k !== 'durationUnit') fields[k] = render(v, input.payload);
      else if (k === 'customer' && v) for (const [ck, cv] of Object.entries(v as Record<string, string>)) fields[`customer.${ck}`] = render(cv, input.payload);
      else if (k === 'when' && v) fields.when = `${render((v as any).value, input.payload)} ∈ {${(v as any).equals}}`;
    }
    return c.json({ preview: fields, paths: pathsOf(input.payload), eventId: render(hook!.auth?.eventId, input.payload) || null });
  }
  const out = await receive(deps, hook!, { raw, headers: () => undefined, query: () => undefined, now: nowOf(deps) }, todayOf(c), { test: true });
  return c.json(out);
});

// ------------------------------------------------------------------ the receiver

inboundHookReceiverRoutes.post('/inbound/hooks/:id', async (c) => {
  const id = c.req.param('id') ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return c.json({ error: 'not_found' }, 404);
  if (Number(c.req.header('content-length') ?? 0) > MAX_HOOK_BODY) return c.json({ error: 'too_large' }, 413);
  const deps = c.get('deps');
  const org = c.get('org');
  // Owner access anchored to the company of the address: the sealed sender secret is not readable otherwise.
  const [hook] = await deps.db.system((q) => q.query<HookRow>(`select ${COLS}, sealed from inbound_hooks where id = $1 and org_id = $2`, [id, org.id]));
  if (!hook) return c.json({ error: 'not_found' }, 404);
  const raw = await c.req.text();
  if (raw.length > MAX_HOOK_BODY) return c.json({ error: 'too_large' }, 413);
  const out = await receive(deps, hook, { raw, headers: (n) => c.req.header(n), query: (n) => c.req.query(n), now: nowOf(deps) }, todayOf(c));
  return c.json({ ok: out.http < 300, status: out.status, ...(out.error ? { error: out.error } : {}), ...(out.result ? { result: out.result } : {}) }, out.http as 200);
});
