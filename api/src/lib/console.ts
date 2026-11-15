// Curahold's own console (desk.<domain>): what the first screen needs to say
// "how is the business today, and who needs me". Read over the owner
// connection, across every company, from two places only: the billing
// provider's records as the product keeps them (orgs.billing, written by the
// provider's webhooks) and the product's own tables. Nothing here writes.
import type { Deps } from '../context';
import { PLANS, PRICE_CURRENCY, type Interval, type PlanKey } from '../../../shared/src/billing';
import type { ConsoleToday } from '../../../shared/src/console';
import type { MetricPoint } from '../../../shared/src/metrics';
import { sha256Hex } from './crypto';

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
const planKey = (v: unknown): PlanKey | null => (v === 'team' || v === 'business' ? v : null);
const interval = (v: unknown): Interval => (v === 'year' ? 'year' : 'month');
const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
/** Monthly recurring revenue of one paying company: per-seat monthly price × seats. */
const mrrOf = (plan: PlanKey | null, iv: Interval, seats: number) => (plan ? PLANS[plan].price[iv] * Math.max(0, seats) : 0);

/** Windows the rates are read over, in days. */
export const TRIAL_WINDOW_DAYS = 90;
export const ACTIVATION_WINDOW_DAYS = 90;
export const CHURN_WINDOW_DAYS = 30;
const PAYING = `billing->>'status' in ('active', 'past_due')`;

