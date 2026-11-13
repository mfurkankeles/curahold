// The platform owner's whole-business metrics: revenue, customers, engagement
// and usage across every company, in one snapshot. It runs over the owner
// connection (crossing the per-company isolation every other screen keeps), so
// only the platform owner may reach it — see requireOwner. No company can grant
// itself this; in production it is one configured address and nobody else.
import { Hono } from 'hono';
import { requireOwner, type AppEnv } from '../context';
import { PLANS, type Interval, type PlanKey } from '../../../shared/src/billing';
import { SEATS_SQL } from '../lib/billing';
import type { MetricPoint, PlatformMetrics } from '../../../shared/src/metrics';

export const metricsRoutes = new Hono<AppEnv>();

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
const planKey = (v: unknown): PlanKey | null => (v === 'team' || v === 'business' ? v : null);
const interval = (v: unknown): Interval => (v === 'year' ? 'year' : 'month');
/** Monthly recurring revenue for one paying company: per-seat price × seats. */
const mrrOf = (plan: PlanKey | null, iv: Interval, seats: number) => (plan ? PLANS[plan].price[iv] * Math.max(0, seats) : 0);

metricsRoutes.get('/metrics', async (c) => {
  requireOwner(c);
  const deps = c.get('deps');

  const data = await deps.db.system(async (q) => {
    const paying = (await q.query(
      `select o.id, o.name,
              coalesce(o.billing->>'plan', o.plan) as plan,
              coalesce(o.billing->>'interval', 'month') as interval,
              coalesce((o.billing->>'seats')::int, ${SEATS_SQL}) as seats,
              coalesce(o.billing->>'eventAt', o.created_at::text) as since
         from orgs o
        where o.billing->>'status' in ('active', 'past_due')`,
    )) as { id: string; name: string; plan: string; interval: string; seats: number; since: string }[];

    const [counts] = (await q.query(
      `select count(*)::int as orgs,
              count(*) filter (where o.billing->>'status' in ('active','past_due'))::int as paying,
              count(*) filter (where o.billing->>'status' = 'trialing'
                                 or (o.billing->>'status' is null and o.trial_ends_at > now()))::int as trialing,
              count(*) filter (where o.billing->>'status' = 'canceled')::int as churned
         from orgs o`,
    )) as { orgs: number; paying: number; trialing: number; churned: number }[];

    const [signups] = (await q.query(
      `select count(*)::int as total,
              count(*) filter (where verified_at is not null)::int as verified,
              count(*) filter (where org_id is not null)::int as converted
         from signups`,
    )) as { total: number; verified: number; converted: number }[];

    const newOrgs = (await q.query(
      `select to_char(date_trunc('month', created_at), 'YYYY-MM') as t, count(*)::int as v
         from orgs
        where created_at >= date_trunc('month', now()) - interval '11 months'
        group by 1 order by 1`,
    )) as MetricPoint[];

    const [engage] = (await q.query(
      `select count(distinct actor_id) filter (where at >= now() - interval '1 day')::int as dau,
              count(distinct actor_id) filter (where at >= now() - interval '7 days')::int as wau,
              count(distinct actor_id) filter (where at >= now() - interval '30 days')::int as mau
         from audit_log where actor_id is not null`,
    )) as { dau: number; wau: number; mau: number }[];

    const dauTrend = (await q.query(
      `select to_char(date_trunc('day', at), 'YYYY-MM-DD') as t, count(distinct actor_id)::int as v
         from audit_log
        where actor_id is not null and at >= now() - interval '29 days'
        group by 1 order by 1`,
    )) as MetricPoint[];

    const [seats] = (await q.query(
      `select count(*) filter (where seat='full' and status='active')::int as full,
              count(*) filter (where seat='viewer' and status='active')::int as viewer
         from users`,
    )) as { full: number; viewer: number }[];

    const [churn] = (await q.query(
      `select count(*)::int as n from orgs
        where billing->>'status' = 'canceled'
          and coalesce(billing->>'eventAt','') <> ''
          and (billing->>'eventAt')::timestamptz >= now() - interval '30 days'`,
    )) as { n: number }[];

    const [usage] = (await q.query(
      `select (select count(*) from tasks where archived_at is null)::int as tasks,
              (select count(*) from boards)::int as boards,
              ((select count(*) from planned_meetings where status='held') + (select count(*) from activities where kind='meeting'))::int as meetings,
              (select count(*) from records where archived_at is null)::int as records,
              (select count(*) from comments)::int as comments,
              coalesce((select sum(minutes) from time_entries),0)::int as minutes`,
    )) as { tasks: number; boards: number; meetings: number; records: number; comments: number; minutes: number }[];

    const created = (await q.query(
      `select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as t, count(*)::int as v
         from tasks
        where created_at >= date_trunc('week', now()) - interval '11 weeks'
        group by 1 order by 1`,
    )) as MetricPoint[];

    return { paying, counts, signups, newOrgs, engage, dauTrend, seats, churn, usage, created };
  });

  // Revenue, from the live subscriptions.
  const since30 = Date.now() - 30 * 86400_000;
  let mrr = 0;
  let newPaying30 = 0;
  const byPlanMap = new Map<PlanKey, { orgs: number; mrr: number }>();
  const buildupMap = new Map<string, number>();
  const withMrr = data.paying.map((o) => {
    const plan = planKey(o.plan);
    const m = mrrOf(plan, interval(o.interval), num(o.seats));
    mrr += m;
    if (new Date(o.since).getTime() >= since30) newPaying30 += 1;
    if (plan) {
      const b = byPlanMap.get(plan) ?? { orgs: 0, mrr: 0 };
      byPlanMap.set(plan, { orgs: b.orgs + 1, mrr: b.mrr + m });
    }
    const month = (o.since || '').slice(0, 7);
    if (month) buildupMap.set(month, (buildupMap.get(month) ?? 0) + m);
    return { name: o.name, plan: o.plan, seats: num(o.seats), mrr: m };
  });
  const payingOrgs = data.paying.length;
  let running = 0;
  const buildup: MetricPoint[] = [...buildupMap.keys()].sort().map((t) => ({ t, v: (running += buildupMap.get(t) ?? 0) }));

  const signups = data.signups ?? { total: 0, verified: 0, converted: 0 };
  const paying = data.counts?.paying ?? payingOrgs;

  const metrics: PlatformMetrics = {
    asOf: new Date().toISOString(),
    mode: deps.config.billing ? 'live' : 'demo',
    revenue: {
      mrr: Math.round(mrr),
      arr: Math.round(mrr * 12),
      payingOrgs,
      arpa: payingOrgs ? Math.round(mrr / payingOrgs) : 0,
      newPaying30,
      byPlan: [...byPlanMap.entries()].map(([plan, b]) => ({ plan, orgs: b.orgs, mrr: Math.round(b.mrr) })),
      buildup: buildup.map((p) => ({ t: p.t, v: Math.round(p.v) })),
    },
    customers: {
      orgs: data.counts?.orgs ?? 0,
      paying,
      trialing: data.counts?.trialing ?? 0,
      churned: data.counts?.churned ?? 0,
      conversion: signups.total ? paying / signups.total : 0,
      signups,
      funnel: [
        { stage: 'signups', n: signups.total },
        { stage: 'verified', n: signups.verified },
        { stage: 'companies', n: signups.converted },
        { stage: 'paying', n: paying },
      ],
      newOrgs: data.newOrgs,
      top: withMrr.sort((a, b) => b.mrr - a.mrr).slice(0, 8),
    },
    engagement: {
      dau: data.engage?.dau ?? 0,
      wau: data.engage?.wau ?? 0,
      mau: data.engage?.mau ?? 0,
      stickiness: data.engage?.mau ? (data.engage.dau ?? 0) / data.engage.mau : 0,
      activeUsers: (data.seats?.full ?? 0) + (data.seats?.viewer ?? 0),
      seats: { full: data.seats?.full ?? 0, viewer: data.seats?.viewer ?? 0 },
      churn30: data.churn?.n ?? 0,
      dauTrend: data.dauTrend,
    },
    usage: {
      tasks: data.usage?.tasks ?? 0,
      boards: data.usage?.boards ?? 0,
      meetings: data.usage?.meetings ?? 0,
      records: data.usage?.records ?? 0,
      comments: data.usage?.comments ?? 0,
      minutes: data.usage?.minutes ?? 0,
      tasksPerOrg: data.counts?.orgs ? Math.round((data.usage?.tasks ?? 0) / data.counts.orgs) : 0,
      created: data.created,
    },
  };

  return c.json(metrics);
});
