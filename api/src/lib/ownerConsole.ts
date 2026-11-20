// The owner console's own sections: Overview, Revenue & invoices, Trials &
// free, System, Activity, Support at a glance, Plan & targets and the go-live
// Checklist. Read over the owner connection across every company; metadata and
// counts only — never a customer's own records.
import { CHECKLIST, nextTask, type ChecklistEntry, type ChecklistItem, type ChecklistTrigger } from '../../../shared/src/checklist';
import { PRICE_CURRENCY, planOf } from '../../../shared/src/billing';
import type { MetricPoint } from '../../../shared/src/metrics';
import { weekOf } from '../../../shared/src/office';
import {
  PLAN_METRICS,
  type OwnerActivity,
  type OwnerBarData,
  type OwnerChecklist,
  type OwnerOverview,
  type OwnerPlan,
  type OwnerRevenue,
  type OwnerSupport,
  type OwnerSystem,
  type OwnerTrial,
  type Pace,
  type PlanMetric,
  type PlanRow,
  type PlanTask,
} from '../../../shared/src/ownerConsole';
import { nowOf, type Deps } from '../context';
import type { Q, Row } from '../db';
import { consoleToday } from './console';

const num = (v: unknown) => Number(v) || 0;
const isoAt = (v: unknown): string => iso(v) ?? '';
const iso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));
const PAYING = `coalesce(o.billing->>'status' in ('active', 'past_due'), false)`;
const TRIAL = `coalesce(o.billing->>'status' = 'trialing' or (coalesce(o.billing->>'status', '') = '' and o.trial_ends_at > now()), false)`;
const monthOf = (d: Date) => d.toISOString().slice(0, 7);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

// ------------------------------------------------------------ plan & targets

/** Actual values of every plan metric for one month ("YYYY-MM"); stocks are read now. */
async function actuals(q: Q, period: string): Promise<Record<PlanMetric, number | null>> {
  const from = `${period}-01`;
  const [r] = await q.query(
    `select
       (select sum(visitors) from site_daily where to_char(day, 'YYYY-MM') = $1) as site_visitors,
       (select count(*) from trial_requests where to_char(created_at, 'YYYY-MM') = $1) as trial_requests,
       (select count(*) from trial_requests where status = 'approved' and to_char(decided_at, 'YYYY-MM') = $1) as trials_approved,
       (select count(*) from orgs o where to_char(o.created_at, 'YYYY-MM') = $1
           and (select count(*) from users u where u.org_id = o.id and u.status = 'active') >= 2
           and exists (select 1 from tasks t where t.org_id = o.id and t.done_at is not null)) as activations,
       (select count(*) from orgs o where ${PAYING}) as paying_customers,
       (select coalesce(sum(coalesce((o.billing->>'seats')::int, 0)), 0) from orgs o where ${PAYING}) as seats,
       (select count(*) from invoices i join orgs o on o.id = i.org_id where to_char(i.issued_at, 'YYYY-MM') = $1) as invoices,
       (select count(*) from orgs o where o.billing->>'status' = 'canceled' and to_char(nullif(o.billing->>'eventAt', '')::timestamptz, 'YYYY-MM') = $1) as churned,
       (select count(*) from site_daily where day >= $2::date) as site_rows`,
    [period, from],
  );
  const mrr = await mrrNow(q);
  return {
    site_visitors: num(r.site_rows) > 0 ? num(r.site_visitors) : null,
    trial_requests: num(r.trial_requests),
    trials_approved: num(r.trials_approved),
    activations: num(r.activations),
    paying_customers: num(r.paying_customers),
    seats: num(r.seats),
    mrr,
    arr: mrr * 12,
    invoices: num(r.invoices),
    churned: num(r.churned),
  };
}

async function mrrNow(q: Q): Promise<number> {
  const rows = await q.query<{ plan: string; interval: string; seats: number }>(
    `select coalesce(o.billing->>'plan', o.plan) as plan, coalesce(o.billing->>'interval', 'month') as interval, coalesce((o.billing->>'seats')::int, 0) as seats
       from orgs o where ${PAYING}`,
  );
  let m = 0;
  for (const o of rows) {
    const p = planOf(o.plan);
    if (p) m += p.price[o.interval === 'year' ? 'year' : 'month'] * Math.max(0, num(o.seats));
  }
  return Math.round(m);
}

