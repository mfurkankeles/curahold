// The AI team's shared data model (shared/src/office.ts), read and written
// over the owner connection. Two doors use it: the owner console (his session,
// routes/office.ts officeRoutes) and the agents (a seat's own key,
// routes/office.ts agentRoutes). Only the first can decide an approval.
import type { Deps } from '../context';
import type { Q, Row } from '../db';
import type { Approval, ApprovalProposal, AuditLine, LogEntry, LogKind, Meeting, MeetingLine, MeetingMinutes, Pause, Seat } from '../../../shared/src/office';
import { weekOf } from '../../../shared/src/office';
import { fail } from './errors';
import { guardProposal } from '../team/gate';

const iso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));
const num = (v: unknown) => Number(v) || 0;
const isoAt = (v: unknown): string => iso(v) ?? '';

/** The seat whose words are the owner's own (meeting lines, log entries he writes). */
export const OWNER_SEAT = 'owner';

// ------------------------------------------------------------ audit, pauses

export async function auditLine(q: Q, line: { seat: string; actor: AuditLine['actor']; what: string; target?: string | null; detail?: Record<string, unknown> }) {
  await q.query('insert into agent_audit (seat, actor, action, target, detail) values ($1, $2, $3, $4, $5)', [
    line.seat,
    line.actor,
    line.what.slice(0, 80),
    line.target?.slice(0, 300) ?? null,
    JSON.stringify(line.detail ?? {}),
  ]);
}

/** Is this seat paused (its own switch, its team's, or everyone's)? */
export async function isPaused(q: Q, seat: string): Promise<boolean> {
  const [r] = await q.query(
    `select 1 from agent_pauses p where p.resumed_at is null
        and (p.scope = 'all' or (p.scope = 'seat' and p.target = $1) or (p.scope = 'team' and p.target = (select team from seats where seat = $1))) limit 1`,
    [seat],
  );
  return !!r;
}

/** The pauses in force for the AI team, newest first. */
export async function listPauses(deps: Pick<Deps, 'db'>): Promise<Pause[]> {
  const rows = await deps.db.system((q) => q.query('select * from agent_pauses where resumed_at is null order by paused_at desc'));
  return rows.map((r) => ({ id: String(r.id), scope: r.scope, target: r.target ?? null, reason: r.reason ?? null, pausedAt: isoAt(r.paused_at), pausedBy: String(r.paused_by) }));
}

/** Pauses all, a team or a seat (no duplicate for the same scope and target) and records who and why (ADR 0011). */
export async function pause(q: Q, scope: Pause['scope'], target: string | null, by: string, reason: string | null) {
  const [open] = await q.query(`select id from agent_pauses where resumed_at is null and scope = $1 and target is not distinct from $2`, [scope, target]);
  if (open) return String(open.id);
  const [r] = await q.query<{ id: string }>('insert into agent_pauses (scope, target, reason, paused_by) values ($1, $2, $3, $4) returning id', [scope, target, reason, by]);
  await auditLine(q, { seat: target ?? 'all', actor: by.includes('@') ? 'owner' : 'system', what: 'pause', target: `${scope}:${target ?? '*'}`, detail: { reason } });
  await q.query(`insert into company_log (seat, kind, body, ref) values ('system', 'alert', $1, $2)`, [`Paused ${scope}${target ? ` ${target}` : ''}${reason ? `: ${reason}` : ''}`, `pause:${r.id}`]);
  return r.id;
}

/** Lifts a pause and records who lifted it; 'not_found' for one already lifted. */
export async function resume(q: Q, id: string, by: string) {
  const [r] = await q.query('update agent_pauses set resumed_at = now(), resumed_by = $2 where id = $1 and resumed_at is null returning scope, target', [id, by]);
  if (!r) fail('not_found');
  await auditLine(q, { seat: r.target ?? 'all', actor: 'owner', what: 'resume', target: `${r.scope}:${r.target ?? '*'}` });
}

// ------------------------------------------------------------ seats

