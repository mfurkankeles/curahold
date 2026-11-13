// What Paddle tells us about a company's subscription, kept on its row
// (orgs.billing) so every request already knows it; and the subscription's
// seat count kept equal to the company's full seats.
import type { OrgBilling } from '../../../shared/src/billing';
import { fetchOf, type BillingConfig, type Deps } from '../context';
import type { Db } from '../db';
import { audit } from './audit';
import { hmacHex, safeEqual } from './crypto';
import { planOfPrice, updateItems, type PaddleSubscription } from './paddle';

/** A Paddle notification. */
export interface PaddleEvent {
  event_id: string;
  event_type: string;
  occurred_at: string;
  data: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A subscription in one of these states is live: it must never be moved to another company. */
const LIVE = ['active', 'trialing', 'past_due', 'paused'];

/**
 * What the server hands the browser to put in checkout's custom_data. The browser
 * could send anything there, so the company id travels with a signature only this
 * server can make (keyed with the webhook secret); the webhook trusts nothing else.
 */
export async function checkoutCustomData(cfg: BillingConfig, orgId: string): Promise<{ org_id: string; sig: string }> {
  return { org_id: orgId, sig: await hmacHex(cfg.webhookSecret, `checkout:${orgId}`) };
}

async function namedOrg(cfg: BillingConfig, custom: unknown): Promise<string | null> {
  const c = (custom ?? {}) as { org_id?: unknown; sig?: unknown };
  if (typeof c.org_id !== 'string' || !UUID.test(c.org_id) || typeof c.sig !== 'string') return null;
  const want = await hmacHex(cfg.webhookSecret, `checkout:${c.org_id.toLowerCase()}`);
  return safeEqual(c.sig, want) ? c.org_id.toLowerCase() : null;
}

/**
 * Applies a subscription event to its company: once per event, and never an
 * older event over a newer one (Paddle may retry, or deliver out of order).
 * The company is the one already holding this subscription, or — for a new
 * subscription — the one named (and signed for) at checkout. An event that would
 * move a live subscription or customer to a different company is refused:
 * nothing changes, and the attempt is written to the company's activity log.
 * Returns the company's id, or null.
 */
export async function applyPaddleEvent(db: Db, cfg: BillingConfig, ev: PaddleEvent): Promise<string | null> {
  // Transactions, customers, addresses…: nothing to keep — the subscription events say what matters.
  if (!ev.event_type.startsWith('subscription.')) return null;
  const sub = ev.data as PaddleSubscription;
  const named = await namedOrg(cfg, sub.custom_data);
  return db.system(async (q) => {
    const refuse = async (orgId: string, why: string) => {
      await audit(q, { orgId, actorId: null, action: 'billing.refused', entity: 'org', entityId: orgId, meta: { why, subscription: sub.id, event: ev.event_id } });
      return null;
    };
    const [holder] = await q.query(`select id, billing from orgs where billing->>'subscriptionId' = $1 limit 1`, [sub.id]);
    let org = holder;
    if (holder) {
      // The subscription already belongs to a company: custom data cannot move it.
      if (named && named !== holder.id) return refuse(holder.id, 'named_other_org');
      const hb = (holder.billing ?? {}) as OrgBilling;
      if (hb.customerId && sub.customer_id && hb.customerId !== sub.customer_id) return refuse(holder.id, 'customer_changed');
    } else {
      // A new subscription: it needs a signed company, and that company must not already hold another live one.
      if (!named) return null;
      [org] = await q.query(`select id, billing from orgs where id = $1::uuid`, [named]);
      if (!org) return null;
      const ob = (org.billing ?? {}) as OrgBilling;
      if (ob.subscriptionId && ob.subscriptionId !== sub.id && LIVE.includes(ob.status ?? '')) return refuse(org.id, 'already_subscribed');
      if (ob.customerId && sub.customer_id && ob.customerId !== sub.customer_id && LIVE.includes(ob.status ?? '')) return refuse(org.id, 'customer_changed');
    }
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
