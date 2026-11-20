// The investor side of the owner's plan (Plan & targets in the owner console):
// budget against spend, the plan's two milestone metrics, fundraising windows
// and a hand-kept investor pipeline, plus the weekly CEO summary's settings.
// Also the one reader of the business plan's targets file (targets.json), used
// both by the console's "load from the plan" button and by
// scripts/plan/load-targets.ts, so the two can never read it differently.
// Pure TypeScript: no imports outside shared.
import { OWNER_LOCALES, ownerWord } from './i18n/owner';
import { PLAN_METRICS } from './ownerConsole';

/**
 * The plan's two milestones ("land beside the existing tool → expand → replace"). Not in PLAN_METRICS so the
 * month strip on the overview keeps its ten funnel figures; stored in plan_targets like them.
 */
export const MILESTONE_METRICS = ['expanded_companies', 'switched_companies'] as const;
export type MilestoneMetric = (typeof MILESTONE_METRICS)[number];
/** Every metric a target may be set for. */
export const TARGET_METRICS = [...PLAN_METRICS, ...MILESTONE_METRICS] as const;
export type TargetMetric = (typeof TARGET_METRICS)[number];

export const WINDOW_STATUSES = ['planned', 'preparing', 'open', 'closed', 'skipped'] as const;
export type WindowStatus = (typeof WINDOW_STATUSES)[number];
export const INVESTOR_KINDS = ['angel', 'fund', 'public', 'accelerator', 'strategic', 'other'] as const;
export type InvestorKind = (typeof INVESTOR_KINDS)[number];
/** In the order a conversation moves; 'passed' is the end of one that did not go on. */
export const INVESTOR_STAGES = ['idea', 'contacted', 'meeting', 'diligence', 'term-sheet', 'committed', 'passed'] as const;
export type InvestorStage = (typeof INVESTOR_STAGES)[number];

/** The plan's currency; every amount on this side of the console is in it. */
export const PLAN_CURRENCY = 'USD';

export interface BudgetLine {
  category: string;
  planned: number;
  /** null: not entered yet. */
  actual: number | null;
  source: 'owner' | 'plan';
}
export interface BudgetMonth {
  period: string;
  planned: number;
  /** Sum of the lines entered so far; null when none is. */
  actual: number | null;
  /** Paid invoices issued in the month (the billing records), in the plan's currency. */
  revenue: number;
  /** The plan's own expected revenue for the month, when the plan file gave one. */
  revenuePlan: number | null;
  lines: BudgetLine[];
}
export interface OwnerBudget {
  /** The current month first is not guaranteed: months run from three before now to eight after. */
  months: BudgetMonth[];
  /** Cash the owner said he has, and on which day; null until he says. */
  cash: number | null;
  cashOn: string | null;
  /** Months the cash lasts at the expected net spend; null when it cannot be worked out or nothing is spent net. */
  runwayMonths: number | null;
  /** Which scenario the plan file was loaded from, and the capital it says is needed. */
  scenario: string | null;
  capitalNeed: number | null;
}
export interface MilestoneRow {
  metric: MilestoneMetric;
  target: number | null;
  /** The level at month end as measured now (lib/ownerPlan.ts says how). */
  actual: number;
  /** Next target to reach, with its month: the first future month whose target is above the actual. */
  next: { period: string; target: number } | null;
}
export interface FundraisingWindow {
  id: string;
  key: string | null;
  name: string;
  opensOn: string;
  closesOn: string;
  targetMin: number | null;
  targetMax: number | null;
  status: WindowStatus;
  conditions: string | null;
  note: string | null;
  /** Investors in the pipeline tied to this window, and the amount they committed. */
  investors: number;
  committed: number;
}
export interface Investor {
  id: string;
  name: string;
  kind: InvestorKind;
  stage: InvestorStage;
  windowId: string | null;
  nextStep: string | null;
  nextOn: string | null;
  amount: number | null;
  note: string | null;
  updatedAt: string;
}
export interface OwnerInvestorSide {
  currency: string;
  period: string;
  budget: OwnerBudget;
  milestones: MilestoneRow[];
  windows: FundraisingWindow[];
  investors: Investor[];
  /** Investors put aside in the last 30 days, which can still be brought back. */
  removed: { id: string; name: string; deletedAt: string }[];
}

/** One of the owner console's two languages (OWNER_LOCALES): what the summary and phone alerts are written in. */
export const isOwnerLocale = (v: unknown): v is 'tr' | 'en' => typeof v === 'string' && (OWNER_LOCALES as string[]).includes(v);

