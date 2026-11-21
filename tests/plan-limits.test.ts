// The settings that keep a small company from costing more than it pays (pricing audit, 20 Nov; ADR 0022): the
// assistant's money ceiling (seats × the plan's rate, a trial's fixed amount; an administrator can only go lower, and
// the model stops at it whatever is stored), the public chat's own cap, the fewest seats a subscription is billed for,
// and the trial's width (25 seats as the owner approved, 1 GB a seat). Billing is on, through a stubbed Paddle.
import { beforeAll, describe, expect, it } from 'vitest';
import { CATALOGUE, capsOf, MIN_SEATS_DEFAULT, minSeatRulesFrom, minSeatsFor } from '../shared/src/billing';
import { TRIAL_DEFAULTS } from '../shared/src/trialRequest';
import { assistantConfigFrom, planAiCeilingUsd } from '../api/src/assistant/cost';
import { overCap } from '../api/src/assistant/core';
import { dbStore } from '../api/src/assistant/store';
import { billedSeats, syncSeats } from '../api/src/billing/service';
import { CONSOLE_SETTING_DEFAULTS } from '../api/src/lib/trialRequests';
import { login, setup, type Client, type Env } from './helpers';

const PRICES = { team: { month: 'pri_team_m', year: 'pri_team_y' }, business: { month: 'pri_biz_m', year: 'pri_biz_y' } };
let env: Env;
let ada: Client;

beforeAll(async () => {
  env = await setup({ billing: { provider: 'paddle', env: 'sandbox', apiKey: 'pdl_key', webhookSecret: 'pdl_secret', clientToken: 'test_token', prices: PRICES } });
  ada = await login(env, 'acme', 'ada@demo.example');
});

const fullSeats = async () =>
  (await env.db.system((q) => q.query<{ n: number }>(`select count(*)::int as n from users where org_id = $1 and seat = 'full' and status = 'active'`, [env.a.orgId])))[0].n;
const month = `date_trunc('month', now())::date`;

describe('the assistant’s money ceiling', () => {
  it('is seats × the plan’s rate for a paying company, a fixed amount in the trial, none with billing off', () => {
    const cfg = assistantConfigFrom({});
    expect(planAiCeilingUsd({ state: 'free', plan: 'team' }, 3, cfg)).toBeNull();
    expect(planAiCeilingUsd({ state: 'trial', plan: 'business' }, 25, cfg)).toBe(5);
    expect(planAiCeilingUsd({ state: 'active', plan: 'team' }, 3, cfg)).toBe(1.65);
    expect(planAiCeilingUsd({ state: 'past_due', plan: 'business' }, 4, cfg)).toBe(4.4);
    // A plan with no rate of its own never opens an unbounded cost: the lowest rate applies.
    expect(planAiCeilingUsd({ state: 'active', plan: 'enterprise' }, 10, cfg)).toBe(5.5);
    // The operator changes the rates; a bad entry keeps its default.
    const set = assistantConfigFrom({ ASSISTANT_USD_PER_SEAT: 'team:1, business:oops', ASSISTANT_TRIAL_USD: '2' });
    expect(set.aiUsdPerSeat).toEqual({ team: 1, business: 1.1 });
    expect(planAiCeilingUsd({ state: 'trial', plan: 'team' }, 3, set)).toBe(2);
  });

  it('in the trial: the administrator cannot set more than the trial’s amount', async () => {
    const view = (await ada.get('/api/assist/settings')).json;
    expect(view.engine.maxMonthlyCapUsd).toBe(5);
    const over = await ada.put('/api/assist/settings', { monthlyCapUsd: 50 });
    expect(over.status).toBe(409);
    expect(over.json.error).toBe('plan_limit_ai');
    expect((await ada.put('/api/assist/settings', { monthlyCapUsd: 4 })).json.settings.monthlyCapUsd).toBe(4);
  });

  it('paying: the ceiling follows the seats, and the model stops there even with a higher limit stored', async () => {
    await env.db.system((q) => q.query(`update orgs set billing = '{"status":"active","plan":"team","interval":"month"}'::jsonb where id = $1`, [env.a.orgId]));
    const ceiling = Math.round((await fullSeats()) * 0.55 * 100) / 100;
    expect((await ada.get('/api/assist/settings')).json.engine.maxMonthlyCapUsd).toBe(ceiling);
    expect((await ada.put('/api/assist/settings', { monthlyCapUsd: ceiling + 1 })).status).toBe(409);
    // A limit stored before the ceiling (by hand, an older version) is shown as the ceiling…
    await env.db.system((q) => q.query(`update orgs set settings = settings || '{"assistant":{"enabled":true,"monthlyCapUsd":50}}'::jsonb where id = $1`, [env.a.orgId]));
    expect((await ada.get('/api/assist/settings')).json.settings.monthlyCapUsd).toBe(ceiling);
    // …and the model is not asked once the company has spent the ceiling, though 50 $ is stored.
    await env.db.system((q) =>
      q.query(
        `insert into assistant_usage (org_id, month, questions, model_questions, cost_micros) values ($1, ${month}, 1, 1, $2)
         on conflict (org_id, month) do update set cost_micros = excluded.cost_micros`,
        [env.a.orgId, Math.round(ceiling * 1e6)],
      ),
    );
    const store = dbStore(env.db, { orgId: env.a.orgId, userId: env.a.ids.ada, surface: 'app', retentionDays: 0, billingOn: true, config: assistantConfigFrom({}) });
    const used = await store.usage();
    expect(used.planCapUsd).toBe(ceiling);
    expect(overCap(used, 100, 50)).toBe(true);
    await env.db.system((q) => q.query(`update assistant_usage set cost_micros = 0 where org_id = $1 and month = ${month}`, [env.a.orgId]));
    expect(overCap(await store.usage(), 100, 50)).toBe(false);
  });

  it('the public chat has its own cap and cannot use up what customers share', async () => {
    const store = dbStore(env.db, { orgId: null, userId: null, surface: 'docs', retentionDays: 0, config: assistantConfigFrom({}) });
    await store.record({ model: true, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, micros: 10_000_000 });
    const pub = await store.usage();
    expect(pub).toMatchObject({ publicCapUsd: 10 });
    expect(pub.publicMicros).toBeGreaterThanOrEqual(10_000_000);
    expect(overCap(pub, 100, null)).toBe(true);
    // A company's assistant is not stopped by it: the installation cap (100 $) is far away.
    const company = await dbStore(env.db, { orgId: env.a.orgId, userId: env.a.ids.ada, surface: 'app', retentionDays: 0, billingOn: true }).usage();
    expect(company.publicCapUsd).toBeUndefined();
    expect(overCap({ ...company, companyMicros: 0 }, 100, 50)).toBe(false);
  });
});

