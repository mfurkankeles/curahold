// The investor side of Plan & targets: budget against spend with runway, the
// plan's two milestone metrics measured on real data, fundraising windows and
// the owner's hand-kept investor pipeline, and loading all of it (with the
// monthly targets and tasks) from the business plan's targets file. Over the
// owner connection, like the rest of the console (lib/ownerConsole.ts): the
// tables are the owner's own (migration 0252); the milestone counts read
// across companies and return numbers only, never a company's records.
import type { FundraisingWindowsRow, InvestorPipelineRow, PlanBudgetRow } from '../db/rows.gen';
import {
  addPeriod,
  MILESTONE_METRICS,
  PLAN_CURRENCY,
  runwayOf,
  type BudgetMonth,
  type FundraisingWindow,
  type Investor,
  type InvestorKind,
  type InvestorStage,
  type MilestoneMetric,
  type MilestoneRow,
  type OwnerInvestorSide,
  type PlanImport,
  type WindowStatus,
} from '../../../shared/src/ownerPlan';
import { nowOf, type Deps } from '../context';
import type { Q } from '../db';
import { PAYING } from './ownerConsole';
import { writeConsoleSetting } from './ownerOutbox';

const num = (v: unknown) => Number(v) || 0;
const numOrNull = (v: unknown) => (v == null ? null : Number(v));
const dayOf = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const isoOf = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v ?? ''));
/** Paid since: the first subscription the billing records have for the company. */
const PAID_SINCE = `(select min(s.created_at) from subscriptions s where s.org_id = o.id)`;

/**
 * The plan's milestones as levels right now (business plan, "land → expand → replace"):
 * - expanded: paying for 3 months or more, and work started on boards of at least two departments in the last 30 days;
 * - switched: paying for 6 months or more, once connected to an outside CRM or tracker (a "source" connection), and
 *   either no such connection is active any more, or at least 80% of the records created in the last 30 days were
 *   made in Curahold itself. The plan's "30 days in a row" is read as the last 30 days together.
 */
export async function milestoneActuals(q: Q, now: Date): Promise<Record<MilestoneMetric, number>> {
  const [r] = await q.query<{ expanded: number; switched: number }>(
    `select
       (select count(*)::int from orgs o where ${PAYING} and ${PAID_SINCE} <= $1::timestamptz - interval '3 months'
           and (select count(distinct b.department_id) from tasks t join boards b on b.id = t.board_id and b.org_id = t.org_id
                 where t.org_id = o.id and t.created_at > $1::timestamptz - interval '30 days') >= 2) as expanded,
       (select count(*)::int from orgs o where ${PAYING} and ${PAID_SINCE} <= $1::timestamptz - interval '6 months'
           and exists (select 1 from connections c where c.org_id = o.id and c.kind = 'source')
           and (not exists (select 1 from connections c where c.org_id = o.id and c.kind = 'source' and c.status = 'active')
                or coalesce((select count(*) filter (where r.source = 'manual')::numeric / nullif(count(*), 0)
                               from records r where r.org_id = o.id and r.created_at > $1::timestamptz - interval '30 days'), 0) >= 0.8)) as switched`,
    [now.toISOString()],
  );
  return { expanded_companies: num(r?.expanded), switched_companies: num(r?.switched) };
}

