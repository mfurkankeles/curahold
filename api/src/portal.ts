// The customer portal's API (/papi), served only on the portal's own domain
// (acme.curahold-portal.com). It shares nothing with the app's API: its own
// cookie, its own sessions, and a database role that can only call the
// portal_* functions (db/migrations/0011_portal.sql).
import { PORTAL_HEADERS } from './lib/headers';
import { clientIp, isSignIn, isUpload, isWrite, limited, sharedLimiter, takeAll, type BudgetName } from './lib/ratelimit';
import { edgeAnswer, raiseTrafficAlert, robotRefusal, sharedWatch } from './lib/botGuard';
import { turnstileSiteKey } from './lib/humanCheck';
import { CLOSED_X_ROBOTS } from '../../shared/src/compliance/crawlers';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
import { normalizeLocale, translate, type Locale } from '../../shared/src/i18n';
import type { PortalOrg } from '../../shared/src/portal';
import { slugFromHost } from './app';
import { defer, nowOf, type Deps, type OrgRow } from './context';
import { runTaskEvent } from './lib/automations';
import type { Q } from './db';
import { sha256Hex } from './lib/crypto';
import { HttpError, fail } from './lib/errors';
import { flushHealth } from './lib/health';
import { readiness } from './lib/ops';
import { quarantine, released } from './lib/uploadScan';
import { enqueue, kick } from './lib/notify';
import { PORTAL_COOKIE, methodAllowed, portalAuth, portalBrand, portalBytesUsed, portalFiles, portalOn, portalQuotaMb, signInOptions, type PortalEnv } from './lib/portal';
import { PORTAL_FILE_MB, PORTAL_MAX_FILES } from '../../shared/src/portal';
import { mountAccount, mountSignIn } from './portalSignIn';
import { uuid } from './lib/validate';
import { deliverWebhooks } from './lib/webhooks';
import { portalAssist, portalAssistAvailable, portalAssistConsent } from './routes/assist';

/** Errors raised inside the portal_* functions, by name. */
const DB_ERRORS: Record<string, 'unauthenticated' | 'not_found' | 'too_many_requests'> = {
  portal_signed_out: 'unauthenticated',
  portal_not_found: 'not_found',
  portal_rate: 'too_many_requests',
};

