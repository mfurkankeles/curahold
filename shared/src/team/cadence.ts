// When each seat wakes, as data. The conductor turns these into scheduled
// tasks later (nothing here schedules anything). Every wake runs the code
// pre-check first (api/src/team/precheck.ts): with nothing new for the seat
// the run ends there, at zero model cost.

/** What the pre-check looks at for a seat (besides its queue, its threads and its meetings, which every seat has). */
export const SIGNALS = ['trials', 'support', 'security', 'usage', 'approvals-decided', 'monday', 'month-start', 'daily'] as const;
export type Signal = (typeof SIGNALS)[number];

export interface Cadence {
  seat: string;
  /** Five-field cron in Europe/Istanbul. */
  cron: string;
  what: string;
  /** Extra signals that count as "something changed" for this seat. */
  signals: Signal[];
  /** Expected tokens when the run does happen. */
  tokensPerRun: number;
  /** Share of wakes expected to end at the pre-check (nothing new). */
  skipShare: number;
}

export const TIMEZONE = 'Europe/Istanbul';

export const CADENCES: Cadence[] = [
  // Daily brief: always runs (the brief itself is the job), so 'daily' counts as a change once a day.
  { seat: 'coo', cron: '40 8 * * *', what: 'Daily brief + approvals digest', signals: ['daily', 'approvals-decided', 'security', 'usage'], tokensPerRun: 14_000, skipShare: 0 },
  { seat: 'coo', cron: '10 9 * * 1', what: 'Monday management page', signals: ['monday'], tokensPerRun: 20_000, skipShare: 0 },
  { seat: 'cto', cron: '20 9 * * 1', what: 'Engineering review', signals: ['monday', 'security'], tokensPerRun: 12_000, skipShare: 0.2 },
  { seat: 'release-reliability', cron: '50 7 * * *', what: 'Daily health check', signals: ['security'], tokensPerRun: 6_000, skipShare: 0.85 },
  { seat: 'security-engineer', cron: '0 */4 * * *', what: 'Alert triage', signals: ['security'], tokensPerRun: 6_000, skipShare: 0.95 },
  { seat: 'cpo', cron: '30 9 * * 2', what: 'Product review', signals: ['support'], tokensPerRun: 12_000, skipShare: 0.3 },
  { seat: 'growth-lead', cron: '0 */2 * * 1-5', what: 'New trial requests → summaries for approval', signals: ['trials'], tokensPerRun: 6_000, skipShare: 0.9 },
  { seat: 'growth-lead', cron: '40 9 * * 1', what: 'Growth review', signals: ['monday'], tokensPerRun: 12_000, skipShare: 0 },
  { seat: 'content-marketing', cron: '0 10 * * 1', what: '2-week content pack (every second Monday)', signals: ['monday'], tokensPerRun: 25_000, skipShare: 0.5 },
  { seat: 'performance-marketing', cron: '20 10 * * 3', what: 'Audience + test review', signals: [], tokensPerRun: 15_000, skipShare: 0.6 },
  { seat: 'cco', cron: '10 8 * * *', what: 'Support + trial health check', signals: ['support', 'trials'], tokensPerRun: 7_000, skipShare: 0.8 },
  { seat: 'cfo', cron: '50 9 * * 1', what: 'Monday numbers', signals: ['monday', 'usage'], tokensPerRun: 10_000, skipShare: 0 },
  { seat: 'cfo', cron: '0 10 1-3 * *', what: 'Month close', signals: ['month-start'], tokensPerRun: 18_000, skipShare: 0.67 },
  { seat: 'trust-lead', cron: '30 10 1 * *', what: 'Monthly compliance + access review', signals: ['month-start', 'security'], tokensPerRun: 20_000, skipShare: 0 },
  { seat: 'note-taker', cron: '0 16 * * 5', what: 'Weekly knowledge digest', signals: [], tokensPerRun: 8_000, skipShare: 0.3 },
  // Everyone else wakes only on work: a task in its queue, a thread, a meeting.
];

const runsPerWeek = (cron: string): number => {
  const [min, hour, dom, , dow] = cron.split(/\s+/);
  const count = (f: string, span: number) => {
    if (f === '*') return span;
    const step = /^\*\/(\d+)$/.exec(f);
    if (step) return Math.ceil(span / Number(step[1]));
    return f.split(',').reduce((n, part) => {
      const r = /^(\d+)-(\d+)$/.exec(part);
      return n + (r ? Number(r[2]) - Number(r[1]) + 1 : 1);
    }, 0);
  };
  const perDay = count(min, 60) * count(hour, 24);
  // Day-of-month schedules: their days a month spread over ~4.33 weeks.
  if (dom !== '*') return (perDay * count(dom, 30)) / 4.33;
  return perDay * count(dow, 7);
};

/** Expected tokens a week for a seat's cadences (what the console and the end questions show). */
export function weeklyEstimate(seat: string): { runs: number; wakes: number; tokens: number } {
  let runs = 0;
  let wakes = 0;
  let tokens = 0;
  for (const c of CADENCES.filter((x) => x.seat === seat)) {
    const w = runsPerWeek(c.cron);
    wakes += w;
    runs += w * (1 - c.skipShare);
    tokens += w * (1 - c.skipShare) * c.tokensPerRun;
  }
  return { runs: Math.round(runs * 10) / 10, wakes: Math.round(wakes * 10) / 10, tokens: Math.round(tokens) };
}