const seatOf = (r: Row, pausedSeats: Set<string>, allPaused: boolean, pausedTeams: Set<string>): Seat => ({
  seat: r.seat,
  title: r.title,
  titleTr: r.title_tr ?? '',
  team: r.team,
  reportsTo: r.reports_to ?? null,
  tier: r.tier,
  state: r.state,
  filledBy: r.filled_by,
  humanEmail: r.human_email ?? null,
  cadence: r.cadence ?? null,
  weeklyBudget: num(r.weekly_budget),
  wakeTrigger: r.wake_trigger ?? null,
  card: r.card ?? {},
  hasKey: !!r.key_hash,
  agent: r.agent_id
    ? { id: String(r.agent_id), name: r.agent_name, avatar: r.avatar ?? null, model: r.model ?? null, effort: r.effort ?? null, lastRunAt: iso(r.last_run_at), nextRunAt: iso(r.next_run_at), lastSummary: r.last_summary ?? null }
    : null,
  usage: { tokens: num(r.tokens), costUsd: num(r.cost_usd), runs: num(r.runs) },
  paused: allPaused || pausedSeats.has(r.seat) || pausedTeams.has(r.team),
  queue: { queued: num(r.queued), running: num(r.running), blocked: num(r.blocked) },
});

/** Every AI seat (or one) with its state, usage this week and budget. */
export async function listSeats(deps: Pick<Deps, 'db'>, now: Date, only?: string): Promise<Seat[]> {
  return deps.db.system(async (q) => {
    const rows = await q.query(
      `select s.*, a.id as agent_id, a.name as agent_name, a.avatar, a.model, a.effort, a.last_run_at, a.next_run_at, a.last_summary,
              u.tokens, u.cost_usd, u.runs,
              (select count(*) from agent_tasks t where t.seat = s.seat and t.status = 'queued') as queued,
              (select count(*) from agent_tasks t where t.seat = s.seat and t.status = 'running') as running,
              (select count(*) from agent_tasks t where t.seat = s.seat and t.status = 'blocked') as blocked
         from seats s left join agents a on a.seat = s.seat left join agent_usage u on u.seat = s.seat and u.week = $1::date
        ${only ? 'where s.seat = $2' : ''}
        order by array_position(array['ceo-office','executive','lead','specialist','note-taker','advisor'], s.tier), s.team, s.seat`,
      only ? [weekOf(now), only] : [weekOf(now)],
    );
    const pauses = await q.query('select scope, target from agent_pauses where resumed_at is null');
    const all = pauses.some((p) => p.scope === 'all');
    const seats = new Set(pauses.filter((p) => p.scope === 'seat').map((p) => String(p.target)));
    const teams = new Set(pauses.filter((p) => p.scope === 'team').map((p) => String(p.target)));
    return rows.map((r) => seatOf(r, seats, all, teams));
  });
}

export interface SeatInput {
  seat: string;
  title: string;
  titleTr?: string;
  team: string;
  reportsTo?: string | null;
  tier: Seat['tier'];
  state?: Seat['state'];
  filledBy?: Seat['filledBy'];
  humanEmail?: string | null;
  cadence?: string | null;
  weeklyBudget?: number;
  wakeTrigger?: string | null;
  card?: Seat['card'];
  agent?: { name: string; avatar?: string | null; model?: string | null; effort?: string | null } | null;
}

/** Creates or updates a seat's card from the owner's edit. */
export async function upsertSeat(q: Q, s: SeatInput, by: string) {
  await q.query(
    `insert into seats (seat, title, title_tr, team, reports_to, tier, state, filled_by, human_email, cadence, weekly_budget, wake_trigger, card)
     values ($1, $2, $3, $4, $5, $6, coalesce($7, 'on-call'), coalesce($8, 'agent'), $9, $10, coalesce($11, 0), $12, coalesce($13, '{}'::jsonb))
     on conflict (seat) do update set title = excluded.title, title_tr = excluded.title_tr, team = excluded.team, reports_to = excluded.reports_to,
       tier = excluded.tier, state = excluded.state, filled_by = excluded.filled_by, human_email = excluded.human_email, cadence = excluded.cadence,
       weekly_budget = excluded.weekly_budget, wake_trigger = excluded.wake_trigger, card = excluded.card, updated_at = now()`,
    [s.seat, s.title, s.titleTr ?? '', s.team, s.reportsTo ?? null, s.tier, s.state ?? null, s.filledBy ?? null, s.humanEmail ?? null, s.cadence ?? null, s.weeklyBudget ?? null, s.wakeTrigger ?? null, s.card ? JSON.stringify(s.card) : null],
  );
  if (s.agent) {
    const [had] = await q.query('select id from agents where seat = $1', [s.seat]);
    if (had) await q.query('update agents set name = $2, avatar = $3, model = $4, effort = $5 where id = $1', [had.id, s.agent.name, s.agent.avatar ?? null, s.agent.model ?? null, s.agent.effort ?? null]);
    else await q.query('insert into agents (seat, name, avatar, model, effort) values ($1, $2, $3, $4, $5)', [s.seat, s.agent.name, s.agent.avatar ?? null, s.agent.model ?? null, s.agent.effort ?? null]);
  }
  await auditLine(q, { seat: s.seat, actor: 'owner', what: 'seat.saved', target: s.seat, detail: { by } });
}

