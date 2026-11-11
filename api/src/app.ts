// The Tendwell API. One Hono app runs on Cloudflare Workers (worker.ts) and
// on Node for development and tests (node.ts).
//
// Request flow: the subdomain picks the company (acme.tendwell.com → "acme"),
// the session cookie picks the person, and every query then runs inside
// db.tenant(...) so row-level security keeps companies apart.
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { normalizeLocale, translate, type Locale } from '../../shared/src/i18n';
import type { Perm } from '../../shared/src/model';
import { type AppEnv, type Deps, type OrgRow } from './context';
import { sha256Hex } from './lib/crypto';
import { HttpError, fail } from './lib/errors';
import { accountRoutes } from './routes/accounts';
import { recordRoutes } from './routes/records';
import { syncRoutes } from './routes/sync';
import { adminRoutes } from './routes/admin';
import { automationRoutes } from './routes/automations';
import { connectCallback_, connectionRoutes } from './routes/connections';
import { hookRoutes } from './routes/hooks';
import { setupRoutes } from './routes/setup';
import { signupRoutes } from './routes/signup';
import { authRoutes, oauthCallback, SESSION_COOKIE } from './routes/auth';
import { boardRoutes } from './routes/boards';
import { meRoutes } from './routes/me';
import { taskRoutes } from './routes/tasks';

const RESERVED = new Set(['www', 'app', 'api', 'auth', 'admin', 'mail', 'status', 'docs', 'help']);

export function slugFromHost(host: string, baseDomain: string): string | null {
  const h = host.split(':')[0].toLowerCase();
  const base = baseDomain.toLowerCase();
  if (!h.endsWith(`.${base}`)) return null;
  const sub = h.slice(0, -(base.length + 1));
  if (!sub || sub.includes('.') || RESERVED.has(sub)) return null;
  return sub;
}

function requestLocale(header: string | undefined, accept: string | undefined, fallback: Locale): Locale {
  if (header === 'tr' || header === 'en') return header;
  if (accept && /^tr\b/i.test(accept.trim())) return 'tr';
  return fallback;
}

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>();
  const cfg = deps.config;

  app.use('*', async (c, next) => {
    c.set('deps', deps);
    await next();
  });

  app.onError((err, c) => {
    const org = c.get('org') as OrgRow | undefined;
    const locale = (c.get('locale') as Locale | undefined) ?? org?.locale ?? 'en';
    if (err instanceof HttpError) {
      return c.json(
        { error: err.code, message: translate(locale, err.key, err.vars, org?.terms), ...err.extra },
        err.status as any,
      );
    }
    console.error('[tendwell] unhandled', err);
    return c.json({ error: 'server', message: translate(locale, 'errors.server') }, 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true }));

  // The central address (app.tendwell.com): OAuth returns, chat services'
  // inbound calls and company sign-up — all before any company is known.
  app.get('/api/oauth/callback', oauthCallback);
  app.get('/api/connect/callback', connectCallback_);
  app.route('/api/hooks', hookRoutes);
  app.route('/api/signup', signupRoutes);

  // ---------------------------------------------------------------- company
  app.use('/api/*', async (c, next) => {
    const host = c.req.header('host') ?? new URL(c.req.url).host;
    let slug = cfg.singleTenantSlug ?? slugFromHost(host, cfg.baseDomain);
    if (!slug && cfg.devOrgHeader) slug = c.req.header('x-tendwell-org') ?? null;
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
    };
    c.set('org', org);
    c.set('locale', requestLocale(c.req.header('x-tendwell-locale'), c.req.header('accept-language'), org.locale));

    // Cross-site forms cannot set custom headers, so requiring one on every
    // write blocks request forgery (the session cookie is also SameSite=Lax).
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && !c.req.header('x-tendwell-device')) fail('forbidden');
    await next();
  });

  // Public, per company: login page data and the sign-in steps.
  app.route('/api', authRoutes);

  // ---------------------------------------------------------------- person
  app.use('/api/*', async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
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
    if (c.req.header('x-tendwell-device') && c.req.header('x-tendwell-device') !== s.device_id) fail('device_mismatch');
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
    if (s.locale && !c.req.header('x-tendwell-locale')) c.set('locale', normalizeLocale(s.locale));
    if (s.stale) {
      await deps.db.tenant({ orgId: org.id, userId: s.user_id }, async (q) => {
        await q.query('update sessions set last_seen_at = now() where id = $1', [s.session_id]);
        await q.query('update users set last_active_at = now() where id = $1', [s.user_id]);
      });
    }
    await next();
  });

  app.route('/api', meRoutes);
  app.route('/api', boardRoutes);
  app.route('/api', taskRoutes);
  app.route('/api', accountRoutes);
  app.route('/api', recordRoutes);
  app.route('/api', syncRoutes);
  app.route('/api', connectionRoutes);
  app.route('/api', automationRoutes);
  app.route('/api/setup', setupRoutes);
  app.route('/api/admin', adminRoutes);

  app.all('/api/*', () => fail('not_found'));
  return app;
}
