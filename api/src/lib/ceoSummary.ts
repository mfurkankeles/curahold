// The weekly CEO summary: every Monday morning the owner gets one e-mail, in
// Turkish or English as he chose, with last week in plain numbers — targets
// against actuals, new trial requests, revenue and invoices, errors and alerts,
// what the AI team proposes and waits for his yes, support that blocks a
// customer, budget and the next fundraising step. Built from the console's own
// readers (no model call, so no AI cost and nothing invented); queued in the
// owner's outbox under the week's key, so it goes once however often the
// hourly job runs, and a short push follows on his phones if he added any.
import { intlTag, type Locale } from '../../../shared/src/i18n';
import { ownerWord, type OwnerKey } from '../../../shared/src/i18n/owner';
import { weekOf } from '../../../shared/src/office';
import type { CeoSummaryPreview } from '../../../shared/src/ownerPlan';
import { deskUrl, nowOf, type Deps } from '../context';
import { ownerPlan } from './ownerConsole';
import { ownerAddress, ownerMailSettings, pushToOwner, queueOwner } from './ownerOutbox';
import { investorSide } from './ownerPlan';

/** Monday 06:00 UTC: 09:00 in Istanbul, early enough to plan the week, after the night's jobs (03:00, 05:00). */
export const SUMMARY_HOUR_UTC = 6;
const DAY = 86_400_000;
const keyOf = (monday: string) => `ceo-summary:${monday}`;

/** Last week's figures across the business (counts and sums only), for [from, to). */
async function weekFigures(deps: Deps, from: Date, to: Date) {
  const [r] = await deps.db.system((q) =>
    q.query(
      `select
         (select count(*)::int from trial_requests where created_at >= $1 and created_at < $2) as requests,
         (select count(*)::int from trial_requests where status = 'new') as requests_waiting,
         (select count(*)::int from trial_requests where status = 'approved' and decided_at >= $1 and decided_at < $2) as approved,
         (select count(*)::int from invoices i join orgs o on o.id = i.org_id where i.status in ('paid', 'completed') and i.issued_at >= $1 and i.issued_at < $2) as paid,
         (select coalesce(sum(i.amount_cents), 0)::bigint from invoices i join orgs o on o.id = i.org_id where i.status in ('paid', 'completed') and i.issued_at >= $1 and i.issued_at < $2) as paid_cents,
         (select count(*)::int from invoices i join orgs o on o.id = i.org_id where i.status in ('failed', 'past_due') and i.issued_at >= $1 and i.issued_at < $2) as failed,
         (select count(*)::int from error_log e left join orgs o on o.id = e.org_id where e.source = 'server' and e.at >= $1 and e.at < $2) as errors,
         (select count(*)::int from sync_runs r join orgs o on o.id = r.org_id where r.status = 'error' and r.started_at >= $1 and r.started_at < $2) as sync_failed,
         (select count(*)::int from company_log where kind = 'alert' and at >= $1 and at < $2) as alerts,
         (select count(*)::int from approvals where status = 'pending') as pending,
         (select count(*)::int from approvals where status = 'pending' and priority = 'urgent') as urgent,
         (select min(created_at) from approvals where status = 'pending') as oldest,
         (select count(*)::int from help_requests h join orgs o on o.id = h.org_id where h.status = 'received' and h.impact = 'blocking') as blocking`,
      [from.toISOString(), to.toISOString()],
    ),
  );
  const n = (k: string) => Number(r?.[k]) || 0;
  return {
    requests: n('requests'),
    requestsWaiting: n('requests_waiting'),
    approved: n('approved'),
    paid: n('paid'),
    paidAmount: n('paid_cents') / 100,
    failed: n('failed'),
    errors: n('errors'),
    syncFailed: n('sync_failed'),
    alerts: n('alerts'),
    pending: n('pending'),
    urgent: n('urgent'),
    oldest: r?.oldest ? new Date(r.oldest) : null,
    blocking: n('blocking'),
  };
}