/**
 * Hand a seat over ("Koltuğu devret"): to a person, a person with the agent as assistant, or back to an agent.
 * Returns the handover pack: the card, open work, memory and the latest log, so nothing lives only in an agent's head.
 */
export async function handOver(q: Q, seat: string, to: { filledBy: Seat['filledBy']; humanEmail: string | null }, by: string) {
  const [s] = await q.query('update seats set filled_by = $2, human_email = $3, updated_at = now() where seat = $1 returning *', [seat, to.filledBy, to.humanEmail]);
  if (!s) fail('not_found');
  // A person who takes the seat alone takes it from the agent: the agent leaves the seat (its history stays).
  if (to.filledBy === 'human') await q.query('update agents set seat = null where seat = $1', [seat]);
  // The seat's key moves with it: an old key stops working at handover; a new one is issued when needed.
  await q.query('update seats set key_hash = null where seat = $1', [seat]);
  const tasks = await q.query(`select id, title, status, priority, due_at from agent_tasks where seat = $1 and status in ('queued', 'running', 'blocked') order by created_at`, [seat]);
  const memory = await q.query('select key, value from agent_memory where seat = $1 order by key', [seat]);
  const log = await q.query('select at, kind, body, ref from company_log where seat = $1 order by at desc limit 50', [seat]);
  await auditLine(q, { seat, actor: 'owner', what: 'seat.handover', target: seat, detail: { filledBy: to.filledBy, by } });
  await q.query(`insert into company_log (seat, kind, body) values ($1, 'handoff', $2)`, [seat, `Seat handed over: ${to.filledBy}${to.humanEmail ? ` (${to.humanEmail})` : ''}`]);
  return { seat: { seat: s.seat, title: s.title, titleTr: s.title_tr, team: s.team, reportsTo: s.reports_to, card: s.card }, openWork: tasks, memory, recentLog: log };
}

// ------------------------------------------------------------ approvals

const approvalOf = (r: Row): Approval => ({
  id: String(r.id),
  ref: String(r.ref),
  title: r.title,
  summary: r.summary,
  why: r.why,
  whatChanges: r.what_changes,
  proposedBy: r.proposed_by,
  discussedWith: r.discussed_with ?? [],
  risk: r.risk,
  riskNote: r.risk_note ?? null,
  costUsd: r.cost_usd == null ? null : Number(r.cost_usd),
  usageTokens: r.usage_tokens == null ? null : Number(r.usage_tokens),
  reversible: !!r.reversible,
  undoNote: r.undo_note ?? null,
  link: r.link ?? null,
  meeting: r.meeting ? String(r.meeting) : null,
  priority: r.priority,
  action: r.action ?? { kind: 'none' },
  status: r.status,
  decidedAt: iso(r.decided_at),
  decidedBy: r.decided_by ?? null,
  decisionNote: r.decision_note ?? null,
  edited: r.edited ?? null,
  result: r.result ?? null,
  resultAt: iso(r.result_at),
  createdAt: isoAt(r.created_at),
  checks: r.checks ?? null,
});

/** Text that must never reach the owner's queue (or the log): keys, tokens, private keys. */
const SECRET = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk_(live|test)_[A-Za-z0-9]{10,}|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{20,}|\bxox[abpr]-[A-Za-z0-9-]{10,}|\bag_[a-z0-9-]+_[A-Za-z0-9_-]{20,})/;
/**
 * Whether any text looks like a key, token or password. Proposals, log lines and meeting lines containing one are refused,
 * so a secret never lands in the log or in front of the owner by accident.
 */
