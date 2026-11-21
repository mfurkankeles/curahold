// The one billing path (docs/ADR/0019) and the data-driven price list
// (shared/src/plans.json): the same Paddle event on both webhook addresses
// lands once; old-path companies are migrated without loss; plan changes are
// prorated by the catalogue; dunning keeps a company open for the grace period
// only; and every cost driver stops at its plan's cap. Paddle is a mock (no
// network, no keys): env.fetchHolder answers every API call.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import catalogueJson from '../shared/src/plans.json';
import { CATALOGUE, accessOf, capsOf, parseCatalogue, regionFor, regionalPrice } from '../shared/src/billing';
import { checkoutCustomData } from '../api/src/billing/sign';
import { capsForOrg, checkConnectors, checkStorage } from '../api/src/billing/entitlements';
import { dbStore } from '../api/src/assistant/store';
import { overCap } from '../api/src/assistant/core';
import { seatGuard } from '../api/src/lib/trial';
import { hmacHex } from '../api/src/lib/crypto';
import { BASE, login, setup, type Client, type Env } from './helpers';

const SECRET = 'pdl_ntfset_test_secret';
const PRICES = { team: { month: 'pri_team_m', year: 'pri_team_y' }, business: { month: 'pri_biz_m', year: 'pri_biz_y' } };

let env: Env;
let ada: Client;
let orgId: string;
let signed: Record<string, string>;

