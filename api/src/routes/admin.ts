// Company administration: settings, roles, teams, people, devices, the
// activity log and the personal-data tools (KVKK/GDPR export and erasure).
import { Hono } from 'hono';
import { z } from 'zod';
import { translate } from '../../../shared/src/i18n';
import { PERMS, type AdminUser, type AuditEntry, type Role } from '../../../shared/src/model';
import { orgUrl, requirePerm, run, type AppEnv } from '../context';
import type { Q } from '../db';
import { audit } from '../lib/audit';
import { randomToken, sha256Hex } from '../lib/crypto';
import { fail } from '../lib/errors';
import { iso, toComment, toTask } from '../lib/mappers';
import { body, email, param, uuid } from '../lib/validate';

export const adminRoutes = new Hono<AppEnv>();

const INVITE_DAYS = 7;

// ------------------------------------------------------------------ company

const termWords = z.object({ one: z.string().trim().max(40).optional(), other: z.string().trim().max(40).optional() });

adminRoutes.patch('/org', async (c) => {
  requirePerm(c, 'org.manage');
  const input = await body(
    c,
    z.object({
      name: z.string().trim().min(1).max(120).optional(),
      locale: z.enum(['en', 'tr']).optional(),
      timezone: z
        .string()
        .max(64)
        .refine((tz) => {
          try {
            new Intl.DateTimeFormat('en', { timeZone: tz });
            return true;
          } catch {
            return false;
          }
        })
        .optional(),
      terms: z.object({ account: z.object({ en: termWords.optional(), tr: termWords.optional() }).optional() }).optional(),
    }),
  );
  const auth = c.get('auth');
  const org = c.get('org');
  await run(c, async (q) => {
    await q.query(
      `update orgs set name = coalesce($2, name), locale = coalesce($3, locale),
              timezone = coalesce($4, timezone), terms = coalesce($5::jsonb, terms)
        where id = $1`,
      [org.id, input.name ?? null, input.locale ?? null, input.timezone ?? null, input.terms ? JSON.stringify(input.terms) : null],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'org.updated', entity: 'org', entityId: org.id, meta: { fields: Object.keys(input) } });
  });
  return c.json({ ok: true });
});

// -------------------------------------------------------------------- roles

const toRole = (r: any): Role => ({ id: r.id, key: r.key, name: r.name, perms: r.perms, system: r.system });
const permsSchema = z.array(z.enum(PERMS)).max(PERMS.length);

adminRoutes.get('/roles', async (c) => {
  requirePerm(c, 'users.manage');
  const rows = await run(c, (q) => q.query('select * from roles order by system desc, name'));
  return c.json({ roles: rows.map(toRole) });
});

adminRoutes.post('/roles', async (c) => {
  requirePerm(c, 'org.manage');
  const input = await body(
    c,
    z.object({ key: z.string().regex(/^[a-z][a-z0-9_-]{1,30}$/), name: z.string().trim().min(1).max(60), perms: permsSchema }),
  );
  const auth = c.get('auth');
  const org = c.get('org');
  const row = await run(c, async (q) => {
    const exists = await q.query('select 1 from roles where key = $1', [input.key]);
    if (exists.length) fail('validation', { fields: 'key' }, { fields: ['key'] });
    const [r] = await q.query('insert into roles (org_id, key, name, perms) values ($1, $2, $3, $4) returning *', [
      org.id,
      input.key,
      input.name,
      [...new Set(input.perms)],
    ]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'role.created', entity: 'role', entityId: r.id });
    return r;
  });
  return c.json({ role: toRole(row) }, 201);
});

adminRoutes.patch('/roles/:id', async (c) => {
  requirePerm(c, 'org.manage');
  const id = param(c, 'id');
  const input = await body(c, z.object({ name: z.string().trim().min(1).max(60).optional(), perms: permsSchema.optional() }));
  const auth = c.get('auth');
  const org = c.get('org');
  const row = await run(c, async (q) => {
    const [r] = await q.query('select * from roles where id = $1', [id]);
    if (!r) fail('not_found');
    // The administrator role always keeps every permission.
    const perms = r.key === 'admin' ? [...PERMS] : input.perms ? [...new Set(input.perms)] : r.perms;
    const [u] = await q.query('update roles set name = coalesce($2, name), perms = $3 where id = $1 returning *', [
      id,
      input.name ?? null,
      perms,
    ]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'role.updated', entity: 'role', entityId: id });
    return u;
  });
  return c.json({ role: toRole(row) });
});

