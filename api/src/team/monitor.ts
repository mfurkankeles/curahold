// Behaviour monitoring: code rules, no model. A seat that reads far more than
// its role needs, burns tokens in a spike, keeps retrying what is refused or
// tries to get around the approval gate is paused at once and the owner is
// alerted (company log alert + the console's Ekip badge). Only the owner
// resumes it (the pause switches in routes/office.ts).
import type { Deps } from '../context';
import type { Q } from '../db';
import { HttpError, type ErrorCode } from '../lib/errors';
import { auditLine, pause } from '../lib/office';

export const RULES = {
  /** Data-tool reads in one hour above this: over-reach. */
  readsPerHour: 40,
  /** Refused tool calls or proposals in one hour at or above this: blocked-action retries. */
  refusalsPerHour: 3,
  /** One run above this share of the weekly budget, or this many times the seat's recent median: a spike. */
  spikeShareOfBudget: 0.35,
  spikeTimesMedian: 4,
} as const;

export type MonitorRule = 'over-reach' | 'refused-retries' | 'gate-bypass' | 'token-spike';

export async function alertAndPause(q: Q, seat: string, rule: MonitorRule, detail: Record<string, unknown>) {
  await auditLine(q, { seat, actor: 'system', what: `monitor.${rule}`, target: seat, detail });
  await q.query(`insert into company_log (seat, kind, body, ref, meta) values ('system', 'alert', $1, $2, $3)`, [
    `${seat} paused by the monitor: ${rule}`,
    `monitor:${rule}:${seat}`,
    JSON.stringify({ rule, seat, ...detail }),
  ]);
  await pause(q, 'seat', seat, 'system', `monitor: ${rule}`);
}

/** A refused action (tool outside the card, a kind it may not propose…): audited, and three in an hour pause it. */
export async function refused(q: Q, seat: string, what: string, detail: Record<string, unknown> = {}) {
  await auditLine(q, { seat, actor: 'agent', what: `refused.${what}`.slice(0, 80), target: seat, detail });
  const [n] = await q.query<{ n: number }>(`select count(*)::int as n from agent_audit where seat = $1 and at > now() - interval '1 hour' and action like 'refused.%'`, [seat]);
  if (n.n >= RULES.refusalsPerHour) await alertAndPause(q, seat, 'refused-retries', { count: n.n, last: what });
}

/** Trying to act instead of propose, or to use another seat's access: paused on the first attempt. */
export async function gateBypass(q: Q, seat: string, detail: Record<string, unknown>) {
  await alertAndPause(q, seat, 'gate-bypass', detail);
}

/** Every data-tool read is counted; past the hourly line the seat pauses. */
export async function countRead(q: Q, seat: string, tool: string) {
  await auditLine(q, { seat, actor: 'agent', what: `read.${tool}`, target: tool });
  const [n] = await q.query<{ n: number }>(`select count(*)::int as n from agent_audit where seat = $1 and at > now() - interval '1 hour' and action like 'read.%'`, [seat]);
  if (n.n > RULES.readsPerHour) {
    await alertAndPause(q, seat, 'over-reach', { reads: n.n });
    return false;
  }
  return true;
}

/** After a run: tokens far above the seat's own normal pause it. */
export async function checkSpike(q: Q, seat: string, tokens: number, weeklyBudget: number) {
  const recent = await q.query<{ t: number }>(`select (detail->>'tokens')::int as t from agent_audit where seat = $1 and action = 'run' order by id desc limit 10`, [seat]);
  await auditLine(q, { seat, actor: 'system', what: 'run', target: seat, detail: { tokens } });
  const sorted = recent.map((r) => Number(r.t) || 0).sort((a, b) => a - b);
  const median = sorted.length >= 3 ? sorted[Math.floor(sorted.length / 2)] : 0;
  const overBudget = weeklyBudget > 0 && tokens > weeklyBudget * RULES.spikeShareOfBudget;
  const overMedian = median > 0 && tokens > median * RULES.spikeTimesMedian;
  if (overBudget || overMedian) {
    await alertAndPause(q, seat, 'token-spike', { tokens, median, weeklyBudget });
    return true;
  }
  return false;
}

/**
 * A refusal raised inside a transaction (which then rolls back): the caller
 * records it afterwards in a transaction of its own (recordRefusal), so the
 * audit line and the pause are never lost with the refused write.
 */
export class GateRefusal extends HttpError {
  constructor(
    code: ErrorCode,
    extra: Record<string, unknown>,
    readonly seat: string,
    readonly what: string,
    readonly detail: Record<string, unknown>,
    /** An outside action the seat has no right to: pause at once. */
    readonly bypass = false,
  ) {
    super(code, {}, extra);
  }
}

export async function recordRefusal(deps: Pick<Deps, 'db'>, e: GateRefusal) {
  await deps.db.system((q) => (e.bypass ? gateBypass(q, e.seat, { what: e.what, ...e.detail }) : refused(q, e.seat, e.what, e.detail)));
}

/** Runs fn in a transaction; a refusal inside it is recorded after the rollback, then thrown on. */
export async function guarded<T>(deps: Pick<Deps, 'db'>, fn: (q: Q) => Promise<T>): Promise<T> {
  try {
    return await deps.db.system(fn);
  } catch (e) {
    if (e instanceof GateRefusal) await recordRefusal(deps, e);
    throw e;
  }
}