export const hasSecret = (...texts: (string | null | undefined)[]) => texts.some((t) => !!t && SECRET.test(t));

/**
 * Files a proposal for the owner. Goes through the approval gate (team/gate.ts guardProposal): known kind, on the seat's
 * card, review for outside kinds, output checks. Returns its id and reference (ADR 0011).
 */
export async function propose(q: Q, seat: string, p: ApprovalProposal, deps?: Pick<Deps, 'config'>): Promise<{ id: string; ref: string }> {
  if (hasSecret(p.title, p.summary, p.why, p.whatChanges, p.riskNote, p.undoNote, JSON.stringify(p.action))) fail('validation', { fields: 'secret' }, { fields: ['summary'], reason: 'secret' });
  // The approval gate (team/gate.ts): kind on the seat's card, review for outside kinds, output checks.
  const checks = await guardProposal(deps ?? { config: { baseDomain: '' } as Deps['config'] }, q, seat, p);
  const [r] = await q.query<{ id: string; ref: string }>(
    `insert into approvals (title, summary, why, what_changes, proposed_by, discussed_with, risk, risk_note, cost_usd, usage_tokens, reversible, undo_note, link, meeting, priority, action, checks)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) returning id, ref`,
    [p.title, p.summary, p.why, p.whatChanges, seat, p.discussedWith, p.risk, p.riskNote ?? null, p.costUsd ?? null, p.usageTokens ?? null, p.reversible, p.undoNote ?? null, p.link ?? null, p.meeting ?? null, p.priority, JSON.stringify(p.action), checks.length ? JSON.stringify(checks) : null],
  );
  await q.query(`insert into company_log (seat, kind, body, ref) values ($1, 'decision', $2, $3)`, [seat, `Proposed for approval: ${p.title}`, r.ref]);
  return r;
}

/** Approvals by status, optionally one seat's, newest first. */
export async function listApprovals(deps: Pick<Deps, 'db'>, status: Approval['status'] | 'open' | 'all', seat?: string): Promise<Approval[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (status === 'open') where.push(`status = 'pending'`);
  else if (status !== 'all') where.push(`status = $${args.push(status)}`);
  if (seat) where.push(`proposed_by = $${args.push(seat)}`);
  const rows = await deps.db.system((q) =>
    q.query(
      `select * from approvals ${where.length ? `where ${where.join(' and ')}` : ''}
        order by (status = 'pending') desc, array_position(array['urgent','normal','low'], priority), created_at limit 300`,
      args,
    ),
  );
  return rows.map(approvalOf);
}

/**
 * What runs after the owner's yes, by the action's kind. Built in: "none" (a decision only, written to
 * the log) and "queue-task" (work for a seat). Other kinds are added by the module that can run them
 * (deploy, send, spend…); with no runner yet the approval stays "approved" until one picks it up.
 */
export const APPROVED_ACTIONS: Record<string, (deps: Deps, q: Q, a: Approval) => Promise<string>> = {
  none: async () => 'Decision recorded.',
  'queue-task': async (_deps, q, a) => {
    const seat = String(a.action.seat ?? a.proposedBy);
    const title = String(a.action.title ?? a.title).slice(0, 300);
    const [s] = await q.query('select 1 from seats where seat = $1', [seat]);
    if (!s) throw new Error(`no seat ${seat}`);
    await q.query(`insert into agent_tasks (seat, title, detail, priority, from_seat) values ($1, $2, $3, $4, 'owner')`, [seat, title, a.whatChanges || null, a.priority]);
    return `Queued for ${seat}: ${title}`;
  },
};

export type Decision = { decision: 'approve'; edits?: Approval['edited']; note?: string | null } | { decision: 'reject'; note?: string | null } | { decision: 'meeting'; note?: string | null };