adminRoutes.delete('/roles/:id', async (c) => {
  requirePerm(c, 'org.manage');
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  await run(c, async (q) => {
    const [r] = await q.query('select * from roles where id = $1', [id]);
    if (!r) fail('not_found');
    if (r.system) fail('forbidden');
    const used = await q.query(`select 1 from users where role_id = $1 and status <> 'deleted' limit 1`, [id]);
    if (used.length) fail('role_in_use');
    await q.query('delete from roles where id = $1', [id]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'role.deleted', entity: 'role', entityId: id });
  });
  return c.json({ ok: true });
});

// -------------------------------------------------------------------- teams

const teamSchema = z.object({
  name: z.string().trim().min(1).max(80),
  leadId: uuid.nullable().optional(),
  memberIds: z.array(uuid).max(500).optional(),
});

async function writeTeamMembers(q: Q, orgId: string, teamId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length) {
    const ok = await q.query(`select id from users where id = any($1::uuid[]) and status <> 'deleted'`, [unique]);
    if (ok.length !== unique.length) fail('validation', { fields: 'memberIds' }, { fields: ['memberIds'] });
  }
  await q.query('delete from team_members where team_id = $1', [teamId]);
  for (const u of unique) await q.query('insert into team_members (org_id, team_id, user_id) values ($1, $2, $3)', [orgId, teamId, u]);
}

adminRoutes.post('/teams', async (c) => {
  requirePerm(c, 'teams.manage');
  const input = await body(c, teamSchema);
  const auth = c.get('auth');
  const org = c.get('org');
  const id = await run(c, async (q) => {
    const dup = await q.query('select 1 from teams where lower(name) = lower($1)', [input.name]);
    if (dup.length) fail('validation', { fields: 'name' }, { fields: ['name'] });
    const [t] = await q.query('insert into teams (org_id, name, lead_id) values ($1, $2, $3) returning id', [
      org.id,
      input.name,
      input.leadId ?? null,
    ]);
    const members = [...(input.memberIds ?? []), ...(input.leadId ? [input.leadId] : [])];
    await writeTeamMembers(q, org.id, t.id, members);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'team.created', entity: 'team', entityId: t.id });
    return t.id as string;
  });
  return c.json({ id }, 201);
});

adminRoutes.patch('/teams/:id', async (c) => {
  requirePerm(c, 'teams.manage');
  const id = param(c, 'id');
  const input = await body(c, teamSchema.partial());
  const auth = c.get('auth');
  const org = c.get('org');
  await run(c, async (q) => {
    const [t] = await q.query('select * from teams where id = $1', [id]);
    if (!t) fail('not_found');
    await q.query('update teams set name = coalesce($2, name), lead_id = $3 where id = $1', [
      id,
      input.name ?? null,
      input.leadId !== undefined ? input.leadId : t.lead_id,
    ]);
    if (input.memberIds) await writeTeamMembers(q, org.id, id, [...input.memberIds, ...(input.leadId ? [input.leadId] : [])]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'team.updated', entity: 'team', entityId: id });
  });
  return c.json({ ok: true });
});

adminRoutes.delete('/teams/:id', async (c) => {
  requirePerm(c, 'teams.manage');
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  await run(c, async (q) => {
    const rows = await q.query('delete from teams where id = $1 returning id', [id]);
    if (!rows.length) fail('not_found');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'team.deleted', entity: 'team', entityId: id });
  });
  return c.json({ ok: true });
});

// ------------------------------------------------------------------- people

