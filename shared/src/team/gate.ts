// The approval gate's vocabulary: what an agent may propose, which proposals
// reach outside the company, and who must have reviewed what before the owner
// can say yes. Agents only ever PROPOSE; an action with an effect outside the
// company runs only through the approved path (api/src/team/gate.ts), after
// the owner's own decision, with credentials only the server holds.

/** Internal kinds: they change nothing outside the company (a decision on record, work for a seat). */
export const INTERNAL_KINDS = ['none', 'queue-task', 'memory-update'] as const;

/**
 * Kinds with an effect outside the company or on its accounts. No agent holds
 * credentials for any of them; each runs only after the owner's yes.
 */
export const EXTERNAL_KINDS = [
  'deploy', // go-live of a build
  'merge', // a branch into main
  'send-email', // to a customer, prospect, investor or anyone outside
  'send-message', // chat apps, social direct messages
  'publish-post', // social media, blog, press, site content
  'spend', // any payment or purchase
  'ad-campaign', // creating or changing an ad campaign or its budget
  'settings-change', // product or console settings
  'account-change', // accounts, access, keys, subscriptions
  'schedule-change', // scheduled tasks and cadences
  'delete-data', // any deletion
  'contract', // signing or sending terms
  'security-rule-change', // monitoring rules, limits, protections
] as const;

export type InternalKind = (typeof INTERNAL_KINDS)[number];
export type ExternalKind = (typeof EXTERNAL_KINDS)[number];
export type ActionKind = InternalKind | ExternalKind;
export const ACTION_KINDS: readonly ActionKind[] = [...INTERNAL_KINDS, ...EXTERNAL_KINDS];

/**
 * Whether an action kind reaches outside or cannot be undone lightly (deploy, merge, mail, posts, spend, contracts,
 * deleting data, security rules): those need a review and the owner's approval (ADR 0011).
 */
export const isExternal = (kind: string): kind is ExternalKind => (EXTERNAL_KINDS as readonly string[]).includes(kind);
/** Whether an action kind exists at all; unknown kinds are refused by the gate. */
export const isKnownKind = (kind: string): kind is ActionKind => (ACTION_KINDS as readonly string[]).includes(kind);

/**
 * Separation of duties: these kinds need a review by another seat, recorded
 * before the proposal, and the reviewer can never be the proposer. The owner
 * still decides; the review only makes the proposal eligible.
 */
export const NEEDS_REVIEW: Partial<Record<ExternalKind, { reviewers: string[]; why: string }>> = {
  merge: { reviewers: ['release-reliability', 'security-engineer'], why: 'code is reviewed by QA or AppSec, never by its author' },
  deploy: { reviewers: ['release-reliability'], why: 'the release gate passed' },
  'publish-post': { reviewers: ['growth-lead', 'trust-lead'], why: 'brand and claims checked' },
  'send-email': { reviewers: ['growth-lead', 'cco', 'coo', 'trust-lead'], why: 'a second pair of eyes on anything that leaves' },
  'ad-campaign': { reviewers: ['cfo', 'growth-lead'], why: 'budget and targeting checked' },
  spend: { reviewers: ['cfo'], why: 'the finance lead checked the cost' },
  contract: { reviewers: ['trust-lead', 'cfo'], why: 'legal and finance read it' },
  // The security team cannot change its own rules alone.
  'security-rule-change': { reviewers: ['cto', 'coo'], why: 'someone outside the security team agrees' },
};

/** Tools the agent runtime knows. A seat gets only those its card lists (least privilege). */
export const TOOL_IDS = [
  'log.read', // its own slice of the company log
  'log.write', // notes and reports into the log
  'thread.ask', // ask another seat in a log thread (short: ask / context / deadline)
  'task.create', // work for another seat (or itself)
  'memory.write', // its own memory
  'approval.propose', // a proposal for the owner
  'meeting.call', // set a meeting (COO and executives)
  'data.team', // seats, queues and weekly usage
  'data.business', // company counts, trials, paying, plan targets (numbers only)
  'data.trials', // trial requests summary (no personal data)
  'data.support', // support volume and waiting requests (no message bodies)
  'data.security', // alerts, pauses, refused actions
] as const;
export type ToolId = (typeof TOOL_IDS)[number];

/** The read tools: each call is counted for the over-reach rule. */
export const DATA_TOOLS: readonly ToolId[] = ['data.team', 'data.business', 'data.trials', 'data.support', 'data.security'];