export async function consoleToday(deps: Deps, staffEmail: string): Promise<ConsoleToday> {
  const data = await deps.db.system(async (q) => {
    const paying = await q.query<{ plan: string; interval: string; seats: number; since: string | null }>(
      `select coalesce(o.billing->>'plan', o.plan) as plan, coalesce(o.billing->>'interval', 'month') as interval,
              coalesce((o.billing->>'seats')::int, (select count(*)::int from users u where u.org_id = o.id and u.seat = 'full' and u.status = 'active')) as seats,
              nullif(o.billing->>'eventAt', '') as since
         from orgs o where o.${PAYING}`,
    );
    const [c] = await q.query(
      `select count(*)::int as total,
              count(*) filter (where ${PAYING})::int as paying,
              count(*) filter (where billing->>'status' = 'past_due')::int as past_due,
              count(*) filter (where billing->>'status' = 'trialing' or (coalesce(billing->>'status', '') = '' and trial_ends_at > now()))::int as trialing,
              count(*) filter (where trial_ends_at between now() - make_interval(days => $1) and now())::int as trials_ended,
              count(*) filter (where trial_ends_at between now() - make_interval(days => $1) and now() and ${PAYING})::int as trials_paid,
              count(*) filter (where billing->>'status' = 'canceled' and nullif(billing->>'eventAt', '')::timestamptz >= now() - make_interval(days => $2))::int as churned
         from orgs`,
      [TRIAL_WINDOW_DAYS, CHURN_WINDOW_DAYS],
    );
    // Activated: a second person joined and a task was finished. Read over the companies that started lately.
    const [a] = await q.query(
      `select count(*)::int as started,
              count(*) filter (where (select count(*) from users u where u.org_id = o.id and u.status = 'active') >= 2
                                 and exists (select 1 from tasks t where t.org_id = o.id and t.done_at is not null))::int as activated
         from orgs o where o.created_at >= now() - make_interval(days => $1)`,
      [ACTIVATION_WINDOW_DAYS],
    );
    const requests = await q.query(
      `select h.ref, h.subject, h.impact, coalesce(h.last_message_at, h.created_at) as at, o.name as org_name, k.staff_email as owner
         from help_requests h join orgs o on o.id = h.org_id left join desk_claims k on k.request_id = h.id
        where h.status = 'received'
        order by (h.impact = 'blocking') desc nulls last, coalesce(h.last_message_at, h.created_at) limit 6`,
    );
    const [support] = await q.query(
      `select count(*) filter (where h.status = 'received')::int as waiting,
              count(*) filter (where h.status = 'received' and k.request_id is null)::int as unclaimed,
              count(*) filter (where h.status = 'received' and h.impact = 'blocking')::int as blocking,
              count(*) filter (where h.status <> 'solved' and k.staff_email = $1)::int as mine
         from help_requests h left join desk_claims k on k.request_id = h.id`,
      [staffEmail],
    );
    const pastDue = await q.query(
      `select id, name, nullif(billing->>'eventAt', '') as since from orgs where billing->>'status' = 'past_due' order by since nulls last limit 5`,
    );
    const trials = await q.query(
      `select id, name, trial_ends_at from orgs
        where trial_ends_at between now() and now() + interval '7 days' and coalesce(billing->>'status', '') not in ('active', 'past_due')
        order by trial_ends_at limit 5`,
    );
    return { paying, c, a, requests, support, pastDue, trials };
  });

  const since30 = Date.now() - 30 * 86400_000;
  let mrr = 0;
  let mrrNew = 0;
  const byMonth = new Map<string, number>();
  for (const o of data.paying) {
    const m = mrrOf(planKey(o.plan), interval(o.interval), num(o.seats));
    mrr += m;
    const at = o.since ? Date.parse(o.since) : NaN;
    if (at >= since30) mrrNew += m;
    const month = o.since ? o.since.slice(0, 7) : '';
    if (month) byMonth.set(month, (byMonth.get(month) ?? 0) + m);
  }
  let running = 0;
  const trend: MetricPoint[] = [...byMonth.keys()].sort().map((t) => ({ t, v: Math.round((running += byMonth.get(t) ?? 0)) }));
  const c = data.c ?? {};
  const rate = (part: number, whole: number) => (whole > 0 ? part / whole : null);

  return {
    asOf: new Date().toISOString(),
    mode: deps.config.billing ? 'live' : 'demo',
    currency: PRICE_CURRENCY,
    revenue: { mrr: Math.round(mrr), arr: Math.round(mrr * 12), mrrNew30: Math.round(mrrNew), trend: trend.slice(-12) },
    trialToPaid: { rate: rate(num(c.trials_paid), num(c.trials_ended)), paid: num(c.trials_paid), ended: num(c.trials_ended), days: TRIAL_WINDOW_DAYS },
    activation: { rate: rate(num(data.a?.activated), num(data.a?.started)), activated: num(data.a?.activated), started: num(data.a?.started), days: ACTIVATION_WINDOW_DAYS },
    churn: { companies: num(c.churned), rate: rate(num(c.churned), num(c.paying) + num(c.churned)), days: CHURN_WINDOW_DAYS },
    customers: { total: num(c.total), paying: num(c.paying), trialing: num(c.trialing), pastDue: num(c.past_due) },
    support: { waiting: num(data.support?.waiting), unclaimed: num(data.support?.unclaimed), blocking: num(data.support?.blocking), mine: num(data.support?.mine) },
    attention: [
      ...data.requests.map((r) => ({ kind: 'request' as const, ref: String(r.ref), title: String(r.subject), company: String(r.org_name), at: iso(r.at), blocking: r.impact === 'blocking', owner: r.owner ? String(r.owner) : null })),
      ...data.pastDue.map((o) => ({ kind: 'payment' as const, orgId: String(o.id), company: String(o.name), at: iso(o.since) })),
      ...data.trials.map((o) => ({ kind: 'trial' as const, orgId: String(o.id), company: String(o.name), at: iso(o.trial_ends_at) })),
    ],
  };
}

/**
 * A short fingerprint of everything the console shows: a company joins, pays,
 * fails to pay or leaves; a request arrives, is answered, taken or closed. The
 * open console asks for it every few seconds and reloads only when it moves.
 */
export async function consolePulse(deps: Deps): Promise<string> {
  const [r] = await deps.db.system((q) =>
    q.query<{ v: string }>(
      `select concat_ws('|',
         (select count(*) from orgs), (select max(nullif(billing->>'eventAt', '')) from orgs), (select max(trial_ends_at) from orgs),
         (select count(*) from help_requests), (select max(updated_at) from help_requests), (select max(last_message_at) from help_requests),
         (select count(*) from desk_claims), (select max(at) from desk_claims)) as v`,
    ),
  );
  return (await sha256Hex(r?.v ?? '')).slice(0, 16);
}
