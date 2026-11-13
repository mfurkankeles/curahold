// Plans, prices and what a company may do — shared by the server (which
// enforces it) and the web app (which shows it). Billing is optional: a
// self-hosted install, the demo and development run with it off, and then
// everything is open ("free").
//
// To change a price, change it here and in Paddle (the price ids live in the
// server's PADDLE_PRICES setting). Prices are per full seat, per month; the
// yearly price is what a month costs when paid for a year.

export const PLAN_KEYS = ['team', 'business'] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const INTERVALS = ['month', 'year'] as const;
export type Interval = (typeof INTERVALS)[number];

/** What only some plans include. Everything else is in every plan. */
export const FEATURES = ['crm_sync', 'portal', 'playbooks'] as const;
export type Feature = (typeof FEATURES)[number];

export interface PlanDef {
  key: PlanKey;
  /** US dollars per full seat per month, by how often it is paid. */
  price: Record<Interval, number>;
  features: Feature[];
}

export const PLANS: Record<PlanKey, PlanDef> = {
  team: { key: 'team', price: { month: 19, year: 15 }, features: [] },
  business: { key: 'business', price: { month: 35, year: 29 }, features: ['crm_sync', 'portal', 'playbooks'] },
};

export const PRICE_CURRENCY = 'USD';

/** The plan that includes a feature (the cheapest one). */
export const planFor = (f: Feature): PlanKey => PLAN_KEYS.find((k) => PLANS[k].features.includes(f)) ?? 'business';

/** What the billing provider last told us about the company's subscription (orgs.billing). */
export interface OrgBilling {
  provider?: 'paddle';
  status?: 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled';
  plan?: PlanKey;
  interval?: Interval;
  /** Full seats on the subscription. */
  seats?: number;
  /** When the period paid for ends (the next bill, or the end of a cancelled one). */
  periodEnd?: string | null;
  /** Cancelled, but still running until periodEnd. */
  cancelAtPeriodEnd?: boolean;
  customerId?: string;
  subscriptionId?: string;
  /** When the provider's event that set this happened (older events are ignored). */
  eventAt?: string;
}

/**
 * Where a company stands:
 * - free: billing is off (self-hosted, demo) — everything open;
 * - trial: a new company within its trial — everything open;
 * - active: paying (its plan decides the features);
 * - past_due: a payment failed; still open while the provider retries;
 * - ending: cancelled, open until the period paid for ends;
 * - locked: no plan — everything can be read and exported, nothing changed.
 */
export type AccessState = 'free' | 'trial' | 'active' | 'past_due' | 'ending' | 'locked';

export interface Access {
  state: AccessState;
  plan: PlanKey;
  readOnly: boolean;
  trialEndsAt: string | null;
  /** Days left of the trial, or of a cancelled period. */
  daysLeft: number | null;
  periodEnd: string | null;
  interval: Interval | null;
  seats: number | null;
}

const DAY = 86_400_000;

export function accessOf(enabled: boolean, billing: OrgBilling | null | undefined, trialEndsAt: string | null | undefined, now: Date): Access {
  const b = billing ?? {};
  const base = { trialEndsAt: trialEndsAt ?? null, periodEnd: b.periodEnd ?? null, interval: b.interval ?? null, seats: b.seats ?? null };
  const left = (until: string | null | undefined) => (until ? Math.max(0, Math.ceil((Date.parse(until) - now.getTime()) / DAY)) : null);
  if (!enabled) return { ...base, state: 'free', plan: 'business', readOnly: false, daysLeft: null };
  const plan = b.plan ?? 'business';
  const periodOpen = !!b.periodEnd && Date.parse(b.periodEnd) > now.getTime();
  switch (b.status) {
    case 'active':
    case 'trialing':
      return b.cancelAtPeriodEnd ? { ...base, state: 'ending', plan, readOnly: false, daysLeft: left(b.periodEnd) } : { ...base, state: 'active', plan, readOnly: false, daysLeft: null };
    case 'past_due':
      return { ...base, state: 'past_due', plan, readOnly: false, daysLeft: null };
    case 'paused':
    case 'canceled':
      return periodOpen ? { ...base, state: 'ending', plan, readOnly: false, daysLeft: left(b.periodEnd) } : { ...base, state: 'locked', plan, readOnly: true, daysLeft: 0 };
  }
  // Never subscribed: the trial, then read-only until a plan is chosen.
  if (trialEndsAt && Date.parse(trialEndsAt) > now.getTime()) return { ...base, state: 'trial', plan: 'business', readOnly: false, daysLeft: left(trialEndsAt) };
  return { ...base, state: 'locked', plan: 'business', readOnly: true, daysLeft: 0 };
}

/** Whether the company's plan includes a feature (always, while billing is off or in the trial). */
export const allows = (a: Access, f: Feature) => a.state === 'free' || a.state === 'trial' || PLANS[a.plan].features.includes(f);

// ---------------------------------------------------------------------------
// Canonical subscription records (db/migrations/0037_billing.sql).
//
// The types above describe the orgs.billing snapshot every request reads to gate
// writes; the ones below describe the subscriptions / invoices tables that are
// the system of record for provisioning, the billing routes and reporting. Both
// draw their plans and prices from PLANS above — one source of truth.
// ---------------------------------------------------------------------------

/** A plan definition (key, per-seat price by interval, the features it unlocks). */
export type Plan = PlanDef;

/**
 * Every plan and its price. The amounts in PLANS are placeholders the owner sets
 * for real before launch.
 * TODO(pricing): confirm the per-seat prices in PLANS and mirror them in Paddle
 * (the live price ids are configured in the server's PADDLE_PRICES setting).
 */
export const PLAN_LIST: readonly PlanDef[] = PLAN_KEYS.map((k) => PLANS[k]);

/** The states a subscription can be in — the CHECK on subscriptions.status. */
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused';

/** How long a new company may use everything before a plan is paid for. */
export const TRIAL_MONTHS = 3;

/**
 * The monthly exit right: a company may leave at the end of any paid period.
 * Leaving sets cancel_at_period_end, and everything stays usable until
 * current_period_end — it is never cut off mid-period.
 */
export const MONTHLY_EXIT = true as const;

/** When a trial started now would end (TRIAL_MONTHS from `start`). */
export function trialEndsAt(start: Date): Date {
  const end = new Date(start);
  end.setMonth(end.getMonth() + TRIAL_MONTHS);
  return end;
}

/** A company's subscription as the API returns it (a row of the subscriptions table). */
export interface Subscription {
  plan: PlanKey;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  /** Whole days left of the trial, or of a period a cancelled plan still runs. */
  daysLeft: number | null;
}

/** An invoice the provider raised (a row of the invoices table). */
export interface Invoice {
  id: string;
  providerInvoiceId: string | null;
  amountCents: number;
  currency: string;
  status: string;
  issuedAt: string | null;
}
