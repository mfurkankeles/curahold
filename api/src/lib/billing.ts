// What Paddle tells us about a company's subscription, kept on its row
// (orgs.billing) so every request already knows it; and the subscription's
// seat count kept equal to the company's full seats.
import type { OrgBilling } from '../../../shared/src/billing';
import { fetchOf, type BillingConfig, type Deps } from '../context';
import type { Db } from '../db';
import { audit } from './audit';
import { planOfPrice, updateItems, type PaddleSubscription } from './paddle';

/** A Paddle notification. */
export interface PaddleEvent {
  event_id: string;
  event_type: string;
  occurred_at: string;
  data: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Applies a subscription event to its company: once per event, and never an
 * older event over a newer one (Paddle may retry, or deliver out of order).
 * The company is the one named at checkout (custom_data.org_id), or the one
 * already holding this subscription. Returns the company's id, or null.
 */
export async function applyPaddleEvent(db: Db, cfg: BillingConfig, ev: PaddleEvent): Promise<string | null> {
  // Transactions, customers, addresses…: nothing to keep — the subscription events say what matters.
  if (!ev.event_type.startsWith('subscription.')) return null;
  const sub = ev.data as PaddleSubscription;
  return db.system(async (q) => {
    const named = typeof sub.custom_data?.org_id === 'string' && UUID.test(sub.custom_data.org_id) ? sub.custom_data.org_id : null;
    const [org] = await q.query(`select id, billing from orgs where id = $1::uuid or billing->>'subscriptionId' = $2 order by (id = $1::uuid) desc nulls last limit 1`, [named, sub.id]);
    if (!org) return null;
    const fresh = await q.query(`insert into billing_events (id, org_id, kind) values ($1, $2, $3) on conflict (id) do nothing returning id`, [ev.event_id, org.id, ev.event_type]);
    if (!fresh.length) return org.id;
    const cur = (org.billing ?? {}) as OrgBilling;
    if (cur.subscriptionId === sub.id && cur.eventAt && Date.parse(cur.eventAt) > Date.parse(ev.occurred_at)) return org.id;
    const item = sub.items?.[0];
    const price = planOfPrice(cfg, item?.price?.id);
    const next: OrgBilling = {
      provider: 'paddle',
      status: sub.status,
      plan: price?.plan ?? cur.plan ?? 'business',
      interval: price?.interval ?? cur.interval,
      seats: item?.quantity ?? cur.seats,
      // The end of what is paid for: the current period, or when a cancellation takes effect.
      periodEnd: sub.current_billing_period?.ends_at ?? sub.scheduled_change?.effective_at ?? sub.canceled_at ?? cur.periodEnd ?? null,
      cancelAtPeriodEnd: sub.scheduled_change?.action === 'cancel',
      customerId: sub.customer_id,
      subscriptionId: sub.id,
      eventAt: ev.occurred_at,
    };
    await q.query('update orgs set billing = $2 where id = $1', [org.id, JSON.stringify(next)]);
    await audit(q, { orgId: org.id, actorId: null, action: 'billing.changed', entity: 'org', entityId: org.id, meta: { status: next.status, plan: next.plan, seats: next.seats } });
    return org.id;
  });
}

/** Full seats that are in use: people who joined (an invitation not yet taken is not billed). */
export const SEATS_SQL = `(select count(*)::int from users u where u.org_id = o.id and u.seat = 'full' and u.status = 'active')`;

/**
 * Keeps each subscription's quantity at the company's full seats (run hourly).
 * More seats are billed now for the rest of the period; fewer are credited at the next bill.
 */
export async function syncSeats(deps: Deps): Promise<number> {
  const cfg = deps.config.billing;
  if (!cfg) return 0;
  const rows = await deps.db.system((q) =>
    q.query(`select o.id, o.billing, ${SEATS_SQL} as seats from orgs o where o.billing->>'subscriptionId' is not null and o.billing->>'status' in ('active', 'trialing', 'past_due')`),
  );
  let changed = 0;
  for (const r of rows) {
    const b = r.billing as OrgBilling;
    const want = Math.max(1, Number(r.seats));
    if (b.seats === want || !b.plan || !b.interval || !b.subscriptionId) continue;
    const price = cfg.prices[b.plan]?.[b.interval];
    if (!price) continue;
    try {
      const sub = await updateItems(cfg, fetchOf(deps), b.subscriptionId, price, want, want > (b.seats ?? 0) ? 'prorated_immediately' : 'prorated_next_billing_period');
      await deps.db.system((q) => q.query(`update orgs set billing = billing || $2::jsonb where id = $1`, [r.id, JSON.stringify({ seats: sub.items?.[0]?.quantity ?? want })]));
      changed++;
    } catch (e) {
      // One company's problem never stops the others; the next hour tries again.
      console.error('[curahold] seat sync failed', r.id, e);
    }
  }
  return changed;
}
