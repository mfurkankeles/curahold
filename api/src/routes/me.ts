import { Hono } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { normalizeLocale } from '../../../shared/src/i18n';
import type { Me, Person, SessionInfo, Team } from '../../../shared/src/model';
import { maxDevices, run, type AppEnv } from '../context';
import { audit } from '../lib/audit';
import { fail } from '../lib/errors';
import { iso } from '../lib/mappers';
import { body, param } from '../lib/validate';
import { SESSION_COOKIE } from './auth';

export const meRoutes = new Hono<AppEnv>();

meRoutes.get('/me', async (c) => {
  const auth = c.get('auth');
  const org = c.get('org');
  const data = await run(c, async (q) => {
    const [o] = await q.query('select plan from orgs where id = $1', [org.id]);
    const teams = await q.query<{ team_id: string }>('select team_id from team_members where user_id = $1', [auth.userId]);
    return { plan: o?.plan ?? 'trial', teamIds: teams.map((t) => t.team_id) };
  });
  const me: Me = {
    user: {
      id: auth.userId,
      name: auth.name,
      email: auth.email,
      seat: auth.seat,
      status: 'active',
      locale: auth.locale,
      roleId: auth.roleId,
      roleKey: auth.roleKey,
      perms: auth.perms,
    },
    org: {
      id: org.id,
      slug: org.slug,
      name: org.name,
      locale: org.locale,
      timezone: org.timezone,
      terms: org.terms,
      plan: data.plan,
      maxDevices: maxDevices(c),
    },
    teamIds: data.teamIds,
    sessionId: auth.sessionId,
  };
  return c.json(me);
});

meRoutes.patch('/me', async (c) => {
  const input = await body(
    c,
    z.object({ name: z.string().trim().min(1).max(120).optional(), locale: z.enum(['en', 'tr']).nullable().optional() }),
  );
  const auth = c.get('auth');
  await run(c, async (q) => {
    if (input.name !== undefined) await q.query('update users set name = $1 where id = $2', [input.name, auth.userId]);
    if (input.locale !== undefined) await q.query('update users set locale = $1 where id = $2', [input.locale, auth.userId]);
  });
  return c.json({ ok: true, locale: input.locale === undefined ? auth.locale : normalizeLocale(input.locale) });
});

meRoutes.get('/me/sessions', async (c) => {
  const auth = c.get('auth');
  const rows = await run(c, (q) =>
    q.query(
      `select id, device_label, method, created_at, last_seen_at from sessions
        where user_id = $1 and revoked_at is null and expires_at > now()
        order by last_seen_at desc`,
      [auth.userId],
    ),
  );
  const list: SessionInfo[] = rows.map((r) => ({
    id: r.id,
    deviceLabel: r.device_label,
    method: r.method,
    createdAt: iso(r.created_at)!,
    lastSeenAt: iso(r.last_seen_at)!,
    current: r.id === auth.sessionId,
  }));
  return c.json({ sessions: list, maxDevices: maxDevices(c) });
});

meRoutes.delete('/me/sessions/:id', async (c) => {
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  const n = await run(c, async (q) => {
    const rows = await q.query(
      `update sessions set revoked_at = now(), revoke_reason = 'user'
        where id = $1 and user_id = $2 and revoked_at is null returning id`,
      [id, auth.userId],
    );
    if (rows.length) await audit(q, { orgId: org.id, actorId: auth.userId, action: 'session.revoked', entity: 'session', entityId: id });
    return rows.length;
  });
  if (!n) fail('not_found');
  if (id === auth.sessionId) deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

meRoutes.post('/auth/logout', async (c) => {
  const auth = c.get('auth');
  await run(c, (q) =>
    q.query(`update sessions set revoked_at = now(), revoke_reason = 'logout' where id = $1`, [auth.sessionId]),
  );
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

// Everyone needs names for pickers and avatars; e-mail is shown to all
// members because it is their work address inside the same company.
meRoutes.get('/people', async (c) => {
  const data = await run(c, async (q) => {
    const people = await q.query(
      `select id, name, email, seat, status from users where status <> 'deleted' order by lower(name)`,
    );
    const teams = await q.query(
      `select t.id, t.name, t.lead_id,
              coalesce(array_agg(tm.user_id) filter (where tm.user_id is not null), '{}') as member_ids
         from teams t left join team_members tm on tm.team_id = t.id
        group by t.id order by lower(t.name)`,
    );
    return { people, teams };
  });
  const people: Person[] = data.people.map((p) => ({ id: p.id, name: p.name, email: p.email, seat: p.seat, status: p.status }));
  const teams: Team[] = data.teams.map((t) => ({ id: t.id, name: t.name, leadId: t.lead_id, memberIds: t.member_ids }));
  return c.json({ people, teams });
});
