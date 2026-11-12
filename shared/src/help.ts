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
  status: 'received' | 'answered' | 'solved';
  createdAt: string;
  files: { id: string; name: string; size: number }[];
  grant: SupportGrant | null;
}
