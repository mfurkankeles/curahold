// The AI team's shared data model: seats (roles), the agents in them, their
// queues, the approval queue, the company log, each seat's memory, meetings
// with minutes, the audit trail and the pause switches. The owner console's
// Approvals section and the Office (built separately) read the same API:
//   owner (console session): /api/desk/office/*   — reads everything, decides, pauses
//   agents (a seat's key):   /api/agent/*         — reads its own slice, proposes, writes
// Agents can never approve: a decision needs the owner's console session,
// which the server checks on every decision.

export const SEAT_TIERS = ['ceo-office', 'executive', 'lead', 'specialist', 'advisor', 'note-taker'] as const;
export type SeatTier = (typeof SEAT_TIERS)[number];
export const SEAT_STATES = ['standing', 'on-call', 'dormant'] as const;
export type SeatState = (typeof SEAT_STATES)[number];
export const SEAT_FILLED_BY = ['agent', 'human', 'human-with-agent'] as const;
export type SeatFilledBy = (typeof SEAT_FILLED_BY)[number];

export interface SeatCard {
  mission?: string;
  responsibilities?: string[];
  kpis?: string[];
  inputs?: string[];
  outputs?: string[];
  playbook?: string;
  tools?: string[];
  /** What the seat may read and do; nothing outside it. */
  permissions?: string[];
}

export interface Seat {
  seat: string;
  title: string;
  titleTr: string;
  team: string;
  reportsTo: string | null;
  tier: SeatTier;
  state: SeatState;
  filledBy: SeatFilledBy;
  humanEmail: string | null;
  cadence: string | null;
  weeklyBudget: number;
  wakeTrigger: string | null;
  card: SeatCard;
  hasKey: boolean;
  agent: { id: string; name: string; avatar: string | null; model: string | null; effort: string | null; lastRunAt: string | null; nextRunAt: string | null; lastSummary: string | null } | null;
  usage: { tokens: number; costUsd: number; runs: number };
  /** Paused by its own switch, its team's, or the switch for everyone. */
  paused: boolean;
  queue: { queued: number; running: number; blocked: number };
}

export const TASK_STATUSES = ['queued', 'running', 'done', 'blocked', 'cancelled'] as const;
export type AgentTaskStatus = (typeof TASK_STATUSES)[number];
export const PRIORITIES3 = ['urgent', 'normal', 'low'] as const;
export type Priority3 = (typeof PRIORITIES3)[number];

export interface AgentTask {
  id: string;
  seat: string;
  title: string;
  detail: string | null;
  status: AgentTaskStatus;
  priority: Priority3;
  fromSeat: string | null;
  dueAt: string | null;
  result: string | null;
  createdAt: string;
  doneAt: string | null;
}

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'meeting', 'done', 'failed'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export const RISKS = ['low', 'medium', 'high'] as const;
export type Risk = (typeof RISKS)[number];

/** What an agent sends to propose something. */
export interface ApprovalProposal {
  title: string;
  summary: string;
  why: string;
  whatChanges: string;
  /** Seats it talked to before proposing ("C ile B konuştu"). */
  discussedWith: string[];
  risk: Risk;
  riskNote?: string | null;
  costUsd?: number | null;
  usageTokens?: number | null;
  reversible: boolean;
  undoNote?: string | null;
  /** The conversation or meeting behind it. */
  link?: string | null;
  meeting?: string | null;
  priority: Priority3;
  /** What runs after a yes: { kind, ...payload }. Run only by the approved path, never by the agent. */
  action: { kind: string; [k: string]: unknown };
}

export interface Approval extends Required<Omit<ApprovalProposal, 'action'>> {
  id: string;
  ref: string;
  proposedBy: string;
  action: ApprovalProposal['action'];
  status: ApprovalStatus;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  edited: Partial<Pick<ApprovalProposal, 'title' | 'summary' | 'whatChanges'>> | null;
  result: string | null;
  resultAt: string | null;
  createdAt: string;
}

export const LOG_KINDS = ['note', 'report', 'decision', 'handoff', 'alert', 'thread'] as const;
export type LogKind = (typeof LOG_KINDS)[number];
export interface LogEntry {
  id: number;
  at: string;
  seat: string;
  kind: LogKind;
  thread: string | null;
  body: string;
  ref: string | null;
}

export interface MeetingMinutes {
  agenda: string[];
  items: { topic: string; summary: string }[];
  /** Proposals only: each becomes an approval card. */
  decisions: string[];
  actions: { seat: string; what: string; due?: string | null }[];
  openQuestions: string[];
  transcriptUrl?: string | null;
}
export const MEETING_STATUSES = ['scheduled', 'live', 'ended', 'cancelled'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];
export interface Meeting {
  id: string;
  title: string;
  goal: string | null;
  calledBy: string;
  withOwner: boolean;
  attendees: string[];
  status: MeetingStatus;
  startsAt: string | null;
  timeBoxMin: number | null;
  tokenBudget: number | null;
  startedAt: string | null;
  endedAt: string | null;
  minutes: MeetingMinutes | null;
  createdAt: string;
}
export interface MeetingLine {
  id: number;
  speaker: string;
  body: string;
  at: string;
}

export interface AuditLine {
  id: number;
  at: string;
  seat: string;
  actor: 'agent' | 'human' | 'owner' | 'system';
  action: string;
  target: string | null;
  detail: Record<string, unknown>;
}

export interface Pause {
  id: string;
  scope: 'all' | 'team' | 'seat';
  target: string | null;
  reason: string | null;
  pausedAt: string;
  pausedBy: string;
}

/** Monday of the week a moment falls in (UTC), "YYYY-MM-DD": the key of agent_usage. */
export function weekOf(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7;
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return m.toISOString().slice(0, 10);
}