describe('the fewest seats a subscription is billed for', () => {
  it('defaults: 3; India 5 (6 a year); Malaysia 4 a year; more seats are billed as they are', () => {
    const deps = { config: { billing: undefined } } as never;
    expect(billedSeats(deps, 'team', 'month', null, 1)).toBe(3);
    expect(billedSeats(deps, 'team', 'month', 'in', 2)).toBe(5);
    expect(billedSeats(deps, 'business', 'year', 'in', 1)).toBe(6);
    expect(billedSeats(deps, 'team', 'year', 'my', 1)).toBe(4);
    expect(billedSeats(deps, 'team', 'month', 'my', 1)).toBe(3);
    expect(billedSeats(deps, 'team', 'month', 'tr', 7)).toBe(7);
  });

  it('the operator sets them by plan, interval and region; unreadable settings keep the defaults', () => {
    const r = minSeatRulesFrom('{"business":{"month":{"*":5}},"*":{"month":{"*":2}}}');
    expect(minSeatsFor(r, 'business', 'month', 'tr')).toBe(5);
    expect(minSeatsFor(r, 'team', 'month', 'tr')).toBe(2);
    expect(minSeatsFor(r, 'team', 'year', 'tr')).toBe(1);
    expect(minSeatRulesFrom('not json')).toBe(MIN_SEATS_DEFAULT);
    expect(minSeatRulesFrom('{"*":{"month":{"*":0}}}')).toBe(MIN_SEATS_DEFAULT);
  });

  it('checkout never asks the provider for fewer, and the Billing screen counts the total with it', async () => {
    env.fetchHolder.impl = async () => new Response(JSON.stringify({ data: { id: 'txn_seats' } }), { status: 201 });
    await env.db.system((q) => q.query(`update orgs set billing = '{}'::jsonb, billing_country = null where id = $1`, [env.a.orgId]));
    const n = await fullSeats();
    const india = await ada.req('POST', '/api/billing/checkout', { plan: 'team', interval: 'year' }, { 'cf-ipcountry': 'IN' });
    expect(india.status).toBe(200);
    expect(india.json.checkout.quantity).toBe(Math.max(6, n));
    const elsewhere = await ada.req('POST', '/api/billing/checkout', { plan: 'team', interval: 'month' }, { 'cf-ipcountry': 'DE' });
    expect(elsewhere.json.checkout.quantity).toBe(Math.max(3, n));
    // The billing country, once known, decides over the address it is seen from.
    await env.db.system((q) => q.query(`update orgs set billing_country = 'IN' where id = $1`, [env.a.orgId]));
    expect((await ada.req('POST', '/api/billing/checkout', { plan: 'team', interval: 'month' }, { 'cf-ipcountry': 'DE' })).json.checkout.quantity).toBe(Math.max(5, n));
    const overview = (await ada.get('/api/billing')).json;
    expect(overview.plans.find((p: { key: string }) => p.key === 'team').minSeats).toEqual({ month: 5, year: 6 });
    await env.db.system((q) => q.query(`update orgs set billing_country = null where id = $1`, [env.a.orgId]));
  });
});

