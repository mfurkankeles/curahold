// The canonical subscription/invoice layer (db/migrations/0037, api/src/billing,
// api/src/routes/subscriptions): a 3-month trial, signed provider webhooks that
// upsert the subscription and record invoices, the monthly exit (leave at period
// end, keep access until then) and resume, and strict company isolation. The
// provider's HTTP calls are mocked — nothing here touches the network.
import { beforeAll, describe, expect, it } from 'vitest';
import { checkoutCustomData } from '../api/src/lib/billing';
import { hmacHex } from '../api/src/lib/crypto';
import { startTrial } from '../api/src/billing/service';
import { BASE, setup, type Env } from './helpers';
import { billingApp, caller } from './billing-harness';

const SECRET = 'pdl_ntfset_test_secret';
const PRICES = { team: { month: 'pri_team_m', year: 'pri_team_y' }, business: { month: 'pri_biz_m', year: 'pri_biz_y' } };

let env: Env;
let app: ReturnType<typeof billingApp>;
let acme: (m: string, p: string, o?: { user?: string; body?: unknown }) => Promise<{ status: number; json: any }>;
let ada: string; // acme administrator
let lena: string; // acme member (no org.manage)
let orgId: string;
let betaId: string;
let signed: Record<string, string>;

/** Paddle calling the webhook on the central address, signed (or not). */
async function paddleSays(event: Record<string, unknown>, opts: { secret?: string; at?: Date } = {}) {
  const raw = JSON.stringify(event);
  const ts = Math.floor((opts.at ?? new Date()).getTime() / 1000);
  const h1 = await hmacHex(opts.secret ?? SECRET, `${ts}:${raw}`);
  return app.request(`https://app.${BASE}/api/inbound/billing/paddle`, { method: 'POST', headers: { 'content-type': 'application/json', 'paddle-signature': `ts=${ts};h1=${h1}` }, body: raw });
}

const subData = (over: Record<string, unknown> = {}) => ({
  id: 'sub_01',
  status: 'active',
  customer_id: 'ctm_01',
  items: [{ price: { id: 'pri_biz_y' }, quantity: 3 }],
  current_billing_period: { starts_at: '2026-11-01T00:00:00Z', ends_at: '2099-01-01T00:00:00Z' },
  scheduled_change: null,
  custom_data: signed,
  ...over,
});

const event = (type: string, data: unknown, over: { id?: string; at?: string } = {}) => ({
  event_id: over.id ?? `evt_${Math.random().toString(36).slice(2)}`,
  event_type: type,
  occurred_at: over.at ?? new Date().toISOString(),
  data,
});

const subsOf = (id: string) => env.db.system((q) => q.query('select * from subscriptions where org_id = $1', [id]));

beforeAll(async () => {
  env = await setup({ billing: { provider: 'paddle', env: 'sandbox', apiKey: 'pdl_key', webhookSecret: SECRET, clientToken: 'test_token', prices: PRICES } });
  app = billingApp(env);
  acme = caller(app, 'acme');
  ada = env.a.ids.ada;
  lena = env.a.ids.lena;
  orgId = env.a.orgId;
  betaId = env.b.orgId;
  signed = await checkoutCustomData(env.config.billing!, orgId);
});

describe('the trial', () => {
  it('provisioning opens a 3-month trial the company can read', async () => {
    expect(await startTrial(env.deps, { orgId, plan: 'business' })).toBe(true);
    // Idempotent: a company that already has a subscription keeps it.
    expect(await startTrial(env.deps, { orgId, plan: 'team' })).toBe(false);
    const r = await acme('GET', '/billing/subscription', { user: ada });
    expect(r.status).toBe(200);
    expect(r.json.enabled).toBe(true);
    expect(r.json.subscription).toMatchObject({ status: 'trialing', plan: 'business', cancelAtPeriodEnd: false });
    // ~3 months out, in whole days.
    expect(r.json.subscription.daysLeft).toBeGreaterThan(80);
    expect(r.json.subscription.daysLeft).toBeLessThan(95);
    expect(r.json.plans.length).toBeGreaterThan(0);
  });
});

describe('provider webhooks', () => {
  it('ignores a call that is not signed by the provider', async () => {
    const r = await paddleSays(event('subscription.created', subData()), { secret: 'not-it' });
    expect(r.status).toBe(401);
    expect((await subsOf(orgId))[0].status).toBe('trialing'); // unchanged
  });

  it('a signed subscription moves the company onto its plan', async () => {
    const r = await paddleSays(event('subscription.created', subData(), { id: 'evt_create', at: '2027-01-01T00:00:00Z' }));
    expect(r.status).toBe(200);
    const g = await acme('GET', '/billing/subscription', { user: ada });
    expect(g.json.subscription).toMatchObject({ status: 'active', plan: 'business', cancelAtPeriodEnd: false, providerSubscriptionId: 'sub_01', providerCustomerId: 'ctm_01' });
  });

  it('records an invoice from a completed transaction', async () => {
    const tx = { id: 'txn_01', invoice_id: 'inv_01', status: 'completed', currency_code: 'USD', billed_at: '2026-11-12T10:05:00Z', subscription_id: 'sub_01', details: { totals: { grand_total: '10500' } }, custom_data: signed };
    expect((await paddleSays(event('transaction.completed', tx))).status).toBe(200);
    const [inv] = await env.db.system((q) => q.query('select * from invoices where org_id = $1', [orgId]));
    expect(inv).toMatchObject({ provider_invoice_id: 'inv_01', amount_cents: 10500, currency: 'USD', status: 'completed' });
  });

  it('never applies an older event over a newer one', async () => {
    await paddleSays(event('subscription.updated', subData({ scheduled_change: { action: 'cancel', effective_at: '2099-01-01T00:00:00Z' } }), { id: 'evt_newer', at: '2027-03-01T00:00:00Z' }));
    expect((await subsOf(orgId))[0].cancel_at_period_end).toBe(true);
    // An older event arriving late must not undo it.
    await paddleSays(event('subscription.updated', subData({ scheduled_change: null }), { id: 'evt_older', at: '2027-02-01T00:00:00Z' }));
    expect((await subsOf(orgId))[0].cancel_at_period_end).toBe(true);
  });
});

