// The one billing path (docs/ADR/0019): everything that changes a company's
// subscription goes through here into the subscriptions / invoices tables, and
// the gating snapshot (orgs.billing) is re-derived from them (project.ts).
//
// - startTrial / ensureSubscription: the approval-based three-month trial row.
// - applyWebhook: a provider's verified notification, applied once (event
//   ledger), never an older one over a newer one, never moving a subscription
//   or customer to another company.
// - changePlan / syncSeats: plan, interval and seat changes, prorated per the
//   catalogue (shared/src/plans.json → proration).
//
// The webhook, the trial and the hourly seat sync have no signed-in person and
// must reach the right company directly, so they run as the owner (db.system).
// Every such statement names org_id from a trusted source (the row that already
// holds the subscription, or a signed checkout id), so one company's billing can
// never spill into another's. By-hand changes an administrator makes go through
// the request role and row-level security, in the route.
import type { BillingEventsRow, SubscriptionsRow } from '../db/rows.gen';
import { CATALOGUE, MIN_SEATS_DEFAULT, minSeatsFor, PLANS, planOf, regionFor, trialEndsAt, type Interval, type PlanKey, type Subscription, type SubscriptionStatus } from '../../../shared/src/billing';
import { fetchOf, nowOf, type Deps } from '../context';
import type { Q } from '../db';
import { audit } from '../lib/audit';
import { pushToOwner } from '../lib/ownerOutbox';
import { ownerWord, type OwnerKey } from '../../../shared/src/i18n/owner';
import { PaddleProvider } from './paddle';
import { projectBillingQ } from './project';
import type { PaymentProvider, ProviderInvoice, ProviderSubscription, WebhookEvent } from './provider';

/** A subscription in one of these states is live and must never be moved between companies. */
export const LIVE: SubscriptionStatus[] = ['active', 'trialing', 'past_due', 'paused'];
const DAY = 86_400_000;

/** Full seats that are in use: people who joined (an invitation not yet taken is not billed). */
export const SEATS_SQL = `(select count(*)::int from users u where u.org_id = o.id and u.seat = 'full' and u.status = 'active')`;

/**
 * The price region a company is billed in: its billing country, else the country it is seen from (checkout only),
 * else the one region that collects the subscription's currency. Null: the fallback region's rule applies.
 */
function billingRegionKey(country: string | null | undefined, currency?: string | null): string | null {
  if (country) return regionFor(country)?.key ?? null;
  const byCurrency = currency ? CATALOGUE.regions.filter((r) => r.collect === currency.toUpperCase()) : [];
  return byCurrency.length === 1 ? byCurrency[0]!.key : null;
}

/**
 * The one price region the fewest billed seats follow, for checkout, the Billing screen, a plan change and the hourly
 * seat sync alike. Two answers for one company would bill it at checkout for one region's minimum and then, within
 * the hour, move it to another's (independent review S2: a Malaysian company buying yearly without a billing
 * country was billed 4 seats, then lowered to 3 because USD is collected in several regions). So checkout decides
 * once and stores it (`stored`, orgs.settings.billingRegion), and everything after the purchase reads that value:
 *   stored region, else the billing country, else the country the request comes from (checkout and the screen
 *   before a purchase only), else the one region that collects the subscription's currency; null: the fallback.
 * Checkout itself passes no `stored`: a new purchase decides again from what is known now.
 */
export function billingRegionOf(o: { stored?: string | null; country?: string | null; seenFrom?: string | null; currency?: string | null }): string | null {
  if (o.stored && CATALOGUE.regions.some((r) => r.key === o.stored)) return o.stored;
  return billingRegionKey(o.country ?? o.seenFrom, o.currency);
}

/**
 * The seats a subscription is billed for: the full seats in use, but never fewer than the plan's minimum for that
 * interval and region (BILLING_MIN_SEATS; shared/src/billing.ts MIN_SEATS_DEFAULT). Every quantity sent to the
 * provider goes through here (checkout, plan change, the hourly seat sync), so none can buy below it.
 */
