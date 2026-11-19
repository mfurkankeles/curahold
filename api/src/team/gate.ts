// The approval gate, enforced in code.
//
// 1. Proposing (guardProposal, called by lib/office.ts propose() for every
//    proposal from any door): the kind must be known and on the seat's card;
//    kinds that need a second pair of eyes carry a review written in the log
//    by another seat allowed to review that kind; the text passes the output
//    checks. Anything else is refused, audited and counted by the monitor —
//    an attempt at an outside kind the seat may not propose pauses it at once.
// 2. Running (executeApproved): only an approval the owner decided in his own
//    console session (decided_by = the console owner, status approved), never
//    one its proposer decided, with its review still valid, through a runner
//    registered by the server. Runners hold the credentials; agents never do —
//    no agent tool, key or route reaches a runner.
import type { Deps } from '../context';
import type { Q } from '../db';
import type { Approval, ApprovalProposal } from '../../../shared/src/office';
import { isExternal, isKnownKind, NEEDS_REVIEW, type ExternalKind } from '../../../shared/src/team/gate';
import { blocks, screen, type Finding } from '../../../shared/src/team/checks';
import { APPROVED_ACTIONS, auditLine, OWNER_SEAT } from '../lib/office';
import { fail } from '../lib/errors';
import { seatPolicy } from './policy';
import { GateRefusal } from './monitor';

/** Inputs for the output checks that come from the installation (never hard-coded). */
export async function checkOptions(deps: Pick<Deps, 'config'>, q: Q) {
  const orgs = await q.query<{ name: string }>('select o.name from orgs o order by o.created_at desc limit 5000');
  const base = deps.config.baseDomain;
  return {
    blockedNames: deps.config.assistant?.blockedNames ?? [],
    companyNames: orgs.map((o) => o.name),
    ownDomains: [base],
    knownHosts: [base],
  };
}

export async function screenTexts(deps: Pick<Deps, 'config'>, q: Q, texts: (string | null | undefined)[], external: boolean): Promise<Finding[]> {
  const f = screen(texts, await checkOptions(deps, q));
  // Anything that leaves the company may never name a competitor.
  return external ? f.map((x) => (x.rule === 'competitor' ? { ...x, severity: 'block' as const } : x)) : f;
}

/** A review recorded in the log: { kind: 'report', ref: 'review:<kind>', meta: { review: { verdict: 'approve' } } } by another seat. */
async function reviewOk(q: Q, proposer: string, kind: ExternalKind, action: ApprovalProposal['action']) {
  const need = NEEDS_REVIEW[kind];
  if (!need) return { ok: true as const };
  const by = typeof action.reviewedBy === 'string' ? action.reviewedBy : null;
  const ref = Number(action.reviewLog);
  if (!by || !Number.isInteger(ref)) return { ok: false as const, why: `needs a review by ${need.reviewers.join(' or ')}` };
  if (by === proposer) return { ok: false as const, why: 'a seat cannot review its own proposal' };
  if (!need.reviewers.includes(by)) return { ok: false as const, why: `${by} may not review ${kind}` };
  const reviewer = await seatPolicy(q, by);
  if (!reviewer || !reviewer.reviews.has(kind)) return { ok: false as const, why: `${by} may not review ${kind}` };
  const [log] = await q.query(`select seat, meta from company_log where id = $1 and kind = 'report'`, [ref]);
  if (!log || log.seat !== by || log.meta?.review?.verdict !== 'approve' || log.meta?.review?.kind !== kind) return { ok: false as const, why: 'review not found in the log' };
  return { ok: true as const };
}

/**
 * Every proposal passes here before it is stored. Returns the output-check
 * findings to show on the card; throws (forbidden / validation) when refused.
 */
export async function guardProposal(deps: Pick<Deps, 'config'>, q: Q, seat: string, p: ApprovalProposal): Promise<Finding[]> {
  const kind = String(p.action?.kind ?? 'none');
  const external = isExternal(kind);
  if (!isKnownKind(kind)) {
    throw new GateRefusal('validation', { fields: ['action'], reason: 'kind' }, seat, 'propose.unknown-kind', { kind });
  }
  if (seat !== OWNER_SEAT) {
    const policy = await seatPolicy(q, seat);
    if (!policy) fail('forbidden');
    if (!policy!.proposes.has(kind as never)) {
      // An outside kind the seat has no right to: an attempt at the gate, paused at once.
      throw new GateRefusal('forbidden', { reason: 'kind', kind }, seat, 'propose.kind', { kind }, external);
    }
    if (external) {
      const r = await reviewOk(q, seat, kind as ExternalKind, p.action);
      if (!r.ok) {
        throw new GateRefusal('forbidden', { reason: 'review', why: r.why }, seat, 'propose.review', { kind, why: r.why });
      }
    }
  }
  const findings = await screenTexts(deps, q, [p.title, p.summary, p.why, p.whatChanges, p.riskNote, p.undoNote, JSON.stringify(p.action)], external);
  if (blocks(findings)) {
    throw new GateRefusal('validation', { fields: ['summary'], reason: 'checks', findings }, seat, 'propose.checks', { rules: findings.filter((f) => f.severity === 'block').map((f) => f.rule) });
  }
  return findings;
}