describe('the monthly exit', () => {
  it('leaving sets cancel-at-period-end but keeps the plan usable until the period ends', async () => {
    // Back to a clean active subscription for this case.
    await paddleSays(event('subscription.updated', subData({ scheduled_change: null }), { id: 'evt_reset', at: '2027-04-01T00:00:00Z' }));
    // The provider's cancel call is mocked.
    env.fetchHolder.impl = async () => new Response(JSON.stringify({ data: {} }), { status: 200 });
    const r = await acme('POST', '/billing/cancel', { user: ada });
    expect(r.status).toBe(200);
    const g = await acme('GET', '/billing/subscription', { user: ada });
    expect(g.json.subscription).toMatchObject({ status: 'active', cancelAtPeriodEnd: true });
    // Still inside the paid period — access is not cut off.
    expect(g.json.subscription.daysLeft).toBeGreaterThan(0);
  });

  it('resume clears a pending cancellation', async () => {
    env.fetchHolder.impl = async () => new Response(JSON.stringify({ data: {} }), { status: 200 });
    expect((await acme('POST', '/billing/resume', { user: ada })).status).toBe(200);
    expect((await acme('GET', '/billing/subscription', { user: ada })).json.subscription.cancelAtPeriodEnd).toBe(false);
  });

  it('only administrators may leave or resume', async () => {
    expect((await acme('POST', '/billing/cancel', { user: lena })).status).toBe(403);
    expect((await acme('POST', '/billing/resume', { user: lena })).status).toBe(403);
  });
});

describe('billing-contact details', () => {
  it('an administrator sets the tax number and billing email', async () => {
    const r = await acme('PATCH', '/billing/profile', { user: ada, body: { taxNumber: 'TR-00000', billingEmail: 'pay@demo.example' } });
    expect(r.status).toBe(200);
    const g = await acme('GET', '/billing/subscription', { user: ada });
    expect(g.json.profile).toEqual({ taxNumber: 'TR-00000', billingEmail: 'pay@demo.example' });
    expect((await acme('PATCH', '/billing/profile', { user: lena, body: { taxNumber: 'x' } })).status).toBe(403);
  });
});

describe('company isolation', () => {
  it('one company never sees another’s subscription or invoices', async () => {
    await startTrial(env.deps, { orgId: betaId, plan: 'team' });
    // The API, under acme, returns only acme's subscription.
    const g = await acme('GET', '/billing/subscription', { user: ada });
    expect(g.json.subscription.providerSubscriptionId).toBe('sub_01');
    // Raw, row-level security scopes both tables to the company in context.
    for (const table of ['subscriptions', 'invoices']) {
      const rows = await env.db.tenant({ orgId, userId: ada }, (q) => q.query(`select org_id from ${table}`));
      expect(rows.every((r) => r.org_id === orgId), table).toBe(true);
    }
    const betaSubs = await env.db.tenant({ orgId: betaId, userId: env.b.ids.ada }, (q) => q.query('select org_id from subscriptions'));
    expect(betaSubs.every((r) => r.org_id === betaId)).toBe(true);
  });

  it('a forged company id on a new subscription is ignored', async () => {
    const before = (await subsOf(betaId))[0];
    // acme's signature does not verify for beta's id, so the event names no company.
    const forged = { org_id: betaId, sig: signed.sig };
    const r = await paddleSays(event('subscription.created', { ...subData({ id: 'sub_forged', customer_id: 'ctm_evil' }), custom_data: forged }, { id: 'evt_forge' }));
    expect(r.status).toBe(200);
    const after = (await subsOf(betaId))[0];
    expect(after.provider_subscription_id).toBe(before.provider_subscription_id); // still beta's own (none from the forgery)
    expect(after.provider_subscription_id).not.toBe('sub_forged');
  });

  it('refuses to move a live subscription to another company, even signed for it', async () => {
    const betaSigned = await checkoutCustomData(env.config.billing!, betaId);
    await paddleSays(event('subscription.updated', subData({ custom_data: betaSigned }), { id: 'evt_swap', at: '2027-05-01T00:00:00Z' }));
    // sub_01 stays with acme; beta is untouched.
    expect((await subsOf(orgId))[0].provider_subscription_id).toBe('sub_01');
    expect((await subsOf(betaId))[0].provider_subscription_id).not.toBe('sub_01');
    const refused = await env.db.system((q) => q.query(`select 1 from audit_log where org_id = $1 and action = 'billing.refused'`, [orgId]));
    expect(refused.length).toBeGreaterThan(0);
  });
});