export function billedSeats(deps: Pick<Deps, 'config'>, plan: PlanKey, interval: Interval, region: string | null, fullSeats: number): number {
  return Math.max(minSeatsFor(deps.config.billing?.minSeats ?? MIN_SEATS_DEFAULT, plan, interval, region), Math.max(1, Math.floor(fullSeats) || 0));
}

/** The configured payment provider, or null when billing is off (self-hosted, demo, tests). */
export function providerFor(deps: Pick<Deps, 'config' | 'fetch'>): PaymentProvider | null {
  const cfg = deps.config.billing;
  if (!cfg) return null;
  return new PaddleProvider(cfg, fetchOf(deps as Deps));
}

/**
 * Start a company's free trial: a 'trialing' subscription that ends TRIAL_MONTHS
 * out (shared/src/plans.json → trial). Called when the owner approves a trial
 * request (lib/trialRequests.ts) or a sign-up is allowed. Idempotent — a company
 * that already has a subscription keeps it. Returns true when a trial was created.
 */
export async function startTrial(deps: Deps, input: { orgId: string; plan: PlanKey }): Promise<boolean> {
  const ends = trialEndsAt(nowOf(deps)).toISOString();
  return deps.db.system(async (q) => {
    const [row] = await q.query<{ id: string }>(
      `insert into subscriptions (org_id, provider, plan, status, trial_ends_at)
         values ($1, 'paddle', $2, 'trialing', $3)
       on conflict (org_id) do nothing
       returning id`,
      [input.orgId, input.plan, ends],
    );
    if (row) {
      await audit(q, { orgId: input.orgId, actorId: null, action: 'billing.changed', entity: 'org', entityId: input.orgId, meta: { status: 'trialing', plan: input.plan } });
      await projectBillingQ(q, input.orgId);
    }
    return !!row;
  });
}

/**
 * Make sure a company has a subscription row, backfilling one from its current
 * trial when it is missing (older companies, demo data). Keeps the real trial end
 * rather than resetting it. Idempotent.
 */
export async function ensureSubscription(deps: Deps, orgId: string): Promise<void> {
  await deps.db.system(async (q) => {
    const [has] = await q.query<{ one: number }>(`select 1 as one from subscriptions where org_id = $1`, [orgId]);
    if (has) return;
    const [org] = await q.query<{ trial_ends_at: unknown }>(`select trial_ends_at from orgs where id = $1`, [orgId]);
    const ends = org?.trial_ends_at ? iso(org.trial_ends_at)! : trialEndsAt(nowOf(deps)).toISOString();
    const [row] = await q.query<{ id: string }>(
      `insert into subscriptions (org_id, provider, plan, status, trial_ends_at)
         values ($1, 'paddle', $2, 'trialing', $3)
       on conflict (org_id) do nothing
       returning id`,
      [orgId, CATALOGUE.trial.plan, ends],
    );
    if (row) await projectBillingQ(q, orgId);
  });
}

/**
 * Apply one verified provider notification. Each event id is applied once (the
 * billing_events ledger; Paddle retries and may deliver twice), and the ledger
 * row is written in the same transaction as the change, so a crash never leaves
 * an event marked done but not applied. Returns the company it touched, or null.
 */
export async function applyWebhook(deps: Deps, provider: string, event: WebhookEvent): Promise<string | null> {
  if (event.subscription) return applySubscription(deps, provider, event, event.subscription);
  if (event.invoice) return applyInvoice(deps, provider, event, event.invoice);
  return null;
}

/** Records the event in the ledger; false when it was already applied. */
async function firstTime(q: Q, provider: string, event: WebhookEvent, orgId: string): Promise<boolean> {
  const fresh = await q.query<Pick<BillingEventsRow, 'id'>>(`insert into billing_events (id, org_id, kind, provider) values ($1, $2, $3, $4) on conflict (id) do nothing returning id`, [
    event.id.slice(0, 120),
    orgId,
    event.type.slice(0, 80),
    provider,
  ]);
  return fresh.length > 0;
}

