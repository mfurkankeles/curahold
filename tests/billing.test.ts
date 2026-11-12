// Billing through Paddle: the trial, signed webhooks applied once and in
// order, read-only without a plan (reading and exporting still work), plan
// features (Business), seats following the people who joined, and nothing of
// it at all while billing is off.
import { beforeAll, describe, expect, it } from 'vitest';
import { accessOf } from '../shared/src/billing';
import { hmacHex } from '../api/src/lib/crypto';
import { syncSeats } from '../api/src/lib/billing';
import { verifyPaddle } from '../api/src/lib/paddle';
import { BASE, Client, login, setup, type Env } from './helpers';

const SECRET = 'pdl_ntfset_test_secret';
const PRICES = { team: { month: 'pri_team_m', year: 'pri_team_y' }, business: { month: 'pri_biz_m', year: 'pri_biz_y' } };

let env: Env;
let ada: Client; // administrator at acme
let lena: Client; // member at acme
let orgId: string;

/** Paddle calling the webhook on the central address, signed (or not). */
async function paddleSays(event: Record<string, unknown>, opts: { secret?: string; at?: Date } = {}) {
  const raw = JSON.stringify(event);
  const ts = Math.floor((opts.at ?? new Date()).getTime() / 1000);
  const h1 = await hmacHex(opts.secret ?? SECRET, `${ts}:${raw}`);
  return env.app.request(`https://app.${BASE}/api/billing/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'paddle-signature': `ts=${ts};h1=${h1}` }, body: raw });
}

const subscription = (over: Record<string, unknown> = {}) => ({
  id: 'sub_01',
  status: 'active',
  customer_id: 'ctm_01',
  items: [{ price: { id: 'pri_team_y' }, quantity: 3 }],
  current_billing_period: { starts_at: '2026-11-01T00:00:00Z', ends_at: '2099-01-01T00:00:00Z' },
  scheduled_change: null,
  custom_data: { org_id: orgId },
  ...over,
});

beforeAll(async () => {
  env = await setup({ billing: { provider: 'paddle', env: 'sandbox', apiKey: 'pdl_key', webhookSecret: SECRET, clientToken: 'test_token', prices: PRICES } });
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  orgId = env.a.orgId;
});

describe('who may do what', () => {
  it('works out the state from the subscription and the trial', () => {
    const now = new Date('2026-11-12T12:00:00Z');
    expect(accessOf(false, {}, null, now).state).toBe('free');
    expect(accessOf(true, {}, '2026-11-20T00:00:00Z', now)).toMatchObject({ state: 'trial', readOnly: false, daysLeft: 8 });
    expect(accessOf(true, {}, '2026-11-01T00:00:00Z', now)).toMatchObject({ state: 'locked', readOnly: true });
    expect(accessOf(true, { status: 'active', plan: 'team' }, null, now)).toMatchObject({ state: 'active', plan: 'team' });
    expect(accessOf(true, { status: 'active', plan: 'team', cancelAtPeriodEnd: true, periodEnd: '2026-12-01T00:00:00Z' }, null, now).state).toBe('ending');
    expect(accessOf(true, { status: 'past_due' }, null, now).readOnly).toBe(false);
    expect(accessOf(true, { status: 'canceled', periodEnd: '2026-11-10T00:00:00Z' }, null, now).state).toBe('locked');
  });

  it('checks Paddle’s signature, and refuses old or wrong ones', async () => {
    const now = new Date();
    const ts = Math.floor(now.getTime() / 1000);
    const raw = '{"a":1}';
    const h1 = await hmacHex(SECRET, `${ts}:${raw}`);
    expect(await verifyPaddle(`ts=${ts};h1=${h1}`, raw, SECRET, now)).toBe(true);
    // During a secret rotation two signatures come; one matching is enough.
    expect(await verifyPaddle(`ts=${ts};h1=deadbeef;h1=${h1}`, raw, SECRET, now)).toBe(true);
    expect(await verifyPaddle(`ts=${ts};h1=${h1}`, '{"a":2}', SECRET, now)).toBe(false);
    expect(await verifyPaddle(`ts=${ts - 3600};h1=${await hmacHex(SECRET, `${ts - 3600}:${raw}`)}`, raw, SECRET, now)).toBe(false);
    expect(await verifyPaddle(undefined, raw, SECRET, now)).toBe(false);
  });
});

describe('the trial and the subscription', () => {
  it('a new company is in its trial, with everything open', async () => {
    const me = (await ada.get('/api/me')).json;
    expect(me.org.billingOn).toBe(true);
    expect(me.org.billing.state).toBe('trial');
    const b = (await ada.get('/api/billing')).json;
    expect(b.enabled).toBe(true);
    expect(b.checkout.prices).toEqual(PRICES);
    expect(b.checkout.orgId).toBe(orgId);
    // Only administrators see what checkout needs.
    expect((await lena.get('/api/billing')).json.checkout).toBeUndefined();
  });

  it('after the trial, without a plan: read and export, but no changes', async () => {
    await env.db.system((q) => q.query(`update orgs set trial_ends_at = now() - interval '1 day' where id = $1`, [orgId]));
    expect((await lena.get('/api/me')).json.org.billing.state).toBe('locked');
    const r = await lena.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Will not be made' });
    expect(r.status).toBe(402);
    expect(r.json.error).toBe('billing_locked');
    expect((await lena.get(`/api/accounts?limit=5`)).status).toBe(200);
    // Choosing a plan is still possible.
    expect((await ada.get('/api/billing')).status).toBe(200);
  });

  it('ignores calls that are not signed by Paddle', async () => {
    const r = await paddleSays({ event_id: 'evt_bad', event_type: 'subscription.created', occurred_at: new Date().toISOString(), data: subscription() }, { secret: 'not-it' });
    expect(r.status).toBe(401);
    expect((await ada.get('/api/me')).json.org.billing.state).toBe('locked');
  });

  it('a subscription from checkout opens everything again, on its plan', async () => {
    const r = await paddleSays({ event_id: 'evt_1', event_type: 'subscription.created', occurred_at: '2026-11-12T10:00:00Z', data: subscription() });
    expect(r.status).toBe(200);
    const me = (await lena.get('/api/me')).json;
    expect(me.org.billing).toMatchObject({ state: 'active', plan: 'team', interval: 'year', seats: 3 });
    expect((await lena.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Back to work' })).status).toBe(201);
  });

  it('applies each event once, and never an older one over a newer one', async () => {
    // A newer event: cancelled at the end of the period.
    await paddleSays({ event_id: 'evt_2', event_type: 'subscription.updated', occurred_at: '2026-11-12T11:00:00Z', data: subscription({ scheduled_change: { action: 'cancel', effective_at: '2099-01-01T00:00:00Z' } }) });
    expect((await ada.get('/api/me')).json.org.billing.state).toBe('ending');
    // The first one again, and an older one arriving late: no change.
    await paddleSays({ event_id: 'evt_1', event_type: 'subscription.created', occurred_at: '2026-11-12T10:00:00Z', data: subscription() });
    await paddleSays({ event_id: 'evt_0', event_type: 'subscription.updated', occurred_at: '2026-11-12T09:00:00Z', data: subscription({ items: [{ price: { id: 'pri_biz_m' }, quantity: 9 }] }) });
    const me = (await ada.get('/api/me')).json;
    expect(me.org.billing).toMatchObject({ state: 'ending', plan: 'team', seats: 3 });
    const seen = await env.db.system((q) => q.query(`select id from billing_events where org_id = $1 order by id`, [orgId]));
    expect(seen.map((r) => r.id)).toEqual(['evt_0', 'evt_1', 'evt_2']);
  });
});

describe('plans and seats', () => {
  it('Team does not include playbooks or CRM sync; Business does', async () => {
    await paddleSays({ event_id: 'evt_3', event_type: 'subscription.updated', occurred_at: '2026-11-12T12:00:00Z', data: subscription() });
    const r = await ada.post('/api/plans', { name: 'Onboarding', boardId: env.a.boards.csBoard, tasks: [{ title: 'Kick-off', dueInDays: 0, assignee: 'account_owner' }] });
    expect(r.status).toBe(402);
    expect(r.json).toMatchObject({ error: 'plan_required', plan: 'business' });
    await paddleSays({ event_id: 'evt_4', event_type: 'subscription.updated', occurred_at: '2026-11-12T13:00:00Z', data: subscription({ items: [{ price: { id: 'pri_biz_y' }, quantity: 3 }] }) });
    expect((await ada.get('/api/me')).json.org.billing.plan).toBe('business');
    expect((await ada.post('/api/plans', { name: 'Onboarding', boardId: env.a.boards.csBoard, tasks: [{ title: 'Kick-off', dueInDays: 0, assignee: 'account_owner' }] })).status).toBe(201);
  });

  it('the subscription follows the people who joined (hourly)', async () => {
    const calls: { url: string; body: any }[] = [];
    env.fetchHolder.impl = async (url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      calls.push({ url, body });
      return new Response(JSON.stringify({ data: { ...subscription(), items: [{ price: { id: 'pri_biz_y' }, quantity: body.items[0].quantity }] } }), { status: 200 });
    };
    const [{ n }] = await env.db.system((q) => q.query(`select count(*)::int as n from users where org_id = $1 and seat = 'full' and status = 'active'`, [orgId]));
    expect(await syncSeats(env.deps)).toBe(1);
    expect(calls[0].url).toBe('https://sandbox-api.paddle.com/subscriptions/sub_01');
    expect(calls[0].body).toEqual({ items: [{ price_id: 'pri_biz_y', quantity: n }], proration_billing_mode: n > 3 ? 'prorated_immediately' : 'prorated_next_billing_period' });
    expect((await ada.get('/api/me')).json.org.billing.seats).toBe(n);
    // Nothing to do the next hour.
    expect(await syncSeats(env.deps)).toBe(0);
  });

  it('the portal link comes from Paddle, for administrators only', async () => {
    env.fetchHolder.impl = async (url) => new Response(JSON.stringify({ data: { urls: { general: { overview: `https://customer-portal.paddle.com/x?from=${encodeURIComponent(url)}` } } } }), { status: 201 });
    const r = await ada.post('/api/billing/portal');
    expect(r.status).toBe(200);
    expect(r.json.url).toContain('customers%2Fctm_01%2Fportal-sessions');
    expect((await lena.post('/api/billing/portal')).status).toBe(403);
  });
});

describe('billing off', () => {
  it('nothing is limited and nothing is charged', async () => {
    const off = await setup();
    const zeynep = await login(off, 'acme', 'zeynep@demo.example');
    await off.db.system((q) => q.query(`update orgs set trial_ends_at = now() - interval '30 days'`));
    const me = (await zeynep.get('/api/me')).json;
    expect(me.org.billingOn).toBe(false);
    expect(me.org.billing.state).toBe('free');
    expect((await zeynep.post('/api/tasks', { boardId: off.a.boards.csBoard, title: 'Still fine' })).status).toBe(201);
    expect((await off.app.request(`https://app.${BASE}/api/billing/webhook`, { method: 'POST', body: '{}' })).status).toBe(404);
  });
});
