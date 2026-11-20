// Plans, prices and what a company may do — shared by the server (which
// enforces it) and the web app (which shows it). Billing is optional: a
// self-hosted install, the demo and development run with it off, and then
// everything is open ("free").
//
// The price list itself is data: shared/src/plans.json (plans, prices, caps,
// trial, dunning, proration, regions and their tax). To change a price, change
// that file and the matching price in Paddle (the price ids live in the server's
// PADDLE_PRICES setting). See docs/ADR/0019 and docs/site/en/billing.md.

import catalogueJson from './plans.json';

export const INTERVALS = ['month', 'year'] as const;
export type Interval = (typeof INTERVALS)[number];

/** What only some plans include. Everything else is in every plan. A gate in code, so the list itself lives here. */
export const FEATURES = ['crm_sync', 'portal', 'playbooks'] as const;
export type Feature = (typeof FEATURES)[number];

/** A plan's key, as the catalogue names it ("team", "business", or whatever the owner's final list says). */
export type PlanKey = string;

/**
 * The limits on what costs us money, per plan (null: no limit). Every one is
 * enforced on the server; they are the reason a customer can never cost more
 * than they pay (the owner's rule: cheapest possible, never loss-making).
 */
export interface Caps {
  /** Assistant questions answered by the model per month, pooled across the company: this × full seats. */
  aiQuestionsPerSeat: number | null;
  /** Files kept (attachments), pooled: this × full seats, in GB. */
  storageGbPerSeat: number | null;
  /** How often a connected tool syncs on its own, in minutes (the scheduler runs hourly, so below 60 means hourly). */
  syncEveryMinutes: number | null;
  /** Connected tools (CRM, spreadsheet, support, accounting sources); the demo source is never counted. */
  connectors: number | null;
  /** Full seats on the plan; viewers are free and never counted. */
  seatsMax: number | null;
}
export const CAP_KEYS = ['aiQuestionsPerSeat', 'storageGbPerSeat', 'syncEveryMinutes', 'connectors', 'seatsMax'] as const satisfies readonly (keyof Caps)[];

export interface PlanDef {
  key: PlanKey;
  /** The plan's name where a dictionary has none (billing.plan.<key> wins when it exists). */
  name: string;
  /** Per full seat per month in the list currency, by how often it is paid. */
  price: Record<Interval, number>;
  features: Feature[];
  caps: Caps;
}

/** How Paddle prorates a change (its proration_billing_mode values). */
export type Proration = 'prorated_immediately' | 'prorated_next_billing_period' | 'full_immediately' | 'full_next_billing_period' | 'do_not_bill';

/** Prices and tax for buyers in some countries. Paddle, as merchant of record, adds and files the tax. */
export interface Region {
  key: string;
  /** ISO country codes; the region with none is the fallback for every other country. */
  countries: string[];
  /** The currency prices are shown in. */
  currency: string;
  /** The currency Paddle actually charges (USD where it cannot collect the local one, e.g. AED). */
  collect: string;
  /** Prices in `collect`, by plan and interval; null: Paddle converts the list price itself. */
  prices: Record<PlanKey, Record<Interval, number>> | null;
  /** Prices shown in `currency` when it differs from `collect` (a guide only). */
  displayPrices?: Record<PlanKey, Record<Interval, number>>;
  /** Fixed rate list currency → `currency` for a guide price, when there is no list (e.g. the AED peg). */
  displayRate?: number;
  /** The tax Paddle adds on top: a pass-through, never our revenue or cost. */
  tax: { name: string; rate: number | null; b2b: boolean };
}

export interface Catalogue {
  version: string;
  /** "draft" until the owner's final pricing is dropped in, then "final". */
  status: 'draft' | 'final';
  currency: string;
  trial: { months: number; approval: boolean; plan: PlanKey; autoApproveSeats: number; caps: Partial<Caps> };
  dunning: { graceDays: number };
  proration: { upgrade: Proration; downgrade: Proration; seatsUp: Proration; seatsDown: Proration };
  plans: PlanDef[];
  regions: Region[];
}

const PRORATIONS: Proration[] = ['prorated_immediately', 'prorated_next_billing_period', 'full_immediately', 'full_next_billing_period', 'do_not_bill'];

/**
 * Checks a price list (shared/src/plans.json, or the owner's replacement) and
 * returns it typed. Throws with the first problem in words, so a wrong file
 * stops the build and the tests instead of reaching a customer's bill.
 */