/** Something a subscription carried that the server did not offer (review S5): told to the owner after the commit. */
type Mismatch = { orgId: string; why: 'unknown_price' | 'over_plan' | 'too_few_seats'; seats?: number; want?: number; cap?: number };

async function applySubscription(deps: Deps, provider: string, event: WebhookEvent, sub: ProviderSubscription): Promise<string | null> {
  const found: Mismatch[] = [];
  const orgId = await deps.db.system(async (q) => {
    const refuse = async (orgId: string, why: string) => {
      // Written to the company's activity log so an administrator (and we) can see the attempt.
      await audit(q, { orgId, actorId: null, action: 'billing.refused', entity: 'org', entityId: orgId, meta: { why, subscription: sub.providerSubscriptionId, event: event.id } });
      return null;
    };
    type Cur = { org_id: string; plan: string; status: SubscriptionStatus; provider_customer_id: string | null; provider_subscription_id: string | null; trial_ends_at: unknown; event_at: unknown; past_due_since: unknown; billing_interval: Interval | null; seats: number | null; currency: string | null };
    const cols = `org_id, plan, status, provider_customer_id, provider_subscription_id, trial_ends_at, event_at, past_due_since, billing_interval, seats, currency`;
    // The company already holding this provider subscription, if any: a lookup across companies by the
    // provider's id, which is how a webhook finds its company (the result's org_id is then the only scope used).
    let [cur] = await q.query<Cur>(
      `select org_id, plan, status, provider_customer_id, provider_subscription_id, trial_ends_at, event_at, past_due_since, billing_interval, seats, currency
         from subscriptions where provider_subscription_id = $1 limit 1`,
      [sub.providerSubscriptionId],
    );
    const held = !!cur;
    if (cur) {
      // A subscription that belongs to a company stays there: custom data cannot re-point it, nor can a new customer take it.
      if (sub.signedOrgId && sub.signedOrgId !== cur.org_id) return refuse(cur.org_id, 'named_other_org');
      if (cur.provider_customer_id && sub.providerCustomerId && cur.provider_customer_id !== sub.providerCustomerId) return refuse(cur.org_id, 'customer_changed');
    } else {
      // A new subscription needs a signed company id — an unsigned or forged one is ignored.
      if (!sub.signedOrgId) return null;
      const [org] = await q.query<{ id: string }>(`select id from orgs where id = $1::uuid`, [sub.signedOrgId]);
      if (!org) return null;
      [cur] = await q.query<Cur>(`select ${cols} from subscriptions where org_id = $1`, [org.id]);
      if (cur?.provider_subscription_id && cur.provider_subscription_id !== sub.providerSubscriptionId && LIVE.includes(cur.status)) return refuse(org.id, 'already_subscribed');
      if (cur?.provider_customer_id && sub.providerCustomerId && cur.provider_customer_id !== sub.providerCustomerId && LIVE.includes(cur.status)) return refuse(org.id, 'customer_changed');
    }
    const orgId = cur?.org_id ?? sub.signedOrgId!;
    // Money (security audit M2): a new subscription must be for a price of ours (PADDLE_PRICES). Any other recurring
    // price in the same Paddle account would otherwise end a trial as "paying" on the trial's plan.
    if (!held && !sub.plan) {
      // Paid at the provider all the same: the owner hears of it to refund it (RUNBOOK "Billing: a refused subscription").
      found.push({ orgId, why: 'unknown_price' });
      return refuse(orgId, 'unknown_price');
    }
    if (!(await firstTime(q, provider, event, orgId))) return orgId;
    // Paddle may deliver out of order: never let an older event overwrite a newer one.
    const last = iso(cur?.event_at);
    if (cur?.provider_subscription_id === sub.providerSubscriptionId && last && Date.parse(last) > Date.parse(event.occurredAt)) return orgId;

    // An existing subscription whose price is no longer in the list keeps the plan it was bought on.
    const plan = sub.plan ?? cur!.plan;
    const trial = sub.trialEndsAt ?? iso(cur?.trial_ends_at) ?? null;
    // Dunning: remember when the first failed payment happened; a payment that goes through clears it.
    const pastDueSince = sub.status === 'past_due' ? (iso(cur?.past_due_since) ?? event.occurredAt) : null;
    await q.query(
      `insert into subscriptions (org_id, provider, provider_customer_id, provider_subscription_id, plan, status, trial_ends_at, current_period_end,
                                  cancel_at_period_end, billing_interval, seats, currency, past_due_since, event_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
       on conflict (org_id) do update set
         provider = excluded.provider,
         provider_customer_id = coalesce(excluded.provider_customer_id, subscriptions.provider_customer_id),
         provider_subscription_id = excluded.provider_subscription_id,
         plan = excluded.plan, status = excluded.status,
         trial_ends_at = excluded.trial_ends_at, current_period_end = excluded.current_period_end,
         cancel_at_period_end = excluded.cancel_at_period_end,
         billing_interval = coalesce(excluded.billing_interval, subscriptions.billing_interval),
         seats = coalesce(excluded.seats, subscriptions.seats),
         currency = coalesce(excluded.currency, subscriptions.currency),
         past_due_since = excluded.past_due_since, event_at = excluded.event_at, updated_at = now()`,
      [orgId, provider, sub.providerCustomerId, sub.providerSubscriptionId, plan, sub.status, trial, sub.currentPeriodEnd, sub.cancelAtPeriodEnd, sub.interval, sub.seats, sub.currency, pastDueSince, event.occurredAt],
    );
    await audit(q, { orgId, actorId: null, action: 'billing.changed', entity: 'org', entityId: orgId, meta: { status: sub.status, plan, seats: sub.seats } });
    // What the server would have sold, checked again here and not only at checkout (review S5): the browser's Paddle.js
    // can still change an open checkout's items. A plan too small for the company's full seats is flagged (seatGuard
    // then refuses every new full seat) and told to the owner; too few seats are brought back to the company's billed
    // seats at once, after the commit, as the hourly sync would.
    if (LIVE.includes(sub.status)) {
      const [o] = await q.query<{ n: number; country: string | null }>(`select ${SEATS_SQL} as n, o.billing_country as country from orgs o where o.id = $1`, [orgId]);
      const n = Number(o?.n ?? 0);
      const cap = planOf(plan)?.caps.seatsMax ?? null;
      if (cap != null && n > cap) {
        await audit(q, { orgId, actorId: null, action: 'billing.over_plan', entity: 'org', entityId: orgId, meta: { plan, seats: n, cap, event: event.id } });
        found.push({ orgId, why: 'over_plan', seats: n, cap });
      }
      const interval = sub.interval ?? cur?.billing_interval ?? null;
      const want = interval ? billedSeats(deps, plan as PlanKey, interval, billingRegionKey(o?.country, sub.currency), n) : null;
      if (want != null && sub.seats != null && sub.seats < want) found.push({ orgId, why: 'too_few_seats', seats: sub.seats, want });
    }
    await projectBillingQ(q, orgId);
    return orgId;
  });
  for (const m of found) await actOnMismatch(deps, sub, m, event.id);
  return orgId;
}