adminRoutes.get('/users', async (c) => {
  requirePerm(c, 'users.manage');
  const rows = await run(c, (q) =>
    q.query(
      `select u.*, coalesce((select array_agg(team_id) from team_members m where m.user_id = u.id), '{}') as team_ids
         from users u order by u.status = 'deleted', lower(u.name)`,
    ),
  );
  const users: AdminUser[] = rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    seat: u.seat,
    status: u.status,
    roleId: u.role_id,
    teamIds: u.team_ids,
    lastActiveAt: iso(u.last_active_at),
    createdAt: iso(u.created_at)!,
  }));
  const seatsUsed = users.filter((u) => u.seat === 'full' && (u.status === 'active' || u.status === 'invited')).length;
  return c.json({ users, seatsUsed });
});

async function assertAdminRemains(q: Q, changingUserId: string) {
  const [n] = await q.query<{ n: number }>(
    `select count(*)::int as n from users u join roles r on r.id = u.role_id
      where r.key = 'admin' and u.status = 'active' and u.seat = 'full' and u.id <> $1`,
    [changingUserId],
  );
  if (n.n === 0) fail('last_admin');
}

adminRoutes.post('/users', async (c) => {
  requirePerm(c, 'users.manage');
  const input = await body(
    c,
    z.object({
      email,
      name: z.string().trim().min(1).max(120),
      roleId: uuid,
      seat: z.enum(['full', 'viewer']),
      teamIds: z.array(uuid).max(50).optional(),
    }),
  );
  const auth = c.get('auth');
  const org = c.get('org');
  const deps = c.get('deps');
  const created = await run(c, async (q) => {
    const exists = await q.query('select 1 from users where email = $1', [input.email]);
    if (exists.length) fail('email_taken');
    const role = await q.query('select 1 from roles where id = $1', [input.roleId]);
    if (!role.length) fail('validation', { fields: 'roleId' }, { fields: ['roleId'] });
    const [u] = await q.query(
      `insert into users (org_id, email, name, role_id, seat, status) values ($1, $2, $3, $4, $5, 'invited') returning id`,
      [org.id, input.email, input.name, input.roleId, input.seat],
    );
    for (const t of new Set(input.teamIds ?? [])) {
      await q.query('insert into team_members (org_id, team_id, user_id) values ($1, $2, $3)', [org.id, t, u.id]);
    }
    const token = randomToken(32);
    await q.query(
      `insert into login_tokens (org_id, email, token_hash, kind, expires_at)
       values ($1, $2, $3, 'magic', now() + make_interval(days => $4::int))`,
      [org.id, input.email, await sha256Hex(token), INVITE_DAYS],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'user.invited', entity: 'user', entityId: u.id });
    return { id: u.id as string, token };
  });
  const link = `${orgUrl(deps.config, org.slug)}/auth/verify#token=${created.token}`;
  await deps.email.send({
    to: input.email,
    subject: translate(org.locale, 'email.invite.subject', { inviter: auth.name, org: org.name }),
    text: translate(org.locale, 'email.invite.body', { inviter: auth.name, org: org.name, name: input.name, link }),
  });
  return c.json({ id: created.id, ...(deps.config.devExposeTokens ? { devToken: created.token } : {}) }, 201);
});

