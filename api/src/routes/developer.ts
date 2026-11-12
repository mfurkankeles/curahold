// Settings for builders: personal API keys, apps connected with OAuth
// (AI assistants among them) and the company's webhooks.
import { Hono } from 'hono';
import { z } from 'zod';
import { WEBHOOK_EVENTS, type ApiKeyInfo, type WebhookInfo } from '../../../shared/src/developer';
import { requirePerm, run, secretsKey, type AppEnv } from '../context';
import type { Row } from '../db';
import { audit } from '../lib/audit';
import { randomToken, seal } from '../lib/crypto';
import { fail } from '../lib/errors';
import { iso } from '../lib/mappers';
import { KEY_PREFIX, newSecret } from '../lib/tokens';
import { body, param } from '../lib/validate';
import { checkWebhookUrl, postWebhook } from '../lib/webhooks';

export const developerRoutes = new Hono<AppEnv>();

const toKey = (r: Row): ApiKeyInfo => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  prefix: r.prefix,
  canWrite: r.can_write,
  userId: r.user_id,
  clientId: r.client_id ?? null,
  createdAt: iso(r.created_at)!,
  lastUsedAt: iso(r.last_used_at),
  expiresAt: iso(r.kind === 'oauth' ? r.refresh_expires_at : r.expires_at),
});

/** Keys and connected apps — your own, or (for people who manage people) everyone's. */
developerRoutes.get('/dev/keys', async (c) => {
  const auth = c.get('auth');
  const all = c.req.query('scope') === 'all' && auth.perms.includes('users.manage');
  const rows = await run(c, (q) =>
    q.query(
      `select * from api_tokens where revoked_at is null and ($1 or user_id = $2)
         and (kind = 'key' or refresh_expires_at > now()) order by created_at desc limit 500`,
      [all, auth.userId],
    ),
  );
  return c.json({ keys: rows.map(toKey) });
});

developerRoutes.post('/dev/keys', async (c) => {
  if (c.get('tokenKind')) fail('forbidden'); // a key cannot make more keys
  const input = await body(c, z.object({ name: z.string().trim().min(1).max(80), canWrite: z.boolean().default(false), expiresInDays: z.number().int().min(1).max(730).nullable().default(365) }));
  const auth = c.get('auth');
  const org = c.get('org');
  if (input.canWrite && auth.seat !== 'full') fail('read_only_seat');
  const s = await newSecret(KEY_PREFIX);
  const row = await run(c, async (q) => {
    const [r] = await q.query(
      `insert into api_tokens (org_id, user_id, kind, name, token_hash, can_write, prefix, expires_at)
       values ($1, $2, 'key', $3, $4, $5, $6, case when $7::int is null then null else now() + make_interval(days => $7::int) end) returning *`,
      [org.id, auth.userId, input.name, s.hash, input.canWrite, s.shown, input.expiresInDays],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'api_key.created', entity: 'api_key', entityId: r.id, meta: { name: input.name, write: input.canWrite } });
    return r;
  });
  // The only time the key is shown.
  return c.json({ key: toKey(row), token: s.token }, 201);
});

developerRoutes.delete('/dev/keys/:id', async (c) => {
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  await run(c, async (q) => {
    const r = await q.query('update api_tokens set revoked_at = now() where id = $1 and revoked_at is null returning id, name', [id]);
    if (!r.length) fail('not_found');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'api_key.revoked', entity: 'api_key', entityId: id, meta: { name: r[0].name } });
  });
  return c.json({ ok: true });
});

// ----------------------------------------------------------------- webhooks

const toHook = (r: Row): WebhookInfo => ({
  id: r.id,
  url: r.url,
  events: r.events,
  active: r.active,
  failures: r.failures,
  lastStatus: r.last_status ?? null,
  lastAt: iso(r.last_at),
  createdAt: iso(r.created_at)!,
});
const HOOK_COLS = 'id, url, events, active, failures, last_status, last_at, created_at';

developerRoutes.get('/dev/webhooks', async (c) => {
  requirePerm(c, 'connections.manage');
  const rows = await run(c, (q) => q.query(`select ${HOOK_COLS} from webhooks order by created_at`));
  return c.json({ webhooks: rows.map(toHook), events: WEBHOOK_EVENTS });
});

developerRoutes.post('/dev/webhooks', async (c) => {
  requirePerm(c, 'connections.manage');
  const input = await body(c, z.object({ url: z.string().trim().max(500), events: z.array(z.enum(WEBHOOK_EVENTS)).min(1) }));
  const url = checkWebhookUrl(input.url);
  const org = c.get('org');
  const auth = c.get('auth');
  const secret = `whsec_${randomToken(24)}`;
  const sealed = await seal({ secret }, secretsKey(c.get('deps').config));
  const row = await run(c, async (q) => {
    const [{ n }] = await q.query<{ n: number }>('select count(*)::int as n from webhooks');
    if (n >= 20) fail('validation', { fields: 'url' }, { fields: ['url'] });
    const [r] = await q.query(`insert into webhooks (org_id, url, events, secret, created_by) values ($1, $2, $3, $4, $5) returning ${HOOK_COLS}`, [
      org.id,
      url,
      [...new Set(input.events)],
      sealed,
      auth.userId,
    ]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'webhook.created', entity: 'webhook', entityId: r.id, meta: { url } });
    return r;
  });
  return c.json({ webhook: toHook(row), secret }, 201);
});

developerRoutes.patch('/dev/webhooks/:id', async (c) => {
  requirePerm(c, 'connections.manage');
  const id = param(c, 'id');
  const input = await body(c, z.object({ active: z.boolean().optional(), events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional() }));
  const row = await run(c, async (q) => {
    const [r] = await q.query(
      `update webhooks set active = coalesce($2, active), events = coalesce($3, events), failures = case when $2 then 0 else failures end
        where id = $1 returning ${HOOK_COLS}`,
      [id, input.active ?? null, input.events ?? null],
    );
    if (!r) fail('not_found');
    return r;
  });
  return c.json({ webhook: toHook(row) });
});

developerRoutes.delete('/dev/webhooks/:id', async (c) => {
  requirePerm(c, 'connections.manage');
  const id = param(c, 'id');
  const org = c.get('org');
  const auth = c.get('auth');
  await run(c, async (q) => {
    const r = await q.query('delete from webhooks where id = $1 returning url', [id]);
    if (!r.length) fail('not_found');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'webhook.deleted', entity: 'webhook', entityId: id, meta: { url: r[0].url } });
  });
  return c.json({ ok: true });
});

/** Send a sample event now and report what the receiver answered. */
developerRoutes.post('/dev/webhooks/:id/test', async (c) => {
  requirePerm(c, 'connections.manage');
  const id = param(c, 'id');
  const deps = c.get('deps');
  const org = c.get('org');
  // The secret is read with owner access, for this company's webhook only.
  const [hook] = await deps.db.system((q) => q.query('select * from webhooks where id = $1 and org_id = $2', [id, org.id]));
  if (!hook) fail('not_found');
  const body = JSON.stringify({ id: crypto.randomUUID(), event: 'ping', occurredAt: new Date().toISOString(), company: org.slug, data: { hello: 'Curahold' } });
  const status = await postWebhook(deps, hook, body, 'ping');
  return c.json({ status, ok: status >= 200 && status < 300 });
});