/**
 * After the commit: what the server does about a subscription it did not offer. Too few seats → the subscription is
 * changed back to the company's billed seats now. Every kind → an alert in the console and a push to the owner's phones
 * (owner outbox, once per subscription and kind), because each needs a person: a refund, a plan the company outgrew.
 */
async function actOnMismatch(deps: Deps, sub: ProviderSubscription, m: Mismatch, eventId: string): Promise<void> {
  let fixed = false;
  if (m.why === 'too_few_seats' && sub.plan && sub.interval && m.want) {
    const provider = providerFor(deps);
    try {
      if (provider) {
        const next = await provider.changeItems(sub.providerSubscriptionId, sub.plan, sub.interval, m.want, CATALOGUE.proration.seatsUp);
        await deps.db.system(async (q) => {
          await q.query(`update subscriptions set seats = $2, updated_at = now() where org_id = $1`, [m.orgId, next.seats ?? m.want]);
          await projectBillingQ(q, m.orgId);
        });
        fixed = true;
      }
    } catch (e) {
      // The hourly seat sync tries again; the owner is told either way.
      console.error('[curahold] could not bring a subscription back to its seats', m.orgId, e);
    }
  }
  const ref = `billing:${m.why}:${sub.providerSubscriptionId}`.slice(0, 200);
  const [org] = await deps.db.system(async (q) => {
    const rows = await q.query<{ name: string; slug: string }>(`select name, slug from orgs where id = $1`, [m.orgId]);
    await q.query(
      `insert into company_log (seat, kind, body, ref, meta) select 'system', 'alert', $1, $2, $3 where not exists (select 1 from company_log where ref = $2)`,
      [`Billing: ${m.why.replace(/_/g, ' ')} on ${rows[0]?.slug ?? m.orgId}${fixed ? ' (seats brought back)' : ''}`, ref, JSON.stringify({ org_id: m.orgId, subscription: sub.providerSubscriptionId, event: eventId, ...m, fixed })],
    );
    return rows;
  });
  await pushToOwner(deps, `push:${ref}`, (l) => ({
    title: ownerWord(l, 'billing.push.mismatch.title'),
    body: ownerWord(l, `billing.push.mismatch.${m.why}` as OwnerKey, { company: (org?.name ?? '').slice(0, 80) }),
    url: '/system',
    urgency: 'high',
  }));
}