/** The weekly CEO summary's settings (console_settings `ceoSummary.*`). */
export interface CeoSummarySettings {
  enabled: boolean;
  locale: 'tr' | 'en';
}
/** The weekly summary as it would be sent now. */
export interface CeoSummaryPreview {
  subject: string;
  text: string;
  to: string | null;
  settings: CeoSummarySettings;
  /** Monday of the week the next summary covers the week before of, and the moment it goes. */
  nextAt: string;
  /** When the last one went (null: none yet). */
  lastSentAt: string | null;
}

/** The owner's phones for alerts (Web Push). */
export interface OwnerPushState {
  /** false: VAPID keys are not set on the server, so no phone can be added (docs/ENVIRONMENT.md). */
  configured: boolean;
  /** The server's public key, for the browser's subscribe call. */
  publicKey: string | null;
  devices: { id: string; label: string; createdAt: string; lastOkAt: string | null; failures: number }[];
}

// ------------------------------------------------------------ the plan file

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const KEY = /^[a-z0-9][a-z0-9-]{1,40}$/;
const METRICS = new Set<string>(TARGET_METRICS);
const LIMIT = { targets: 2000, budget: 2000, tasks: 500, windows: 20 };

export interface PlanImport {
  scenario: string;
  capitalScenario: string | null;
  currency: string;
  targets: { metric: TargetMetric; period: string; target: number }[];
  budget: { period: string; category: string; planned: number }[];
  revenuePlan: Record<string, number>;
  capitalNeed: number | null;
  windows: { key: string; name: string; opensOn: string; closesOn: string; targetMin: number | null; targetMax: number | null; conditions: string | null }[];
  tasks: { title: string; dueOn: string }[];
}
export type PlanImportResult = { ok: true; plan: PlanImport; scenarios: string[] } | { ok: false; errors: string[]; scenarios: string[] };

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const amount = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e11 ? Math.round(v * 100) / 100 : null);
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** "2027-02" plus n months. */
export function addPeriod(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
const lastDay = (period: string) => new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).toISOString().slice(0, 10);

/**
 * The fundraising windows the business plan names (§12: pre-seed / angel in months 4–7 after launch, seed in
 * months 10–14), with the round sizes it gives, when the file carries no `fundraising` list of its own. Month 1 is
 * the launch month. The conditions are the plan's own, kept short; the owner edits them in the console.
 */
export function planWindows(launchMonth: string, locale: 'tr' | 'en' = 'tr'): PlanImport['windows'] {
  const m = (n: number) => addPeriod(launchMonth, n - 1);
  const w = (k: Parameters<typeof ownerWord>[1]) => ownerWord(locale, k);
  return [
    {
      key: 'pre-seed',
      name: w('fund.plan.preseed.name'),
      opensOn: `${m(4)}-01`,
      closesOn: lastDay(m(7)),
      targetMin: 100000,
      targetMax: 300000,
      conditions: w('fund.plan.preseed.conditions'),
    },
    {
      key: 'seed',
      name: w('fund.plan.seed.name'),
      opensOn: `${m(10)}-01`,
      closesOn: lastDay(m(14)),
      targetMin: 258542,
      targetMax: null,
      conditions: w('fund.plan.seed.conditions'),
    },
  ];
}

/**
 * Reads the business plan's targets file into what the console stores, for one scenario (the file's default when
 * none is named). Everything is checked; anything out of shape is an error and nothing is loaded, so a half-read
 * file can never leave half a plan behind. Unknown keys (regions, pricing drafts) are ignored on purpose.
 */