async function settings(q: Q): Promise<Record<string, unknown>> {
  const rows = await q.query<{ key: string; value: unknown }>(`select key, value from console_settings where key like 'budget.%' or key = 'plan.scenario'`);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

const windowOf = (r: FundraisingWindowsRow & { investors?: number; committed?: number }): FundraisingWindow => ({
  id: r.id,
  key: r.key,
  name: r.name,
  opensOn: dayOf(r.opens_on)!,
  closesOn: dayOf(r.closes_on)!,
  targetMin: numOrNull(r.target_min),
  targetMax: numOrNull(r.target_max),
  status: r.status as WindowStatus,
  conditions: r.conditions,
  note: r.note,
  investors: num(r.investors),
  committed: num(r.committed),
});
const investorOf = (r: InvestorPipelineRow): Investor => ({
  id: r.id,
  name: r.name,
  kind: r.kind as InvestorKind,
  stage: r.stage as InvestorStage,
  windowId: r.window_id,
  nextStep: r.next_step,
  nextOn: dayOf(r.next_on),
  amount: numOrNull(r.amount),
  note: r.note,
  updatedAt: isoOf(r.updated_at),
});

/** Months shown: three before this one to eight after (a year). */
const SPAN = { before: 3, after: 8 };

/** Everything the investor side of Plan & targets shows, in one read. */
export async function investorSide(deps: Deps, at?: Date): Promise<OwnerInvestorSide> {
  const now = at ?? nowOf(deps);
  const period = now.toISOString().slice(0, 7);
  const from = addPeriod(period, -SPAN.before);
  const to = addPeriod(period, SPAN.after);
  return deps.db.system(async (q) => {
    const set = await settings(q);
    const lines = await q.query<PlanBudgetRow>(`select * from plan_budget where period between $1 and $2 order by period, planned desc, category limit 2000`, [from, to]);
    const paid = await q.query<{ p: string; cents: string }>(
      `select to_char(i.issued_at, 'YYYY-MM') as p, coalesce(sum(i.amount_cents), 0)::bigint as cents from invoices i join orgs o on o.id = i.org_id
        where i.status in ('paid', 'completed') and i.issued_at >= $1::date and i.issued_at < ($2::date + interval '1 month') group by 1`,
      [`${from}-01`, `${to}-01`],
    );
    const revenue = new Map(paid.map((r) => [r.p, num(r.cents) / 100]));
    const revenuePlan = (set['budget.revenuePlan'] && typeof set['budget.revenuePlan'] === 'object' ? set['budget.revenuePlan'] : {}) as Record<string, number>;
    const months: BudgetMonth[] = [];
    for (let i = -SPAN.before; i <= SPAN.after; i++) {
      const p = addPeriod(period, i);
      const mine = lines.filter((l) => l.period === p);
      const entered = mine.filter((l) => l.actual != null);
      months.push({
        period: p,
        planned: Math.round(mine.reduce((s, l) => s + num(l.planned), 0) * 100) / 100,
        actual: entered.length ? Math.round(entered.reduce((s, l) => s + num(l.actual), 0) * 100) / 100 : null,
        revenue: revenue.get(p) ?? 0,
        revenuePlan: typeof revenuePlan[p] === 'number' ? revenuePlan[p] : null,
        lines: mine.map((l) => ({ category: l.category, planned: num(l.planned), actual: numOrNull(l.actual), source: l.source as 'owner' | 'plan' })),
      });
    }
    const cash = typeof set['budget.cash'] === 'number' ? (set['budget.cash'] as number) : null;
    // Runway at the plan's spend and revenue for this month and the next two; where the plan has no budget, the
    // spend entered so far. Revenue already in the bank this month counts when it is more than the plan expected.
    const ahead = months.filter((m) => m.period >= period).slice(0, 3);
    const runwayMonths = runwayOf(
      cash,
      ahead.filter((m) => m.planned > 0 || m.actual != null).map((m) => ({ spend: Math.max(m.planned, m.actual ?? 0), revenue: Math.max(m.revenuePlan ?? 0, m.period === period ? m.revenue : 0) })),
    );

    const act = await milestoneActuals(q, now);
    const t = await q.query<{ metric: string; period: string; target: string }>(`select metric, period, target from plan_targets where metric = any ($1::text[]) and period >= $2 order by period`, [
      [...MILESTONE_METRICS],
      period,
    ]);
    const milestones: MilestoneRow[] = MILESTONE_METRICS.map((metric) => {
      const mine = t.filter((r) => r.metric === metric);
      const cur = mine.find((r) => r.period === period);
      const next = mine.find((r) => r.period > period && num(r.target) > act[metric]);
      return { metric, target: cur ? num(cur.target) : null, actual: act[metric], next: next ? { period: next.period, target: num(next.target) } : null };
    });

    const windows = (
      await q.query<FundraisingWindowsRow & { investors: number; committed: number }>(
        `select w.*, (select count(*)::int from investor_pipeline i where i.window_id = w.id and i.deleted_at is null) as investors,
                (select coalesce(sum(i.amount), 0) from investor_pipeline i where i.window_id = w.id and i.deleted_at is null and i.stage = 'committed') as committed
           from fundraising_windows w order by w.opens_on, w.name limit 50`,
      )
    ).map(windowOf);
    const investors = (await q.query<InvestorPipelineRow>(`select * from investor_pipeline where deleted_at is null order by next_on nulls last, updated_at desc limit 500`)).map(investorOf);
    const removed = await q.query<{ id: string; name: string; deleted_at: Date }>(
      `select id, name, deleted_at from investor_pipeline where deleted_at > $1::timestamptz - interval '30 days' order by deleted_at desc limit 20`,
      [now.toISOString()],
    );
    return {
      currency: PLAN_CURRENCY,
      period,
      budget: {
        months,
        cash,
        cashOn: typeof set['budget.cashOn'] === 'string' ? (set['budget.cashOn'] as string) : null,
        runwayMonths,
        scenario: typeof set['plan.scenario'] === 'string' ? (set['plan.scenario'] as string) : null,
        capitalNeed: typeof set['budget.capitalNeed'] === 'number' ? (set['budget.capitalNeed'] as number) : null,
      },
      milestones,
      windows,
      investors,
      removed: removed.map((r) => ({ id: r.id, name: r.name, deletedAt: isoOf(r.deleted_at) })),
    };
  });
}

/** What a plan import changed, for the owner's confirmation line. */
export interface ImportCounts {
  targets: number;
  budget: number;
  windows: number;
  tasks: number;
}

/**
 * Loads a read plan file (shared/src/ownerPlan.ts readPlanFile) in one transaction: targets and planned budget are
 * replaced for the months the file covers (actual spend the owner typed is kept), fundraising windows are matched
 * by their key (the owner's status and notes are kept), and tasks already there (same title and day) are not added
 * twice. Running it again changes nothing.
 */
export async function importPlan(deps: Pick<Deps, 'db'>, plan: PlanImport, by: string): Promise<ImportCounts> {
  return deps.db.system(async (q) => {
    for (const t of plan.targets)
      await q.query(
        `insert into plan_targets (metric, period, target, updated_by) values ($1, $2, $3, $4)
         on conflict (metric, period) do update set target = excluded.target, updated_by = excluded.updated_by, updated_at = now()`,
        [t.metric, t.period, t.target, by],
      );
    for (const b of plan.budget)
      await q.query(
        `insert into plan_budget (period, category, planned, source, updated_by) values ($1, $2, $3, 'plan', $4)
         on conflict (period, category) do update set planned = excluded.planned, updated_by = excluded.updated_by, updated_at = now()`,
        [b.period, b.category, b.planned, by],
      );
    for (const w of plan.windows)
      await q.query(
        `insert into fundraising_windows (key, name, opens_on, closes_on, target_min, target_max, conditions) values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (key) do update set opens_on = excluded.opens_on, closes_on = excluded.closes_on, target_min = excluded.target_min,
                target_max = excluded.target_max, conditions = coalesce(fundraising_windows.conditions, excluded.conditions), updated_at = now()`,
        [w.key, w.name, w.opensOn, w.closesOn, w.targetMin, w.targetMax, w.conditions],
      );
    let tasks = 0;
    for (const t of plan.tasks) {
      const rows = await q.query(
        `insert into plan_tasks (title, due_on, source) select $1, $2, 'plan' where not exists (select 1 from plan_tasks where title = $1 and due_on = $2) returning id`,
        [t.title, t.dueOn],
      );
      tasks += rows.length;
    }
    await writeConsoleSetting(q, 'plan.scenario', plan.scenario, by);
    await writeConsoleSetting(q, 'budget.revenuePlan', plan.revenuePlan, by);
    if (plan.capitalNeed != null) await writeConsoleSetting(q, 'budget.capitalNeed', plan.capitalNeed, by);
    await q.query(`insert into desk_log (staff_email, action, ref, org_id) values ($1, 'plan.import', $2, null)`, [by, plan.scenario]);
    return { targets: plan.targets.length, budget: plan.budget.length, windows: plan.windows.length, tasks };
  });
}