describe('seats added during a period', () => {
  it('are billed at once, prorated for the rest of the period; seats removed are credited at the next bill', async () => {
    const want = Math.max(3, await fullSeats());
    const calls: { items: { quantity: number }[]; proration_billing_mode: string }[] = [];
    env.fetchHolder.impl = async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      calls.push(body);
      return new Response(JSON.stringify({ data: { id: 'sub_seats', status: 'active', customer_id: 'ctm_seats', items: [{ price: { id: 'pri_team_m' }, quantity: body.items[0].quantity }], current_billing_period: { starts_at: '2026-11-01T00:00:00Z', ends_at: '2099-01-01T00:00:00Z' }, scheduled_change: null } }), { status: 200 });
    };
    const subscribe = (seats: number) =>
      env.db.system((q) =>
        q.query(
          `insert into subscriptions (org_id, provider, provider_customer_id, provider_subscription_id, plan, status, billing_interval, seats)
           values ($1, 'paddle', 'ctm_seats', 'sub_seats', 'team', 'active', 'month', $2)
           on conflict (org_id) do update set provider_subscription_id = 'sub_seats', plan = 'team', status = 'active', billing_interval = 'month', seats = $2`,
          [env.a.orgId, seats],
        ),
      );
    // People joined since the last bill: the extra seats are charged now, for the rest of the period.
    await subscribe(want - 1);
    expect(await syncSeats(env.deps)).toBe(1);
    expect(calls.at(-1)).toEqual({ items: [{ price_id: 'pri_team_m', quantity: want }], proration_billing_mode: CATALOGUE.proration.seatsUp });
    expect(CATALOGUE.proration.seatsUp).toBe('prorated_immediately');
    // People left: the next bill is lower, nothing is refunded mid-period.
    await subscribe(want + 2);
    expect(await syncSeats(env.deps)).toBe(1);
    expect(calls.at(-1)).toEqual({ items: [{ price_id: 'pri_team_m', quantity: want }], proration_billing_mode: 'prorated_next_billing_period' });
    // Nothing changed: nothing is sent.
    const n = calls.length;
    expect(await syncSeats(env.deps)).toBe(0);
    expect(calls.length).toBe(n);
    await env.db.system((q) => q.query(`delete from subscriptions where org_id = $1`, [env.a.orgId]));
  });
});

describe('the trial', () => {
  it('is 25 seats (the owner\'s approved default) and 1 GB a seat, and the owner console starts from it', () => {
    expect(CATALOGUE.trial.autoApproveSeats).toBe(25);
    expect(TRIAL_DEFAULTS.seatCap).toBe(25);
    expect(CONSOLE_SETTING_DEFAULTS['trial.seatCap']).toBe(25);
    const caps = capsOf({ state: 'trial', plan: CATALOGUE.trial.plan }, 3);
    expect(caps.storageGbPerSeat).toBe(1);
    expect(caps.storageBytes).toBe(3 * 1024 ** 3);
    // A paying Business company keeps its plan's space.
    expect(capsOf({ state: 'active', plan: 'business' }, 3).storageGbPerSeat).toBe(10);
  });

  it('the Billing screen shows the trial limits the terms point to: the approved seats and the space a seat', async () => {
    const org = (set: string) => env.db.system((q) => q.query(`update orgs set ${set} where id = $1`, [env.a.orgId]));
    await env.db.system((q) => q.query(`delete from subscriptions where org_id = $1`, [env.a.orgId]));
    await org(`billing = '{}'::jsonb, trial_ends_at = now() + interval '30 days', trial_seat_cap = 25`);
    const inTrial = (await ada.get('/api/billing')).json;
    expect(inTrial.access.state).toBe('trial');
    expect(inTrial.trialLimits).toEqual({ seats: 25, storageGbPerSeat: 1 });
    // The seat row counts against the trial's seats, not "no limit" from the Business plan behind the trial.
    expect(inTrial.usage.seats.cap).toBe(25);
    // An older trial without a seat cap still shows the space a seat.
    await org(`trial_seat_cap = null`);
    const noCap = (await ada.get('/api/billing')).json;
    expect(noCap.trialLimits).toEqual({ seats: null, storageGbPerSeat: 1 });
    expect(noCap.usage.seats.cap).toBeNull();
    // A paying company has no trial limits on the screen.
    await org(`billing = '{"status":"active","plan":"team","interval":"month"}'::jsonb, trial_seat_cap = 10`);
    const paying = (await ada.get('/api/billing')).json;
    expect(paying.trialLimits).toBeNull();
    expect(paying.usage.seats.cap).toBe(CATALOGUE.plans.find((p) => p.key === 'team')!.caps.seatsMax);
    await org(`billing = '{}'::jsonb, trial_seat_cap = null`);
  });
});
