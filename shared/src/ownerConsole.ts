// The owner console (desk.<domain>): what each owner-only section is sent.
// Worked out on the server across every company from the billing provider's
// records (as the product keeps them) and the product's own tables. The owner
// sees companies, billing, usage counts and metadata; a customer's own records
// only through time-boxed, view-only support access that is logged in that
// customer's own activity log.
import type { ConsoleToday } from './console';
import type { ChecklistEntry } from './checklist';
import type { MetricPoint } from './metrics';

export const PLAN_METRICS = ['site_visitors', 'trial_requests', 'trials_approved', 'activations', 'paying_customers', 'seats', 'mrr', 'arr', 'invoices', 'churned'] as const;
export type PlanMetric = (typeof PLAN_METRICS)[number];

export type Pace = 'on-track' | 'close' | 'behind' | 'no-target';

export interface PlanRow {
  metric: PlanMetric;
  target: number | null;
  /** null: not measured yet (e.g. the site's own analytics is not connected). */
  actual: number | null;
  /** Where the month should be by now, pro-rated by days gone. */
  expected: number | null;
  pace: Pace;
}

export interface PlanTask {
  id: string;
  title: string;
  dueOn: string;
  doneAt: string | null;
  source: 'owner' | 'plan' | 'agent';
}

export interface OwnerPlan {
  period: string;
  /** Share of the month gone, 0–1. */
  elapsed: number;
  rows: PlanRow[];
  /** Targets for the next months too, for editing: metric → period → target. */
  targets: Record<string, Record<string, number>>;
  tasks: { today: PlanTask[]; week: PlanTask[]; month: PlanTask[]; overdue: PlanTask[] };
}

export interface OwnerOverview {
  today: ConsoleToday;
  invoices: { paid30: number; paidAmount30: number; failed30: number; upcoming30: number; currency: string };
  states: { paying: number; trial: number; free: number; requested: number; churned: number };
  growth: { signups30: number; activations30: number; signups: MetricPoint[] };
  requests: { open: number; new: number };
  errors: { server24h: number; browser24h: number; syncFailed24h: number; connectionsInError: number };
  site: { connected: boolean; visitors30: number | null; requests30: number; conversion: number | null; variants: { variant: string; visitors: number; requests: number }[] };
  /** The plan's month at a glance. */
  strip: { onTrack: number; close: number; behind: number; rows: PlanRow[] };
  usage: { tokens: number; budget: number; costUsd: number; pausedAll: boolean };
  approvalsPending: number;
  checklist: { done: number; total: number; next: string | null };
  /** The same figures one period earlier (30 days before the last 30; the 24 hours before the last 24), for each tile's change. */
  prev: { paid30: number; signups30: number; requests30: number; server24h: number; syncFailed24h: number };
}

export interface OwnerInvoice {
  orgId: string;
  company: string;
  amountCents: number;
  currency: string;
  status: string;
  issuedAt: string | null;
}
export interface OwnerRevenue {
  currency: string;
  mrr: number;
  arr: number;
  trend: MetricPoint[];
  totals: { paid: number; failed: number; other: number; paidAmount: number };
  invoices: OwnerInvoice[];
  upcoming: { orgId: string; company: string; at: string; status: string }[];
}

export interface OwnerTrial {
  orgId: string;
  company: string;
  slug: string;
  state: 'trial' | 'free' | 'expired';
  endsAt: string | null;
  daysLeft: number | null;
  people: number;
  seatCap: number | null;
  lastActiveAt: string | null;
  fromRequest: string | null;
  departments: string[];
}

export interface OwnerSystem {
  errors: { server24h: number; browser24h: number; top: { message: string; source: string; n: number; last: string }[] };
  sync: { failed24h: number; ran24h: number; inError: { orgId: string; company: string; provider: string; error: string | null }[] };
  live: { mode: 'live' | 'demo' };
}

export interface OwnerActivity {
  at: string;
  who: string;
  action: string;
  ref: string | null;
  company: string | null;
}

export interface OwnerChecklist {
  entries: ChecklistEntry[];
  next: ChecklistEntry | null;
  progress: Record<string, { done: number; total: number }>;
}

export interface OwnerSupport {
  waiting: number;
  unclaimed: number;
  blocking: number;
  answered: number;
  solved7: number;
  oldestWaitingAt: string | null;
  waitingList: { ref: string; subject: string; company: string; at: string | null; blocking: boolean }[];
}

export interface OwnerBarData {
  approvalsPending: number;
  requestsNew: number;
  usage: { tokens: number; budget: number; costUsd: number };
}
