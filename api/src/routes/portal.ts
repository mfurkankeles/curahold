// The customer portal, from inside the company: turning it on, opening a
// board, inviting customers' people, sharing a task with them.
import { Hono } from 'hono';
import { z } from 'zod';
import { PORTAL_FIELDS, type BoardPortal, type PortalPerson, type PortalSettings } from '../../../shared/src/portal';
import { defer, portalUrl, requirePerm, requireWriter, run, type AppEnv } from '../context';
import type { Row } from '../db';
import { audit } from '../lib/audit';
import { fail } from '../lib/errors';
import { toBoard } from '../lib/mappers';
import { emailPortalLink, portalOn } from '../lib/portal';
import { body, param, uuid } from '../lib/validate';
import { canManageBoard, loadBoard } from './boards';

export const portalRoutes = new Hono<AppEnv>();

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const toPerson = (r: Row): PortalPerson => ({
  id: r.id,
  accountId: r.account_id,
  accountName: r.account_name ?? null,
  email: r.email,
  name: r.name,
  status: r.status,
  createdAt: iso(r.created_at)!,
  lastSeenAt: iso(r.last_seen_at),
});

portalRoutes.get('/portal', async (c) => {
  const org = c.get('org');
  const deps = c.get('deps');
  const boards = await run(c, (q) => q.query(`select id, name from boards where coalesce((portal->>'enabled')::boolean, false) order by name`));
  const out: PortalSettings = {
    available: !!deps.config.portalDomain,
    enabled: portalOn(org),
    address: portalUrl(deps.config, org.slug),
    boards: boards.map((b) => ({ id: b.id, name: b.name })),
  };
  return c.json(out);
});

/** The company's switch. Off: the portal answers "not found" to everyone, at once. */
portalRoutes.put('/portal/settings', async (c) => {
  requirePerm(c, 'org.manage');
  if (c.get('previewBy') || c.get('supportBy')) fail('forbidden');
  const { enabled } = await body(c, z.object({ enabled: z.boolean() }));
  if (enabled && !c.get('deps').config.portalDomain) fail('not_configured');
  const org = c.get('org');
  const auth = c.get('auth');
  await run(c, async (q) => {
    await q.query(`update orgs set settings = jsonb_set(settings, '{portal}', coalesce(settings->'portal', '{}'::jsonb) || jsonb_build_object('enabled', $2::boolean)) where id = $1`, [org.id, enabled]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: enabled ? 'portal.enabled' : 'portal.disabled', entity: 'org', entityId: org.id });
  });
  return c.json({ enabled });
});

// --------------------------------------------------------------- people

portalRoutes.get('/portal/users', async (c) => {
  const accountId = c.req.query('accountId');
  if (accountId && !uuid.safeParse(accountId).success) fail('not_found');
  const rows = await run(c, (q) =>
    q.query(
      `select pu.*, a.name as account_name from portal_users pu join accounts a on a.id = pu.account_id
        where ($1::uuid is null or pu.account_id = $1) order by a.name, pu.name limit 500`,
      [accountId ?? null],
    ),
  );
  return c.json({ people: rows.map(toPerson) });
});

portalRoutes.post('/portal/users', async (c) => {
  requireWriter(c);
  const org = c.get('org');
  const auth = c.get('auth');
  const deps = c.get('deps');
  if (!portalOn(org, deps)) fail('portal_off');
  const input = await body(
    c,
    z.object({
      accountId: uuid,
      email: z.string().trim().toLowerCase().email().max(254),
      name: z.string().trim().min(1).max(120),
      locale: z.enum(['tr', 'en']).nullish(),
    }),
  );
  const person = await run(c, async (q) => {
    const [a] = await q.query('select id, name, owner_id from accounts where id = $1 and archived_at is null', [input.accountId]);
    if (!a) fail('not_found');
    if (!auth.perms.includes('org.manage') && a.owner_id !== auth.userId) fail('portal_invite_owner');
    // Someone inside the company is not a customer.
    const [inside] = await q.query(`select 1 from users where lower(email) = $1`, [input.email]);
    if (inside) fail('portal_internal_email');
    const [taken] = await q.query(`select id from portal_users where email = $1`, [input.email]);
    if (taken) fail('portal_email_taken');
    const [p] = await q.query(
      `insert into portal_users (org_id, account_id, email, name, locale, invited_by) values ($1, $2, $3, $4, $5, $6) returning *`,
      [org.id, a.id, input.email, input.name, input.locale ?? null, auth.userId],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'portal.invited', entity: 'portal_user', entityId: p.id, meta: { account: a.name } });
    return { ...p, account_name: a.name } as Row;
  });
  defer(deps, emailPortalLink(deps, org, { id: person.id, email: person.email, name: person.name, locale: person.locale, accountName: person.account_name }, 'invite', auth.name));
  return c.json({ person: toPerson(person) }, 201);
});