export function parseCatalogue(raw: unknown): Catalogue {
  const bad = (why: string): never => {
    throw new Error(`plans.json: ${why}`);
  };
  const c = (raw ?? {}) as Record<string, any>;
  const num = (v: unknown, what: string, min = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= min ? v : bad(`${what} must be a number ≥ ${min}`));
  const cap = (v: unknown, what: string) => (v === null ? null : num(v, what));
  if (typeof c.version !== 'string' || !c.version) bad('version is missing');
  if (c.status !== 'draft' && c.status !== 'final') bad('status must be "draft" or "final"');
  if (typeof c.currency !== 'string' || !/^[A-Z]{3}$/.test(c.currency)) bad('currency must be a three-letter code');
  if (!Array.isArray(c.plans) || !c.plans.length) bad('plans must list at least one plan');
  const keys = new Set<string>();
  const plans: PlanDef[] = c.plans.map((p: any, i: number) => {
    const where = `plans[${i}]`;
    if (typeof p?.key !== 'string' || !/^[a-z][a-z0-9_]{0,30}$/.test(p.key)) bad(`${where}.key must be lower-case letters, digits or _`);
    if (keys.has(p.key)) bad(`${where}.key "${p.key}" appears twice`);
    keys.add(p.key);
    const features = Array.isArray(p.features) ? p.features : bad(`${where}.features must be a list`);
    for (const f of features) if (!(FEATURES as readonly string[]).includes(f)) bad(`${where}.features: unknown feature "${f}" (known: ${FEATURES.join(', ')})`);
    const caps = {} as Caps;
    for (const k of CAP_KEYS) caps[k] = k in (p.caps ?? {}) ? cap(p.caps[k], `${where}.caps.${k}`) : bad(`${where}.caps.${k} is missing (null means no limit)`);
    return { key: p.key, name: typeof p.name === 'string' && p.name ? p.name : p.key, price: { month: num(p.price?.month, `${where}.price.month`), year: num(p.price?.year, `${where}.price.year`) }, features, caps };
  });
  const t = c.trial ?? {};
  if (!keys.has(t.plan)) bad('trial.plan must be one of the plans');
  const trialCaps: Partial<Caps> = {};
  for (const [k, v] of Object.entries(t.caps ?? {})) {
    if (!(CAP_KEYS as readonly string[]).includes(k)) bad(`trial.caps: unknown cap "${k}"`);
    trialCaps[k as keyof Caps] = cap(v, `trial.caps.${k}`);
  }
  const pr = c.proration ?? {};
  for (const k of ['upgrade', 'downgrade', 'seatsUp', 'seatsDown']) if (!PRORATIONS.includes(pr[k])) bad(`proration.${k} must be one of ${PRORATIONS.join(', ')}`);
  const regions: Region[] = (Array.isArray(c.regions) ? c.regions : []).map((r: any, i: number) => {
    const where = `regions[${i}]`;
    for (const f of ['currency', 'collect']) if (typeof r?.[f] !== 'string' || !/^[A-Z]{3}$/.test(r[f])) bad(`${where}.${f} must be a three-letter code`);
    const table = (v: unknown, what: string) => {
      if (v == null) return null;
      const out: Record<PlanKey, Record<Interval, number>> = {};
      for (const k of keys) out[k] = { month: num((v as any)[k]?.month, `${what}.${k}.month`), year: num((v as any)[k]?.year, `${what}.${k}.year`) };
      return out;
    };
    return {
      key: String(r.key),
      countries: Array.isArray(r.countries) ? r.countries.map((x: unknown) => String(x).toUpperCase()) : bad(`${where}.countries must be a list`),
      currency: r.currency,
      collect: r.collect,
      prices: table(r.prices, `${where}.prices`),
      ...(r.displayPrices ? { displayPrices: table(r.displayPrices, `${where}.displayPrices`)! } : {}),
      ...(r.displayRate != null ? { displayRate: num(r.displayRate, `${where}.displayRate`) } : {}),
      tax: { name: String(r.tax?.name ?? ''), rate: r.tax?.rate == null ? null : num(r.tax.rate, `${where}.tax.rate`), b2b: !!r.tax?.b2b },
    };
  });
  if (regions.length && regions.filter((r) => !r.countries.length).length !== 1) bad('regions need exactly one fallback region (no countries)');
  return {
    version: c.version,
    status: c.status,
    currency: c.currency,
    trial: { months: num(t.months, 'trial.months', 1), approval: t.approval !== false, plan: t.plan, autoApproveSeats: num(t.autoApproveSeats, 'trial.autoApproveSeats'), caps: trialCaps },
    dunning: { graceDays: num(c.dunning?.graceDays, 'dunning.graceDays') },
    proration: { upgrade: pr.upgrade, downgrade: pr.downgrade, seatsUp: pr.seatsUp, seatsDown: pr.seatsDown },
    plans,
    regions,
  };
}

