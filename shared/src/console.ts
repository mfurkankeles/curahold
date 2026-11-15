// Curahold's own console, first screen: how the business is today and who
// needs the team. Worked out on the server across every company, from the
// billing provider's records (as the product keeps them) and the product's own
// tables. A rate is null while there is nothing yet to divide by.
import type { MetricPoint } from './metrics';

export type ConsoleAttention =
  /** A help request waiting on support. */
  | { kind: 'request'; ref: string; title: string; company: string; at: string | null; blocking: boolean; owner: string | null }
  /** A paying company whose last payment failed. */
  | { kind: 'payment'; orgId: string; company: string; at: string | null }
  /** A trial that ends within a week and is not paying yet. */
  | { kind: 'trial'; orgId: string; company: string; at: string | null };

export interface ConsoleToday {
  asOf: string;
  /** live: billing is on (a hosted, billed service). demo: billing is off, the numbers are sample data. */
  mode: 'live' | 'demo';
  currency: string;
  revenue: { mrr: number; arr: number; /** MRR from companies that started paying in the last 30 days. */ mrrNew30: number; trend: MetricPoint[] };
  /** Of the trials that ended in the last `days`, the share that pays. */
  trialToPaid: { rate: number | null; paid: number; ended: number; days: number };
  /** Of the companies that started in the last `days`, the share where a second person joined and a task was finished. */
  activation: { rate: number | null; activated: number; started: number; days: number };
  /** Companies that cancelled in the last `days`, and their share of paying + cancelled. */
  churn: { companies: number; rate: number | null; days: number };
  customers: { total: number; paying: number; trialing: number; pastDue: number };
  support: { waiting: number; unclaimed: number; blocking: number; mine: number };
  /** Who needs the team, most pressing first: waiting requests, failed payments, trials ending. */
  attention: ConsoleAttention[];
}
