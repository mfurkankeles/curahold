// The platform owner's super-admin console. It reads across every company, so
// the gate is the point: the configured owner (and listed staff) see all
// customers; a normal org administrator is turned away with 403. MRR is worked
// out from the shared plan prices. acme is seeded as a paying customer in the
// normalized billing schema (0037); beta has no billing rows at all, which
// exercises the defensive path (a company present in the schema but with nothing
// filled in reads as a trial, with null plan and no invoices — never a crash).
//
// The routes live in api/src/routes/admin-platform.ts and are mounted in
// api/src/app.ts by the coordinator (a hub file this lane does not edit). app.ts
// ends every /api/* request it does not recognise with a 404 guard, so a route
// mounted after createApp cannot be reached. To test the console in isolation we
// mount it on a tiny harness that reproduces exactly the slice of app.ts's
// /api/* pipeline the console relies on: deps on the context, and the signed-in
// user resolved from the session cookie (same hash + query as app.ts). Sign-in
// itself still goes through the real app, so these are real sessions.
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { BASE, Client, login, setup, type Env } from './helpers';
import type { AppEnv } from '../api/src/context';
import { sha256Hex } from '../api/src/lib/crypto';
import { HttpError } from '../api/src/lib/errors';
import { platformRoutes } from '../api/src/routes/admin-platform';
import { metricsRoutes } from '../api/src/routes/metrics';
import { deskRoutes } from '../api/src/routes/desk';

const OWNER = 'owner@demo.example';
const STAFF = 'staff@demo.example';
const ADMIN = 'ada@demo.example';
// Curahold's own console lives on a host of its own; staff are pointed there, nobody else is told.
const CONSOLE = `https://desk.${BASE}`;

let env: Env;
let owner: Client;
let staff: Client;
let admin: Client;

/** Build the console harness and a platform client per real session. */
function harnessClient(signedIn: Client): Client {
  const app = new Hono<AppEnv>();
  // Same as app.ts: an HttpError becomes its own status (403, 404…), not a 500.
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.code }, err.status as 400);
    throw err;
  });
  app.use('*', (c, next) => {
    c.set('deps', env.deps);
    return next();
  });
  // Reproduce app.ts's /api/* auth for the console: resolve the person from the
  // session cookie. The console reads deps + auth (it is cross-company, so it
  // needs no single org on the context).
  app.use('/api/*', async (c, next) => {
    const token = /app_session=([^;]+)/.exec(c.req.header('cookie') ?? '')?.[1];
    if (token) {
      const [org] = await env.deps.db.tenant({ orgId: null, userId: null }, (q) => q.query<{ id: string }>('select * from resolve_org($1)', ['acme']));
      const hash = await sha256Hex(token);
      const [s] = await env.deps.db.tenant({ orgId: org.id, userId: null }, (q) =>
        q.query(
          `select u.id as user_id, u.name, u.email, u.seat, r.id as role_id, r.key as role_key, r.perms, s.second_step
             from sessions s join users u on u.id = s.user_id join roles r on r.id = u.role_id
            where s.token_hash = $1`,
          [hash],
        ),
      );
      if (s) c.set('auth', { userId: s.user_id, sessionId: 'test', name: s.name, email: s.email, roleId: s.role_id, roleKey: s.role_key, perms: s.perms ?? [], seat: s.seat, locale: null, secondStep: s.second_step });
    }
    await next();
  });
  // Mounted exactly as the coordinator mounts it in app.ts: app.route('/api', platformRoutes).
  app.route('/api', platformRoutes);
  app.route('/api', metricsRoutes);

  const c = new Client({ ...env, app }, signedIn.slug, signedIn.device);
  c.cookie = signedIn.cookie;
  return c;
}