/** On track when the actual is where the month should be by now (pro-rated); churn the other way round. */
export function paceOf(metric: PlanMetric, actual: number | null, target: number | null, elapsed: number): { expected: number | null; pace: Pace } {
  if (target == null) return { expected: null, pace: 'no-target' };
  const expected = Math.round(target * elapsed * 100) / 100;
  if (actual == null) return { expected, pace: 'behind' };
  if (metric === 'churned') return { expected: target, pace: actual <= target ? 'on-track' : actual <= target * 1.2 ? 'close' : 'behind' };
  return { expected, pace: actual >= expected ? 'on-track' : actual >= expected * 0.8 ? 'close' : 'behind' };
}

const taskOf = (r: Row): PlanTask => ({ id: String(r.id), title: r.title, dueOn: isoAt(r.due_on).slice(0, 10), doneAt: iso(r.done_at), source: r.source });

export async function ownerPlan(deps: Deps, at?: Date): Promise<OwnerPlan> {
  const now = at ?? nowOf(deps);
  const period = monthOf(now);
  const daysIn = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const elapsed = Math.min(1, (now.getUTCDate() - 1 + now.getUTCHours() / 24) / daysIn);
  return deps.db.system(async (q) => {
    const act = await actuals(q, period);
    const t = await q.query(`select metric, period, target from plan_targets where period >= $1 order by period limit 400`, [period]);
    const targets: OwnerPlan['targets'] = {};
    for (const r of t) (targets[r.metric] ??= {})[r.period] = Number(r.target);
    const rows: PlanRow[] = PLAN_METRICS.map((metric) => {
      const target = targets[metric]?.[period] ?? null;
      return { metric, target, actual: act[metric], ...paceOf(metric, act[metric], target, elapsed) };
    });
    const today = dayOf(now);
    const weekEnd = dayOf(new Date(Date.parse(`${weekOf(now)}T00:00:00Z`) + 6 * 86400_000));
    const monthEnd = `${period}-${String(daysIn).padStart(2, '0')}`;
    const tasks = (await q.query(`select * from plan_tasks where (done_at is null and due_on <= $1) or (due_on between $2 and $1) order by due_on, created_at limit 300`, [monthEnd, today])).map(taskOf);
    return {
      period,
      elapsed,
      rows,
      targets,
      tasks: {
        overdue: tasks.filter((x) => !x.doneAt && x.dueOn < today),
        today: tasks.filter((x) => x.dueOn === today),
        week: tasks.filter((x) => x.dueOn > today && x.dueOn <= weekEnd),
        month: tasks.filter((x) => x.dueOn > weekEnd && x.dueOn <= monthEnd),
      },
    };
  });
}

// ------------------------------------------------------------ checklist

/** Does a trigger fire on today's data? Returns the reason in plain words (English, for the log), or null. */
async function fires(q: Q, t: ChecklistTrigger): Promise<string | null> {
  const country = `coalesce((select r.country from trial_requests r where r.created_org = o.id limit 1), nullif(o.settings->>'country', ''), nullif(o.billing->>'country', ''))`;
  if (t.kind === 'manual') return null;
  if (t.kind === 'paidInCountry' || t.kind === 'customerInCountry') {
    const [r] = await q.query(
      `select o.name, ${country} as country from orgs o where ${t.kind === 'paidInCountry' ? PAYING : `(${PAYING} or ${TRIAL})`} and ${country} = any ($1::text[]) order by o.created_at limit 1`,
      [t.countries],
    );
    return r ? `${t.kind === 'paidInCountry' ? 'paying' : 'customer'} company in ${r.country}` : null;
  }
  if (t.kind === 'payingAtLeast') {
    const [r] = await q.query(`select count(*)::int as n from orgs o where ${PAYING}`);
    return num(r.n) >= t.n ? `${r.n} paying companies` : null;
  }
  if (t.kind === 'seatsAtLeast') {
    const [r] = await q.query(`select coalesce(sum(coalesce((o.billing->>'seats')::int, 0)), 0)::int as n from orgs o where ${PAYING}`);
    return num(r.n) >= t.n ? `${r.n} paid seats` : null;
  }
  const arr = (await mrrNow(q)) * 12;
  return arr >= t.amount ? `ARR ${arr}` : null;
}