adminRoutes.patch('/users/:id', async (c) => {
  requirePerm(c, 'users.manage');
  const id = param(c, 'id');
  const input = await body(
    c,
    z.object({
      name: z.string().trim().min(1).max(120).optional(),
      roleId: uuid.optional(),
      seat: z.enum(['full', 'viewer']).optional(),
      status: z.enum(['active', 'disabled']).optional(),
      teamIds: z.array(uuid).max(50).optional(),
    }),
  );
  const auth = c.get('auth');
  const org = c.get('org');
  await run(c, async (q) => {
    const [u] = await q.query('select u.*, r.key as role_key from users u join roles r on r.id = u.role_id where u.id = $1', [id]);
    if (!u || u.status === 'deleted') fail('not_found');
    if (input.roleId) {
      const [r] = await q.query('select key from roles where id = $1', [input.roleId]);
      if (!r) fail('validation', { fields: 'roleId' }, { fields: ['roleId'] });
    }
    const losesAdmin =
      u.role_key === 'admin' &&
      ((input.roleId && input.roleId !== u.role_id) || input.status === 'disabled' || input.seat === 'viewer');
    if (losesAdmin) await assertAdminRemains(q, id);
    const status = input.status ?? (u.status === 'invited' ? 'invited' : u.status);
    await q.query(
      `update users set name = coalesce($2, name), role_id = coalesce($3, role_id), seat = coalesce($4, seat), status = $5
        where id = $1`,
      [id, input.name ?? null, input.roleId ?? null, input.seat ?? null, status],
    );
    if (input.status === 'disabled') {
      await q.query(`update sessions set revoked_at = now(), revoke_reason = 'disabled' where user_id = $1 and revoked_at is null`, [id]);
    }
    if (input.teamIds) {
      await q.query('delete from team_members where user_id = $1', [id]);
      for (const t of new Set(input.teamIds)) {
        await q.query('insert into team_members (org_id, team_id, user_id) values ($1, $2, $3)', [org.id, t, id]);
      }
    }
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'user.updated', entity: 'user', entityId: id, meta: { fields: Object.keys(input) } });
  });
  return c.json({ ok: true });
});

adminRoutes.get('/users/:id/sessions', async (c) => {
  requirePerm(c, 'users.manage');
  const id = param(c, 'id');
  const rows = await run(c, (q) =>
    q.query(
      `select id, device_label, method, created_at, last_seen_at from sessions
        where user_id = $1 and revoked_at is null and expires_at > now() order by last_seen_at desc`,
      [id],
    ),
  );
  return c.json({
    sessions: rows.map((r) => ({
      id: r.id,
      deviceLabel: r.device_label,
      method: r.method,
      createdAt: iso(r.created_at),
      lastSeenAt: iso(r.last_seen_at),
      current: false,
    })),
  });
});

adminRoutes.delete('/sessions/:id', async (c) => {
  requirePerm(c, 'users.manage');
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  await run(c, async (q) => {
    const rows = await q.query(
      `update sessions set revoked_at = now(), revoke_reason = 'admin' where id = $1 and revoked_at is null returning id`,
      [id],
    );
    if (!rows.length) fail('not_found');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'session.revoked', entity: 'session', entityId: id });
  });
  return c.json({ ok: true });
});

// ----------------------------------------------- personal data (KVKK / GDPR)

// Everything Tendwell holds about one person, as a JSON download — the
// answer to a data-subject access request (KVKK m.11, GDPR Art. 15/20).
adminRoutes.get('/users/:id/export', async (c) => {
  requirePerm(c, 'privacy.manage');
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  const u = await run(c, async (q) => {
    const [row] = await q.query(
      'select u.id, u.email, u.name, u.seat, u.status, u.locale, u.created_at, u.last_active_at, r.name as role from users u join roles r on r.id = u.role_id where u.id = $1',
      [id],
    );
    if (!row) fail('not_found');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'user.exported', entity: 'user', entityId: id });
    return row;
  });
  // Owner-level reads, always filtered by this company: the export must
  // include tasks on boards the administrator personally cannot open.
  const out = await c.get('deps').db.system(async (sq) => {
    const tasks = await sq.query(
      `select * from tasks where org_id = $1 and (created_by = $2 or $2 = any(assignee_ids)) order by created_at`,
      [org.id, id],
    );
    const comments = await sq.query('select * from comments where org_id = $1 and author_id = $2 order by created_at', [org.id, id]);
    const sessions = await sq.query(
      'select device_label, method, ip, geo, created_at, last_seen_at, revoked_at, revoke_reason from sessions where org_id = $1 and user_id = $2 order by created_at',
      [org.id, id],
    );
    const activity = await sq.query(
      'select action, entity, entity_id, at from audit_log where org_id = $1 and actor_id = $2 order by at',
      [org.id, id],
    );
    const teams = await sq.query(
      'select t.name from teams t join team_members m on m.team_id = t.id where t.org_id = $1 and m.user_id = $2',
      [org.id, id],
    );
    return { tasks, comments, sessions, activity, teams };
  });
  const data = {
    exportedAt: new Date().toISOString(),
    company: org.name,
    person: { ...u, created_at: iso(u.created_at), last_active_at: iso(u.last_active_at) },
    teams: out.teams.map((t) => t.name),
    tasks: out.tasks.map(toTask),
    comments: out.comments.map(toComment),
    sessions: out.sessions.map((s) => ({
      device: s.device_label,
      method: s.method,
      ip: s.ip,
      country: s.geo,
      createdAt: iso(s.created_at),
      lastSeenAt: iso(s.last_seen_at),
      endedAt: iso(s.revoked_at),
      endReason: s.revoke_reason,
    })),
    activity: out.activity.map((a) => ({ action: a.action, entity: a.entity, entityId: a.entity_id, at: iso(a.at) })),
  };
  c.header('content-disposition', `attachment; filename="tendwell-personal-data-${id}.json"`);
  return c.json(data);
});

