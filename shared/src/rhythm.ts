// Rhythm: what a team aims for in a period, how often it sits down with each
// customer, and when Tendwell should speak up about work that has gone still.
// Everything here is worked out from what is already stored, when someone looks.

export const TARGET_PERIODS = ['month', 'quarter', 'year'] as const;
export type TargetPeriod = (typeof TARGET_PERIODS)[number];
export const TARGET_KINDS = ['new', 'expansion', 'renewal'] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

export interface Rhythm {
  /** Money to win per period, by kind of deal. Null: no target. */
  targets: { period: TargetPeriod } & Record<TargetKind, number | null>;
  /** Days between business reviews for every customer. 0: no rhythm. */
  reviewDays: number;
  /** Open work nobody has touched for this many days is brought up once a week. 0: off. */
  staleDays: number;
  /** Work this many days past its date is passed to the team lead. 0: off. */
  escalateDays: number;
}

export const DEFAULT_RHYTHM: Rhythm = {
  targets: { period: 'quarter', new: null, expansion: null, renewal: null },
  reviewDays: 0,
  staleDays: 14,
  escalateDays: 0,
};

const whole = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
};
const amount = (v: unknown) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== '' && Number.isFinite(n) && n > 0 && n < 1e13 ? Math.round(n) : null;
};

/** Whatever was stored, as a rhythm that can be relied on. */
export function rhythmOf(raw: unknown): Rhythm {
  const r = (raw ?? {}) as { targets?: Record<string, unknown>; reviewDays?: unknown; staleDays?: unknown; escalateDays?: unknown };
  const t = r.targets ?? {};
  return {
    targets: {
      period: (TARGET_PERIODS as readonly string[]).includes(String(t.period)) ? (t.period as TargetPeriod) : 'quarter',
      new: amount(t.new),
      expansion: amount(t.expansion),
      renewal: amount(t.renewal),
    },
    reviewDays: whole(r.reviewDays, 0, 730, DEFAULT_RHYTHM.reviewDays),
    staleDays: whole(r.staleDays, 0, 365, DEFAULT_RHYTHM.staleDays),
    escalateDays: whole(r.escalateDays, 0, 90, DEFAULT_RHYTHM.escalateDays),
  };
}

const DAY = 86_400_000;
const utc = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface Period {
  kind: TargetPeriod;
  /** "2026-Q4", "2026-11" or "2026". */
  key: string;
  start: string;
  /** The last day, inclusive. */
  end: string;
  /** How much of it has passed by the end of today, 0–1. */
  elapsed: number;
  daysLeft: number;
}

/** The month, quarter or year a day falls in. */
export function periodOf(today: string, kind: TargetPeriod = 'quarter'): Period {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  const first = kind === 'year' ? 0 : kind === 'quarter' ? m - (m % 3) : m;
  const months = kind === 'year' ? 12 : kind === 'quarter' ? 3 : 1;
  const start = Date.UTC(y, first, 1);
  const end = Date.UTC(y, first + months, 0);
  const total = Math.round((end - start) / DAY) + 1;
  const gone = Math.min(total, Math.max(0, Math.round((utc(today) - start) / DAY) + 1));
  const key = kind === 'year' ? String(y) : kind === 'quarter' ? `${y}-Q${Math.floor(m / 3) + 1}` : today.slice(0, 7);
  return { kind, key, start: isoOf(start), end: isoOf(end), elapsed: gone / total, daysLeft: total - gone };
}

export type PaceState = 'reached' | 'ahead' | 'on' | 'behind';

export interface Pace {
  target: number;
  won: number;
  /** Open deals due to close in the period, each counted by how far along it is. */
  weighted: number;
  /** Where "won" would be today if the period were won evenly. */
  expected: number;
  /** Won so far plus the weighted open deals. */
  forecast: number;
  /** Still to win; 0 when the target is reached. */
  gap: number;
  /** What has to be won each remaining week to get there. */
  perWeek: number;
  state: PaceState;
}

/**
 * How a target is going. Ahead: more is won than an even pace needs by today.
 * On track: not ahead, but what is won plus the weighted open deals covers it.
 * Behind: neither.
 */
