// Mounts the Wave-6A routes the way the coordinator will wire them into
// api/src/app.ts, so the tests exercise the real handlers, the real database
// and real row-level security end to end.
//   * ssoAuthRoutes + scimRoutes run BEFORE the company/person middleware (they
//     resolve the company themselves), so the harness only provides `deps`.
//   * ssoAdminRoutes run in the authed space, so the harness provides the
//     company and the signed-in admin exactly as app.ts would.
import { Hono } from 'hono';
import { normalizeLocale } from '../../shared/src/i18n';
import type { AuthCtx, AppEnv, OrgRow } from '../../api/src/context';
import { HttpError } from '../../api/src/lib/errors';
import { ssoAdminRoutes, ssoAuthRoutes } from '../../api/src/routes/sso';
import { scimRoutes } from '../../api/src/routes/scim';
import type { Env } from '../helpers';

// Mirror the hub app's HttpError → status mapping, so the handlers' fail()
// codes surface as the real app would return them (e.g. forbidden → 403).
function withErrors(app: Hono<AppEnv>) {
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.code, ...err.extra }, err.status as any);
    throw err;
  });
  return app;
}

/** The pre-sign-in group: SSO login + SCIM. Equivalent to the hub registering
 *  app.route('/api/sso', ssoAuthRoutes) and app.route('/api/scim/v2', scimRoutes). */
export function authApp(env: Env) {
  const app = new Hono<AppEnv>();
  app.use('*', (c, next) => {
    c.set('deps', env.deps as any);
    return next();
  });
  app.route('/api/sso', ssoAuthRoutes);
  app.route('/api/scim/v2', scimRoutes);
  return withErrors(app);
}

/** The authed admin group, with the company and admin injected as app.ts would. */
export function adminApp(env: Env, org: OrgRow, auth: AuthCtx) {
  const app = new Hono<AppEnv>();
  app.use('*', (c, next) => {
    c.set('deps', env.deps as any);
    c.set('org', org);
    c.set('auth', auth);
    c.set('locale', org.locale);
    return next();
  });
  app.route('/api', ssoAdminRoutes);
  return withErrors(app);
}

export async function orgRowOf(env: Env, orgId: string): Promise<OrgRow> {
  const [row] = await env.db.system((q) => q.query<any>('select * from orgs where id = $1', [orgId]));
  return {
    ...row,
    locale: normalizeLocale(row.locale),
    terms: row.terms ?? {},
    settings: row.settings ?? {},
    domains: row.domains ?? [],
    account_fields: row.account_fields ?? [],
    setup: row.setup ?? {},
    billing: row.billing ?? {},
    trial_ends_at: row.trial_ends_at ?? null,
  } as OrgRow;
}

export function adminAuth(userId: string, email = 'ada@demo.example'): AuthCtx {
  return { userId, sessionId: 'test-session', name: 'Ada Demir', email, roleId: 'r', roleKey: 'admin', perms: ['org.manage'], seat: 'full', locale: null };
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
