// A minimal app that mounts the Wave-4A billing / onboarding routers with the
// same deps (and the same row-level security) as the product, so these routes
// can be exercised over HTTP without editing the shared api/src/app.ts hub — the
// coordinator wires that. It resolves the company from the host and the person
// from an x-test-user header, the way app.ts resolves them from the subdomain
// and the session cookie.
import { Hono } from 'hono';
import { normalizeLocale } from '../shared/src/i18n';
import type { AppEnv } from '../api/src/context';
import { HttpError } from '../api/src/lib/errors';
import { onboardingRoutes } from '../api/src/routes/onboarding';
import { paddleInboundWebhook, subscriptionRoutes } from '../api/src/routes/subscriptions';
import { BASE, type Env } from './helpers';

export function billingApp(env: Env) {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('deps', env.deps);
    await next();
  });
  // Central address, before any company: the provider's signed webhook.
  app.post('/api/inbound/billing/paddle', paddleInboundWebhook);
  // Company routes: the host picks the company, x-test-user picks the person.
  app.use('/api/*', async (c, next) => {
    const slug = (c.req.header('host') ?? new URL(c.req.url).host).split('.')[0];
    const [org] = await env.deps.db.tenant({ orgId: null, userId: null }, (q) => q.query('select * from resolve_org($1)', [slug]));
    if (!org) return c.json({ error: 'org_not_found' }, 404);
    c.set('org', {
      ...org,
      locale: normalizeLocale(org.locale),
      terms: org.terms ?? {},
      settings: org.settings ?? {},
      domains: org.domains ?? [],
      account_fields: org.account_fields ?? [],
      setup: org.setup ?? {},
      billing: org.billing ?? {},
      trial_ends_at: org.trial_ends_at ?? null,
    } as AppEnv['Variables']['org']);
    c.set('locale', 'en');
    const userId = c.req.header('x-test-user');
    if (userId) {
      const [u] = await env.deps.db.tenant({ orgId: org.id, userId: null }, (q) =>
        q.query('select u.id, u.name, u.email, u.seat, r.id as role_id, r.key as role_key, r.perms from users u join roles r on r.id = u.role_id where u.id = $1', [userId]),
      );
      if (u) c.set('auth', { userId: u.id, sessionId: 'test', name: u.name, email: u.email, roleId: u.role_id, roleKey: u.role_key, perms: u.perms ?? [], seat: u.seat, locale: null });
    }
    await next();
  });
  app.route('/api', subscriptionRoutes);
  app.route('/api', onboardingRoutes);
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.code, ...err.extra }, err.status as 400);
    console.error('[test harness] unhandled', err);
    return c.json({ error: 'server', message: String(err) }, 500);
  });
  return app;
}

/** A request to the billing app as `userId` at `slug`; parses the JSON answer. */
export function caller(app: ReturnType<typeof billingApp>, slug: string) {
  return async (method: string, path: string, opts: { user?: string; body?: unknown } = {}) => {
    const headers: Record<string, string> = {};
    if (opts.user) headers['x-test-user'] = opts.user;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const res = await app.request(`https://${slug}.${BASE}/api${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };
}