export async function ownerChecklist(deps: Deps): Promise<OwnerChecklist> {
  return deps.db.system(async (q) => {
    // Triggers are evaluated from real data each time; the first moment one fired is kept (its deadline counts from then).
    for (const item of CHECKLIST) {
      if (item.priority !== 'later' || !item.trigger || item.trigger.kind === 'manual') continue;
      const why = await fires(q, item.trigger);
      if (why)
        await q.query(
          `insert into checklist_progress (item, triggered_at, trigger_why, at) values ($1, now(), $2, now())
           on conflict (item) do update set triggered_at = coalesce(checklist_progress.triggered_at, now()), trigger_why = coalesce(checklist_progress.trigger_why, excluded.trigger_why)`,
          [item.id, why],
        );
    }
    const rows = await q.query('select * from checklist_progress');
    const by = new Map(rows.map((r) => [String(r.item), r]));
    const done = (id: string) => by.get(id)?.status === 'done';
    const entries: ChecklistEntry[] = CHECKLIST.map((item: ChecklistItem) => {
      const p = by.get(item.id);
      const days = item.trigger && 'days' in item.trigger ? item.trigger.days : 30;
      const firedAt = p?.triggered_at ? new Date(p.triggered_at as string) : null;
      return {
        ...item,
        status: (p?.status ?? 'todo') as ChecklistEntry['status'],
        note: p?.note ?? null,
        evidence: p?.evidence ?? null,
        at: p && p.status !== 'todo' ? iso(p.at) : null,
        triggered: firedAt ? { at: firedAt.toISOString(), why: String(p?.trigger_why ?? ''), due: dayOf(new Date(firedAt.getTime() + days * 86400_000)) } : null,
        ready: (item.after ?? []).every(done),
      };
    });
    const progress: OwnerChecklist['progress'] = {};
    for (const e of entries) {
      if (e.priority === 'later' && !e.triggered) continue;
      for (const k of [e.area, e.priority === 'later' ? 'must' : e.priority, 'all']) {
        const g = (progress[k] ??= { done: 0, total: 0 });
        g.total++;
        if (e.status === 'done') g.done++;
      }
    }
    return { entries, next: nextTask(entries), progress };
  });
}

export async function markChecklist(deps: Pick<Deps, 'db'>, item: string, by: string, status: 'todo' | 'done' | 'skipped', note: string | null, evidence: string | null) {
  await deps.db.system((q) =>
    q.query(
      `insert into checklist_progress (item, status, note, evidence, at, by_email) values ($1, $2, $3, $4, now(), $5)
       on conflict (item) do update set status = excluded.status, note = coalesce(excluded.note, checklist_progress.note),
         evidence = coalesce(excluded.evidence, checklist_progress.evidence), at = now(), by_email = excluded.by_email`,
      [item, status, note, evidence, by],
    ),
  );
}

// ------------------------------------------------------------ overview

