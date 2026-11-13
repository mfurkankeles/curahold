// The Curahold API. One Hono app runs on Cloudflare Workers (worker.ts) and
// on Node for development and tests (node.ts).
//
// Request flow: the subdomain picks the company (acme.curahold.com → "acme"),
// the session cookie picks the person, and every query then runs inside
// db.tenant(...) so row-level security keeps companies apart.
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { normalizeLocale, translate, type Locale } from '../../shared/src/i18n';
import type { Perm } from '../../shared/src/model';
import { assertOwnerConfigured, defer, type AppEnv, type Deps, type OrgRow } from './context';
import { securityHeaders } from './lib/headers';
import { deliverWebhooks } from './lib/webhooks';
import { Repeated, rememberAnswer, repeatKeyOf, repeatedAnswer, storedAnswer } from './lib/repeats';
import { flushHealth } from './lib/health';
import { recordError } from './lib/errlog';
import { timelineRoutes } from './routes/timeline';
import { meetingRoutes } from './routes/meetings';
import { billingRoutes, billingWebhook } from './routes/billing';
import { inboundRoutes, ticketRoutes } from './routes/tickets';
import { sha256Hex } from './lib/crypto';
import { audit } from './lib/audit';
import { HttpError, fail } from './lib/errors';
import { accountRoutes } from './routes/accounts';
import { recordRoutes } from './routes/records';
import { syncRoutes } from './routes/sync';
import { devInboundRoutes, devLinkRoutes } from './routes/devlinks';
import { jiraRoutes } from './routes/jira';
import { subscriptionRoutes, paddleInboundWebhook } from './routes/subscriptions';
import { onboardingRoutes } from './routes/onboarding';
import { platformRoutes } from './routes/admin-platform';
import { consentRoutes } from './routes/consent';
import { adminRoutes } from './routes/admin';
import { automationRoutes } from './routes/automations';
import { trashRoutes } from './routes/trash';
import { calendarRoutes } from './routes/calendar';
import { replayRoutes } from './routes/replay';
import { deskRoutes } from './routes/desk';
import { connectCallback_, connectionRoutes } from './routes/connections';
import { hookRoutes } from './routes/hooks';
import { setupRoutes } from './routes/setup';
import { signupRoutes } from './routes/signup';
import { authRoutes, oauthCallback, SESSION_COOKIE } from './routes/auth';
import { boardRoutes } from './routes/boards';
import { meRoutes } from './routes/me';
import { metricsRoutes } from './routes/metrics';
import { pmRoutes } from './routes/pm';
import { taskRoutes } from './routes/tasks';
import { workRoutes } from './routes/work';
import { reportRoutes } from './routes/reports';
import { builderRoutes } from './routes/builder';
import { pageRoutes } from './routes/pages';
import { searchRoutes } from './routes/search';
import { developerRoutes } from './routes/developer';
import { mcpRoutes } from './routes/mcp';
import { oauthApi, oauthRoutes } from './routes/oauth';
import { resolveToken } from './lib/tokens';
import { helpRoutes, supportEntry } from './routes/help';
import { portalRoutes } from './routes/portal';
import { signInSupport } from './lib/support';

const RESERVED = new Set(['www', 'app', 'api', 'auth', 'admin', 'mail', 'status', 'docs', 'help', 'desk']);

export function slugFromHost(host: string, baseDomain: string): string | null {
  const h = host.split(':')[0].toLowerCase();
  const base = baseDomain.toLowerCase();
  if (!h.endsWith(`.${base}`)) return null;
  const sub = h.slice(0, -(base.length + 1));
  if (!sub || sub.includes('.') || RESERVED.has(sub)) return null;
  return sub;
}

/**
 * The language of an answer: what the person chose (the app sends it), else the
 * company's own language. The browser's language is not consulted: English is
 * where everyone starts, and another language is a choice somebody made.
 */