async function applyInvoice(deps: Deps, provider: string, event: WebhookEvent, invoice: ProviderInvoice): Promise<string | null> {
  return deps.db.system(async (q) => {
    let orgId: string | null = null;
    if (invoice.providerSubscriptionId) {
      const [h] = await q.query<{ org_id: string }>(`select org_id from subscriptions where provider_subscription_id = $1 limit 1`, [invoice.providerSubscriptionId]);
      orgId = h?.org_id ?? null;
    }
    orgId = orgId ?? invoice.signedOrgId;
    if (!orgId) return null;
    if (!(await firstTime(q, provider, event, orgId))) return orgId;
    // An invoice id already held by another company is never touched (the where clause).
    await q.query(
      `insert into invoices (org_id, provider_invoice_id, amount_cents, currency, status, issued_at)
         values ($1, $2, $3, $4, $5, $6)
       on conflict (provider_invoice_id) do update set
         status = excluded.status, amount_cents = excluded.amount_cents, issued_at = excluded.issued_at
       where invoices.org_id = $1`,
      [orgId, invoice.providerInvoiceId, invoice.amountCents, invoice.currency, invoice.status, invoice.issuedAt],
    );
    return orgId;
  });
}

/** A plan's monthly-equivalent price, to tell an upgrade from a downgrade. */
const worth = (plan: PlanKey, interval: Interval) => PLANS[plan]?.price[interval] ?? 0;

/**
 * Another plan or interval for a running subscription. An upgrade is billed now
 * for the rest of the period; a downgrade is credited at the next bill (the
 * catalogue's proration settings). Shown at once; Paddle's webhook confirms it.
 */