beforeAll(async () => {
  // The in-app console as a self-hosted install has it; the hosted service (off) is the last block of this file.
  env = await setup({ owner: OWNER, staffKeys: { [STAFF]: 'k'.repeat(24) }, maxDevices: 5, inAppConsole: true });
  await env.deps.db.system(async (q) => {
    // The operator and one staff member — a viewer account each in one company so they can sign in
    // (viewer so acme keeps exactly its five full seats: 5 × $35 = $175 MRR).
    const [role] = await q.query<{ id: string }>(`select id from roles where org_id = $1 and key = 'member'`, [env.a.orgId]);
    for (const email of [OWNER, STAFF]) {
      await q.query(`insert into users (org_id, email, name, role_id, seat, status) values ($1, $2, $3, $4, 'viewer', 'active')`, [
        env.a.orgId,
        email,
        email.split('@')[0],
        role.id,
      ]);
    }
    // acme: a paying Business customer in the normalized billing schema (0037). Invented demo data only.
    await q.query(
      `insert into subscriptions (org_id, provider, provider_customer_id, provider_subscription_id, plan, status) values ($1, 'paddle', 'cus_demo', 'sub_demo', 'business', 'active')`,
      [env.a.orgId],
    );
    await q.query(
      `insert into invoices (org_id, provider_invoice_id, amount_cents, currency, status, issued_at) values ($1, 'inv_demo', 17500, 'USD', 'paid', now())`,
      [env.a.orgId],
    );
    await q.query(`update orgs set tax_number = 'TR-DEMO-001', billing_email = 'billing@acme.example' where id = $1`, [env.a.orgId]);
  });
  // Real sign-in through the real app, then a console client per session.
  owner = harnessClient(await login(env, 'acme', OWNER));
  staff = harnessClient(await login(env, 'acme', STAFF));
  admin = harnessClient(await login(env, 'acme', ADMIN));
  // Curahold staff open the console only from a session that passed a second step (tests/identity.test.ts covers the step itself).
  await env.db.system((q) => q.query(`update sessions set second_step = 'passkey' where user_id in (select id from users where email = any($1))`, [[OWNER, STAFF]]));
});

describe('platform console: staff need a second step', () => {
  it('a staff session without one is told so and refused', async () => {
    const bare = harnessClient(await login(env, 'acme', STAFF));
    expect((await bare.get('/api/platform/access')).json).toEqual({ owner: false, staff: true, platform: true, secondStepNeeded: true, consoleUrl: CONSOLE });
    const r = await bare.get('/api/platform/customers');
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('staff_second_step');
  });

  it('the owner reads the whole-business metrics only after one too', async () => {
    const bare = harnessClient(await login(env, 'acme', OWNER));
    const r = await bare.get('/api/metrics');
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('staff_second_step');
    expect((await owner.get('/api/metrics')).status).toBe(200);
    // Staff open the console, but the metrics are the owner's alone.
    expect((await staff.get('/api/metrics')).status).toBe(403);
    expect((await admin.get('/api/metrics')).status).toBe(403);
  });
});

describe('platform console: who may open it', () => {
  it('tells each person whether the console is theirs', async () => {
    expect((await owner.get('/api/platform/access')).json).toEqual({ owner: true, staff: true, platform: true, consoleUrl: CONSOLE });
    expect((await staff.get('/api/platform/access')).json).toEqual({ owner: false, staff: true, platform: true, consoleUrl: CONSOLE });
    expect((await admin.get('/api/platform/access')).json).toEqual({ owner: false, staff: false, platform: false });
  });

  it('lets the owner read, and refuses a normal org administrator with 403', async () => {
    expect((await owner.get('/api/platform/customers')).status).toBe(200);
    expect((await owner.get('/api/platform/overview')).status).toBe(200);
    expect((await admin.get('/api/platform/customers')).status).toBe(403);
    expect((await admin.get('/api/platform/overview')).status).toBe(403);
    expect((await admin.get(`/api/platform/customers/${env.a.orgId}`)).status).toBe(403);
  });

  it('lets a listed staff member read too', async () => {
    expect((await staff.get('/api/platform/customers')).status).toBe(200);
    expect((await staff.get('/api/platform/overview')).status).toBe(200);
  });
});

describe('platform console: customers', () => {
  it('lists every company, one row each', async () => {
    const { status, json } = await owner.get('/api/platform/customers');
    expect(status).toBe(200);
    const slugs = json.customers.map((c: { slug: string }) => c.slug);
    expect(slugs).toContain('acme');
    expect(slugs).toContain('beta');
    expect(json.customers.length).toBeGreaterThanOrEqual(2);
  });

  it('shows a paying company its plan, billing contacts and latest invoice', async () => {
    const { json } = await owner.get('/api/platform/customers');
    const acme = json.customers.find((c: { slug: string }) => c.slug === 'acme');
    expect(acme.plan).toBe('business');
    expect(acme.status).toBe('active');
    expect(acme.users).toBeGreaterThan(0);
    expect(acme.taxNumber).toBe('TR-DEMO-001');
    expect(acme.billingEmail).toBe('billing@acme.example');
    expect(acme.latestInvoiceStatus).toBe('paid');
  });
});

