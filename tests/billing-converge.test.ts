// Billing convergence: the subscriptions table (0037) is the system of record and
// the orgs.billing gating snapshot is a projection of it (api/src/billing/project).
// These check that each subscription state projects to the access state the
// existing accessOf() gate expects, and that a missing row is backfilled.
import { beforeAll, describe, expect, it } from 'vitest';
import { accessOf, type AccessState } from '../shared/src/billing';
import { ensureSubscription } from '../api/src/billing/service';
import { projectBilling } from '../api/src/billing/project';
import { setup, type Env } from './helpers';

let env: Env;

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string | null));

async function stateOf(orgId: string): Promise<AccessState> {
  const row = await env.deps.db.system(async (q) => {
    const [r] = await q.query<{ billing: unknown; trial_ends_at: unknown }>('select billing, trial_ends_at from orgs where id = $1', [orgId]);
    return r;
  });
  // Billing enabled (true) so the gate actually computes a real state, not 'free'.
  return accessOf(true, row.billing as never, iso(row.trial_ends_at), new Date()).state;
}

async function upsertSub(orgId: string, set: string, params: unknown[]) {
  await env.deps.db.system(async (q) => {
    await q.query(
      `insert into subscriptions (org_id, provider, plan, status, trial_ends_at)
         values ($1, 'paddle', 'business', 'trialing', now() + interval '80 days')
       on conflict (org_id) do nothing`,
      [orgId],
    );
    await q.query(`update subscriptions set ${set}, updated_at = now() where org_id = $1`, [orgId, ...params]);
  });
}

beforeAll(async () => {
  env = await setup();
});

describe('billing projection onto the gating snapshot', () => {
  it('projects each subscription state to the access state accessOf expects', async () => {
    const org = env.a.orgId;

    // active, paid period in the future → active
    await upsertSub(org, `status = 'active', trial_ends_at = now() - interval '5 days', current_period_end = now() + interval '20 days', cancel_at_period_end = false`, []);
    await projectBilling(env.deps, org);
    expect(await stateOf(org)).toBe('active');

    // active but cancelled at period end → ending (still usable until the period ends)
    await upsertSub(org, `cancel_at_period_end = true`, []);
    await projectBilling(env.deps, org);
    expect(await stateOf(org)).toBe('ending');

    // back to a live trial → trial (snapshot drops the status, keeps a future trial end)
    await upsertSub(org, `status = 'trialing', cancel_at_period_end = false, trial_ends_at = now() + interval '40 days', current_period_end = null`, []);
    await projectBilling(env.deps, org);
    expect(await stateOf(org)).toBe('trial');

    // cancelled with the period already over → locked (read-only)
    await upsertSub(org, `status = 'canceled', current_period_end = now() - interval '1 day', trial_ends_at = now() - interval '90 days'`, []);
    await projectBilling(env.deps, org);
    expect(await stateOf(org)).toBe('locked');
  });

  it('backfills a missing subscription row from the company trial, and that reads as a trial', async () => {
    const org = env.b.orgId;
    const before = await env.deps.db.system((q) => q.query<{ one: number }>('select 1 as one from subscriptions where org_id = $1', [org]));
    expect(before.length).toBe(0); // seeded companies start without a row

    await ensureSubscription(env.deps, org);

    const row = await env.deps.db.system((q) => q.query<{ status: string }>('select status from subscriptions where org_id = $1', [org]));
    expect(row[0]?.status).toBe('trialing');
    expect(await stateOf(org)).toBe('trial');

    // Idempotent: a second call changes nothing.
    await ensureSubscription(env.deps, org);
    const again = await env.deps.db.system((q) => q.query<{ one: number }>('select 1 as one from subscriptions where org_id = $1', [org]));
    expect(again.length).toBe(1);
  });
});