/** The price list in force (shared/src/plans.json). */
export const CATALOGUE: Catalogue = parseCatalogue(catalogueJson);

export const PLAN_LIST: readonly PlanDef[] = CATALOGUE.plans;
export const PLAN_KEYS = CATALOGUE.plans.map((p) => p.key) as [PlanKey, ...PlanKey[]];
/** The plans by key, from the price catalogue (one source for app, site and Paddle; ADR 0019). */
export const PLANS: Record<PlanKey, PlanDef> = Object.fromEntries(CATALOGUE.plans.map((p) => [p.key, p]));
export const PRICE_CURRENCY = CATALOGUE.currency;
/** The plan a trial (and a company whose plan is unknown) gets. */
export const DEFAULT_PLAN: PlanKey = CATALOGUE.trial.plan;

/** Whether a value names a plan in the catalogue. */
export const isPlanKey = (v: unknown): v is PlanKey => typeof v === 'string' && Object.hasOwn(PLANS, v);
/** A plan by key, or null for a key the catalogue does not (or no longer) have. */
export const planOf = (key: unknown): PlanDef | null => (isPlanKey(key) ? PLANS[key] : null);

/** The plan that includes a feature (the cheapest one). */
export const planFor = (f: Feature): PlanKey =>
  [...PLAN_LIST].sort((a, b) => a.price.month - b.price.month).find((p) => p.features.includes(f))?.key ?? DEFAULT_PLAN;

/** The region a billing country belongs to (the fallback region for any other country). */
export function regionFor(country: string | null | undefined): Region | null {
  const cc = (country ?? '').toUpperCase();
  return CATALOGUE.regions.find((r) => r.countries.includes(cc)) ?? CATALOGUE.regions.find((r) => !r.countries.length) ?? null;
}

/**
 * What a seat costs in a region: the amount charged (in `collect`) and the one
 * shown (in `currency`, a guide when they differ). Tax is added by Paddle on top.
 */
export function regionalPrice(region: Region | null, plan: PlanKey, interval: Interval): { collect: string; amount: number; currency: string; shown: number | null } {
  const list = PLANS[plan]?.price[interval] ?? 0;
  if (!region) return { collect: PRICE_CURRENCY, amount: list, currency: PRICE_CURRENCY, shown: list };
  const amount = region.prices?.[plan]?.[interval] ?? list;
  const shown = region.currency === region.collect ? amount : (region.displayPrices?.[plan]?.[interval] ?? (region.displayRate ? Math.round(amount * region.displayRate) : null));
  return { collect: region.collect, amount, currency: region.currency, shown };
}

/** How long a new company may use everything before a plan is paid for. */
export const TRIAL_MONTHS = CATALOGUE.trial.months;

/**
 * The limits a company works within right now: its plan's caps (the trial's
 * own lower ones while in the trial), with the pooled ones multiplied out for
 * its full seats. Billing off (self-hosted, demo): no limits at all.
 */
export function capsOf(a: Pick<Access, 'state' | 'plan'>, fullSeats: number): Caps & { aiQuestionsPerMonth: number | null; storageBytes: number | null } {
  const none: Caps = { aiQuestionsPerSeat: null, storageGbPerSeat: null, syncEveryMinutes: null, connectors: null, seatsMax: null };
  const base = a.state === 'free' ? none : { ...(planOf(a.plan) ?? PLANS[DEFAULT_PLAN]).caps, ...(a.state === 'trial' ? CATALOGUE.trial.caps : {}) };
  const seats = Math.max(1, Math.floor(fullSeats) || 0);
  return {
    ...base,
    aiQuestionsPerMonth: base.aiQuestionsPerSeat == null ? null : Math.round(base.aiQuestionsPerSeat * seats),
    storageBytes: base.storageGbPerSeat == null ? null : Math.round(base.storageGbPerSeat * seats * 1024 ** 3),
  };
}

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
  /** When a renewal payment first failed (dunning); cleared once a payment goes through. */
  pastDueSince?: string | null;
}

