// Waking a seat: a cheap code pre-check first (SQL only, no model). If
// nothing changed for the seat since it last looked, the wake ends there at
// zero model cost. Only with something new does the seat run (runtime.ts).
//
// The cadences are data (shared/src/team/cadence.ts); tick() is what a
// scheduled task calls — the conductor creates those, nothing here schedules.
import type { AgentTasksRow, AgentWakesRow, ApprovalsRow, CompanyLogRow, MeetingsRow } from '../db/rows.gen';
import type { Deps } from '../context';
import type { Q } from '../db';
import { nowOf } from '../context';
import { isPaused, writeLog } from '../lib/office';
import { CADENCES, TIMEZONE, type Signal } from '../../../shared/src/team/cadence';
import { isActive, seatPolicy } from './policy';
import { run, type RunResult } from './runtime';

export interface PreCheck {
  seat: string;
  run: boolean;
  /** Why not: 'nothing-new', 'paused', 'inactive', 'dormant', 'human', 'no-seat'. */
  reason: string;
  events: string[];
  seenLog: number;
}

const localParts = (d: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, day: Number(p.day), hour: Number(p.hour) % 24, minute: Number(p.minute), dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
};

/** The checks themselves — reads only (the cursor is moved by wake()). */
export async function precheck(q: Q, seat: string, now: Date, extra: Signal[] = []): Promise<PreCheck> {
  const no = (reason: string): PreCheck => ({ seat, run: false, reason, events: [], seenLog: 0 });
  const p = await seatPolicy(q, seat);
  if (!p) return no('no-seat');
  if (p.filledBy === 'human') return no('human');
  if (p.state === 'dormant') return no('dormant');
  if (!isActive(p)) return no('inactive');
  if (await isPaused(q, seat)) return no('paused');
  const [w] = await q.query<Pick<AgentWakesRow, 'checked_at' | 'seen_log' | 'ran_at'>>('select checked_at, seen_log, ran_at from agent_wakes where seat = $1', [seat]);
  const since: Date = w?.checked_at ? new Date(w.checked_at) : new Date(0);
  const seen = Number(w?.seen_log ?? 0);
  const ranAt: Date | null = w?.ran_at ? new Date(w.ran_at) : null;
  const events: string[] = [];

  const tasks = await q.query<Pick<AgentTasksRow, 'title' | 'priority' | 'from_seat'>>(`select title, priority, from_seat from agent_tasks where seat = $1 and status = 'queued' order by (priority = 'urgent') desc, created_at limit 10`, [seat]);
  for (const t of tasks) events.push(`Task${t.priority === 'urgent' ? ' (urgent)' : ''} from ${t.from_seat ?? 'owner'}: ${t.title}`);
  const threads = await q.query(
    `select id, seat, body from company_log where id > $2 and seat <> $1 and kind = 'thread'
        and thread in (select thread from company_log where thread is not null and (seat = $1 or meta->>'to' = $1)) order by id limit 10`,
    [seat, seen],
  );
  for (const t of threads) events.push(`Thread from ${t.seat}: ${String(t.body).slice(0, 300)}`);
  const meetings = await q.query<Pick<MeetingsRow, 'id' | 'title'>>(
    `select id, title from meetings where $1 = any (attendees) and (status = 'live' or (status = 'scheduled' and coalesce(starts_at, created_at) <= $2::timestamptz + interval '10 minutes'))`,
    [seat, now.toISOString()],
  );
  for (const m of meetings) events.push(`Meeting: ${m.title} (${m.id})`);
  const signals = new Set<Signal>([...CADENCES.filter((c) => c.seat === seat).flatMap((c) => c.signals), ...extra]);
  if (signals.has('approvals-decided')) {
    const [r] = await q.query<{ n: number }>(`select count(*)::int as n from approvals where decided_at > $1 and status <> 'pending'`, [since.toISOString()]);
    if (r.n) events.push(`${r.n} approvals decided since the last look`);
  } else {
    const own = await q.query<Pick<ApprovalsRow, 'ref' | 'title' | 'status'>>(`select ref, title, status from approvals where proposed_by = $1 and decided_at > $2 limit 5`, [seat, since.toISOString()]);
    for (const a of own) events.push(`Your proposal ${a.ref} was ${a.status}: ${a.title}`);
  }
  if (signals.has('trials')) {
    const [r] = await q.query<{ n: number }>(`select count(*)::int as n from trial_requests where created_at > $1 and status = 'new'`, [since.toISOString()]);
    if (r.n) events.push(`${r.n} new trial requests`);
  }
  if (signals.has('support')) {
    const [r] = await q.query<{ n: number }>(`select count(*)::int as n from help_requests h where h.org_id is not null and h.created_at > $1`, [since.toISOString()]);
    if (r.n) events.push(`${r.n} new support requests`);
  }
  if (signals.has('security') || signals.has('usage')) {
    const alerts = await q.query<Pick<CompanyLogRow, 'body' | 'ref'>>(`select body, ref from company_log where kind = 'alert' and id > $1 order by id limit 10`, [seen]);
    for (const a of alerts) {
      const isUsage = String(a.ref ?? '').startsWith('budget80:');
      if ((isUsage && signals.has('usage')) || (!isUsage && signals.has('security'))) events.push(`Alert: ${a.body}`);
    }
  }
  const local = localParts(now);
  const lastLocal = ranAt ? localParts(ranAt) : null;
  if (signals.has('daily') && lastLocal?.date !== local.date) events.push('Daily run due');
  if (signals.has('monday') && local.dow === 1 && lastLocal?.date !== local.date) events.push('Monday review due');
  if (signals.has('month-start') && local.day <= 3 && lastLocal?.date.slice(0, 7) !== local.date.slice(0, 7)) events.push('Month start due');

  const [top] = await q.query('select coalesce(max(id), 0) as id from company_log');
  return { seat, run: events.length > 0, reason: events.length ? 'events' : 'nothing-new', events, seenLog: Number(top.id) };
}