export async function ownerOverview(deps: Deps, staffEmail: string): Promise<OwnerOverview> {
  const today = await consoleToday(deps, staffEmail);
  const plan = await ownerPlan(deps);
  const check = await ownerChecklist(deps);
  const now = nowOf(deps);
  const data = await deps.db.system(async (q) => {
    const [inv] = await q.query(
      `select count(*) filter (where i.status in ('paid', 'completed') and i.issued_at > now() - interval '30 days')::int as paid,
              coalesce(sum(i.amount_cents) filter (where i.status in ('paid', 'completed') and i.issued_at > now() - interval '30 days'), 0)::bigint as paid_amount,
              count(*) filter (where i.status in ('failed', 'past_due') and i.issued_at > now() - interval '30 days')::int as failed,
              count(*) filter (where i.status in ('paid', 'completed') and i.issued_at > now() - interval '60 days' and i.issued_at <= now() - interval '30 days')::int as paid_prev
         from invoices i join orgs o on o.id = i.org_id`,
    );
    const [up] = await q.query(
      `select count(*)::int as n from subscriptions s join orgs o on o.id = s.org_id
        where s.status = 'active' and not s.cancel_at_period_end and s.current_period_end between now() and now() + interval '30 days'`,
    );
    const [st] = await q.query(
      `select count(*) filter (where ${PAYING})::int as paying, count(*) filter (where ${TRIAL})::int as trial,
              count(*) filter (where o.billing->>'status' = 'canceled')::int as churned,
              count(*) filter (where not (${PAYING}) and not ${TRIAL} and coalesce(o.billing->>'status', '') not in ('canceled'))::int as free,
              count(*) filter (where o.created_at > now() - interval '30 days')::int as signups30,
              count(*) filter (where o.created_at > now() - interval '60 days' and o.created_at <= now() - interval '30 days')::int as signups_prev
         from orgs o`,
    );
    const signups = await q.query(`select to_char(o.created_at, 'YYYY-MM') as t, count(*)::int as v from orgs o where o.created_at > now() - interval '12 months' group by 1 order by 1`);
    const [rq] = await q.query(`select count(*) filter (where status in ('new', 'contacted'))::int as open, count(*) filter (where status = 'new')::int as fresh from trial_requests`);
    const [er] = await q.query(
      `select count(*) filter (where e.source = 'server' and e.at > now() - interval '24 hours')::int as server,
              count(*) filter (where e.source = 'browser' and e.at > now() - interval '24 hours')::int as browser,
              count(*) filter (where e.source = 'server' and e.at <= now() - interval '24 hours')::int as server_prev
         from error_log e where e.at > now() - interval '48 hours' and (e.org_id is null or e.org_id is not null)`,
    );
    const [sy] = await q.query(
      `select count(*) filter (where r.status = 'error' and r.started_at > now() - interval '24 hours')::int as failed,
              count(*) filter (where r.status = 'error' and r.started_at <= now() - interval '24 hours')::int as failed_prev
         from sync_runs r join orgs o on o.id = r.org_id where r.started_at > now() - interval '48 hours'`,
    );
    const [cn] = await q.query(`select count(*)::int as n from connections c join orgs o on o.id = c.org_id where c.status = 'error'`);
    const site = await q.query(
      `select variant, sum(visitors)::int as visitors, sum(requests)::int as requests from site_daily where day > (now() - interval '30 days')::date group by variant order by variant`,
    );
    const [req30] = await q.query(
      `select count(*) filter (where created_at > now() - interval '30 days')::int as n,
              count(*) filter (where created_at <= now() - interval '30 days')::int as prev
         from trial_requests where created_at > now() - interval '60 days'`,
    );
    const [us] = await q.query(
      `select coalesce(sum(u.tokens), 0)::bigint as tokens, coalesce(sum(u.cost_usd), 0) as cost, (select coalesce(sum(weekly_budget), 0) from seats) as budget,
              exists (select 1 from agent_pauses where scope = 'all' and resumed_at is null) as paused_all
         from agent_usage u where u.week = $1::date`,
      [weekOf(now)],
    );
    const [ap] = await q.query(`select count(*)::int as n from approvals where status = 'pending'`);
    return { inv, up, st, signups, rq, er, sy, cn, site, req30, us, ap };
  });
  const visitors = data.site.reduce((s, r) => s + num(r.visitors), 0);
  const strip = plan.rows.filter((r) => r.pace !== 'no-target');
  return {
    today,
    invoices: { paid30: num(data.inv.paid), paidAmount30: num(data.inv.paid_amount) / 100, failed30: num(data.inv.failed), upcoming30: num(data.up.n), currency: PRICE_CURRENCY },
    states: { paying: num(data.st.paying), trial: num(data.st.trial), free: num(data.st.free), requested: num(data.rq.open), churned: num(data.st.churned) },
    growth: { signups30: num(data.st.signups30), activations30: today.activation.activated, signups: data.signups.map((r) => ({ t: String(r.t), v: num(r.v) })) as MetricPoint[] },
    requests: { open: num(data.rq.open), new: num(data.rq.fresh) },
    errors: { server24h: num(data.er.server), browser24h: num(data.er.browser), syncFailed24h: num(data.sy.failed), connectionsInError: num(data.cn.n) },
    site: {
      connected: data.site.length > 0,
      visitors30: data.site.length ? visitors : null,
      requests30: num(data.req30.n),
      conversion: visitors > 0 ? num(data.req30.n) / visitors : null,
      variants: data.site.map((r) => ({ variant: String(r.variant), visitors: num(r.visitors), requests: num(r.requests) })),
    },
    strip: { onTrack: strip.filter((r) => r.pace === 'on-track').length, close: strip.filter((r) => r.pace === 'close').length, behind: strip.filter((r) => r.pace === 'behind').length, rows: strip },
    usage: { tokens: num(data.us.tokens), budget: num(data.us.budget), costUsd: Math.round(num(data.us.cost) * 100) / 100, pausedAll: !!data.us.paused_all },
    approvalsPending: num(data.ap.n),
    checklist: { done: check.progress.all?.done ?? 0, total: check.progress.all?.total ?? 0, next: check.next?.id ?? null },
    prev: { paid30: num(data.inv.paid_prev), signups30: num(data.st.signups_prev), requests30: num(data.req30.prev), server24h: num(data.er.server_prev), syncFailed24h: num(data.sy.failed_prev) },
  };
}