portalRoutes.post('/portal/users/:id/resend', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const org = c.get('org');
  const deps = c.get('deps');
  if (!portalOn(org, deps)) fail('portal_off');
  const p = await run(c, async (q) => {
    const [p] = await q.query(`select pu.*, a.name as account_name from portal_users pu join accounts a on a.id = pu.account_id where pu.id = $1 and pu.status <> 'disabled'`, [id]);
    if (!p) fail('not_found');
    // Only those who could invite them may send it again.
    const [ok] = await q.query(`update portal_users set name = name where id = $1 returning id`, [id]);
    if (!ok) fail('forbidden');
    return p;
  });
  defer(deps, emailPortalLink(deps, org, { id: p.id, email: p.email, name: p.name, locale: p.locale, accountName: p.account_name }, 'invite', c.get('auth').name));
  return c.json({ ok: true });
});

/** Switching someone off ends their sessions and links at once. */
portalRoutes.delete('/portal/users/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const org = c.get('org');
  const auth = c.get('auth');
  const n = await run(c, async (q) => {
    const rows = await q.query(`update portal_users set status = 'disabled' where id = $1 and status <> 'disabled' returning id`, [id]);
    if (rows.length) await audit(q, { orgId: org.id, actorId: auth.userId, action: 'portal.disabled_user', entity: 'portal_user', entityId: id });
    return rows.length;
  });
  if (!n) fail('not_found');
  await c.get('deps').db.system(async (q) => {
    await q.query('update portal_sessions set revoked_at = now() where portal_user_id = $1 and org_id = $2 and revoked_at is null', [id, org.id]);
    await q.query('delete from portal_tokens where portal_user_id = $1 and org_id = $2', [id, org.id]);
  });
  return c.json({ ok: true });
});

// --------------------------------------------------------------- boards

const boardPortal = z.object({
  enabled: z.boolean(),
  intake: z.string().min(1).max(60),
  labels: z.record(z.string().max(60), z.string().trim().max(60)).default({}),
  fields: z.array(z.enum(PORTAL_FIELDS)).max(PORTAL_FIELDS.length).default([]),
});

/** Opening a board to customers is an administrator's decision, and the board's manager's too. */
portalRoutes.put('/boards/:id/portal', async (c) => {
  requireWriter(c);
  requirePerm(c, 'org.manage');
  const id = param(c, 'id');
  const org = c.get('org');
  const auth = c.get('auth');
  const input = await body(c, boardPortal);
  if (input.enabled && !portalOn(org, c.get('deps'))) fail('portal_off');
  const board = await run(c, async (q) => {
    const b = await loadBoard(q, id);
    if (!canManageBoard(auth, b)) fail('forbidden');
    // Only private or team boards hold customer work; never someone's personal board.
    if (input.enabled && b.visibility === 'private') fail('portal_private_board');
    const keys = new Set((b.columns as { key: string }[]).map((x) => x.key));
    if (!keys.has(input.intake)) fail('validation', { fields: 'intake' }, { fields: ['intake'] });
    const labels = Object.fromEntries(Object.entries(input.labels).filter(([k, v]) => keys.has(k) && v));
    const portal: BoardPortal = { enabled: input.enabled, intake: input.intake, labels, fields: [...new Set(input.fields)] };
    await q.query('update boards set portal = $2 where id = $1', [id, JSON.stringify(portal)]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: input.enabled ? 'portal.board_opened' : 'portal.board_closed', entity: 'board', entityId: id });
    return loadBoard(q, id);
  });
  return c.json({ board: toBoard(board, canManageBoard(auth, board)) });
});

/** Share a task with its customer (or stop). Only on an open board, only for a task with a customer. */
portalRoutes.put('/tasks/:id/portal', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const org = c.get('org');
  const auth = c.get('auth');
  const { shared } = await body(c, z.object({ shared: z.boolean() }));
  await run(c, async (q) => {
    const [t] = await q.query(
      `select t.id, t.account_id, coalesce((b.portal->>'enabled')::boolean, false) as open
         from tasks t join boards b on b.id = t.board_id where t.id = $1 and t.archived_at is null`,
      [id],
    );
    if (!t) fail('not_found');
    if (shared && (!t.open || !t.account_id || !portalOn(org))) fail('portal_not_shared');
    await q.query('update tasks set portal_shared = $2, updated_at = now(), updated_by = $3, version = version + 1 where id = $1', [id, shared, auth.userId]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: shared ? 'portal.task_shared' : 'portal.task_unshared', entity: 'task', entityId: id });
  });
  return c.json({ shared });
});