export function readPlanFile(file: unknown, scenario?: string | null, locale: 'tr' | 'en' = 'tr'): PlanImportResult {
  const f = obj(file);
  const scenarios = Object.keys(obj(f?.scenarios) ?? {});
  if (!f || !scenarios.length) return { ok: false, errors: ['not a plan file: no scenarios'], scenarios };
  const id = scenario || (typeof f.defaultScenario === 'string' ? f.defaultScenario : scenarios[0]);
  const s = obj(obj(f.scenarios)![id]);
  if (!s) return { ok: false, errors: [`no scenario "${id}"`], scenarios };
  const errors: string[] = [];
  const currency = typeof f.currency === 'string' ? f.currency : 'USD';
  if (currency !== PLAN_CURRENCY) errors.push(`currency ${currency}: the console keeps the plan in ${PLAN_CURRENCY}`);

  const targets: PlanImport['targets'] = [];
  const milestoneRows = arr(obj(obj(f.milestones)?.targets)?.[id]);
  for (const [i, raw] of [...arr(s.targets), ...milestoneRows].entries()) {
    const t = obj(raw);
    const value = amount(t?.target);
    if (!t || typeof t.metric !== 'string' || !METRICS.has(t.metric) || typeof t.period !== 'string' || !PERIOD.test(t.period) || value == null) errors.push(`target #${i + 1} is not {metric, period, target}`);
    else targets.push({ metric: t.metric as TargetMetric, period: t.period, target: value });
  }

  const capitalScenario = typeof s.pairedCapitalScenario === 'string' ? s.pairedCapitalScenario : null;
  const b = capitalScenario ? obj(obj(f.budget)?.[capitalScenario]) : null;
  const budget: PlanImport['budget'] = [];
  const revenuePlan: Record<string, number> = {};
  for (const [i, raw] of arr(b?.monthly).entries()) {
    const m = obj(raw);
    if (!m || typeof m.period !== 'string' || !PERIOD.test(m.period)) {
      errors.push(`budget month #${i + 1} has no period`);
      continue;
    }
    const rev = amount(m.revenueNet);
    if (rev != null) revenuePlan[m.period] = rev;
    for (const [category, v] of Object.entries(obj(m.byCategory) ?? {})) {
      const planned = amount(v);
      const name = text(category, 80);
      if (planned == null || !name) errors.push(`budget ${m.period} "${category}" is not an amount`);
      else budget.push({ period: m.period, category: name, planned });
    }
  }

  const launch = typeof f.launchMonth === 'string' && PERIOD.test(f.launchMonth) ? f.launchMonth : null;
  const windows: PlanImport['windows'] = [];
  if (Array.isArray(f.fundraising)) {
    for (const [i, raw] of f.fundraising.entries()) {
      const w = obj(raw);
      const key = typeof w?.key === 'string' && KEY.test(w.key) ? w.key : null;
      const name = text(w?.name, 120);
      const opensOn = typeof w?.opensOn === 'string' && DATE.test(w.opensOn) ? w.opensOn : null;
      const closesOn = typeof w?.closesOn === 'string' && DATE.test(w.closesOn) ? w.closesOn : null;
      const targetMin = w?.targetMin == null ? null : amount(w.targetMin);
      const targetMax = w?.targetMax == null ? null : amount(w.targetMax);
      if (!key || !name || !opensOn || !closesOn || closesOn < opensOn || (w?.targetMin != null && targetMin == null) || (w?.targetMax != null && targetMax == null) || (targetMin != null && targetMax != null && targetMax < targetMin))
        errors.push(`fundraising window #${i + 1} needs key, name, opensOn ≤ closesOn and amounts`);
      else windows.push({ key, name, opensOn, closesOn, targetMin, targetMax, conditions: text(w?.conditions, 2000) });
    }
  } else if (launch) windows.push(...planWindows(launch, locale));

  const tasks: PlanImport['tasks'] = [];
  for (const [i, raw] of arr(f.tasks).entries()) {
    const t = obj(raw);
    const title = text(t?.title, 300);
    if (!title || typeof t?.dueOn !== 'string' || !DATE.test(t.dueOn)) errors.push(`task #${i + 1} is not {title, dueOn}`);
    else tasks.push({ title, dueOn: t.dueOn });
  }

  if (targets.length > LIMIT.targets || budget.length > LIMIT.budget || tasks.length > LIMIT.tasks || windows.length > LIMIT.windows) errors.push('the file is larger than a plan the console keeps');
  if (errors.length) return { ok: false, errors: errors.slice(0, 20), scenarios };
  const need = amount(b?.capitalNeedEmployed);
  return { ok: true, scenarios, plan: { scenario: id, capitalScenario, currency, targets, budget, revenuePlan, capitalNeed: need, windows, tasks } };
}

/**
 * Months of runway: cash divided by the average net monthly spend (spend minus revenue) of the months given.
 * null when there is no cash figure, no month, or nothing is spent net (the business pays for itself).
 */
export function runwayOf(cash: number | null, months: { spend: number; revenue: number }[]): number | null {
  if (cash == null || !months.length) return null;
  const burn = months.reduce((s, m) => s + m.spend - m.revenue, 0) / months.length;
  if (burn <= 0) return null;
  return Math.max(0, Math.round((cash / burn) * 10) / 10);
}