async function mark(q: Q, seat: string, now: Date, r: { result: string; ran: boolean; seenLog?: number }) {
  await q.query(
    `insert into agent_wakes (seat, checked_at, seen_log, ran_at, last_result, skipped, ran) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (seat) do update set checked_at = excluded.checked_at, seen_log = greatest(agent_wakes.seen_log, excluded.seen_log),
       ran_at = coalesce(excluded.ran_at, agent_wakes.ran_at), last_result = excluded.last_result,
       skipped = agent_wakes.skipped + excluded.skipped, ran = agent_wakes.ran + excluded.ran`,
    [seat, now.toISOString(), r.seenLog ?? 0, r.ran ? now.toISOString() : null, r.result, r.ran ? 0 : 1, r.ran ? 1 : 0],
  );
}

/** Wake one seat: pre-check, then (only with news) a run whose report goes to the log. "force" is the owner's "Şimdi başlat". */
export async function wake(deps: Deps, seat: string, opts: { force?: boolean; signals?: Signal[] } = {}): Promise<{ check: PreCheck; run: RunResult | null }> {
  const now = nowOf(deps);
  const check = await deps.db.system((q) => precheck(q, seat, now, opts.signals));
  const blocked = ['paused', 'inactive', 'dormant', 'human', 'no-seat'].includes(check.reason);
  if (!check.run && (blocked || !opts.force)) {
    if (check.reason !== 'no-seat') await deps.db.system((q) => mark(q, seat, now, { result: check.reason === 'nothing-new' ? 'skipped' : check.reason, ran: false, seenLog: check.seenLog }));
    return { check, run: null };
  }
  const text = check.events.length ? `What changed since you last looked:\n${check.events.map((e) => `- ${e}`).join('\n')}\n\nDo your job on these. Report in at most 10 lines.` : 'The CEO asked you to start now. Check your queue and report in at most 10 lines.';
  const r = await run(deps, { seat, context: 'wake', text });
  await deps.db.system(async (q) => {
    if (r.status === 'ok' && r.reply.trim()) await writeLog(q, seat, { kind: 'report', body: r.reply.slice(0, 8000) }).catch(() => undefined);
    // Queued tasks the run saw are now its own to carry: they move to running.
    if (r.status === 'ok') await q.query(`update agent_tasks set status = 'running' where seat = $1 and status = 'queued'`, [seat]);
    await mark(q, seat, now, { result: r.status === 'ok' ? 'ran' : r.status, ran: r.status === 'ok', seenLog: check.seenLog });
    if (r.status === 'ok') await q.query('update agents set last_summary = $2 where seat = $1', [seat, r.reply.slice(0, 2000)]);
  });
  return { check, run: r };
}

/** Does a five-field cron match this minute (Europe/Istanbul)? */
export function cronMatches(cron: string, at: Date): boolean {
  const [mi, ho, dom, mon, dow] = cron.trim().split(/\s+/);
  const l = localParts(at);
  const month = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, month: 'numeric' }).format(at));
  const field = (f: string, v: number) =>
    f === '*' ||
    f.split(',').some((part) => {
      const step = /^\*\/(\d+)$/.exec(part);
      if (step) return v % Number(step[1]) === 0;
      const r = /^(\d+)-(\d+)$/.exec(part);
      if (r) return v >= Number(r[1]) && v <= Number(r[2]);
      return Number(part) === v;
    });
  return field(mi, l.minute) && field(ho, l.hour) && field(dom, l.day) && field(mon, month) && field(dow, l.dow);
}

/**
 * One tick of the clock: every cadence due this minute wakes its seat (pre-check first).
 * The scheduled task that calls it runs every few minutes; `window` covers the minutes since the last call.
 */
export async function tick(deps: Deps, windowMin = 1): Promise<{ seat: string; ran: boolean; reason: string }[]> {
  const now = nowOf(deps);
  const due = new Set<string>();
  for (let i = 0; i < Math.max(1, Math.min(windowMin, 60)); i++) {
    const at = new Date(now.getTime() - i * 60_000);
    for (const c of CADENCES) if (cronMatches(c.cron, at)) due.add(c.seat);
  }
  // Seats with work in their queue wake too (on-call seats have no cadence).
  const queued = await deps.db.system((q) => q.query<{ seat: string }>(`select distinct seat from agent_tasks where status = 'queued'`));
  for (const r of queued) due.add(r.seat);
  const out: { seat: string; ran: boolean; reason: string }[] = [];
  for (const seat of due) {
    const r = await wake(deps, seat);
    out.push({ seat, ran: !!r.run, reason: r.run ? r.run.status : r.check.reason });
  }
  return out;
}
