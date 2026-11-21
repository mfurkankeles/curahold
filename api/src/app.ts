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
import { recordError, redact } from './lib/errlog';
import { timelineRoutes } from './routes/timeline';
import { meetingRoutes } from './routes/meetings';
import { billingRoutes, billingWebhook } from './routes/billing';
import { inboundRoutes, ticketRoutes } from './routes/tickets';
import { sha256Hex } from './lib/crypto';
import { audit } from './lib/audit';
import { HttpError, fail } from './lib/errors';
import { MailError } from './lib/services';
import { accountRoutes } from './routes/accounts';
import { recordRoutes } from './routes/records';
import { syncRoutes } from './routes/sync';
import { financeRoutes } from './routes/finance';
import { devInboundRoutes, devLinkRoutes } from './routes/devlinks';
import { segmentInboundRoutes } from './routes/segment';
import { whatsappInboundRoutes } from './routes/whatsapp';
import { inboundHookReceiverRoutes, inboundHookRoutes } from './routes/inboundHooks';
import { jiraRoutes } from './routes/jira';
import { onboardingRoutes } from './routes/onboarding';
import { onboardingPlanRoutes, onboardingShareRoutes } from './routes/onboardingPlans';
import { platformRoutes } from './routes/admin-platform';
import { consentEventRoutes, consentRoutes } from './routes/consent';
import { adminRoutes } from './routes/admin';
import { setupHealthRoutes } from './routes/setupHealth';
import { automationRoutes } from './routes/automations';
import { trashRoutes } from './routes/trash';
import { calendarRoutes } from './routes/calendar';
import { replayRoutes } from './routes/replay';
import { deskRoutes } from './routes/desk';
import { agentRoutes, officeRoutes } from './routes/office';
import { teamRoutes } from './routes/team';
import { ownerRoutes } from './routes/owner';
import { connectCallback_, connectionRoutes } from './routes/connections';
import { hookRoutes } from './routes/hooks';
import { setupRoutes } from './routes/setup';
import { signupRoutes } from './routes/signup';
import { trialRoutes } from './routes/trial';
import { agreementRoutes } from './routes/agreements';
import { authRoutes, oauthCallback, SESSION_COOKIE } from './routes/auth';
import { ssoAuthRoutes, ssoAdminRoutes } from './routes/sso';
import { scimRoutes } from './routes/scim';
import { boardRoutes } from './routes/boards';
import { departmentRoutes } from './routes/departments';
import { handoffRoutes } from './routes/handoff';
import { meRoutes } from './routes/me';
import { metricsRoutes } from './routes/metrics';
import { pmRoutes } from './routes/pm';
import { taskRoutes } from './routes/tasks';
import { workRoutes } from './routes/work';
import { importRoutes } from './routes/imports';
import { loadRoutes } from './routes/load';
import { reportRoutes } from './routes/reports';
import { builderRoutes } from './routes/builder';
import { exportRoutes } from './routes/exports';
import { pageRoutes } from './routes/pages';
import { searchRoutes } from './routes/search';
import { developerRoutes } from './routes/developer';
import { mcpRoutes } from './routes/mcp';
import { identityRoutes } from './routes/identity';
import { securityTxt } from './routes/securitytxt';
import { oauthApi, oauthRoutes } from './routes/oauth';
import { resolveToken } from './lib/tokens';
import { tokenReach, withheldPerms } from './lib/tokenScope';
import { analyticsRoutes, feedChallenge, feedCredential, isFeed } from './routes/analytics';
import { helpRoutes, supportEntry } from './routes/help';
import { portalRoutes } from './routes/portal';
import { assistPublicRoutes, assistRoutes } from './routes/assist';
import { signInSupport } from './lib/support';
import { BUDGETS, INVITES_PER_HOUR, clientIp, isExport, isInvite, isSearch, isSignIn, isUpload, isWrite, limited, sharedLimiter, takeAll, type BudgetName } from './lib/ratelimit';
import { crawlerBearer, edgeAnswer, raiseTrafficAlert, robotRefusal, sharedWatch } from './lib/botGuard';
import { raiseOpsAlert, readiness, sharedOps } from './lib/ops';
import { liveRoutes } from './live/routes';
import { asksForTicket } from './live/protocol';
import { touchesConsole } from './live/platform';