/** The owner decides. The caller has checked it is the owner's own console session; nobody else reaches this. */
export async function decide(deps: Deps, id: string, owner: string, d: Decision): Promise<Approval> {
  return deps.db.system(async (q) => {
    const [row] = await q.query('select * from approvals where id = $1 for update', [id]);
    if (!row) fail('not_found');
    if (row.status !== 'pending') fail('conflict');
    let a = approvalOf(row);
    if (d.decision === 'reject') {
      await q.query(`update approvals set status = 'rejected', decided_at = now(), decided_by = $2, decision_note = $3 where id = $1`, [id, owner, d.note ?? null]);
      await q.query(`insert into company_log (seat, kind, body, ref) values ('owner', 'decision', $1, $2)`, [`Rejected: ${a.title}${d.note ? ` — ${d.note}` : ''}`, a.ref]);
    } else if (d.decision === 'meeting') {
      const [m] = await q.query<{ id: string }>(
        `insert into meetings (title, goal, called_by, with_owner, attendees) values ($1, $2, 'owner', true, $3) returning id`,
        [a.title.slice(0, 200), a.summary || null, [...new Set([a.proposedBy, ...a.discussedWith])]],
      );
      await q.query(`update approvals set status = 'meeting', decided_at = now(), decided_by = $2, decision_note = $3, meeting = $4 where id = $1`, [id, owner, d.note ?? null, m.id]);
      await q.query(`insert into company_log (seat, kind, body, ref) values ('owner', 'decision', $1, $2)`, [`Meeting called on: ${a.title}`, a.ref]);
    } else {
      const edits = d.edits && Object.keys(d.edits).length ? d.edits : null;
      if (edits && hasSecret(edits.title, edits.summary, edits.whatChanges)) fail('validation', { fields: 'secret' }, { fields: ['summary'] });
      await q.query(
        `update approvals set status = 'approved', decided_at = now(), decided_by = $2, decision_note = $3, edited = $4,
                title = coalesce($5, title), summary = coalesce($6, summary), what_changes = coalesce($7, what_changes) where id = $1`,
        [id, owner, d.note ?? null, edits ? JSON.stringify(edits) : null, edits?.title ?? null, edits?.summary ?? null, edits?.whatChanges ?? null],
      );
      a = { ...a, ...(edits ?? {}) };
      await q.query(`insert into company_log (seat, kind, body, ref) values ('owner', 'decision', $1, $2)`, [`Approved: ${a.title}`, a.ref]);
      const run = APPROVED_ACTIONS[a.action.kind];
      if (run) {
        try {
          const result = await run(deps, q, a);
          await q.query(`update approvals set status = 'done', result = $2, result_at = now() where id = $1`, [id, result.slice(0, 4000)]);
        } catch (e) {
          await q.query(`update approvals set status = 'failed', result = $2, result_at = now() where id = $1`, [id, String((e as Error).message).slice(0, 4000)]);
        }
      }
    }
    await auditLine(q, { seat: a.proposedBy, actor: 'owner', what: `approval.${d.decision}`, target: a.ref, detail: { by: owner } });
    const [after] = await q.query('select * from approvals where id = $1', [id]);
    return approvalOf(after);
  });
}

// ------------------------------------------------------------ log, memory, audit

const logOf = (r: Row): LogEntry => ({ id: Number(r.id), at: isoAt(r.at), seat: r.seat, kind: r.kind, thread: r.thread ? String(r.thread) : null, body: r.body, ref: r.ref ?? null });

/** Writes a line in the AI team's company log; refused if it contains a secret. */
export async function writeLog(q: Q, seat: string, e: { kind: LogKind; body: string; thread?: string | null; ref?: string | null }) {
  if (hasSecret(e.body, e.ref)) fail('validation', { fields: 'secret' }, { fields: ['body'], reason: 'secret' });
  const [r] = await q.query('insert into company_log (seat, kind, thread, body, ref) values ($1, $2, $3, $4, $5) returning *', [seat, e.kind, e.thread ?? null, e.body, e.ref ?? null]);
  return logOf(r);
}