// Erasure (KVKK m.7, GDPR Art. 17). The person disappears from the
// company: name and email are replaced, sessions and one-time tokens are
// deleted, they are removed from every task, team and board. Comments
// stay as business records but lose the author.
adminRoutes.post('/users/:id/erase', async (c) => {
  requirePerm(c, 'privacy.manage');
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  if (id === auth.userId) fail('forbidden');
  const target = await run(c, async (q) => {
    const [u] = await q.query('select u.*, r.key as role_key from users u join roles r on r.id = u.role_id where u.id = $1', [id]);
    if (!u || u.status === 'deleted') fail('not_found');
    if (u.role_key === 'admin') await assertAdminRemains(q, id);
    return u;
  });
  // One owner-level transaction, every statement filtered by this company,
  // so the erasure also reaches boards the administrator cannot open.
  await c.get('deps').db.system(async (sq) => {
    const o = org.id;
    await sq.query('update tasks set assignee_ids = array_remove(assignee_ids, $2) where org_id = $1 and $2 = any(assignee_ids)', [o, id]);
    await sq.query('update tasks set created_by = null where org_id = $1 and created_by = $2', [o, id]);
    await sq.query('update tasks set updated_by = null where org_id = $1 and updated_by = $2', [o, id]);
    await sq.query('update comments set author_id = null where org_id = $1 and author_id = $2', [o, id]);
    await sq.query('update comments set mentions = array_remove(mentions, $2) where org_id = $1 and $2 = any(mentions)', [o, id]);
    await sq.query('update boards set created_by = null where org_id = $1 and created_by = $2', [o, id]);
    await sq.query('update files set uploaded_by = null where org_id = $1 and uploaded_by = $2', [o, id]);
    await sq.query('delete from sessions where org_id = $1 and user_id = $2', [o, id]);
    await sq.query('delete from login_tokens where org_id = $1 and email = $2', [o, target.email]);
    await sq.query('delete from team_members where org_id = $1 and user_id = $2', [o, id]);
    await sq.query('delete from board_members where org_id = $1 and user_id = $2', [o, id]);
    await sq.query('update teams set lead_id = null where org_id = $1 and lead_id = $2', [o, id]);
    await sq.query(
      `update users set name = '—', email = $3, status = 'deleted', locale = null, last_active_at = null
        where org_id = $1 and id = $2`,
      [o, id, `erased+${id}@invalid.tendwell`],
    );
    await audit(sq, { orgId: o, actorId: auth.userId, action: 'user.erased', entity: 'user', entityId: id });
  });
  return c.json({ ok: true });
});

// ------------------------------------------------------------- activity log

adminRoutes.get('/audit', async (c) => {
  requirePerm(c, 'audit.view');
  const before = c.req.query('before');
  const rows = await run(c, (q) =>
    q.query(
      `select id, actor_id, action, entity, entity_id, at from audit_log
        where ($1::timestamptz is null or at < $1::timestamptz)
        order by at desc limit 200`,
      [before && !Number.isNaN(Date.parse(before)) ? before : null],
    ),
  );
  const entries: AuditEntry[] = rows.map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    at: iso(r.at)!,
  }));
  return c.json({ entries });
});