/** The console's top bar: what waits for a decision and the AI team's week, in one light read (every heartbeat). */
export async function ownerBar(deps: Deps): Promise<OwnerBarData> {
  const [r] = await deps.db.system((q) =>
    q.query(
      `select (select count(*)::int from approvals where status = 'pending') as approvals,
              (select count(*)::int from trial_requests where status = 'new') as requests,
              (select coalesce(sum(tokens), 0)::bigint from agent_usage where week = $1::date) as tokens,
              (select coalesce(sum(cost_usd), 0) from agent_usage where week = $1::date) as cost,
              (select coalesce(sum(weekly_budget), 0)::bigint from seats) as budget`,
      [weekOf(nowOf(deps))],
    ),
  );
  return { approvalsPending: num(r.approvals), requestsNew: num(r.requests), usage: { tokens: num(r.tokens), budget: num(r.budget), costUsd: Math.round(num(r.cost) * 100) / 100 } };
}

// ------------------------------------------------------------ revenue, trials, system, activity, support

export async function ownerRevenue(deps: Deps, staffEmail: string): Promise<OwnerRevenue> {
  const today = await consoleToday(deps, staffEmail);
  return deps.db.system(async (q) => {
    const inv = await q.query(
      `select i.org_id, o.name, i.amount_cents, i.currency, i.status, i.issued_at from invoices i join orgs o on o.id = i.org_id order by i.issued_at desc nulls last limit 200`,
    );
    const [t] = await q.query(
      `select count(*) filter (where i.status in ('paid', 'completed'))::int as paid, count(*) filter (where i.status in ('failed', 'past_due'))::int as failed,
              count(*) filter (where i.status not in ('paid', 'completed', 'failed', 'past_due'))::int as other,
              coalesce(sum(i.amount_cents) filter (where i.status in ('paid', 'completed')), 0)::bigint as amount
         from invoices i join orgs o on o.id = i.org_id`,
    );
    const up = await q.query(
      `select s.org_id, o.name, s.current_period_end, s.status from subscriptions s join orgs o on o.id = s.org_id
        where s.status in ('active', 'past_due') and s.current_period_end > now() order by s.current_period_end limit 50`,
    );
    return {
      currency: today.currency,
      mrr: today.revenue.mrr,
      arr: today.revenue.arr,
      trend: today.revenue.trend,
      totals: { paid: num(t.paid), failed: num(t.failed), other: num(t.other), paidAmount: num(t.amount) / 100 },
      invoices: inv.map((r) => ({ orgId: String(r.org_id), company: String(r.name), amountCents: num(r.amount_cents), currency: String(r.currency), status: String(r.status), issuedAt: iso(r.issued_at) })),
      upcoming: up.map((r) => ({ orgId: String(r.org_id), company: String(r.name), at: isoAt(r.current_period_end), status: String(r.status) })),
    };
  });
}

export async function ownerTrials(deps: Deps): Promise<OwnerTrial[]> {
  const now = nowOf(deps).getTime();
  const rows = await deps.db.system((q) =>
    q.query(
      `select o.id, o.name, o.slug, o.trial_ends_at, o.trial_seat_cap, o.billing->>'status' as status, o.settings->'departments' as departments,
              (select count(*) from users u where u.org_id = o.id and u.status = 'active')::int as people,
              (select max(u.last_active_at) from users u where u.org_id = o.id) as last_active,
              (select r.ref from trial_requests r where r.created_org = o.id limit 1) as from_request
         from orgs o where not (${PAYING}) and coalesce(o.billing->>'status', '') <> 'canceled'
        order by o.trial_ends_at nulls last limit 500`,
    ),
  );
  return rows.map((r) => {
    const ends = r.trial_ends_at ? new Date(r.trial_ends_at as string).getTime() : null;
    const state: OwnerTrial['state'] = r.status === 'trialing' || (ends != null && ends > now) ? 'trial' : ends != null ? 'expired' : 'free';
    return {
      orgId: String(r.id),
      company: String(r.name),
      slug: String(r.slug),
      state,
      endsAt: iso(r.trial_ends_at),
      daysLeft: ends == null ? null : Math.ceil((ends - now) / 86400_000),
      people: num(r.people),
      seatCap: r.trial_seat_cap == null ? null : num(r.trial_seat_cap),
      lastActiveAt: iso(r.last_active),
      fromRequest: r.from_request ? String(r.from_request) : null,
      departments: Array.isArray(r.departments) ? (r.departments as string[]) : [],
    };
  });
}

