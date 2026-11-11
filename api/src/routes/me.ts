import { Hono } from 'hono';
import { healthConfig } from '../../../shared/src/health';
import { deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { normalizeLocale } from '../../../shared/src/i18n';
import { NOTIFY_EVENTS, type DeliveryOption, type Me, type Notification, type Person, type SessionInfo, type Team } from '../../../shared/src/model';
import { logoPath, maxDevices, orgUrl, run, type AppEnv } from '../context';
import { randomToken, sha256Hex } from '../lib/crypto';
import { loadRenderCtx, prefsOf, render } from '../lib/notify';
import { audit } from '../lib/audit';
import { fail } from '../lib/errors';
import { iso } from '../lib/mappers';
import { defsFor } from '../lib/fieldAccess';
import { body, param } from '../lib/validate';
import { SESSION_COOKIE } from './auth';

export const meRoutes = new Hono<AppEnv>();

meRoutes.get('/me', async (c) => {
  const auth = c.get('auth');
  const org = c.get('org');
  const data = await run(c, async (q) => {
    const [o] = await q.query('select plan from orgs where id = $1', [org.id]);
    const [u] = await q.query('select onboarded_at, prefs from users where id = $1', [auth.userId]);
    const teams = await q.query<{ team_id: string }>('select team_id from team_members where user_id = $1', [auth.userId]);
    return { plan: o?.plan ?? 'trial', teamIds: teams.map((t) => t.team_id), onboardedAt: iso(u?.onboarded_at), prefs: prefsOf(u?.prefs) };
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
      onboardedAt: data.onboardedAt,
      prefs: data.prefs,
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
      currency: org.currency,
      template: org.template,
      domains: org.domains,
      joinRequests: org.join_requests,
      autoJoin: org.auto_join,
      accountFields: defsFor(org.account_fields, auth),
      health: (({ enabled, bands }) => ({ enabled, bands }))(healthConfig(org.settings?.health)),
      setup: org.setup ?? {},
      logoUrl: logoPath(org),
    },
    teamIds: data.teamIds,
    sessionId: auth.sessionId,
    ...(c.get('previewBy') ? { previewBy: c.get('previewBy') } : {}),
  };
  return c.json(me);
});

meRoutes.patch('/me', async (c) => {
  const input = await body(
    c,
    z.object({
      name: z.string().trim().min(1).max(120).optional(),
      locale: z.enum(['en', 'tr']).nullable().optional(),
      onboarded: z.boolean().optional(),
      prefs: z
        .object({
          channel: z.string().max(40).optional(),
          events: z.partialRecord(z.enum(NOTIFY_EVENTS), z.boolean()).optional(),
          digestHour: z.number().int().min(0).max(23).optional(),
          defaultBoardId: z.string().uuid().nullable().optional(),
          quiet: z.object({ from: z.number().int().min(0).max(23), to: z.number().int().min(0).max(23) }).nullable().optional(),
        })
        .optional(),
    }),
  );
  const auth = c.get('auth');
  await run(c, async (q) => {
    if (input.name !== undefined) await q.query('update users set name = $1 where id = $2', [input.name, auth.userId]);
    if (input.locale !== undefined) await q.query('update users set locale = $1 where id = $2', [input.locale, auth.userId]);
    if (input.onboarded) await q.query('update users set onboarded_at = coalesce(onboarded_at, now()) where id = $1', [auth.userId]);
    if (input.prefs) {
      const ch = input.prefs.channel;
      if (ch && !['auto', 'email', 'none'].includes(ch)) {
        const ok = await q.query(`select 1 from connections where id::text = $1 and kind = 'messaging' and provider <> 'webhook'`, [ch]);
        if (!ok.length) fail('validation', { fields: 'prefs.channel' }, { fields: ['prefs.channel'] });
      }
      const [u] = await q.query('select prefs from users where id = $1', [auth.userId]);
      const cur = prefsOf(u?.prefs);
      const next = { ...cur, ...input.prefs, events: { ...cur.events, ...(input.prefs.events ?? {}) } };
      await q.query('update users set prefs = $2 where id = $1', [auth.userId, JSON.stringify(next)]);
    }
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

// ------------------------------------------------------------ notifications

/** Where this person can get notifications: email, or a chat app the company connected. */
meRoutes.get('/me/delivery', async (c) => {
  const auth = c.get('auth');
  const rows = await run(c, (q) =>
    q.query(
      `select c.id, c.provider, c.label, exists (select 1 from chat_identities i where i.connection_id = c.id and i.user_id = $1) as linked
         from connections c where c.kind = 'messaging' and c.status = 'active' and c.provider <> 'webhook' order by c.created_at`,
      [auth.userId],
    ),
  );
  const options: DeliveryOption[] = [
    ...rows.map((r) => ({ id: r.id, provider: r.provider, label: r.label, linked: r.linked })),
    { id: 'email', provider: 'email', label: auth.email, linked: true },
  ];
  return c.json({ options });
});

meRoutes.get('/notifications', async (c) => {
  const auth = c.get('auth');
  const deps = c.get('deps');
  const rows = await run(c, (q) =>
    q.query(`select * from notifications where user_id = $1 order by created_at desc limit 50`, [auth.userId]),
  );
  const unread = rows.filter((r) => !r.read_at).length;
  const list: Notification[] = [];
  for (const n of rows) {
    const ctx = await deps.db.system((q) => loadRenderCtx(q, deps, n, c.get('locale')));
    const m = render(ctx);
    list.push({ id: n.id, kind: n.kind, taskId: n.task_id, actorId: n.actor_id, title: m.title, body: m.body ?? '', url: m.url ?? null, readAt: iso(n.read_at), createdAt: iso(n.created_at)! });
  }
  return c.json({ notifications: list, unread });
});

meRoutes.post('/notifications/read', async (c) => {
  const input = await body(c, z.object({ ids: z.array(z.string().uuid()).max(100).optional(), all: z.boolean().optional() }));
  const auth = c.get('auth');
  await run(c, (q) =>
    input.all
      ? q.query('update notifications set read_at = now() where user_id = $1 and read_at is null', [auth.userId])
      : q.query('update notifications set read_at = now() where user_id = $1 and id = any($2::uuid[]) and read_at is null', [auth.userId, input.ids ?? []]),
  );
  return c.json({ ok: true });
});

// --------------------------------------------------------------- calendar

/** A secret calendar address for this person's tasks; asking again replaces it. */
meRoutes.post('/me/calendar', async (c) => {
  const auth = c.get('auth');
  const org = c.get('org');
  const token = randomToken(24);
  const hash = await sha256Hex(token);
  await run(c, (q) => q.query('update users set calendar_token_hash = $2 where id = $1', [auth.userId, hash]));
  return c.json({ url: `${orgUrl(c.get('deps').config, org.slug)}/api/calendar/${token}.ics` });
});

meRoutes.delete('/me/calendar', async (c) => {
  const auth = c.get('auth');
  await run(c, (q) => q.query('update users set calendar_token_hash = null where id = $1', [auth.userId]));
  return c.json({ ok: true });
});

meRoutes.get('/me/calendar', async (c) => {
  const auth = c.get('auth');
  const [u] = await run(c, (q) => q.query('select calendar_token_hash is not null as on from users where id = $1', [auth.userId]));
  return c.json({ enabled: !!u?.on });
});
