// The platform owner's super-admin console — the business operator's view ACROSS
// every customer company. These types are shared by the server route
// (api/src/routes/admin-platform.ts) and the web pages (PlatformConsole,
// FounderPages). Everything here is seen only by the platform owner/staff; no
// tenant customer is ever handed this shape. See api/src/lib/platform.ts for the
// gate and shared/src/billing.ts for the plan prices MRR is worked out from.
import type { MetricPoint } from './metrics';

/**
 * A subscription's lifecycle. The first five match the billing schema's
 * subscriptions.status (migration 0037); 'none' is our own label for a company
 * that has never subscribed (and whose trial, if any, is over).
 */
export type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused' | 'none';

export const SUB_STATUSES: SubStatus[] = ['trialing', 'active', 'past_due', 'canceled', 'paused', 'none'];

/** One row of the customers table: a single company with its billing standing. */
export interface PlatformCustomer {
  orgId: string;
  name: string;
  slug: string;
  createdAt: string;
  /** Active people in the company (full seats + viewers). */
  users: number;
  /** Active people on a full (writing) seat — what a subscription is billed on. */
  seats: number;
  plan: string | null;
  status: SubStatus;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  /** From the billing schema (0037); null while that schema is not present. */
  taxNumber: string | null;
  billingEmail: string | null;
  /** The most recent invoice/payment, when the billing schema is present. */
  latestInvoiceStatus: string | null;
  latestInvoiceAt: string | null;
}

export interface PlatformInvoice {
  providerInvoiceId: string | null;
  amountCents: number;
  currency: string;
  status: string;
  issuedAt: string | null;
}

/** Full detail for one customer company. */
export interface PlatformCustomerDetail {
  customer: PlatformCustomer;
  settings: {
    locale: string;
    timezone: string;
    currency: string;
    template: string;
    domains: string[];
  };
  counts: { boards: number; accounts: number; tasks: number; records: number; members: number };
  subscription: {
    provider: string | null;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    plan: string | null;
    status: SubStatus;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  invoices: PlatformInvoice[];
}

/** Platform-wide totals for the overview tiles. */
export interface PlatformOverview {
  /**
   * Whether the normalized billing schema (0037: subscriptions, invoices,
   * orgs.tax_number…) is present. When false the numbers come from the legacy
   * orgs.billing snapshot and the billing-schema-only fields read null.
   */
  billingSchema: boolean;
  totals: {
    customers: number;
    active: number;
    trialing: number;
    pastDue: number;
    canceled: number;
    paused: number;
  };
  /** Approximate monthly recurring revenue, in whole `currency` units (sum of active plan prices × full seats). */
  mrr: number;
  /** Annual run rate (mrr × 12). */
  arr: number;
  currency: string;
  /** New companies per month, coarse buckets, last 12 months (the signups trend). */
  signups: MetricPoint[];
}

/** What GET /api/platform/access tells the browser about the signed-in person. */
export interface PlatformAccess {
  /** The single configured platform owner (PLATFORM_OWNER). */
  owner: boolean;
  /** owner, or a listed staff identifier (STAFF_KEYS / SUPPORT_STAFF). */
  staff: boolean;
  /** owner || staff — whether the console is theirs to open at all. */
  platform: boolean;
}