export function paceOf(target: number, won: number, weighted: number, period: Pick<Period, 'elapsed' | 'daysLeft'>): Pace {
  const expected = target * period.elapsed;
  const forecast = won + weighted;
  const gap = Math.max(0, target - won);
  const weeks = Math.max(1, period.daysLeft / 7);
  const state: PaceState = won >= target ? 'reached' : won >= expected ? 'ahead' : forecast >= target ? 'on' : 'behind';
  return { target, won, weighted, expected, forecast, gap, perWeek: gap / weeks, state };
}

export interface DealLike {
  ownerId: string | null;
  amount: number;
  /** "won", "lost" or anything else for open. */
  status: string | null;
  kind: string | null;
  /** When it closed, or is expected to. */
  closeDate: string | null;
  /** 0–1: how far along an open deal is. */
  weight: number;
}

export interface TargetRow extends Pace {
  kind: TargetKind | 'all';
  deals: number;
}

/**
 * Targets against deals for the period today falls in: one row per kind
 * that has a target, and one for everything when there is more than one
 * (or when deals carry no kind). Also who won how much.
 */
export function targetReport(rhythm: Rhythm, deals: DealLike[], today: string, hasKinds = true) {
  const period = periodOf(today, rhythm.targets.period);
  const inPeriod = (d: DealLike) => !!d.closeDate && d.closeDate.slice(0, 10) >= period.start && d.closeDate.slice(0, 10) <= period.end;
  const won = deals.filter((d) => d.status === 'won' && inPeriod(d));
  const open = deals.filter((d) => d.status !== 'won' && d.status !== 'lost' && inPeriod(d));
  const sum = (list: DealLike[], w = false) => list.reduce((n, d) => n + d.amount * (w ? d.weight : 1), 0);
  const rows: TargetRow[] = [];
  const set = TARGET_KINDS.filter((k) => rhythm.targets[k]);
  if (hasKinds) {
    for (const k of set) {
      const mine = (d: DealLike) => d.kind === k;
      rows.push({ kind: k, deals: won.filter(mine).length, ...paceOf(rhythm.targets[k]!, sum(won.filter(mine)), sum(open.filter(mine), true), period) });
    }
  }
  const total = set.reduce((n, k) => n + rhythm.targets[k]!, 0);
  if (total && (!hasKinds || rows.length > 1)) rows.push({ kind: 'all', deals: won.length, ...paceOf(total, sum(won), sum(open, true), period) });
  const owners = new Map<string, { ownerId: string; won: number; deals: number }>();
  for (const d of won) {
    if (!d.ownerId) continue;
    const o = owners.get(d.ownerId) ?? { ownerId: d.ownerId, won: 0, deals: 0 };
    o.won += d.amount;
    o.deals += 1;
    owners.set(d.ownerId, o);
  }
  return { period, rows, total, owners: [...owners.values()].sort((a, b) => b.won - a.won) };
}

export type ReviewState = 'none' | 'overdue' | 'soon' | 'ok';

export interface ReviewDue {
  /** Days between reviews that applies to this customer (its own, else the company's). 0: none. */
  every: number;
  /** Its own rhythm, not the company's. */
  own: boolean;
  last: string | null;
  due: string | null;
  /** Days until it is due; negative when late. */
  days: number | null;
  state: ReviewState;
}

/**
 * When the next business review is due: the last one plus the rhythm, or —
 * for a customer never reviewed — the day it was added plus the rhythm.
 */
export function reviewDue(a: { reviewDays?: number | null; lastReviewAt?: string | null; createdAt: string }, companyDays: number, today: string): ReviewDue {
  const own = a.reviewDays !== null && a.reviewDays !== undefined;
  const every = own ? a.reviewDays! : companyDays;
  const last = a.lastReviewAt ? a.lastReviewAt.slice(0, 10) : null;
  if (!every) return { every: 0, own, last, due: null, days: null, state: 'none' };
  const due = isoOf(utc(last ?? a.createdAt) + every * DAY);
  const days = Math.round((utc(due) - utc(today)) / DAY);
  return { every, own, last, due, days, state: days < 0 ? 'overdue' : days <= 14 ? 'soon' : 'ok' };
}