const RESERVED = new Set(['www', 'app', 'api', 'auth', 'admin', 'mail', 'status', 'docs', 'help', 'desk']);

/**
 * The company slug in a request's host (`acme.curahold.com` gives "acme"); null for the bare domain, a reserved
 * subdomain, a deeper subdomain or any other domain.
 */
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
  return normalizeLocale(header, fallback);
}

/**
 * Builds the whole API as one Hono app: security headers, the operations watch, the robot guard, then company
 * resolution, authentication and the per-request guards, then every route group. Order matters: guards run before
 * routes, and public doors are mounted before sign-in. Same app on Workers and Node (ADR 0003). Split plan: docs/HANDOVER.md.
 */
export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>();
  const cfg = deps.config;
  assertOwnerConfigured(cfg);

  // Browser-side protections on every answer (CSP, HSTS, framing, sniffing); see lib/headers.ts.
  app.use('*', securityHeaders(cfg.scheme === 'https'));

  // Operations watch (lib/ops.ts): every API answer's status and time; too many failures or a slow tail → an alert.
  const ops = deps.ops ?? sharedOps;
  if (cfg.ops?.alerts !== false)
    app.use('/api/*', async (c, next) => {
      const t0 = Date.now();
      await next();
      const alert = ops.note(c.res.status, Date.now() - t0);
      if (alert) defer(deps, raiseOpsAlert(deps, alert));
    });

  // Robots (lib/botGuard.ts): robots.txt and the TDM reservation per host, known
  // crawlers refused by name, and bursts of refused or limited answers noted for the console.
  const watch = deps.watch ?? sharedWatch;
  const notice = (kind: 'limited' | 'refused', ip: string | null, detail: string) => {
    const alert = watch.note(kind, ip, detail);
    if (alert) defer(deps, raiseTrafficAlert(deps, alert));
  };
  app.use('*', async (c, next) => {
    const early = edgeAnswer(c.req.raw, cfg);
    if (early) return early;
    const ip = clientIp(c, cfg.clientIp);
    const robot = { path: c.req.path, ua: c.req.header('user-agent'), bearer: /^Bearer\s/i.test(c.req.header('authorization') ?? '') };
    const refused = robotRefusal(cfg.robotGuard, robot);
    if (refused) {
      notice('refused', ip, refused);
      const loc = normalizeLocale(c.req.header('x-curahold-locale'), 'en');
      return c.json({ error: 'robot_refused', message: translate(loc, 'errors.robot_refused') }, 403);
    }
    const proveBearer = crawlerBearer(cfg.robotGuard, robot);
    if (proveBearer) c.set('crawlerBearer', proveBearer);
    await next();
    if (c.res.status === 429) notice('limited', ip, c.req.path);
  });

  app.use('*', async (c, next) => {
    c.set('deps', deps);
    c.set('self', app);
    await next();
    // Webhooks: deliver what this change produced right after answering.
    if (deps.defer && c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.path.startsWith('/api/') && c.res.status < 400) {
      // Scores of the customers this change touched, then the webhooks (a new score is a change too).
      defer(deps, flushHealth(deps, 200).then(() => deliverWebhooks(deps, 20)));
    }
    // The live channel (Cloudflare): tell the company's room to look. Self-hosted, Postgres tells it (live/node.ts).
    const changed = c.get('org') as OrgRow | undefined;
    const wrote = c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.res.status < 400;
    if (deps.live?.poke && changed && wrote) defer(deps, deps.live.poke(changed.id));
    // Curahold's own console, when this write may have changed what it shows (live/platform.ts).
    if (deps.live?.platform && wrote && touchesConsole(c.req.method, c.req.path)) defer(deps, deps.live.platform());
  });

  // ---------------------------------------------------------------- request limits (lib/ratelimit.ts)
  const limiter = deps.limiter ?? sharedLimiter;
  const scale = cfg.limitScale ?? 1;
  const limitsOn = scale > 0;
  type Check = [key: string, budget: BudgetName];
  // 1. The network address, before anything else is looked up.
  app.use('*', async (c, next) => {
    const p = c.req.path;
    if (!limitsOn || p === '/api/health' || !(p.startsWith('/api/') || p === '/mcp' || p.startsWith('/oauth/') || p.startsWith('/.well-known/'))) return next();
    const ip = clientIp(c, cfg.clientIp);
    if (ip) {
      const checks: Check[] = [[`ip:${ip}`, 'ip']];
      if (isSignIn(c.req.method, p)) checks.push([`signin:${ip}`, 'signin']);
      if (p === '/api/consent-event') checks.push([`consent:${ip}`, 'consent']);
      if (p === '/api/assist/public') checks.push([`assist-door:${ip}`, 'assistDoor']);
      // A scanner's run of unknown addresses: its allowance is spent by each 404 below, and checked here first.
      const held = watch.waitOf(ip);
      if (held) return limited(c, held);
      const wait = takeAll(limiter, scale, checks);
      if (wait) return limited(c, wait);
    }
    await next();
    // Counted as probing: unknown addresses (404), and "sign in first" (401) to a caller that brought no credential at
    // all. Without a session every API address answers 401 before routing, so a scanner without one never saw a 404
    // and was never counted. A signed-out browser asks once or twice; the budget is 60. Webhook receivers are left
    // out of the 401 count: a vendor's sending address is shared by many companies, and one misconfigured hook must
    // not hold it for all of them.
    const machine = /^\/api\/(inbound|hooks)\/|^\/api\/billing\/webhook$/.test(p);
    const bare = !machine && !getCookie(c, SESSION_COOKIE) && !c.req.header('authorization') && !c.req.header('x-curahold-staff-key');
    if (ip && p.startsWith('/api/') && (c.res.status === 404 || (c.res.status === 401 && bare))) {
      const wait = limiter.take(`probe:${ip}`, BUDGETS.probe, scale);
      if (wait) watch.hold(ip, wait);
    }
  });
  // 2. The company (after companyFromHost): everyone at it together, its sign-in steps, its AI connections.
  const companyLimits = async (c: any, next: () => Promise<void>) => {
    if (!limitsOn) return next();
    const org = c.get('org') as OrgRow;
    const m = c.req.method;
    const p = c.req.path as string;
    const checks: Check[] = [[`org:${org.id}`, 'company']];
    if (isSignIn(m, p)) checks.push([`signin-org:${org.id}`, 'signinCompany']);
    if (p === '/mcp' && m === 'POST') {
      const bearer = /^Bearer\s+(\S+)/i.exec(c.req.header('authorization') ?? '')?.[1];
      if (bearer) checks.push([`mcp:${(await sha256Hex(bearer)).slice(0, 32)}`, 'mcp']);
      checks.push([`mcp-org:${org.id}`, 'mcpCompany']);
    }
    const wait = takeAll(limiter, scale, checks);
    if (wait) return limited(c, wait, c.get('locale'));
    await next();
  };
  // 3. The person (after sign-in): everything they ask, their changes, search, exports, invitations.
  const personLimits = async (c: any, next: () => Promise<void>) => {
    const auth = c.get('auth');
    if (!limitsOn || !auth) return next();
    const org = c.get('org') as OrgRow;
    const m = c.req.method;
    const p = c.req.path as string;
    const who = `${org.id}:${auth.userId}`;
    const checks: Check[] = [[`person:${who}`, 'person']];
    if (isWrite(m)) checks.push([`write:${who}`, 'write']);
    if (isSearch(m, p)) checks.push([`search:${who}`, 'search']);
    if (isExport(m, p, new URL(c.req.url))) checks.push([`export:${who}`, 'export']);
    if (isUpload(m, p, c.req.header('content-type'))) checks.push([`upload:${who}`, 'upload'], [`upload-org:${org.id}`, 'uploadCompany']);
    if (isFeed(p)) checks.push([`analytics:${org.id}:${auth.sessionId}`, 'analytics']);
    const invite = isInvite(m, p);
    if (invite) checks.push([`invite:${who}`, 'invite'], [`invite-org:${org.id}`, 'inviteCompany']);
    const wait = takeAll(limiter, scale, checks);
    if (wait) return limited(c, wait, c.get('locale'));
    if (invite) {
      // Emails in the company's name: the hour's count comes from the database, exact on every isolate.
      const [{ n }] = await deps.db.tenant({ orgId: org.id, userId: auth.userId }, (q) => q.query<{ n: number }>('select app_invites_last_hour() as n'));
      if (n >= INVITES_PER_HOUR * scale) return limited(c, 900, c.get('locale'));
    }
    await next();
  };

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
    // The platform's logs get the same masking as the error table (lib/errlog.ts).
    console.error('[curahold] unhandled', redact(err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)));
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
    // Mail that could not go out (the relay refused or was busy, even after its retry): the person is told plainly to
    // try again later; the relay's reply was recorded above for the operator, who fixes the setting.
    if (err instanceof MailError) return c.json({ error: 'mail_unavailable', message: translate(locale, 'errors.mail_unavailable') }, 503);
    return c.json({ error: 'server', message: translate(locale, 'errors.server') }, 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true }, 200, { 'access-control-allow-origin': '*', 'cache-control': 'no-store' }));
  // Readiness: the database reached, and how fast (the status page and the synthetic check read it; no company data).
  app.get('/api/health/ready', async (c) => {
    const r = await readiness(deps);
    return c.json(r, r.ok ? 200 : 503, { 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
  });
  // Where to report a vulnerability, on every address (before any company is looked up).
  app.get('/.well-known/security.txt', securityTxt);

  // The central address (app.curahold.com): OAuth returns, chat services'
  // inbound calls and company sign-up — all before any company is known.
  app.get('/api/oauth/callback', oauthCallback);
  app.get('/api/connect/callback', connectCallback_);
  app.route('/api/hooks', hookRoutes);
  app.route('/api/signup', signupRoutes);
  // The free-trial request form (decided by the owner in the console).
  app.route('/api/trial', trialRoutes);
  // A visitor's cookie choice, for the proof of consent (no account; routes/consent.ts).
  app.route('/api/consent-event', consentEventRoutes);
  // Curahold's own support desk and the door for incoming mail (staff key / mail key).
  // The owner console's own sections and the AI team's two doors (the owner's session; a seat's key).
  app.route('/api/desk/owner', ownerRoutes);
  app.route('/api/desk/office', officeRoutes);
  app.route('/api/desk/team', teamRoutes);
  app.route('/api/agent', agentRoutes);
  app.route('/api/desk', deskRoutes);
  // The public docs' and sales site's "Ask": no company, docs only (routes/assist.ts).
  app.route('/', assistPublicRoutes);
  // Paddle's notifications (signature-checked), one handler on two addresses: the
  // documented one and the older one, so either Paddle destination works (ADR 0019).
  app.post('/api/inbound/billing/paddle', billingWebhook);
  app.post('/api/billing/webhook', billingWebhook);
  // SSO login and SCIM provisioning resolve the company themselves (by slug or
  // bearer token), so they mount before companyFromHost and its CSRF guard.
  app.route('/api/sso', ssoAuthRoutes);
  app.route('/api/scim/v2', scimRoutes);

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
  // A crawler's user agent let through for its bearer (lib/botGuard.ts): now that the company is known, the bearer must
  // be one of its live keys or app tokens. Without this, any "Bearer x" got a crawler the public answers (sign-in page
  // data, entry links) that the robot rules refuse it. Only these requests pay for the lookup; a token without a
  // Curahold prefix is refused before any query.
  app.use('/api/*', async (c, next) => {
    const kind = c.get('crawlerBearer');
    if (kind) {
      const bearer = /^Bearer\s+(\S+)/i.exec(c.req.header('authorization') ?? '')?.[1] ?? '';
      const live = bearer ? await resolveToken(deps.db, c.get('org').id, bearer, { analytics: isFeed(c.req.path) }) : null;
      if (!live) {
        notice('refused', clientIp(c, cfg.clientIp), kind);
        return c.json({ error: 'robot_refused', message: translate(c.get('locale'), 'errors.robot_refused') }, 403);
      }
    }
    await next();
  });
  // Apps and AI assistants (OAuth, MCP) reach the company at its own address.
  app.use('/mcp', companyFromHost);
  app.use('/oauth/*', companyFromHost);
  app.use('/.well-known/*', companyFromHost);
  app.use('/api/*', companyLimits);
  app.use('/mcp', companyLimits);
  app.use('/oauth/*', companyLimits);
  app.route('/', oauthRoutes);
  app.route('/', mcpRoutes);

  // Public, per company: login page data and the sign-in steps.
  app.route('/api', authRoutes);
  app.route('/api', inboundRoutes);
  // GitHub / GitLab webhooks that link branches, pull requests and commits to tasks (signed, like the ticket inbound).
  app.route('/api', devInboundRoutes);
  app.route('/api', segmentInboundRoutes);
  // WhatsApp Business: Meta's callback for the company's own app (signed with its app secret).
  app.route('/api', whatsappInboundRoutes);
  // Incoming webhooks: any tool posts to the address of one hook (signed or with a shared token).
  app.route('/api', inboundHookReceiverRoutes);
  // Curahold support: the entry link, its session, the desk's file links.
  app.route('/api', supportEntry);
  // A shared onboarding progress report, opened with its secret link (no session).
  app.route('/api', onboardingShareRoutes);

  // ---------------------------------------------------------------- person
  app.use('/api/*', async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    // The analytics feed also takes a key as a Basic password or in its address: what BI tools can send.
    const feed = isFeed(c.req.path);
    const bearer = /^Bearer\s+(\S+)/i.exec(c.req.header('authorization') ?? '')?.[1] ?? (feed ? feedCredential(c) : undefined);
    if (feed && !token && !bearer) return feedChallenge(c);
    if (!token && bearer) {
      // An API key or an app's token: it acts as its owner, read only unless allowed to write.
      const t = await resolveToken(deps.db, c.get('org').id, bearer, { analytics: feed });
      if (!t && feed) return feedChallenge(c);
      if (!t) fail('unauthenticated');
      // An analytics key opens the analytics feed and nothing else.
      if (t!.kind === 'analytics' && !feed) fail('forbidden');
      // Administration, identity, billing and credentials are for a signed-in person only, and a token limited to
      // areas stays inside them (security audit H1, ADR 0024).
      const reach = tokenReach(c.req.path.slice('/api'.length), c.req.method, t!.areas);
      if (reach !== 'ok') fail(reach);
      if (!t!.canWrite && c.req.method !== 'GET' && c.req.method !== 'HEAD') fail('read_only_token');
      const u = t!.user;
      // Administrator-level permissions stay with the signed-in person (review S1, lib/tokenScope.ts).
      const withheld = withheldPerms(c.req.path.slice('/api'.length));
      c.set('withheld', withheld);
      c.set('auth', {
        userId: u.user_id,
        sessionId: t!.tokenId,
        name: u.name,
        email: u.email,
        roleId: u.role_id,
        roleKey: u.role_key,
        perms: ((u.perms ?? []) as Perm[]).filter((p) => !withheld.includes(p)),
        seat: t!.canWrite ? u.seat : 'viewer',
        locale: u.locale ? normalizeLocale(u.locale) : null,
        depts: u.dept_keys ?? [],
      });
      c.set('tokenKind', t!.kind);
      if (t!.scope) c.set('analyticsScope', t!.scope);
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
        `select s.id as session_id, s.device_id, s.revoked_at, s.revoke_reason, s.second_step,
                s.expires_at < now() as expired,
                s.last_seen_at < now() - interval '5 minutes' as stale,
                u.id as user_id, u.name, u.email, u.seat, u.status, u.locale,
                r.id as role_id, r.key as role_key, app_perms_of(u.id, r.perms) as perms,
                array(select d.key from department_members dm join departments d on d.id = dm.department_id where dm.user_id = u.id and d.enabled) as dept_keys
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
      depts: s.dept_keys ?? [],
      secondStep: s.second_step ?? null,
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
      if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && !asksForTicket(c.req.method, c.req.path)) fail('preview_read_only');
      if (!/^[0-9a-f-]{36}$/i.test(previewAs) || c.req.path.startsWith('/api/me/sessions')) fail('forbidden');
      const [t] = await deps.db.tenant({ orgId: org.id, userId: s.user_id }, (q) =>
        q.query(
          `select u.id, u.name, u.email, u.seat, u.status, r.id as role_id, r.key as role_key, app_perms_of(u.id, r.perms) as perms,
                  array(select d.key from department_members dm join departments d on d.id = dm.department_id where dm.user_id = u.id and d.enabled) as dept_keys
             from users u join roles r on r.id = u.role_id where u.id = $1`,
          [previewAs],
        ),
      );
      if (!t || t.status !== 'active') fail('not_found');
      const real = c.get('auth');
      c.set('previewBy', { id: real.userId, name: real.name });
      c.set('auth', { ...real, userId: t.id, name: t.name, email: t.email, roleId: t.role_id, roleKey: t.role_key, perms: (t.perms ?? []) as Perm[], seat: t.seat, depts: t.dept_keys ?? [] });
      if (c.req.path === '/api/me') {
        await deps.db.tenant({ orgId: org.id, userId: real.userId }, (q) =>
          audit(q, { orgId: org.id, actorId: real.userId, action: 'user.previewed', entity: 'user', entityId: t.id }),
        );
      }
    }
    await next();
  });

  app.use('/api/*', personLimits);

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
  app.route('/api', agreementRoutes);
  app.route('/api', identityRoutes);
  app.route('/api', liveRoutes);
  app.route('/api', metricsRoutes);
  app.route('/api', boardRoutes);
  app.route('/api', departmentRoutes);
  app.route('/api', handoffRoutes);
  app.route('/api', taskRoutes);
  app.route('/api', pmRoutes);
  app.route('/api', workRoutes);
  app.route('/api', importRoutes);
  app.route('/api', loadRoutes);
  app.route('/api', reportRoutes);
  app.route('/api', builderRoutes);
  app.route('/api', exportRoutes);
  app.route('/api', analyticsRoutes);
  app.route('/api', accountRoutes);
  app.route('/api', recordRoutes);
  app.route('/api', pageRoutes);
  app.route('/api', searchRoutes);
  app.route('/api', timelineRoutes);
  app.route('/api', meetingRoutes);
  app.route('/api', billingRoutes);
  app.route('/api', onboardingRoutes);
  app.route('/api', onboardingPlanRoutes);
  app.route('/api', ssoAdminRoutes);
  app.route('/api', platformRoutes);
  app.route('/api', consentRoutes);
  app.route('/api', ticketRoutes);
  app.route('/api', developerRoutes);
  app.route('/api', helpRoutes);
  app.route('/api', assistRoutes);
  app.route('/api', portalRoutes);
  app.route('/api', oauthApi);
  app.route('/api', syncRoutes);
  app.route('/api', financeRoutes);
  app.route('/api', jiraRoutes);
  app.route('/api', devLinkRoutes);
  app.route('/api', inboundHookRoutes);
  app.route('/api', connectionRoutes);
  app.route('/api', automationRoutes);
  app.route('/api', setupHealthRoutes);
  app.route('/api', trashRoutes);
  app.route('/api', calendarRoutes);
  app.route('/api', replayRoutes);
  app.route('/api/setup', setupRoutes);
  app.route('/api/admin', adminRoutes);

  app.all('/api/*', () => fail('not_found'));
  return app;
}
