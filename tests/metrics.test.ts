// The platform owner's whole-business metrics: only the owner may read them,
// and the numbers add up across every company. Billing is off in tests, so the
// owner is the company administrator and the mode is "demo".
import { beforeAll, describe, expect, it } from 'vitest';
import { login, setup, type Env } from './helpers';

let env: Env;

beforeAll(async () => {
  env = await setup();
  // Make acme a paying Business customer with five seats: 5 × $35 = $175 MRR.
  await env.deps.db.system((q) =>
    q.query(`update orgs set billing = $2::jsonb where id = $1`, [
      env.a.orgId,
      JSON.stringify({ status: 'active', plan: 'business', interval: 'month', seats: 5, eventAt: new Date().toISOString() }),
    ]),
  );
  // One action today, so a daily-active user shows up.
  await env.deps.db.system((q) =>
    q.query(`insert into audit_log (org_id, actor_id, action, entity) values ($1, $2, 'test.ping', 'org')`, [env.a.orgId, env.a.ids.ada]),
  );
});

describe('platform metrics', () => {
  it('is for the owner alone', async () => {
    const admin = await login(env, 'acme', 'ada@demo.example');
    const member = await login(env, 'acme', 'lena@demo.example');
    expect((await admin.get('/api/me')).json.owner).toBe(true);
    expect((await member.get('/api/me')).json.owner).toBe(false);
    expect((await admin.get('/api/metrics')).status).toBe(200);
    expect((await member.get('/api/metrics')).status).toBe(403);
  });

  it('adds up revenue, customers, engagement and usage across companies', async () => {
    const admin = await login(env, 'acme', 'ada@demo.example');
    const { status, json: m } = await admin.get('/api/metrics');
    expect(status).toBe(200);

    // Revenue from the live subscription.
    expect(m.revenue.mrr).toBe(175);
    expect(m.revenue.arr).toBe(175 * 12);
    expect(m.revenue.payingOrgs).toBe(1);
    expect(m.revenue.arpa).toBe(175);
    expect(m.revenue.byPlan.find((p: { plan: string; mrr: number }) => p.plan === 'business')?.mrr).toBe(175);

    // Customers: both seeded companies are counted; the funnel has its four stages.
    expect(m.customers.orgs).toBeGreaterThanOrEqual(2);
    expect(m.customers.paying).toBe(1);
    expect(m.customers.funnel.map((f: { stage: string }) => f.stage)).toEqual(['signups', 'verified', 'companies', 'paying']);

    // Engagement: the ping makes at least one active user today, and seats are counted.
    expect(m.engagement.dau).toBeGreaterThanOrEqual(1);
    expect(m.engagement.mau).toBeGreaterThanOrEqual(1);
    expect(m.engagement.seats.full).toBeGreaterThanOrEqual(1);

    // Usage: the demo seeds boards and tasks.
    expect(m.usage.boards).toBeGreaterThan(0);
    expect(m.usage.tasks).toBeGreaterThan(0);

    // Billing is off in tests, so the numbers are labelled demo.
    expect(m.mode).toBe('demo');
  });
});