/** The whole log (owner), or one seat's slice: its own lines, its lead's and its reports', its threads, and every decision and alert. */
export async function readLog(deps: Pick<Deps, 'db'>, opts: { seat?: string; slice?: string; thread?: string; before?: number; limit?: number }): Promise<LogEntry[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.seat) where.push(`seat = $${args.push(opts.seat)}`);
  if (opts.thread) where.push(`thread = $${args.push(opts.thread)}`);
  if (opts.slice) {
    const s = `$${args.push(opts.slice)}`;
    where.push(
      `(seat = ${s} or kind in ('decision', 'alert') or seat in (select seat from seats where reports_to = ${s}) or seat = (select reports_to from seats where seat = ${s})
        or thread in (select thread from company_log where seat = ${s} and thread is not null))`,
    );
  }
  if (opts.before) where.push(`id < $${args.push(opts.before)}`);
  const rows = await deps.db.system((q) =>
    q.query(`select * from company_log ${where.length ? `where ${where.join(' and ')}` : ''} order by id desc limit ${Math.min(opts.limit ?? 100, 500)}`, args),
  );
  return rows.map(logOf);
}

/** The last 200 audit lines of the AI team, optionally one seat's, paged with `before`. */
export async function readAudit(deps: Pick<Deps, 'db'>, opts: { seat?: string; before?: number }): Promise<AuditLine[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.seat) where.push(`seat = $${args.push(opts.seat)}`);
  if (opts.before) where.push(`id < $${args.push(opts.before)}`);
  const rows = await deps.db.system((q) => q.query(`select * from agent_audit ${where.length ? `where ${where.join(' and ')}` : ''} order by id desc limit 200`, args));
  return rows.map((r) => ({ id: Number(r.id), at: isoAt(r.at), seat: r.seat, actor: r.actor, action: r.action, target: r.target ?? null, detail: r.detail ?? {} }));
}

/** Usage after a run; over the weekly budget the seat pauses itself and the COO hears of it. */
export async function addUsage(q: Q, seat: string, now: Date, u: { tokens: number; costUsd: number }) {
  const [r] = await q.query(
    `insert into agent_usage (seat, week, tokens, cost_usd, runs) values ($1, $2::date, $3, $4, 1)
     on conflict (seat, week) do update set tokens = agent_usage.tokens + excluded.tokens, cost_usd = agent_usage.cost_usd + excluded.cost_usd, runs = agent_usage.runs + 1
     returning tokens, (select weekly_budget from seats where seat = $1) as budget`,
    [seat, weekOf(now), Math.max(0, Math.round(u.tokens)), Math.max(0, u.costUsd)],
  );
  await q.query('update agents set last_run_at = $2 where seat = $1', [seat, now.toISOString()]);
  const budget = num(r.budget);
  if (budget > 0 && num(r.tokens) >= budget) {
    await pause(q, 'seat', seat, 'system', 'weekly budget reached');
    return { paused: true, tokens: num(r.tokens), budget };
  }
  if (budget > 0 && num(r.tokens) >= budget * 0.8) {
    const [warned] = await q.query(`select 1 from company_log where seat = 'system' and ref = $1`, [`budget80:${seat}:${weekOf(now)}`]);
    if (!warned) await q.query(`insert into company_log (seat, kind, body, ref) values ('system', 'alert', $1, $2)`, [`${seat} used 80% of its weekly budget`, `budget80:${seat}:${weekOf(now)}`]);
  }
  return { paused: false, tokens: num(r.tokens), budget };
}

// ------------------------------------------------------------ meetings

const meetingOf = (r: Row): Meeting => ({
  id: String(r.id),
  title: r.title,
  goal: r.goal ?? null,
  calledBy: r.called_by,
  withOwner: !!r.with_owner,
  attendees: r.attendees ?? [],
  status: r.status,
  startsAt: iso(r.starts_at),
  timeBoxMin: r.time_box_min == null ? null : Number(r.time_box_min),
  tokenBudget: r.token_budget == null ? null : Number(r.token_budget),
  startedAt: iso(r.started_at),
  endedAt: iso(r.ended_at),
  minutes: r.minutes ?? null,
  createdAt: isoAt(r.created_at),
});

/** Meetings, filtered by whether the owner attends and by seat, newest first. */
export async function listMeetings(deps: Pick<Deps, 'db'>, opts: { withOwner?: boolean; seat?: string }): Promise<Meeting[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.withOwner !== undefined) where.push(`with_owner = $${args.push(opts.withOwner)}`);
  if (opts.seat) where.push(`($${args.push(opts.seat)} = any (attendees) or called_by = $${args.length})`);
  const rows = await deps.db.system((q) => q.query(`select * from meetings ${where.length ? `where ${where.join(' and ')}` : ''} order by created_at desc limit 200`, args));
  return rows.map(meetingOf);
}