async function paddleSays(path: string, event: Record<string, unknown>) {
  const raw = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const h1 = await hmacHex(SECRET, `${ts}:${raw}`);
  return env.app.request(`https://app.${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'paddle-signature': `ts=${ts};h1=${h1}` }, body: raw });
}

const sub = (over: Record<string, unknown> = {}) => ({
  id: 'sub_one',
  status: 'active',
  customer_id: 'ctm_one',
  currency_code: 'SGD',
  items: [{ price: { id: 'pri_team_m' }, quantity: 2 }],
  current_billing_period: { starts_at: '2026-11-01T00:00:00Z', ends_at: '2099-01-01T00:00:00Z' },
  scheduled_change: null,
  custom_data: signed,
  ...over,
});
const sys = <T>(sql: string, params: unknown[] = []) => env.db.system((q) => q.query<T & Record<string, unknown>>(sql, params));

beforeAll(async () => {
  env = await setup({ billing: { provider: 'paddle', env: 'sandbox', apiKey: 'pdl_key', webhookSecret: SECRET, clientToken: 'test_token', prices: PRICES } });
  ada = await login(env, 'acme', 'ada@demo.example');
  orgId = env.a.orgId;
  signed = await checkoutCustomData(env.config.billing!, orgId);
});

describe('the price list is data', () => {
  it('plans.json parses, and a wrong file says what is wrong', () => {
    expect(parseCatalogue(catalogueJson).plans.map((p) => p.key)).toEqual(CATALOGUE.plans.map((p) => p.key));
    expect(CATALOGUE.trial).toMatchObject({ months: 3, approval: true });
    const broken = (f: (c: any) => void) => {
      const c = structuredClone(catalogueJson) as any;
      f(c);
      return () => parseCatalogue(c);
    };
    expect(broken((c) => (c.plans[0].caps.connectors = -1))).toThrow(/caps.connectors/);
    expect(broken((c) => delete c.plans[0].caps.seatsMax)).toThrow(/seatsMax is missing/);
    expect(broken((c) => c.plans[0].features.push('teleport'))).toThrow(/unknown feature/);
    expect(broken((c) => (c.trial.plan = 'gold'))).toThrow(/trial.plan/);
    expect(broken((c) => (c.proration.upgrade = 'whenever'))).toThrow(/proration.upgrade/);
    // A third plan needs no code: only data.
    const three = structuredClone(catalogueJson) as any;
    three.plans.push({ key: 'starter', name: 'Starter', price: { month: 9, year: 7 }, features: [], caps: { aiQuestionsPerSeat: 5, storageGbPerSeat: 1, syncEveryMinutes: 1440, connectors: 1, seatsMax: 5 } });
    for (const r of three.regions) if (r.prices) r.prices.starter = { month: 1, year: 1 };
    for (const r of three.regions) if (r.displayPrices) r.displayPrices.starter = { month: 1, year: 1 };
    expect(parseCatalogue(three).plans).toHaveLength(3);
  });

  it('each region charges a currency Paddle can collect, tax on top as a pass-through', () => {
    const at = (cc: string) => regionalPrice(regionFor(cc), 'team', 'month');
    expect(at('IN')).toMatchObject({ collect: 'INR', currency: 'INR', amount: 799 });
    expect(at('SG')).toMatchObject({ collect: 'SGD', amount: 25 });
    // Malaysia: collected in USD until MYR is confirmed, MYR shown as a guide.
    expect(at('MY')).toMatchObject({ collect: 'USD', amount: 14, currency: 'MYR', shown: 59 });
    // The Gulf: Paddle cannot collect AED, so the USD list is charged; AED is a guide at the peg.
    expect(at('AE')).toMatchObject({ collect: 'USD', amount: 19, currency: 'AED', shown: 70 });
    expect(at('TR')).toMatchObject({ collect: 'TRY', currency: 'TRY' });
    expect(at('US')).toMatchObject({ collect: 'USD', amount: 19 });
    expect(regionFor('MY')!.tax).toMatchObject({ rate: 0.08, b2b: true });
    expect(regionFor('IN')!.tax).toMatchObject({ rate: 0.18, b2b: false });
  });

  it('caps multiply by full seats, the trial has its own, billing off has none', () => {
    const team = capsOf({ state: 'active', plan: 'team' }, 4);
    expect(team.aiQuestionsPerMonth).toBe(CATALOGUE.plans[0].caps.aiQuestionsPerSeat! * 4);
    expect(team.storageBytes).toBe(CATALOGUE.plans[0].caps.storageGbPerSeat! * 4 * 1024 ** 3);
    expect(capsOf({ state: 'trial', plan: 'business' }, 10).aiQuestionsPerMonth).toBe(CATALOGUE.trial.caps.aiQuestionsPerSeat! * 10);
    expect(capsOf({ state: 'free', plan: 'business' }, 10)).toMatchObject({ aiQuestionsPerMonth: null, connectors: null, seatsMax: null });
  });
});

describe('one webhook, two addresses', () => {
  it('the same Paddle event sent to both lands once: one row, one ledger entry, one snapshot', async () => {
    const ev = { event_id: 'evt_both', event_type: 'subscription.created', occurred_at: '2026-11-20T10:00:00Z', data: sub() };
    expect((await paddleSays('/api/inbound/billing/paddle', ev)).status).toBe(200);
    expect((await paddleSays('/api/billing/webhook', ev)).status).toBe(200);
    const rows = await sys<{ seats: number; billing_interval: string; currency: string }>('select * from subscriptions where org_id = $1', [orgId]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider_subscription_id: 'sub_one', plan: 'team', seats: 2, billing_interval: 'month', currency: 'SGD' });
    expect(await sys('select id from billing_events where id = $1', ['evt_both'])).toHaveLength(1);
    const [o] = await sys<{ billing: any }>('select billing from orgs where id = $1', [orgId]);
    expect(o.billing).toMatchObject({ status: 'active', plan: 'team', interval: 'month', seats: 2, subscriptionId: 'sub_one' });
  });

  it('a new customer cannot take over a subscription that already belongs to a company', async () => {
    await paddleSays('/api/inbound/billing/paddle', { event_id: 'evt_cust', event_type: 'subscription.updated', occurred_at: '2026-11-20T11:00:00Z', data: sub({ customer_id: 'ctm_other' }) });
    const [s] = await sys<{ provider_customer_id: string }>('select provider_customer_id from subscriptions where org_id = $1', [orgId]);
    expect(s.provider_customer_id).toBe('ctm_one');
    expect((await sys("select 1 from audit_log where org_id = $1 and action = 'billing.refused' and meta->>'why' = 'customer_changed'", [orgId])).length).toBe(1);
  });
});

describe('plan changes and dunning', () => {
  it('an upgrade is billed now, a downgrade at the next bill', async () => {
    const calls: any[] = [];
    env.fetchHolder.impl = async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      calls.push(body);
      return new Response(JSON.stringify({ data: sub({ items: [{ price: { id: body.items[0].price_id }, quantity: body.items[0].quantity }] }) }), { status: 200 });
    };
    expect((await ada.post('/api/billing/change', { plan: 'business', interval: 'month' })).status).toBe(200);
    // The seats in use (not the old quantity on the subscription), but never fewer than the plan's minimum
    // (3 by default, BILLING_MIN_SEATS).
    const [{ n }] = await sys<{ n: number }>(`select count(*)::int as n from users where org_id = $1 and seat = 'full' and status = 'active'`, [orgId]);
    expect(calls[0]).toMatchObject({ items: [{ price_id: 'pri_biz_m', quantity: Math.max(3, n) }], proration_billing_mode: CATALOGUE.proration.upgrade });
    expect((await ada.get('/api/me')).json.org.billing.plan).toBe('business');
    expect((await ada.post('/api/billing/change', { plan: 'team', interval: 'year' })).status).toBe(200);
    expect(calls[1]).toMatchObject({ items: [{ price_id: 'pri_team_y' }], proration_billing_mode: CATALOGUE.proration.downgrade });
    expect((await ada.post('/api/billing/change', { plan: 'platinum', interval: 'year' })).status).toBe(400);
  });

  it('a failed payment keeps everything open for the grace period, then read-only; a payment clears it', async () => {
    await paddleSays('/api/inbound/billing/paddle', { event_id: 'evt_due', event_type: 'subscription.past_due', occurred_at: '2026-11-20T12:00:00Z', data: sub({ status: 'past_due' }) });
    const [o] = await sys<{ billing: any }>('select billing from orgs where id = $1', [orgId]);
    expect(o.billing.pastDueSince).toBe('2026-11-20T12:00:00.000Z');
    const day = (d: number) => new Date(Date.parse('2026-11-20T12:00:00Z') + d * 86_400_000);
    expect(accessOf(true, o.billing, null, day(1))).toMatchObject({ state: 'past_due', readOnly: false, daysLeft: CATALOGUE.dunning.graceDays - 1 });
    expect(accessOf(true, o.billing, null, day(CATALOGUE.dunning.graceDays + 1))).toMatchObject({ state: 'locked', readOnly: true });
    await paddleSays('/api/inbound/billing/paddle', { event_id: 'evt_paid', event_type: 'subscription.updated', occurred_at: '2026-11-21T12:00:00Z', data: sub({ status: 'active' }) });
    const [p] = await sys<{ billing: any }>('select billing from orgs where id = $1', [orgId]);
    expect(p.billing).toMatchObject({ status: 'active', pastDueSince: null });
  });
});

describe('caps on what costs money', () => {
  const access = { state: 'active' as const, plan: 'team' };

  it('storage: an upload past the pooled allowance is refused', async () => {
    await env.db.system(async (q) => {
      const caps = await capsForOrg(q, orgId, access);
      await expect(checkStorage(q, orgId, access, 1024)).resolves.toBeUndefined();
      // size is an int column: enough 2 GB rows to pass the company's pooled allowance.
      const rows = Math.ceil(caps.storageBytes! / 2e9) + 1;
      for (let i = 0; i < rows; i++)
        await q.query(`insert into files (org_id, task_id, name, size, mime, storage_key) select $1, id, 'big.bin', 2000000000, 'application/octet-stream', 'k/big' from tasks where org_id = $1 limit 1`, [orgId]);
      await expect(checkStorage(q, orgId, access, 1024)).rejects.toMatchObject({ code: 'plan_limit_storage' });
      await q.query(`delete from files where org_id = $1 and storage_key = 'k/big'`, [orgId]);
    });
  });

  it('connectors: one more than the plan allows is refused; the demo source never counts', async () => {
    const cap = CATALOGUE.plans.find((p) => p.key === 'team')!.caps.connectors!;
    await env.db.system(async (q) => {
      await q.query(`delete from connections where org_id = $1 and kind = 'source'`, [orgId]);
      await q.query(`insert into connections (org_id, kind, provider, label, config) values ($1, 'source', 'demo', 'Demo', '{}')`, [orgId]);
      for (let i = 0; i < cap; i++) {
        await checkConnectors(q, orgId, access);
        await q.query(`insert into connections (org_id, kind, provider, label, config) values ($1, 'source', 'hubspot', $2, '{}')`, [orgId, `crm ${i}`]);
      }
      await expect(checkConnectors(q, orgId, access)).rejects.toMatchObject({ code: 'plan_limit_connectors' });
      await q.query(`delete from connections where org_id = $1 and kind = 'source'`, [orgId]);
    });
  });

  it('seats: a paying plan with a seat limit stops the next full seat', async () => {
    await env.db.system(async (q) => {
      await q.query(`update orgs set billing = billing || '{"status":"active","plan":"team"}'::jsonb where id = $1`, [orgId]);
      const max = CATALOGUE.plans.find((p) => p.key === 'team')!.caps.seatsMax!;
      await expect(seatGuard(q, orgId, 1)).resolves.toBeUndefined();
      await expect(seatGuard(q, orgId, max)).rejects.toMatchObject({ code: 'plan_limit_seats' });
      // Viewers are free and never counted.
      await expect(seatGuard(q, orgId, max, 'viewer')).resolves.toBeUndefined();
    });
  });

  it('assistant questions: past the plan cap the free docs search answers instead of the model', async () => {
    await env.db.system((q) => q.query(`update orgs set billing = billing || '{"status":"active","plan":"team"}'::jsonb where id = $1`, [orgId]));
    const store = dbStore(env.db, { orgId, userId: null, surface: 'app', retentionDays: 0, billingOn: true });
    const used = await store.usage();
    expect(used.questionCap).toBeGreaterThan(0);
    expect(overCap(used, 100, 5)).toBe(false);
    await env.db.system((q) =>
      q.query(
        `insert into assistant_usage (org_id, month, questions, model_questions, cost_micros) values ($1, date_trunc('month', now())::date, $2, $2, 0)
         on conflict (org_id, month) do update set model_questions = excluded.model_questions`,
        [orgId, used.questionCap],
      ),
    );
    expect(overCap(await store.usage(), 100, 5)).toBe(true);
    // Billing off: no plan cap.
    expect((await dbStore(env.db, { orgId, userId: null, surface: 'app', retentionDays: 0 }).usage()).questionCap).toBeNull();
  });

  it('checkout refuses a plan whose seat limit is below the company’s full seats', async () => {
    const [{ n }] = await sys<{ n: number }>(`select count(*)::int as n from users where org_id = $1 and seat = 'full' and status = 'active'`, [orgId]);
    expect(n).toBeGreaterThan(0);
    expect((await ada.post('/api/billing/checkout', { plan: 'business', interval: 'year' })).status).toBe(200);
  });

  it('never sells where Curahold is never offered: billing country, checkout and the connection (NEVER_OFFERED)', async () => {
    const refused = await ada.patch('/api/billing/profile', { taxNumber: null, billingEmail: null, country: 'IR' });
    expect(refused.status).toBe(451);
    expect(refused.json.error).toBe('country_not_offered');
    expect((await ada.patch('/api/billing/profile', { taxNumber: null, billingEmail: null, country: 'ir' })).status).toBe(451);
    // A connection from there is refused at checkout even with a clean profile.
    expect((await ada.req('POST', '/api/billing/checkout', { plan: 'business', interval: 'year' }, { 'cf-ipcountry': 'IR' })).status).toBe(451);
    // A country on file from before (or written around the API) still stops checkout.
    await sys(`update orgs set billing_country = 'IR' where id = $1`, [orgId]);
    expect((await ada.post('/api/billing/checkout', { plan: 'business', interval: 'year' })).json.error).toBe('country_not_offered');
    expect((await ada.patch('/api/billing/profile', { taxNumber: null, billingEmail: null, country: 'DE' })).status).toBe(200);
    expect((await ada.get('/api/billing')).json.profile.country).toBe('DE');
    expect((await ada.post('/api/billing/checkout', { plan: 'business', interval: 'year' })).status).toBe(200);
  });
});

describe('companies from the older path are migrated without loss', () => {
  it('a subscription kept only on orgs.billing gets its table row (0230)', async () => {
    const beta = env.b.orgId;
    await sys('delete from subscriptions where org_id = $1', [beta]);
    await sys(`update orgs set billing = $2 where id = $1`, [
      beta,
      JSON.stringify({ provider: 'paddle', status: 'active', plan: 'business', interval: 'year', seats: 7, periodEnd: '2099-01-01T00:00:00Z', customerId: 'ctm_old', subscriptionId: 'sub_old', eventAt: '2026-11-01T00:00:00Z' }),
    ]);
    // Re-run the migration's data statements (its column changes have already run).
    const sql = readFileSync('db/migrations/0230_billing_one_path.sql', 'utf8');
    const statements = sql.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter((s) => /^(insert into subscriptions|update subscriptions)/.test(s));
    expect(statements).toHaveLength(2);
    for (const s of statements) await sys(s);
    const [row] = await sys<Record<string, unknown>>('select * from subscriptions where org_id = $1', [beta]);
    expect(row).toMatchObject({ provider_subscription_id: 'sub_old', provider_customer_id: 'ctm_old', plan: 'business', status: 'active', billing_interval: 'year', seats: 7 });
  });
});