/**
 * Where a company stands:
 * - free: billing is off (self-hosted, demo) — everything open;
 * - trial: a new company within its trial — everything open;
 * - active: paying (its plan decides the features);
 * - past_due: a payment failed; still open while Paddle retries, for at most
 *   CATALOGUE.dunning.graceDays (then locked like a plan that ended);
 * - ending: cancelled, open until the period paid for ends;
 * - locked: no plan — everything can be read and exported, nothing changed.
 */
export type AccessState = 'free' | 'trial' | 'active' | 'past_due' | 'ending' | 'locked';

export interface Access {
  state: AccessState;
  plan: PlanKey;
  readOnly: boolean;
  trialEndsAt: string | null;
  /** Days left of the trial, of a cancelled period, or of the grace after a failed payment. */
  daysLeft: number | null;
  periodEnd: string | null;
  interval: Interval | null;
  seats: number | null;
}

const DAY = 86_400_000;

/**
 * Where a company stands with billing: free (billing off), trial, active, past due or locked, with days left.
 * Pure, so the app, the site and tests agree. A locked company is read-only, never deleted (ADR 0017, 0019).
 */
export function accessOf(enabled: boolean, billing: OrgBilling | null | undefined, trialEndsAt: string | null | undefined, now: Date): Access {
  const b = billing ?? {};
  const base = { trialEndsAt: trialEndsAt ?? null, periodEnd: b.periodEnd ?? null, interval: b.interval ?? null, seats: b.seats ?? null };
  const left = (until: string | null | undefined) => (until ? Math.max(0, Math.ceil((Date.parse(until) - now.getTime()) / DAY)) : null);
  if (!enabled) return { ...base, state: 'free', plan: DEFAULT_PLAN, readOnly: false, daysLeft: null };
  const plan = b.plan ?? DEFAULT_PLAN;
  const periodOpen = !!b.periodEnd && Date.parse(b.periodEnd) > now.getTime();
  switch (b.status) {
    case 'active':
    case 'trialing':
      return b.cancelAtPeriodEnd ? { ...base, state: 'ending', plan, readOnly: false, daysLeft: left(b.periodEnd) } : { ...base, state: 'active', plan, readOnly: false, daysLeft: null };
    case 'past_due': {
      // Dunning: Paddle retries the card and e-mails the buyer; we stay open meanwhile, but not for ever.
      if (!b.pastDueSince) return { ...base, state: 'past_due', plan, readOnly: false, daysLeft: null };
      const graceEnd = new Date(Date.parse(b.pastDueSince) + CATALOGUE.dunning.graceDays * DAY).toISOString();
      return Date.parse(graceEnd) > now.getTime() ? { ...base, state: 'past_due', plan, readOnly: false, daysLeft: left(graceEnd) } : { ...base, state: 'locked', plan, readOnly: true, daysLeft: 0 };
    }
    case 'paused':
    case 'canceled':
      return periodOpen ? { ...base, state: 'ending', plan, readOnly: false, daysLeft: left(b.periodEnd) } : { ...base, state: 'locked', plan, readOnly: true, daysLeft: 0 };
  }
  // Never subscribed: the trial, then read-only until a plan is chosen.
  if (trialEndsAt && Date.parse(trialEndsAt) > now.getTime()) return { ...base, state: 'trial', plan: DEFAULT_PLAN, readOnly: false, daysLeft: left(trialEndsAt) };
  return { ...base, state: 'locked', plan: DEFAULT_PLAN, readOnly: true, daysLeft: 0 };
}

/** Whether the company's plan includes a feature (always, while billing is off or in the trial). */
export const allows = (a: Access, f: Feature) => a.state === 'free' || a.state === 'trial' || (planOf(a.plan) ?? PLANS[DEFAULT_PLAN]).features.includes(f);

// ---------------------------------------------------------------------------
// Canonical subscription records (db/migrations/0037_billing.sql).
//
// The types above describe the orgs.billing snapshot every request reads to gate
// writes; the ones below describe the subscriptions / invoices tables that are
// the only system of record (docs/ADR/0019): the snapshot is re-derived from them
// after every change (api/src/billing/project.ts). Both draw plans and prices
// from the catalogue above.
// ---------------------------------------------------------------------------

/** A plan definition (key, per-seat price by interval, features, caps). */
export type Plan = PlanDef;

/** The states a subscription can be in — the CHECK on subscriptions.status. */
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused';

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
  interval: Interval | null;
  /** Full seats on the subscription (what Paddle bills). */
  seats: number | null;
  currency: string | null;
  pastDueSince: string | null;
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