/** One meeting with its lines, or null. */
export async function meetingDetail(deps: Pick<Deps, 'db'>, id: string): Promise<{ meeting: Meeting; lines: MeetingLine[] } | null> {
  return deps.db.system(async (q) => {
    const [m] = await q.query('select * from meetings where id = $1', [id]);
    if (!m) return null;
    const lines = await q.query('select id, speaker, body, at from meeting_lines where meeting = $1 order by id limit 2000', [id]);
    return { meeting: meetingOf(m), lines: lines.map((l) => ({ id: Number(l.id), speaker: l.speaker, body: l.body, at: isoAt(l.at) })) };
  });
}

/** Creates a meeting called by `by` with the given attendees and limits. */
export async function createMeeting(q: Q, by: string, m: { title: string; goal?: string | null; attendees: string[]; withOwner: boolean; startsAt?: string | null; timeBoxMin?: number | null; tokenBudget?: number | null }) {
  const [r] = await q.query(
    `insert into meetings (title, goal, called_by, with_owner, attendees, starts_at, time_box_min, token_budget) values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
    [m.title, m.goal ?? null, by, m.withOwner, [...new Set(m.attendees)], m.startsAt ?? null, m.timeBoxMin ?? null, m.tokenBudget ?? null],
  );
  await q.query(`insert into company_log (seat, kind, body, ref) values ($1, 'note', $2, $3)`, [by, `Meeting set: ${m.title}`, `meeting:${r.id}`]);
  return meetingOf(r);
}

/** Adds a line to a meeting; refused if it contains a secret, 'not_found' for an unknown meeting. */
export async function addMeetingLine(q: Q, id: string, speaker: string, text: string) {
  if (hasSecret(text)) fail('validation', { fields: 'secret' }, { fields: ['body'], reason: 'secret' });
  const [m] = await q.query(`select status from meetings where id = $1`, [id]);
  if (!m) fail('not_found');
  if (m.status === 'ended' || m.status === 'cancelled') fail('conflict');
  if (m.status === 'scheduled') await q.query(`update meetings set status = 'live', started_at = now() where id = $1`, [id]);
  const [l] = await q.query('insert into meeting_lines (meeting, speaker, body) values ($1, $2, $3) returning id, speaker, body, at', [id, speaker, text]);
  return { id: Number(l.id), speaker: l.speaker, body: l.body, at: isoAt(l.at) } as MeetingLine;
}

/** The note taker's minutes end the meeting; each proposed decision becomes an approval card (nothing runs before his yes). */
export async function writeMinutes(q: Q, id: string, by: string, minutes: MeetingMinutes, deps?: Pick<Deps, 'config'>) {
  if (hasSecret(JSON.stringify(minutes))) fail('validation', { fields: 'secret' }, { fields: ['minutes'], reason: 'secret' });
  const [m] = await q.query(`update meetings set minutes = $2, status = 'ended', ended_at = coalesce(ended_at, now()) where id = $1 returning *`, [id, JSON.stringify(minutes)]);
  if (!m) fail('not_found');
  const attendees: string[] = m.attendees ?? [];
  const cards = [];
  for (const d of minutes.decisions) {
    cards.push(
      await propose(q, by, {
        title: d.slice(0, 200),
        summary: `${m.title}: ${attendees.join(', ')}`,
        why: minutes.items.map((i) => i.topic).join(' · ').slice(0, 4000),
        whatChanges: d.slice(0, 4000),
        discussedWith: attendees,
        risk: 'low',
        reversible: true,
        meeting: id,
        priority: 'normal',
        action: { kind: 'none' },
      }, deps),
    );
  }
  await q.query(`insert into company_log (seat, kind, body, ref) values ($1, 'report', $2, $3)`, [by, `Minutes: ${m.title} (${minutes.decisions.length} proposals, ${minutes.actions.length} actions)`, `meeting:${id}`]);
  return { meeting: meetingOf(m), approvals: cards };
}