describe('platform console: overview', () => {
  it('adds up MRR from the shared plan prices', async () => {
    const { status, json } = await owner.get('/api/platform/overview');
    expect(status).toBe(200);
    expect(json.billingSchema).toBe(true);
    expect(json.mrr).toBe(175);
    expect(json.arr).toBe(175 * 12);
    expect(json.currency).toBe('USD');
    expect(json.totals.customers).toBeGreaterThanOrEqual(2);
    expect(json.totals.active).toBeGreaterThanOrEqual(1);
    expect(json.totals.trialing).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(json.signups)).toBe(true);
  });
});

describe('platform console: one customer', () => {
  it('returns settings, subscription, counts and invoices', async () => {
    const { status, json } = await owner.get(`/api/platform/customers/${env.a.orgId}`);
    expect(status).toBe(200);
    expect(json.customer.slug).toBe('acme');
    expect(json.customer.plan).toBe('business');
    expect(json.customer.status).toBe('active');
    expect(json.customer.taxNumber).toBe('TR-DEMO-001');
    expect(json.counts.boards).toBeGreaterThan(0);
    expect(json.counts.tasks).toBeGreaterThan(0);
    expect(json.counts.members).toBeGreaterThan(0);
    expect(json.settings.locale).toBe('en');
    expect(json.subscription).not.toBeNull();
    expect(json.subscription.plan).toBe('business');
    expect(json.subscription.status).toBe('active');
    expect(json.invoices.length).toBeGreaterThanOrEqual(1);
    expect(json.invoices[0].amountCents).toBe(17500);
  });

  it('is 404 for a company that is not there, or a malformed id', async () => {
    expect((await owner.get('/api/platform/customers/00000000-0000-0000-0000-000000000000')).status).toBe(404);
    expect((await owner.get('/api/platform/customers/not-a-uuid')).status).toBe(404);
  });
});

describe('platform console: a company with no billing rows (defensive)', () => {
  it('reads beta as a trial — null plan, no subscription, no invoices — without crashing', async () => {
    const list = (await owner.get('/api/platform/customers')).json;
    const beta = list.customers.find((c: { slug: string }) => c.slug === 'beta');
    expect(beta.plan).toBeNull();
    expect(beta.status).toBe('trialing');
    expect(beta.taxNumber).toBeNull();
    expect(beta.latestInvoiceStatus).toBeNull();

    const { status, json } = await owner.get(`/api/platform/customers/${env.b.orgId}`);
    expect(status).toBe(200);
    expect(json.subscription).toBeNull();
    expect(json.invoices).toEqual([]);
    expect(json.customer.status).toBe('trialing');
  });
});

describe('on the hosted service: the in-app console is off', () => {
  it('a company session gets nothing across companies from any address, the owner’s own with a second step included', async () => {
    env.config.inAppConsole = false;
    try {
      const [beta] = await env.db.system((q) => q.query<{ name: string; slug: string }>('select name, slug from orgs where id = $1', [env.b.orgId]));
      const inApp = [...platformRoutes.routes, ...metricsRoutes.routes].filter((r) => r.path !== '/platform/access');
      expect(inApp.length).toBeGreaterThanOrEqual(4);
      const seen = (r: { json: unknown }) => JSON.stringify(r.json ?? null);
      for (const who of [owner, staff, admin]) {
        for (const r of inApp) {
          const res = await who.req(r.method, `/api${r.path.replace(':orgId', env.b.orgId)}`);
          expect(res.status, `${r.method} ${r.path}`).toBe(404);
          expect(seen(res)).not.toContain(beta.name);
        }
      }
      // Staff are pointed to the console on its own host; nobody is offered the in-app one.
      expect((await owner.get('/api/platform/access')).json).toEqual({ owner: false, staff: true, platform: false, consoleUrl: CONSOLE });
      expect((await admin.get('/api/platform/access')).json).toEqual({ owner: false, staff: false, platform: false });
      // Through the real app too: the owner's company session is not "the owner" here, and the console's own addresses refuse it.
      const real = await login(env, 'acme', OWNER);
      expect((await real.get('/api/me')).json.owner).toBe(false);
      for (const r of deskRoutes.routes.filter((x) => x.method === 'GET' && x.path !== '/me')) {
        const res = await real.get(`/api/desk${r.path.replace(':orgId', env.b.orgId).replace(':ref', 'CH-000001').replace(':id', env.b.orgId)}`);
        expect(res.status, `GET /desk${r.path}`).toBe(403);
        expect(seen(res)).not.toContain(beta.name);
      }
      for (const path of ['/api/metrics', '/api/platform/overview', '/api/platform/customers', `/api/platform/customers/${env.b.orgId}`]) {
        const res = await real.get(path);
        expect(res.status, path).toBe(404);
        expect(seen(res)).not.toContain(beta.name);
      }
    } finally {
      env.config.inAppConsole = true;
    }
  });
});