/**
 * Writes the summary for the week [from, to) in the owner's language. Plain text: it reads the same in every mail
 * program and on a phone, and nothing in it needs a picture.
 */
export async function composeCeoSummary(deps: Deps, from: Date, to: Date, locale: 'tr' | 'en'): Promise<{ subject: string; text: string }> {
  const w = (k: OwnerKey, v?: Record<string, string | number>) => ownerWord(locale as Locale, k, v);
  const tag = intlTag(locale);
  const n = (v: number) => new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(v);
  const usd = (v: number) => new Intl.NumberFormat(tag, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
  const date = (d: Date | string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => new Intl.DateTimeFormat(tag, { timeZone: 'UTC', ...opts }).format(typeof d === 'string' ? new Date(`${d}T00:00:00Z`) : d);
  const pct = (v: number) => new Intl.NumberFormat(tag, { style: 'percent', maximumFractionDigits: 0 }).format(v);

  const plan = await ownerPlan(deps, to);
  const side = await investorSide(deps, to);
  const f = await weekFigures(deps, from, to);
  const last = new Date(to.getTime() - DAY);
  const span = `${date(from)} – ${date(last, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const out: string[] = [w('summary.mail.hello'), '', w('summary.mail.week', { span }), ''];

  const rows = plan.rows.filter((r) => r.pace !== 'no-target');
  const metric = (k: string) => w(`metric.${k}` as OwnerKey);
  const fig = (k: string, v: number | null) => (v == null ? w('plan.notMeasured') : k === 'mrr' || k === 'arr' ? usd(v) : n(v));
  out.push(w('summary.mail.targets', { month: date(`${plan.period}-01`, { month: 'long', year: 'numeric' }), pct: pct(plan.elapsed) }));
  if (!rows.length) out.push(`  ${w('summary.mail.noTargets')}`);
  for (const r of rows) out.push(`  ${metric(r.metric)}: ${fig(r.metric, r.actual)} / ${fig(r.metric, r.target)} · ${w(`pace.${r.pace}` as OwnerKey)}`);
  for (const m of side.milestones) if (m.target != null || m.next) out.push(`  ${metric(m.metric)}: ${n(m.actual)}${m.target != null ? ` / ${n(m.target)}` : ''}`);
  out.push('');

  out.push(w('summary.mail.lastWeek'));
  out.push(`  ${w('summary.mail.requests', { n: n(f.requests), waiting: n(f.requestsWaiting), approved: n(f.approved) })}`);
  const mrr = plan.rows.find((r) => r.metric === 'mrr')?.actual ?? 0;
  out.push(`  ${w('summary.mail.revenue', { paid: n(f.paid), amount: usd(f.paidAmount), failed: n(f.failed), mrr: usd(mrr) })}`);
  out.push(`  ${w('summary.mail.errors', { errors: n(f.errors), sync: n(f.syncFailed), alerts: n(f.alerts) })}`);
  out.push(
    `  ${
      f.pending
        ? w('summary.mail.approvals', { n: n(f.pending), urgent: n(f.urgent), days: n(Math.max(0, Math.floor((to.getTime() - (f.oldest?.getTime() ?? to.getTime())) / DAY))) })
        : w('summary.mail.noApprovals')
    }`,
  );
  if (f.blocking) out.push(`  ${w('summary.mail.blocking', { n: n(f.blocking) })}`);
  out.push('');

  const month = side.budget.months.find((m) => m.period === side.period);
  if (month && (month.planned > 0 || month.actual != null)) {
    out.push(w('summary.mail.budget', { planned: usd(month.planned), spent: month.actual == null ? w('budget.notEntered') : usd(month.actual) }));
    if (side.budget.runwayMonths != null) out.push(`  ${w('summary.mail.runway', { months: n(side.budget.runwayMonths) })}`);
  }
  const today = to.toISOString().slice(0, 10);
  const next = side.windows.find((x) => x.status !== 'closed' && x.status !== 'skipped' && x.closesOn >= today);
  if (next)
    out.push(
      next.opensOn > today
        ? w('summary.mail.windowOpens', { name: next.name, date: date(next.opensOn, { day: 'numeric', month: 'long', year: 'numeric' }), days: n(Math.round((Date.parse(next.opensOn) - Date.parse(today)) / DAY)) })
        : w('summary.mail.windowOpen', { name: next.name, date: date(next.closesOn, { day: 'numeric', month: 'long', year: 'numeric' }) }),
    );
  const weekEnd = new Date(to.getTime() + 7 * DAY).toISOString().slice(0, 10);
  const steps = side.investors.filter((i) => i.nextOn && i.nextOn < weekEnd && i.stage !== 'passed').slice(0, 8);
  if (steps.length) {
    out.push(w('summary.mail.steps'));
    for (const s of steps) out.push(`  · ${date(s.nextOn!)} — ${s.name}${s.nextStep ? `: ${s.nextStep}` : ''}`);
  }
  out.push('', w('summary.mail.open', { url: `${deskUrl(deps.config)}/plan` }), '', w('summary.mail.footer'));
  return { subject: w('summary.mail.subject', { span }), text: out.join('\n').replace(/\n{3,}/g, '\n\n') };
}

/** The Monday the summary sent at `now` belongs to, and the week it covers (the seven days before that Monday). */
export function summaryWeek(now: Date): { monday: string; from: Date; to: Date } {
  const monday = weekOf(now);
  const to = new Date(`${monday}T00:00:00Z`);
  return { monday, from: new Date(to.getTime() - 7 * DAY), to };
}

/**
 * The hourly job's part: on Monday from 06:00 UTC, once per week (the outbox key), when the summary is on and the
 * owner has an address. Composing reads a good deal, so the key is looked up first. Returns whether one was queued.
 */
export async function queueCeoSummary(deps: Deps, now: Date): Promise<boolean> {
  if (now.getUTCDay() !== 1 || now.getUTCHours() < SUMMARY_HOUR_UTC) return false;
  const to = ownerAddress(deps);
  if (!to) return false;
  const { monday, from, to: end } = summaryWeek(now);
  const s = await deps.db.system((q) => ownerMailSettings(q));
  if (!s.enabled) return false;
  const [seen] = await deps.db.system((q) => q.query(`select 1 from owner_outbox where dedupe_key = $1`, [keyOf(monday)]));
  if (seen) return false;
  const mail = await composeCeoSummary(deps, from, end, s.locale);
  const queued = await deps.db.system((q) => queueOwner(q, 'mail', keyOf(monday), { to, ...mail }));
  if (queued) await pushToOwner(deps, `push:${keyOf(monday)}`, (l) => ({ title: ownerWord(l, 'summary.push.title'), body: ownerWord(l, 'summary.push.body'), url: '/plan?q=summary', urgency: 'normal' }));
  return queued;
}

/** What the console's preview shows: the summary as it would be written now, for the last seven days. */
export async function previewCeoSummary(deps: Deps): Promise<CeoSummaryPreview> {
  const now = nowOf(deps);
  const s = await deps.db.system((q) => ownerMailSettings(q));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY);
  const mail = await composeCeoSummary(deps, new Date(to.getTime() - 7 * DAY), to, s.locale);
  // The next Monday 06:00 UTC that has not been sent yet.
  const thisMonday = new Date(`${weekOf(now)}T${String(SUMMARY_HOUR_UTC).padStart(2, '0')}:00:00Z`);
  const [sent] = await deps.db.system((q) => q.query<{ sent_at: Date | null; dedupe_key: string }>(`select sent_at, dedupe_key from owner_outbox where dedupe_key like 'ceo-summary:%' order by created_at desc limit 1`));
  const doneThisWeek = sent?.dedupe_key === keyOf(weekOf(now));
  const nextAt = now < thisMonday && !doneThisWeek ? thisMonday : new Date(thisMonday.getTime() + 7 * DAY);
  return { ...mail, to: ownerAddress(deps), settings: s, nextAt: nextAt.toISOString(), lastSentAt: sent?.sent_at ? new Date(sent.sent_at).toISOString() : null };
}
