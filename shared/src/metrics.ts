// The whole-business metrics the platform owner sees: one snapshot across
// every company, worked out on the server over the owner connection (so it
// crosses the per-company isolation that every other screen obeys). The owner
// alone may read it. Numbers are only ever as real as the data behind them:
// `mode` says whether this is a live billed instance or a demo/sample.
import type { PlanKey } from './billing';

/** A labelled point on a trend line: `t` the label (a month or day), `v` the value. */
export interface MetricPoint {
  t: string;
  v: number;
}

export interface PlatformMetrics {
  /** When the snapshot was taken (ISO). */
  asOf: string;
  /** live: a billed production instance. demo: billing is off, so the numbers are sample/self-host data. */
  mode: 'live' | 'demo';

  revenue: {
    /** Monthly recurring revenue, US dollars. */
    mrr: number;
    /** Annual run rate (mrr × 12). */
    arr: number;
    payingOrgs: number;
    /** Average revenue per paying company (mrr / payingOrgs). */
    arpa: number;
    /** Companies that started paying in the last 30 days. */
    newPaying30: number;
    byPlan: { plan: PlanKey; orgs: number; mrr: number }[];
    /** Cumulative MRR by the month each paying company started (an approximation of how MRR built up). */
    buildup: MetricPoint[];
  };

  customers: {
    /** Companies in total. */
    orgs: number;
    paying: number;
    trialing: number;
    churned: number;
    /** Paying companies ÷ sign-ups (0..1). */
    conversion: number;
    signups: { total: number; verified: number; converted: number };
    /** The sign-up → verified → company → paying funnel. */
    funnel: { stage: string; n: number }[];
    /** New companies per month, last 12 months. */
    newOrgs: MetricPoint[];
    /** The largest paying companies by MRR (the logos). */
    top: { name: string; plan: string; seats: number; mrr: number }[];
  };

  engagement: {
    dau: number;
    wau: number;
    mau: number;
    /** DAU ÷ MAU (0..1): how many of the month's users show up on a given day. */
    stickiness: number;
    activeUsers: number;
    seats: { full: number; viewer: number };
    /** Companies that cancelled in the last 30 days. */
    churn30: number;
    /** Distinct active users per day, last 30 days. */
    dauTrend: MetricPoint[];
  };

  usage: {
    tasks: number;
    boards: number;
    meetings: number;
    records: number;
    comments: number;
    minutes: number;
    /** Tasks per company — how deep the use runs, not just how wide. */
    tasksPerOrg: number;
    /** Tasks created per week, last 12 weeks. */
    created: MetricPoint[];
  };
}
