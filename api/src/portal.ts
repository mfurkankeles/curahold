// The customer portal's API (/papi), served only on the portal's own domain
// (acme.tendwell-portal.com). It shares nothing with the app's API: its own
// cookie, its own sessions, and a database role that can only call the
// portal_* functions (db/migrations/0011_portal.sql).
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { normalizeLocale, translate, type Locale } from '../../shared/src/i18n';
import type { PortalOrg } from '../../shared/src/portal';
import { slugFromHost } from './app';
import { defer, type Deps, type OrgRow } from './context';
import type { Q } from './db';
import { randomToken, sha256Hex } from './lib/crypto';
import { HttpError, fail } from './lib/errors';
import { flushHealth } from './lib/health';
import { enqueue, kick } from './lib/notify';
import { PORTAL_COOKIE, PORTAL_SESSION_DAYS, emailPortalLink, portalOn } from './lib/portal';
import { uuid } from './lib/validate';
import { deliverWebhooks } from './lib/webhooks';

type PortalEnv = {
  Variables: {
    org: OrgRow;
    locale: Locale;
    person: { id: string; name: string; accountId: string; sessionId: string };
  };
};

/** Errors raised inside the portal_* functions, by name. */
const DB_ERRORS: Record<string, 'unauthenticated' | 'not_found' | 'too_many_requests'> = {
  portal_signed_out: 'unauthenticated',
  portal_not_found: 'not_found',
  portal_rate: 'too_many_requests',
};

