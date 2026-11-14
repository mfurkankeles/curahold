// Keeping the gating snapshot (orgs.billing) derived from the subscriptions table.
//
// The subscriptions table (0037) is the system of record for billing; the
// existing write-gating reads the orgs.billing snapshot through the shared
// accessOf(). To make the two one coherent system without touching accessOf (and
// every write path that depends on it), we re-derive orgs.billing and
// trial_ends_at from a company's subscription row after any change to it. The
// snapshot becomes a projection of the table — one source of truth feeds gating,
// the owner console and the tenant panel alike.
import type { OrgBilling, PlanKey, SubscriptionStatus } from '../../../shared/src/billing';
import type { Deps } from '../context';
import type { Q } from '../db';

interface Row {
  status: SubscriptionStatus;
  plan: string;
  trial_ends_at: unknown;
  current_period_end: unknown;
  cancel_at_period_end: boolean;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  updated_at: unknown;
}

const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

/**
 * Re-derive orgs.billing + trial_ends_at from a company's subscription row, using
 * the given query runner. A live trial is written the way accessOf expects it —
 * no status, a future trial_ends_at — so gating and the trial countdown keep
 * working; every other state carries its status through. No row: nothing to do.
 */
export async function projectBillingQ(q: Q, orgId: string): Promise<void> {
  const [row] = await q.query<Row>(
    `select status, plan, trial_ends_at, current_period_end, cancel_at_period_end,
            provider_customer_id, provider_subscription_id, updated_at
       from subscriptions where org_id = $1`,
    [orgId],
  );
  if (!row) return;
  // The two display-only fields the table does not carry are preserved.
  const [prev] = await q.query<{ billing: OrgBilling | null }>('select billing from orgs where id = $1', [orgId]);
  const refs: OrgBilling = {
    provider: 'paddle',
    plan: row.plan as PlanKey,
    customerId: row.provider_customer_id ?? undefined,
    subscriptionId: row.provider_subscription_id ?? undefined,
    eventAt: iso(row.updated_at) ?? undefined,
    interval: prev?.billing?.interval,
    seats: prev?.billing?.seats,
  };
  const billing: OrgBilling =
    row.status === 'trialing' && !row.cancel_at_period_end
      ? refs
      : { ...refs, status: row.status, periodEnd: iso(row.current_period_end), cancelAtPeriodEnd: row.cancel_at_period_end };
  await q.query('update orgs set billing = $2 where id = $1', [orgId, JSON.stringify(billing)]);
  await q.query('update orgs set trial_ends_at = $2 where id = $1', [orgId, iso(row.trial_ends_at)]);
}

/** As projectBillingQ, for callers outside a db.system block (tenant routes). Runs as the owner, scoped to orgId. */
export async function projectBilling(deps: Deps, orgId: string): Promise<void> {
  await deps.db.system((q) => projectBillingQ(q, orgId));
}