// ------------------------------------------------------------ the approved path

export type Runner = (deps: Deps, q: Q, a: Approval) => Promise<string>;
const RUNNERS = new Map<ExternalKind, Runner>();

/**
 * The module that can carry out an outside action (deploy, send, spend…)
 * registers its runner here, with credentials it reads from the server's own
 * environment. Registration also wires b3's decide(): a yes runs it at once.
 */
export function registerRunner(kind: ExternalKind, run: Runner) {
  RUNNERS.set(kind, run);
  APPROVED_ACTIONS[kind] = (deps, q, a) => runChecked(deps, q, a, run);
}
export const hasRunner = (kind: string) => RUNNERS.has(kind as ExternalKind);

async function runChecked(deps: Deps, q: Q, a: Approval, run: Runner): Promise<string> {
  // The decision as stored (not as the caller passed it): approved, by the console owner, not by its proposer.
  const [d] = await q.query<{ status: string; decided_by: string | null; proposed_by: string }>('select status, decided_by, proposed_by from approvals where id = $1', [a.id]);
  const owner = consoleOwner(deps);
  if (!d || d.status !== 'approved') throw new Error('not approved');
  if (!owner || (d.decided_by ?? '').toLowerCase() !== owner) throw new Error('not decided by the owner');
  if ((d.decided_by ?? '').toLowerCase() === d.proposed_by.toLowerCase()) throw new Error('separation of duties: proposer decided');
  if (isExternal(a.action.kind) && a.proposedBy !== OWNER_SEAT) {
    const r = await reviewOk(q, a.proposedBy, a.action.kind as ExternalKind, a.action);
    if (!r.ok) throw new Error(`review: ${r.why}`);
  }
  await auditLine(q, { seat: a.proposedBy, actor: 'system', what: `execute.${a.action.kind}`, target: a.ref, detail: { by: a.decidedBy } });
  return run(deps, q, a);
}

export const consoleOwner = (deps: Pick<Deps, 'config'>) => (deps.config.owner ?? deps.config.support?.staff?.[0] ?? '').toLowerCase() || null;

/**
 * Run an approval that was approved before its runner existed (status
 * "approved"). Only the owner's console route calls this.
 */
export async function executeApproved(deps: Deps, id: string, ownerEmail: string): Promise<{ status: string; result: string }> {
  return deps.db.system(async (q) => {
    const [row] = await q.query('select * from approvals where id = $1 for update', [id]);
    if (!row) fail('not_found');
    if (row.status !== 'approved') fail('conflict');
    if (ownerEmail.toLowerCase() !== consoleOwner(deps)) fail('forbidden');
    const kind = String(row.action?.kind ?? 'none');
    const run = RUNNERS.get(kind as ExternalKind) ?? (APPROVED_ACTIONS[kind] && !isExternal(kind) ? APPROVED_ACTIONS[kind] : undefined);
    if (!run) fail('conflict', { reason: 'no runner' }, { reason: 'no-runner' });
    const a: Approval = {
      id: String(row.id),
      ref: row.ref,
      title: row.title,
      summary: row.summary,
      why: row.why,
      whatChanges: row.what_changes,
      proposedBy: row.proposed_by,
      discussedWith: row.discussed_with ?? [],
      risk: row.risk,
      riskNote: row.risk_note,
      costUsd: row.cost_usd,
      usageTokens: row.usage_tokens,
      reversible: row.reversible,
      undoNote: row.undo_note,
      link: row.link,
      meeting: row.meeting,
      priority: row.priority,
      action: row.action,
      status: row.status,
      decidedAt: row.decided_at,
      decidedBy: row.decided_by,
      decisionNote: row.decision_note,
      edited: row.edited,
      result: row.result,
      resultAt: row.result_at,
      createdAt: row.created_at,
    };
    let status = 'done';
    let result: string;
    try {
      result = isExternal(kind) ? await runChecked(deps, q, a, run!) : await run!(deps, q, a);
    } catch (e) {
      status = 'failed';
      result = String((e as Error).message);
    }
    await q.query('update approvals set status = $2, result = $3, result_at = now() where id = $1', [id, status, result.slice(0, 4000)]);
    return { status, result };
  });
}