export async function ownerSystem(deps: Deps): Promise<OwnerSystem> {
  return deps.db.system(async (q) => {
    const [er] = await q.query(
      `select count(*) filter (where e.source = 'server' and e.at > now() - interval '24 hours')::int as server,
              count(*) filter (where e.source = 'browser' and e.at > now() - interval '24 hours')::int as browser,
              count(*) filter (where e.source = 'server' and e.at <= now() - interval '24 hours')::int as server_prev
         from error_log e where e.at > now() - interval '48 hours' and (e.org_id is null or e.org_id is not null)`,
    );
    const top = await q.query(
      `select left(e.message, 200) as message, e.source, count(*)::int as n, max(e.at) as last
         from error_log e where e.at > now() - interval '7 days' and (e.org_id is null or e.org_id is not null)
        group by 1, 2 order by n desc, last desc limit 10`,
    );
    const [sy] = await q.query(
      `select count(*)::int as ran, count(*) filter (where r.status = 'error')::int as failed from sync_runs r join orgs o on o.id = r.org_id where r.started_at > now() - interval '24 hours'`,
    );
    const bad = await q.query(
      `select c.org_id, o.name, c.provider, left(c.last_error, 300) as last_error from connections c join orgs o on o.id = c.org_id where c.status = 'error' order by o.name limit 50`,
    );
    return {
      errors: { server24h: num(er.server), browser24h: num(er.browser), top: top.map((r) => ({ message: String(r.message), source: String(r.source), n: num(r.n), last: isoAt(r.last) })) },
      sync: { failed24h: num(sy.failed), ran24h: num(sy.ran), inError: bad.map((r) => ({ orgId: String(r.org_id), company: String(r.name), provider: String(r.provider), error: r.last_error ? String(r.last_error) : null })) },
      live: { mode: deps.config.billing ? 'live' : 'demo' },
    };
  });
}

export async function ownerActivity(deps: Pick<Deps, 'db'>, before?: string): Promise<OwnerActivity[]> {
  const rows = await deps.db.system((q) =>
    q.query(
      `select * from (
         select l.at, l.staff_email as who, l.action, l.ref, o.name as company from desk_log l left join orgs o on o.id = l.org_id
         union all
         select a.at, coalesce(a.detail->>'by', a.seat) as who, a.action, a.target as ref, null as company from agent_audit a where a.actor = 'owner'
       ) x ${before ? 'where x.at < $1::timestamptz' : ''} order by x.at desc limit 200`,
      before ? [before] : [],
    ),
  );
  return rows.map((r) => ({ at: isoAt(r.at), who: String(r.who), action: String(r.action), ref: r.ref ? String(r.ref) : null, company: r.company ? String(r.company) : null }));
}

export async function ownerSupport(deps: Pick<Deps, 'db'>): Promise<OwnerSupport> {
  return deps.db.system(async (q) => {
    const [s] = await q.query(
      `select count(*) filter (where h.status = 'received')::int as waiting, count(*) filter (where h.status = 'answered')::int as answered,
              count(*) filter (where h.status = 'received' and h.impact = 'blocking')::int as blocking,
              count(*) filter (where h.status = 'received' and not exists (select 1 from desk_claims k where k.request_id = h.id))::int as unclaimed,
              count(*) filter (where h.status = 'solved' and h.updated_at > now() - interval '7 days')::int as solved7,
              min(coalesce(h.last_message_at, h.created_at)) filter (where h.status = 'received') as oldest
         from help_requests h join orgs o on o.id = h.org_id`,
    );
    const list = await q.query(
      `select h.ref, h.subject, h.impact, coalesce(h.last_message_at, h.created_at) as at, o.name from help_requests h join orgs o on o.id = h.org_id
        where h.status = 'received' order by (h.impact = 'blocking') desc nulls last, coalesce(h.last_message_at, h.created_at) limit 10`,
    );
    return {
      waiting: num(s.waiting),
      unclaimed: num(s.unclaimed),
      blocking: num(s.blocking),
      answered: num(s.answered),
      solved7: num(s.solved7),
      oldestWaitingAt: iso(s.oldest),
      waitingList: list.map((r) => ({ ref: String(r.ref), subject: String(r.subject), company: String(r.name), at: iso(r.at), blocking: r.impact === 'blocking' })),
    };
  });
}