export function createPortalApp(deps: Deps) {
  const app = new Hono<PortalEnv>();
  const cfg = deps.config;

  app.use('*', async (c, next) => {
    await next();
    c.header('x-content-type-options', 'nosniff');
    c.header('referrer-policy', 'no-referrer');
    if (c.req.path.startsWith('/papi/')) c.header('cache-control', 'no-store');
    // Writes: the people's tasks and replies move on, and the company's webhooks hear of it.
    if (deps.defer && c.req.method === 'POST' && c.res.status < 400 && /^\/papi\/(boards|tasks)\//.test(c.req.path)) {
      defer(deps, flushHealth(deps, 50).then(() => deliverWebhooks(deps, 20)));
    }
  });

  app.onError((err, c) => {
    const locale = (c.get('locale') as Locale | undefined) ?? 'en';
    const org = c.get('org') as OrgRow | undefined;
    let e = err instanceof HttpError ? err : null;
    if (!e) {
      const hit = Object.keys(DB_ERRORS).find((k) => String((err as Error)?.message ?? '').includes(k));
      if (hit) e = new HttpError(DB_ERRORS[hit]);
    }
    if (e) return c.json({ error: e.code, message: translate(locale, e.key, e.vars, org?.terms) }, e.status as any);
    console.error('[tendwell] portal', err);
    return c.json({ error: 'server', message: translate(locale, 'errors.server') }, 500);
  });

  const db = (c: { get: (k: 'org' | 'person') => any }, fn: (q: Q) => Promise<any>) =>
    deps.db.portal({ orgId: c.get('org').id, portalUserId: c.get('person')?.id ?? null }, fn);

  // ------------------------------------------------------------ company
  app.use('/papi/*', async (c, next) => {
    if (!cfg.portalDomain) fail('not_found');
    const host = c.req.header('host') ?? new URL(c.req.url).host;
    const slug = cfg.singleTenantSlug ?? slugFromHost(host, cfg.portalDomain!);
    if (!slug) fail('org_not_found');
    const [row] = await deps.db.tenant({ orgId: null, userId: null }, (q) => q.query<OrgRow>('select * from resolve_org($1)', [slug]));
    // A company that has not opened a portal does not exist here.
    if (!row || !portalOn(row as OrgRow)) fail('org_not_found');
    const org = { ...row, locale: normalizeLocale(row.locale), terms: row.terms ?? {}, settings: row.settings ?? {} } as OrgRow;
    c.set('org', org);
    const want = c.req.header('x-tendwell-locale');
    c.set('locale', want === 'tr' || want === 'en' ? want : org.locale);
    // A form on another site cannot set this header, so it cannot act for someone here.
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.header('x-tendwell-portal') !== '1') fail('forbidden');
    await next();
  });

  app.get('/papi/org', (c) => {
    const org = c.get('org');
    const out: PortalOrg = { name: org.name, locale: org.locale, logoUrl: (org.settings as any)?.logo?.key ? `/papi/logo?v=${encodeURIComponent(String((org.settings as any).logo.v ?? 1))}` : null };
    return c.json(out);
  });

  app.get('/papi/logo', async (c) => {
    const key = (c.get('org').settings as any)?.logo?.key as string | undefined;
    const obj = key ? await deps.storage.get(key) : null;
    if (!obj) fail('not_found');
    return c.body(obj!.data, 200, { 'content-type': obj!.mime, 'cache-control': 'public, max-age=86400' });
  });

  // ------------------------------------------------------------ sign-in
  /** Always the same answer, so the form cannot be used to find out who has access. */
  app.post('/papi/auth/start', async (c) => {
    const org = c.get('org');
    const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) fail('validation', { fields: 'email' }, { fields: ['email'] });
    const [p] = await deps.db.system((q) =>
      q.query(
        `select pu.id, pu.email, pu.name, pu.locale,
                (select count(*)::int from portal_tokens t where t.portal_user_id = pu.id and t.created_at > now() - interval '1 hour') as recent
           from portal_users pu join accounts a on a.id = pu.account_id and a.archived_at is null
          where pu.org_id = $1 and pu.email = $2 and pu.status in ('invited', 'active')`,
        [org.id, parsed.data!.email],
      ),
    );
    if (p && p.recent < 5) defer(deps, emailPortalLink(deps, org, p as { id: string; email: string; name: string; locale: string | null }, 'signin'));
    return c.json({ ok: true });
  });

  app.post('/papi/auth/verify', async (c) => {
    const org = c.get('org');
    const parsed = z.object({ token: z.string().min(20).max(200) }).safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) fail('invalid_token');
    const session = randomToken(32);
    const person = await deps.db.system(async (q) => {
      const [t] = await q.query(
        `update portal_tokens set used_at = now()
          where token_hash = $1 and org_id = $2 and used_at is null and expires_at > now()
          returning portal_user_id`,
        [await sha256Hex(parsed.data!.token), org.id],
      );
      if (!t) return null;
      const [p] = await q.query(
        `update portal_users set status = 'active', last_seen_at = now()
          where id = $1 and org_id = $2 and status in ('invited', 'active') returning id, name, locale`,
        [t.portal_user_id, org.id],
      );
      if (!p) return null;
      await q.query(
        `insert into portal_sessions (org_id, portal_user_id, token_hash, expires_at) values ($1, $2, $3, now() + make_interval(days => $4))`,
        [org.id, p.id, await sha256Hex(session), PORTAL_SESSION_DAYS],
      );
      return p;
    });
    if (!person) fail('invalid_token');
    // Host-only, on the portal's own domain: never sent to the company's app.
    setCookie(c, PORTAL_COOKIE, session, { httpOnly: true, secure: cfg.scheme === 'https', sameSite: 'Strict', path: '/', maxAge: PORTAL_SESSION_DAYS * 86400 });
    return c.json({ ok: true, locale: person!.locale ?? null });
  });

  app.post('/papi/auth/logout', async (c) => {
    const token = getCookie(c, PORTAL_COOKIE);
    if (token) {
      const hash = await sha256Hex(token);
      await deps.db.system((q) => q.query('update portal_sessions set revoked_at = now() where token_hash = $1 and org_id = $2', [hash, c.get('org').id]));
    }
    deleteCookie(c, PORTAL_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  // ------------------------------------------------------------ person
  app.use('/papi/*', async (c, next) => {
    const token = getCookie(c, PORTAL_COOKIE);
    if (!token) fail('unauthenticated');
    const org = c.get('org');
    const hash = await sha256Hex(token!);
    const [s] = await deps.db.system((q) =>
      q.query(
        `select s.id, s.last_seen_at < now() - interval '5 minutes' as stale, pu.id as person_id, pu.name, pu.account_id, pu.locale
           from portal_sessions s join portal_users pu on pu.id = s.portal_user_id and pu.org_id = s.org_id
          where s.token_hash = $1 and s.org_id = $2 and s.revoked_at is null and s.expires_at > now() and pu.status = 'active'`,
        [hash, org.id],
      ),
    );
    if (!s) fail('unauthenticated');
    c.set('person', { id: s.person_id, name: s.name, accountId: s.account_id, sessionId: s.id });
    if (s.locale && !c.req.header('x-tendwell-locale')) c.set('locale', normalizeLocale(s.locale));
    if (s.stale) {
      await deps.db.system(async (q) => {
        await q.query('update portal_sessions set last_seen_at = now() where id = $1', [s.id]);
        await q.query('update portal_users set last_seen_at = now() where id = $1', [s.person_id]);
      });
    }
    await next();
  });

  const one = async (c: any, sql: string, params: unknown[]) => {
    const [r] = await db(c, (q) => q.query(sql, params));
    return Object.values(r ?? {})[0] as any;
  };
  const id = (c: any, name: string) => {
    const v = c.req.param(name);
    if (!uuid.safeParse(v).success) fail('not_found');
    return v as string;
  };

  app.get('/papi/me', async (c) => {
    const me = await one(c, 'select portal_me() as me', []);
    if (!me) fail('unauthenticated');
    return c.json(me);
  });

  app.get('/papi/boards/:id/tasks', async (c) => c.json({ tasks: await one(c, 'select portal_tasks($1) as t', [id(c, 'id')]) }));

  app.get('/papi/tasks/:id', async (c) => c.json({ task: await one(c, 'select portal_task($1) as t', [id(c, 'id')]) }));

  app.post('/papi/boards/:id/tasks', async (c) => {
    const parsed = z
      .object({ title: z.string().trim().min(3).max(300), description: z.string().trim().max(20000).default('') })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(body)'))];
      fail('validation', { fields: fields.join(', ') }, { fields });
    }
    const taskId = await one(c, 'select portal_create_task($1, $2, $3) as id', [id(c, 'id'), parsed.data!.title, parsed.data!.description]);
    await tellTeam(c, taskId, 'assigned');
    return c.json({ task: await one(c, 'select portal_task($1) as t', [taskId]) }, 201);
  });

  app.post('/papi/tasks/:id/comments', async (c) => {
    const parsed = z.object({ body: z.string().trim().min(1).max(10000) }).safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) fail('validation', { fields: 'body' }, { fields: ['body'] });
    const taskId = id(c, 'id');
    await one(c, 'select portal_comment($1, $2) as id', [taskId, parsed.data!.body]);
    await tellTeam(c, taskId, 'comment', parsed.data!.body);
    return c.json({ task: await one(c, 'select portal_task($1) as t', [taskId]) }, 201);
  });

  /** The people working the task hear about it, in the app and in chat, like any other change. */
  async function tellTeam(c: any, taskId: string, kind: 'assigned' | 'comment', body?: string) {
    const org = c.get('org');
    const person = c.get('person');
    await deps.db.system(async (q) => {
      const [t] = await q.query(`select t.assignee_ids, a.name as account from tasks t left join accounts a on a.id = t.account_id where t.id = $1 and t.org_id = $2`, [taskId, org.id]);
      if (!t) return;
      const by = t.account ? `${person.name} (${t.account})` : person.name;
      await enqueue(
        q,
        (t.assignee_ids ?? []).map((u: string) => ({ orgId: org.id, userId: u, kind, taskId, data: { by, portal: true, ...(body ? { excerpt: body.slice(0, 280) } : {}) } })),
      );
    });
    kick(deps);
  }

  app.all('/papi/*', () => fail('not_found'));
  return app;
}