export function createPortalApp(deps: Deps) {
  const app = new Hono<PortalEnv>();
  const cfg = deps.config;

  // Robots (lib/botGuard.ts): robots.txt says Disallow: / here, crawlers are refused by name, bursts are noted.
  const watch = deps.watch ?? sharedWatch;
  const notice = (kind: 'limited' | 'refused', ip: string | null, detail: string) => {
    const alert = watch.note(kind, ip, detail);
    if (alert) defer(deps, raiseTrafficAlert(deps, alert));
  };
  app.use('*', async (c, next) => {
    const early = edgeAnswer(c.req.raw, { ...cfg, centralHost: '' });
    if (early) return early;
    const ip = clientIp(c, cfg.clientIp);
    const refused = robotRefusal(cfg.robotGuard, { path: c.req.path, ua: c.req.header('user-agent'), bearer: false });
    if (refused) {
      notice('refused', ip, refused);
      return c.json({ error: 'robot_refused', message: translate(normalizeLocale(c.req.header('x-curahold-locale'), 'en'), 'errors.robot_refused') }, 403);
    }
    await next();
    if (c.res.status === 429) notice('limited', ip, c.req.path);
  });

  app.use('*', async (c, next) => {
    await next();
    c.header('x-content-type-options', 'nosniff');
    c.header('x-robots-tag', CLOSED_X_ROBOTS);
    c.header('referrer-policy', 'no-referrer');
    // The page's own policy when this app serves it (self-hosted, local): no framing, scripts from here only.
    for (const [k, v] of Object.entries(PORTAL_HEADERS)) if (!c.res.headers.has(k)) c.header(k, v);
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
    console.error('[curahold] portal', err);
    return c.json({ error: 'server', message: translate(locale, 'errors.server') }, 500);
  });

  const db = (c: { get: (k: 'org' | 'person') => any }, fn: (q: Q) => Promise<any>) =>
    deps.db.portal({ orgId: c.get('org').id, portalUserId: c.get('person')?.id ?? null }, fn);

  // Liveness and readiness for the status page and the synthetic check (no company, no data).
  app.get('/papi/health', async (c) => {
    const r = await readiness(deps);
    c.header('access-control-allow-origin', '*');
    return c.json(r, r.ok ? 200 : 503);
  });

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
    const want = c.req.header('x-curahold-locale');
    c.set('locale', normalizeLocale(want, org.locale));
    // A form on another site cannot set this header, so it cannot act for someone here.
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.header('x-curahold-portal') !== '1') fail('forbidden');
    await next();
  });

  app.get('/papi/org', (c) => {
    const org = c.get('org');
    const out: PortalOrg = {
      name: org.name,
      locale: org.locale,
      logoUrl: (org.settings as any)?.logo?.key ? `/papi/logo?v=${encodeURIComponent(String((org.settings as any).logo.v ?? 1))}` : null,
      signIn: signInOptions(org, deps),
      brand: portalBrand(org),
      turnstile: turnstileSiteKey(deps),
      docsBase: `${deps.config.scheme}://${deps.config.centralHost}/docs/`,
    };
    return c.json(out);
  });

  app.get('/papi/logo', async (c) => {
    const key = (c.get('org').settings as any)?.logo?.key as string | undefined;
    const obj = key ? await deps.storage.get(key) : null;
    if (!obj) fail('not_found');
    return c.body(obj!.data, 200, { 'content-type': obj!.mime, 'cache-control': 'public, max-age=86400' });
  });

  // ------------------------------------------------------------ request limits (lib/ratelimit.ts)
  const limiter = deps.limiter ?? sharedLimiter;
  const scale = cfg.limitScale ?? 1;
  app.use('/papi/*', async (c, next) => {
    if (!(scale > 0)) return next();
    const org = c.get('org');
    const ip = clientIp(c, cfg.clientIp);
    const signin = isSignIn(c.req.method, c.req.path);
    const checks: [string, BudgetName][] = [[`portal-org:${org.id}`, 'company']];
    if (ip) checks.unshift([`ip:${ip}`, 'ip'], ...(signin ? ([[`signin:${ip}`, 'signin']] as [string, BudgetName][]) : []));
    if (signin) checks.push([`portal-signin-org:${org.id}`, 'signinCompany']);
    const wait = takeAll(limiter, scale, checks);
    if (wait) return limited(c, wait, c.get('locale'));
    await next();
  });

  // ------------------------------------------------------------ sign-in
  const signIn = mountSignIn(app, deps);

  // ------------------------------------------------------------ person
  app.use('/papi/*', async (c, next) => {
    const token = getCookie(c, PORTAL_COOKIE);
    if (!token) fail('unauthenticated');
    const org = c.get('org');
    const hash = await sha256Hex(token!);
    const [s] = await deps.db.system((q) =>
      q.query(
        `select s.id, s.method, s.last_seen_at < now() - interval '5 minutes' as stale, pu.id as person_id, pu.name, pu.account_id, pu.locale
           from portal_sessions s join portal_users pu on pu.id = s.portal_user_id and pu.org_id = s.org_id
          where s.token_hash = $1 and s.org_id = $2 and s.revoked_at is null and s.expires_at > now() and pu.status = 'active'
            and s.created_at > now() - make_interval(days => $3)`,
        [hash, org.id, portalAuth(org).sessionDays],
      ),
    );
    // A shorter session length, or a way of signing in switched off, ends these sessions too.
    if (!s || !methodAllowed(signInOptions(org, deps), s.method)) fail('unauthenticated');
    c.set('person', { id: s.person_id, name: s.name, accountId: s.account_id, sessionId: s.id });
    if (s.locale && !c.req.header('x-curahold-locale')) c.set('locale', normalizeLocale(s.locale));
    if (s.stale) {
      await deps.db.system(async (q) => {
        await q.query('update portal_sessions set last_seen_at = now() where id = $1', [s.id]);
        await q.query('update portal_users set last_seen_at = now() where id = $1', [s.person_id]);
      });
    }
    if (scale > 0) {
      const who = `portal:${org.id}:${s.person_id}`;
      const checks: [string, BudgetName][] = [[`person:${who}`, 'person']];
      if (isWrite(c.req.method)) checks.push([`write:${who}`, 'write']);
      if (isUpload(c.req.method, c.req.path, c.req.header('content-type'))) checks.push([`upload:${who}`, 'upload'], [`upload-org:portal:${org.id}`, 'uploadCompany']);
      const wait = takeAll(limiter, scale, checks);
      if (wait) return limited(c, wait, c.get('locale'));
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

  mountAccount(app, deps, signIn);

  app.get('/papi/me', async (c) => {
    const me = await one(c, 'select portal_me() as me', []);
    if (!me) fail('unauthenticated');
    return c.json(me);
  });

  // The portal's assistant: how to use the portal, and the person's own requests (routes/assist.ts).
  app.post('/papi/assist', (c) => portalAssist(c, deps, (fn) => db(c, fn)));
  app.get('/papi/assist/status', (c) => c.json({ available: portalAssistAvailable(deps, c.get('org')) }));
  // The consent notice's answer (KVKK/GDPR): asked before the first question, withdrawable from the chat.
  app.get('/papi/assist/consent', (c) => portalAssistConsent(c, (fn) => db(c, fn)));
  app.post('/papi/assist/consent', (c) => portalAssistConsent(c, (fn) => db(c, fn)));

  app.get('/papi/boards/:id/tasks', async (c) => c.json({ tasks: await one(c, 'select portal_tasks($1) as t', [id(c, 'id')]) }));

  /** A request as the customer sees it, with the files they may open. */
  const taskOf = async (c: any, taskId: string) => {
    const task = await one(c, 'select portal_task($1) as t', [taskId]);
    return { ...task, files: await one(c, 'select portal_task_files($1) as f', [taskId]) };
  };

  app.get('/papi/tasks/:id', async (c) => c.json({ task: await taskOf(c, id(c, 'id')) }));

  /** JSON alone, or a form with the fields in "data" and up to PORTAL_MAX_FILES files, each checked. */
  const input = async (c: any) => {
    if (!(c.req.header('content-type') ?? '').startsWith('multipart/form-data')) return { raw: await c.req.json().catch(() => ({})), files: [] };
    if (Number(c.req.header('content-length') ?? 0) > PORTAL_MAX_FILES * PORTAL_FILE_MB * 1024 * 1024 + 256 * 1024) fail('file_too_large', { mb: PORTAL_FILE_MB });
    const form = await c.req.parseBody({ all: true });
    let raw: unknown = {};
    try {
      raw = JSON.parse(String(form.data ?? '{}'));
    } catch {
      raw = {};
    }
    const files = await portalFiles(form);
    await withinQuota(c, files);
    return { raw, files };
  };
  /** The company's allowance for its customers' files (Settings → Customer portal) is not passed. */
  const withinQuota = async (c: any, files: { size: number }[]) => {
    if (!files.length) return;
    const org = c.get('org');
    const used = await deps.db.system((q) => portalBytesUsed(q, org.id));
    const quota = portalQuotaMb(org.settings) * 1024 * 1024;
    if (used + files.reduce((n, f) => n + f.size, 0) > quota) fail('portal_quota');
  };

  /**
   * Keeps one file, then records it. The database decides whether it may be kept (the
   * person's own request or step, the daily count): when it refuses, the bytes go too, so a
   * refused upload never stays in storage outside the company's quota.
   */
  const keep = async (key: string, f: { data: ArrayBuffer; mime: string }, record: () => Promise<unknown>) => {
    await deps.storage.put(key, f.data, f.mime);
    try {
      await record();
    } catch (e) {
      await deps.storage.delete(key).catch(() => undefined);
      throw e;
    }
    // With a scanner configured, nobody opens it until it is found clean (lib/uploadScan.ts).
    await quarantine(deps, key.slice(0, 36), key);
  };

  /** Keeps the files, then records each on the request (comment null) or on the reply. */
  const attach = async (c: any, taskId: string, commentId: string | null, files: Awaited<ReturnType<typeof portalFiles>>) => {
    const org = c.get('org');
    for (const f of files) {
      const key = `${org.id}/${taskId}/${crypto.randomUUID()}`;
      await keep(key, f, () => one(c, 'select portal_add_file($1, $2, $3, $4, $5, $6) as id', [taskId, commentId, f.name, f.size, f.mime, key]));
    }
  };

  app.post('/papi/boards/:id/tasks', async (c) => {
    const { raw, files } = await input(c);
    const parsed = z.object({ title: z.string().trim().min(3).max(300), description: z.string().trim().max(20000).default('') }).safeParse(raw);
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(body)'))];
      fail('validation', { fields: fields.join(', ') }, { fields });
    }
    const taskId = await one(c, 'select portal_create_task($1, $2, $3) as id', [id(c, 'id'), parsed.data!.title, parsed.data!.description]);
    await attach(c, taskId, null, files);
    await tellTeam(c, taskId, 'assigned');
    await runTaskEvent(deps, c.get('org').id, taskId, 'form_received', nowOf(deps)).catch(() => 0);
    return c.json({ task: await taskOf(c, taskId) }, 201);
  });

  app.post('/papi/tasks/:id/comments', async (c) => {
    const { raw, files } = await input(c);
    const parsed = z.object({ body: z.string().trim().max(10000).default('') }).safeParse(raw);
    // Words, files, or both; a reply of files alone is named after them.
    const body = parsed.success ? parsed.data.body || files.map((f) => f.name).join(', ').slice(0, 10000) : '';
    if (!body) fail('validation', { fields: 'body' }, { fields: ['body'] });
    const taskId = id(c, 'id');
    const commentId = await one(c, 'select portal_comment($1, $2) as id', [taskId, body]);
    await attach(c, taskId, commentId, files);
    await tellTeam(c, taskId, 'comment', body);
    return c.json({ task: await taskOf(c, taskId) }, 201);
  });

  // "Done the way we wanted": on a finished request, once; it also goes into the conversation.
  app.post('/papi/tasks/:id/approve', async (c) => {
    const taskId = id(c, 'id');
    const org = c.get('org');
    const body = translate(org.locale, 'portal.approvedComment', {}, org.terms);
    const commentId = await one(c, 'select portal_approve($1, $2) as id', [taskId, body]);
    if (commentId) await tellTeam(c, taskId, 'comment', body);
    return c.json({ task: await taskOf(c, taskId) });
  });

  // ------------------------------------------------------------ onboarding (db/migrations/0200_onboarding.sql)
  // The customer's own plans, in the company's colours; they tick their own manual
  // steps, answer a step's form (written to their record), say a mapping row looks
  // right, and raise an issue for the company's side.
  app.get('/papi/onboarding', async (c) => c.json({ plans: (await one(c, 'select portal_onboarding() as p', [])) ?? [] }));
  app.post('/papi/onboarding/:id/:kind', async (c) => {
    const kind = c.req.param('kind');
    if (!['tick', 'check', 'issue', 'answer'].includes(kind)) fail('not_found');
    const raw = await c.req.json().catch(() => ({}));
    const parsed = z.record(z.string(), z.string().max(4000)).safeParse(raw);
    if (!parsed.success) fail('validation', { fields: '(body)' }, { fields: ['(body)'] });
    const out = await one(c, 'select portal_onboarding_act($1, $2, $3) as r', [kind, id(c, 'id'), JSON.stringify(parsed.data)]);
    // The plan's owner hears of a new issue in the app.
    if (kind === 'issue' && out?.id) {
      const org = c.get('org');
      await deps.db.system(async (q) => {
        const [p] = await q.query(`select p.id, p.name, p.owner_id, p.account_id from onboarding_issues i join onboarding_plans p on p.id = i.plan_id where i.id = $1 and i.org_id = $2`, [out.id, org.id]);
        if (p?.owner_id) await enqueue(q, [{ orgId: org.id, userId: p.owner_id, kind: 'onboarding', data: { what: 'issue', plan: p.name, planId: p.id, kind: 'client', accountId: p.account_id, step: parsed.data!.title ?? '' } }]);
      });
    }
    return c.json({ plans: (await one(c, 'select portal_onboarding() as p', [])) ?? [] });
  });

  // A file on a step of the customer's own plan (a step on their side, or one that asks for a file).
  app.post('/papi/onboarding-steps/:id/files', async (c) => {
    const stepId = id(c, 'id');
    const { files } = await input(c);
    if (!files.length) fail('validation', { fields: 'files' }, { fields: ['files'] });
    const org = c.get('org');
    for (const f of files) {
      const key = `${org.id}/onboarding/${stepId}/${crypto.randomUUID()}`;
      await keep(key, f, () => one(c, 'select portal_onboarding_add_file($1, $2, $3, $4, $5) as id', [stepId, f.name, f.size, f.mime, key]));
    }
    // The plan's owner hears of it in the app.
    await deps.db.system(async (q) => {
      const [p] = await q.query(
        `select p.id, p.name, p.owner_id, p.account_id, s.title, s.title_key from onboarding_steps s join onboarding_plans p on p.id = s.plan_id where s.id = $1 and s.org_id = $2`,
        [stepId, org.id],
      );
      if (p?.owner_id) await enqueue(q, [{ orgId: org.id, userId: p.owner_id, kind: 'onboarding', data: { what: 'file', plan: p.name, planId: p.id, kind: 'client', accountId: p.account_id, step: p.title ?? '', stepKey: p.title_key ?? '' } }]);
    });
    return c.json({ plans: (await one(c, 'select portal_onboarding() as p', [])) ?? [] }, 201);
  });

  // A file is always a download, never shown in the page, and can run nothing.
  app.get('/papi/files/:id', async (c) => {
    const f = await one(c, 'select portal_file($1) as f', [id(c, 'id')]);
    if (!(await released(deps, c.get('org').id, f.key))) fail('file_quarantined');
    const obj = await deps.storage.get(f.key);
    if (!obj) fail('not_found');
    return c.body(obj!.data, 200, {
      'content-type': f.mime,
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      'content-security-policy': "default-src 'none'; sandbox",
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    });
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
