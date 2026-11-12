// Asking Curahold for help, and letting Curahold's support team in with consent.
export const HELP_CATEGORIES = ['bug', 'question', 'idea', 'data', 'billing'] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];
export const HELP_IMPACTS = ['blocking', 'workaround', 'minor'] as const;
export type HelpImpact = (typeof HELP_IMPACTS)[number];

/** How long support may stay in: one day (the usual), three days, a week. */
export const GRANT_HOURS = [24, 72, 168] as const;
/** Who in a company may let support in: anyone (for what they see), administrators only, or nobody. */
export const SUPPORT_POLICIES = ['anyone', 'admins', 'off'] as const;
export type SupportPolicy = (typeof SUPPORT_POLICIES)[number];

export const HELP_MAX_FILES = 6;
export const HELP_MAX_FILE_MB = 10;

/** What the app adds to a request on its own; shown to the person before sending, and removable. */
export interface HelpContext {
  browser?: string;
  screen?: string;
  viewport?: string;
  version?: string;
  locale?: string;
  timezone?: string;
  at?: string;
  pages?: string[];
  errors?: { at: string; message: string }[];
  failed?: { at: string; method: string; path: string; status: number }[];
  refs?: { accountId?: string; accountName?: string; taskId?: string; boardId?: string };
}

export interface SupportGrant {
  id: string;
  userId: string;
  level: 'view' | 'edit';
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  requestRef: string | null;
  active: boolean;
}

export interface HelpRequestInfo {
  id: string;
  ref: string;
  userId: string | null;
  category: HelpCategory;
  impact: HelpImpact | null;
  subject: string;
  status: HelpStatus;
  createdAt: string;
  files: { id: string; name: string; size: number }[];
  grant: SupportGrant | null;
  /** When the last message on it was written (the request itself counts). */
  lastMessageAt?: string;
  /** Support has answered and the person has not opened it since. */
  unread?: boolean;
  /** Colleagues kept in the loop: they read the request and can answer on it. */
  followers?: string[];
  neededBy?: string | null;
}

/**
 * Whose turn it is. `received`: with Curahold support. `answered`: support
 * has replied and waits for the person. `solved`: done (a new message opens it again).
 */
export const HELP_STATUSES = ['received', 'answered', 'solved'] as const;
export type HelpStatus = (typeof HELP_STATUSES)[number];

/** One message on a help request, as the company sees it (support's own notes never appear). */
export interface HelpMessage {
  id: string;
  author: 'user' | 'support';
  /** The colleague who wrote it, for `user`. */
  userId: string | null;
  /** Who at Curahold wrote it, for `support`. */
  staff: string | null;
  body: string;
  /** Written in the product, or sent in by answering an email. */
  via: 'app' | 'email' | 'desk';
  createdAt: string;
}

/** A help request with its conversation. */
export interface HelpRequestDetail extends HelpRequestInfo {
  description: string;
  steps: string | null;
  pageUrl: string | null;
  messages: HelpMessage[];
  /** Whether the person looking may answer on it (the one who asked, or someone kept in the loop). */
  canReply: boolean;
}