function requestLocale(header: string | undefined, fallback: Locale): Locale {
  return header === 'tr' || header === 'en' ? header : fallback;
}

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>();
  const cfg = deps.config;
  assertOwnerConfigured(cfg);

  // Browser-side protections on every answer (CSP, HSTS, framing, sniffing); see lib/headers.ts.
  app.use('*', securityHeaders(cfg.scheme === 'https'));

  app.use('*', async (c, next) => {
    c.set('deps', deps);
    c.set('self', app);
    await next();
    // Webhooks: deliver what this change produced right after answering.
    if (deps.defer && c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.path.startsWith('/api/') && c.res.status < 400) {
      // Scores of the customers this change touched, then the webhooks (a new score is a change too).
      defer(deps, flushHealth(deps, 200).then(() => deliverWebhooks(deps, 20)));
    }
  });

  app.onError((err, c) => {
    const org = c.get('org') as OrgRow | undefined;
    const locale = (c.get('locale') as Locale | undefined) ?? org?.locale ?? 'en';
    // The same change sent again: the first answer, not the work a second time (lib/repeats.ts).
    if (err instanceof Repeated) {
      const key = c.get('repeat')?.key;
      const auth = c.get('auth');
      return repeatedAnswer(c, err.first, key && org && auth ? () => c.get('deps').db.tenant({ orgId: org.id, userId: auth.userId }, (q) => storedAnswer(q, key)) : undefined);
    }
    if (err instanceof HttpError) {
      return c.json(
        { error: err.code, message: translate(locale, err.key, err.vars, org?.terms), ...err.extra },
        err.status as any,
      );
    }
    console.error('[curahold] unhandled', err);
    // Record it, so a real fault is seen and fixed, not lost to the console.
    const auth = c.get('auth');
    defer(
      c.get('deps'),
      recordError(c.get('deps'), {
        source: 'server',
        orgId: org?.id ?? null,
        userId: auth?.userId ?? null,
        method: c.req.method,
        path: c.req.path,
        message: err instanceof Error ? err.message : String(err),
        detail: err instanceof Error ? err.stack : undefined,
      }),
    );
    return c.json({ error: 'server', message: translate(locale, 'errors.server') }, 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true }));

  // The central address (app.curahold.com): OAuth returns, chat services'
  // inbound calls and company sign-up — all before any company is known.
  app.get('/api/oauth/callback', oauthCallback);
  app.get('/api/connect/callback', connectCallback_);
  app.route('/api/hooks', hookRoutes);
  app.route('/api/signup', signupRoutes);
  // Curahold's own support desk and the door for incoming mail (staff key / mail key).
  app.route('/api/desk', deskRoutes);
  // Paddle's notifications about subscriptions (checked against its secret).
  app.post('/api/billing/webhook', billingWebhook);
  // Paddle notifications for the table-based subscription system (signature-checked).
  app.post('/api/inbound/billing/paddle', paddleInboundWebhook);

  // ---------------------------------------------------------------- company
  const companyFromHost = async (c: any, next: () => Promise<void>) => {
    const host = c.req.header('host') ?? new URL(c.req.url).host;
    let slug = cfg.singleTenantSlug ?? slugFromHost(host, cfg.baseDomain);
    if (!slug && cfg.devOrgHeader) slug = c.req.header('x-curahold-org') ?? null;
    if (!slug) fail('org_not_found');
    const rows = await deps.db.tenant({ orgId: null, userId: null }, (q) =>
      q.query<OrgRow>('select * from resolve_org($1)', [slug]),
    );
    if (!rows[0]) fail('org_not_found');
    const org: OrgRow = {
      ...rows[0],
      locale: normalizeLocale(rows[0].locale),
      terms: rows[0].terms ?? {},
      settings: rows[0].settings ?? {},
      domains: rows[0].domains ?? [],
      account_fields: rows[0].account_fields ?? [],
      setup: rows[0].setup ?? {},
      billing: rows[0].billing ?? {},
      trial_ends_at: rows[0].trial_ends_at ?? null,
    };
    c.set('org', org);
    c.set('locale', requestLocale(c.req.header('x-curahold-locale'), org.locale));

    // Cross-site forms cannot set custom headers, so requiring one on every
    // write blocks request forgery (the session cookie is also SameSite=Lax).
    // Calls with an API key or app token carry no cookie, so they cannot be forged that way.
    const bearer = /^Bearer\s/i.test(c.req.header('authorization') ?? '');
    // Inbound webhooks carry their own secret in the address and come from servers, not browsers.
    const inbound = c.req.path.startsWith('/api/inbound/');
    // Curahold support's own tooling carries its key in a header, which a form cannot set either.
    const custom = c.req.header('x-curahold-device') || c.req.header('x-curahold-staff-key');
    if (c.req.path.startsWith('/api/') && !bearer && !inbound && c.req.method !== 'GET' && c.req.method !== 'HEAD' && !custom) fail('forbidden');
    await next();
  };
  app.use('/api/*', companyFromHost);
  // Apps and AI assistants (OAuth, MCP) reach the company at its own address.
  app.use('/mcp', companyFromHost);
  app.use('/oauth/*', companyFromHost);
  app.use('/.well-known/*', companyFromHost);
  app.route('/', oauthRoutes);
  app.route('/', mcpRoutes);

  // Public, per company: login page data and the sign-in steps.
  app.route('/api', authRoutes);
  app.route('/api', inboundRoutes);
  // GitHub / GitLab webhooks that link branches, pull requests and commits to tasks (signed, like the ticket inbound).
  app.route('/api', devInboundRoutes);
  // Curahold support: the entry link, its session, the desk's file links.
  app.route('/api', supportEntry);

  // ---------------------------------------------------------------- person
  app.use('/api/*', async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    const bearer = /^Bearer\s+(\S+)/i.exec(c.req.header('authorization') ?? '')?.[1];
    if (!token && bearer) {
      // An API key or an app's token: it acts as its owner, read only unless allowed to write.
      const t = await resolveToken(deps.db, c.get('org').id, bearer);
      if (!t) fail('unauthenticated');
      if (!t!.canWrite && c.req.method !== 'GET' && c.req.method !== 'HEAD') fail('read_only_token');
      const u = t!.user;
      c.set('auth', {
        userId: u.user_id,
        sessionId: t!.tokenId,
        name: u.name,
        email: u.email,
        roleId: u.role_id,
        roleKey: u.role_key,
        perms: (u.perms ?? []) as Perm[],
        seat: t!.canWrite ? u.seat : 'viewer',
        locale: u.locale ? normalizeLocale(u.locale) : null,
      });
      c.set('tokenKind', t!.kind);
      if (u.locale && !c.req.header('x-curahold-locale')) c.set('locale', normalizeLocale(u.locale));
      await next();
      return;
    }
    // Curahold support, inside with someone's consent: acts as them (lib/support.ts).
    if (!token && (await signInSupport(c))) {
      await next();
      return;
    }
    if (!token) fail('unauthenticated');
    const org = c.get('org');
    const hash = await sha256Hex(token!);
    const rows = await deps.db.tenant({ orgId: org.id, userId: null }, (q) =>
      q.query(
        `select s.id as session_id, s.device_id, s.revoked_at, s.revoke_reason,
                s.expires_at < now() as expired,
                s.last_seen_at < now() - interval '5 minutes' as stale,
                u.id as user_id, u.name, u.email, u.seat, u.status, u.locale,
                r.id as role_id, r.key as role_key, r.perms
           from sessions s
           join users u on u.id = s.user_id
           join roles r on r.id = u.role_id
          where s.token_hash = $1`,
        [hash],
      ),
    );
    const s = rows[0];
    if (!s) fail('unauthenticated');
    if (s.revoked_at) fail(s.revoke_reason === 'device_limit' ? 'session_evicted' : 'unauthenticated');
    if (s.expired || s.status !== 'active') fail('unauthenticated');
    if (c.req.header('x-curahold-device') && c.req.header('x-curahold-device') !== s.device_id) fail('device_mismatch');
    c.set('auth', {
      userId: s.user_id,
      sessionId: s.session_id,
      name: s.name,
      email: s.email,
      roleId: s.role_id,
      roleKey: s.role_key,
      perms: (s.perms ?? []) as Perm[],
      seat: s.seat,
      locale: s.locale ? normalizeLocale(s.locale) : null,
    });
    if (s.locale && !c.req.header('x-curahold-locale')) c.set('locale', normalizeLocale(s.locale));
    if (s.stale) {
      await deps.db.tenant({ orgId: org.id, userId: s.user_id }, async (q) => {
        await q.query('update sessions set last_seen_at = now() where id = $1', [s.session_id]);
        await q.query('update users set last_active_at = now() where id = $1', [s.user_id]);
      });
    }
    // "See it as them": an administrator reads Curahold with someone else's
    // role, seat and customers. The database checks run as that person, so
    // what shows is exactly what they get. Nothing can be changed this way.
    const previewAs = c.req.header('x-curahold-preview-as');
    if (previewAs && previewAs !== s.user_id) {
      if (!((s.perms ?? []) as string[]).includes('org.manage')) fail('forbidden');
      if (c.req.method !== 'GET' && c.req.method !== 'HEAD') fail('preview_read_only');
      if (!/^[0-9a-f-]{36}$/i.test(previewAs) || c.req.path.startsWith('/api/me/sessions')) fail('forbidden');
      const [t] = await deps.db.tenant({ orgId: org.id, userId: s.user_id }, (q) =>
        q.query(
          `select u.id, u.name, u.email, u.seat, u.status, r.id as role_id, r.key as role_key, r.perms
             from users u join roles r on r.id = u.role_id where u.id = $1`,
          [previewAs],
        ),
      );
      if (!t || t.status !== 'active') fail('not_found');
      const real = c.get('auth');
      c.set('previewBy', { id: real.userId, name: real.name });
      c.set('auth', { ...real, userId: t.id, name: t.name, email: t.email, roleId: t.role_id, roleKey: t.role_key, perms: (t.perms ?? []) as Perm[], seat: t.seat });
      if (c.req.path === '/api/me') {
        await deps.db.tenant({ orgId: org.id, userId: real.userId }, (q) =>
          audit(q, { orgId: org.id, actorId: real.userId, action: 'user.previewed', entity: 'user', entityId: t.id }),
        );
      }
    }
    await next();
  });

  // A change that carries a key happens once: the key is claimed by the request's first
  // transaction, and the answer is kept for whoever sends the key again (lib/repeats.ts).
  app.use('/api/*', async (c, next) => {
    const repeat = c.get('auth') ? await repeatKeyOf(c) : null;
    if (!repeat) return next();
    c.set('repeat', repeat);
    await next();
    if (repeat.claimed && !(c.error instanceof Repeated)) {
      const res = c.res;
      const auth = c.get('auth');
      await c
        .get('deps')
        .db.tenant({ orgId: c.get('org').id, userId: auth.userId }, (q) => rememberAnswer(q, repeat, res))
        .catch((e) => console.error('[curahold] could not keep the answer of a repeatable request', e));
    }
  });
  app.route('/api', meRoutes);
  app.route('/api', metricsRoutes);
  app.route('/api', boardRoutes);
  app.route('/api', taskRoutes);
  app.route('/api', pmRoutes);
  app.route('/api', workRoutes);
  app.route('/api', reportRoutes);
  app.route('/api', builderRoutes);
  app.route('/api', accountRoutes);
  app.route('/api', recordRoutes);
  app.route('/api', pageRoutes);
  app.route('/api', searchRoutes);
  app.route('/api', timelineRoutes);
  app.route('/api', meetingRoutes);
  app.route('/api', billingRoutes);
  app.route('/api', subscriptionRoutes);
  app.route('/api', onboardingRoutes);
  app.route('/api', platformRoutes);
  app.route('/api', consentRoutes);
  app.route('/api', ticketRoutes);
  app.route('/api', developerRoutes);
  app.route('/api', helpRoutes);
  app.route('/api', portalRoutes);
  app.route('/api', oauthApi);
  app.route('/api', syncRoutes);
  app.route('/api', jiraRoutes);
  app.route('/api', devLinkRoutes);
  app.route('/api', connectionRoutes);
  app.route('/api', automationRoutes);
  app.route('/api', trashRoutes);
  app.route('/api', calendarRoutes);
  app.route('/api', replayRoutes);
  app.route('/api/setup', setupRoutes);
  app.route('/api/admin', adminRoutes);

  app.all('/api/*', () => fail('not_found'));
  return app;
}