export async function changePlan(deps: Deps, provider: PaymentProvider, orgId: string, sub: Subscription, plan: PlanKey, interval: Interval, fullSeats: number, region: string | null): Promise<void> {
  const up = worth(plan, interval) >= worth(sub.plan, sub.interval ?? interval);
  // From the seats in use, not the old quantity: the old quantity may hold the previous interval's minimum
  // (India yearly 6 → monthly must become 5, not stay 6 until the next hourly sync). `region` is billingRegionOf's.
  const seats = billedSeats(deps, plan, interval, region, fullSeats);
  const next = await provider.changeItems(sub.providerSubscriptionId!, plan, interval, seats, up ? CATALOGUE.proration.upgrade : CATALOGUE.proration.downgrade);
  await deps.db.system(async (q) => {
    await q.query(`update subscriptions set plan = $2, billing_interval = $3, seats = coalesce($4, seats), updated_at = now() where org_id = $1`, [
      orgId,
      next.plan ?? plan,
      next.interval ?? interval,
      next.seats,
    ]);
    await projectBillingQ(q, orgId);
  });
}

/**
 * Keeps each subscription's quantity at the company's full seats (run hourly by
 * the scheduler). More seats are billed now for the rest of the period; fewer
 * are credited at the next bill (catalogue proration.seatsUp / seatsDown).
 * Returns how many subscriptions changed.
 */
export async function syncSeats(deps: Deps): Promise<number> {
  const provider = providerFor(deps);
  if (!provider) return 0;
  const rows = await deps.db.system((q) =>
    q.query<{ org_id: string; plan: string; billing_interval: Interval | null; seats: number | null; provider_subscription_id: string; want: number; billing_country: string | null; billing_region: string | null; currency: string | null }>(
      `select s.org_id, s.plan, s.billing_interval, s.seats, s.provider_subscription_id, ${SEATS_SQL} as want, o.billing_country, o.settings->>'billingRegion' as billing_region, s.currency
         from subscriptions s join orgs o on o.id = s.org_id
        where s.provider_subscription_id is not null and s.status in ('active', 'trialing', 'past_due')`,
    ),
  );
  let changed = 0;
  for (const r of rows) {
    if (!r.billing_interval || !planOf(r.plan)) continue;
    const want = billedSeats(deps, r.plan, r.billing_interval, billingRegionOf({ stored: r.billing_region, country: r.billing_country, currency: r.currency }), Number(r.want));
    if (r.seats === want) continue;
    try {
      const next = await provider.changeItems(r.provider_subscription_id, r.plan, r.billing_interval, want, want > (r.seats ?? 0) ? CATALOGUE.proration.seatsUp : CATALOGUE.proration.seatsDown);
      await deps.db.system(async (q) => {
        await q.query(`update subscriptions set seats = $2, updated_at = now() where org_id = $1`, [r.org_id, next.seats ?? want]);
        await projectBillingQ(q, r.org_id);
      });
      changed++;
    } catch (e) {
      // One company's problem never stops the others; the next hour tries again.
      console.error('[curahold] seat sync failed', r.org_id, e);
    }
  }
  return changed;
}

/** This company's subscription (read inside a tenant transaction; RLS scopes it), or null. */
export async function readSubscription(q: Q, now: Date): Promise<Subscription | null> {
  const [r] = await q.query<SubscriptionsRow>(`select * from subscriptions limit 1`);
  if (!r) return null;
  const until = r.cancel_at_period_end ? r.current_period_end : r.status === 'trialing' ? r.trial_ends_at : null;
  const daysLeft = until ? Math.max(0, Math.ceil((Date.parse(iso(until)!) - now.getTime()) / DAY)) : null;
  return {
    plan: r.plan as PlanKey,
    status: r.status as SubscriptionStatus,
    trialEndsAt: iso(r.trial_ends_at),
    currentPeriodEnd: iso(r.current_period_end),
    cancelAtPeriodEnd: !!r.cancel_at_period_end,
    providerCustomerId: r.provider_customer_id ?? null,
    providerSubscriptionId: r.provider_subscription_id ?? null,
    interval: (r.billing_interval as Interval | null) ?? null,
    seats: r.seats == null ? null : Number(r.seats),
    currency: r.currency ?? null,
    pastDueSince: iso(r.past_due_since),
    daysLeft,
  };
}

const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
