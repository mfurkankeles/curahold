// The flow between departments, as the app and the API exchange it
// (db/migrations/0160_flow.sql, api/src/lib/handoff.ts, api/src/routes/handoff.ts):
// the hand-over card when a deal is won, customer requests linked to product
// work, what the work's status looks like from the customer's side, and the
// loop back to each customer when the work ships.

/** Where a customer asked for something. */
export const REQUEST_SOURCES = ['account', 'ticket', 'meeting', 'portal', 'task'] as const;
export type RequestSource = (typeof REQUEST_SOURCES)[number];

/** One owner per department on a customer. */
export interface AccountTeamMember {
  departmentId: string;
  departmentKey: string;
  userId: string;
}

/** A piece of product work a customer is waiting for, as anyone who sees the customer may see it. */
export interface LinkedWork {
  linkId: string;
  storyId: string;
  title: string;
  status: string | null;
  done: boolean;
  sprint: string | null;
  sprintEnds: string | null;
  departmentKey: string;
  /** The board, only for people who can open it. */
  boardId: string | null;
  source: RequestSource;
  sourceId: string | null;
  note: string;
  createdAt: string;
  /** When the work was finished and the owner got a draft. */
  shippedAt: string | null;
  toldAt: string | null;
  draft: string;
  loopTaskId: string | null;
  /** A portal request that is still open: the owner can close it (which tells the customer). */
  portalOpen: boolean;
}

/** A story to link a request to (title and where it stands only). */
export interface LinkableStory {
  id: string;
  title: string;
  status: string | null;
  done: boolean;
  departmentKey: string;
  waiting: number;
}

/** The backlog's demand columns for one story. `value` is null for people who may not see the value field. */
export interface StoryDemand {
  storyId: string;
  waiting: number;
  value: number | null;
  nearestRenewal: string | null;
  renewingSoon: number;
}

export interface DemandSummary {
  demand: StoryDemand[];
  /** The company's money and whether this person sees amounts at all. */
  currency: string;
  valueVisible: boolean;
}

/** The customers waiting for one story (names only of those the person may see). */
export interface StoryCustomer {
  linkId: string;
  accountId: string | null;
  accountName: string | null;
  visible: boolean;
  source: RequestSource;
  createdAt: string;
  shippedAt: string | null;
  toldAt: string | null;
}

export interface CustomerPromise {
  id: string;
  accountId: string;
  body: string;
  recordId: string | null;
  activityId: string | null;
  dueDate: string | null;
  keptAt: string | null;
  createdById: string | null;
  createdAt: string;
}

export const HANDOVER_STATUS = ['open', 'confirmed', 'dismissed'] as const;
export type HandoverStatus = (typeof HANDOVER_STATUS)[number];

export interface Stakeholder {
  id: string;
  name: string;
  title: string;
  decision: string | null;
  stance: string | null;
}

/** The hand-over card: everything the next team needs, on one card. */
export interface Handover {
  id: string;
  accountId: string;
  accountName: string;
  sourceKind: 'record' | 'task';
  sourceId: string;
  sourceName: string;
  stage: string;
  status: HandoverStatus;
  /** 'onboarding' when the company has that department switched on, else 'success'. */
  toDepartment: string;
  summary: string;
  planId: string | null;
  ownerId: string | null;
  sellerId: string | null;
  createdAt: string;
  confirmedAt: string | null;
  confirmedById: string | null;
}

export interface HandoverPacket extends Handover {
  stakeholders: Stakeholder[];
  promises: CustomerPromise[];
  /** Product work this customer is still waiting for. */
  requests: LinkedWork[];
  /** The contract's dates: the deal's close date and the customer's renewal date (when there are fields for them). */
  closeDate: string | null;
  renewalDate: string | null;
  /** What the customer is worth a year; null when the person may not see the field. */
  value: number | null;
  currency: string;
  /** People who may take it over: the department's members (leads first). */
  candidates: string[];
}

/** What the customer page shows of the flow, in one request. */
export interface AccountFlow {
  team: AccountTeamMember[];
  work: LinkedWork[];
  promises: CustomerPromise[];
  handovers: Handover[];
}

/** The three narrow assistant actions (D11). Each returns a draft; nothing is saved until the person confirms. */
export const DRAFT_KINDS = ['handover_note', 'shipped_message', 'meeting_promises'] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export interface DraftResult {
  text: string;
  /** Meeting extraction: the promises and next steps found. */
  promises?: string[];
  nextSteps?: string[];
  /** Written by the model (false: from the template, with no model or over the cap). */
  ai: boolean;
  /** Why the template was used: 'off', 'cap', 'error'. */
  why?: 'off' | 'cap' | 'error' | null;
}

/** Days ahead the backlog's ready view looks for renewals. */
export const RENEWAL_WINDOW_DAYS = 90;
