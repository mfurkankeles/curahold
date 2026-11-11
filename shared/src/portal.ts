// The customer portal: what a company opens to its customers' people.
export const PORTAL_FIELDS = ['due', 'priority', 'assignee'] as const;
export type PortalField = (typeof PORTAL_FIELDS)[number];

/** A board's portal settings. Customers see only what is listed here. */
export interface BoardPortal {
  enabled: boolean;
  /** The column new requests land in. */
  intake: string;
  /** What the customer reads for each column (the internal name otherwise). */
  labels: Record<string, string>;
  fields: PortalField[];
}

export interface PortalPerson {
  id: string;
  accountId: string;
  accountName: string | null;
  email: string;
  name: string;
  status: 'invited' | 'active' | 'disabled';
  createdAt: string;
  lastSeenAt: string | null;
}

export interface PortalSettings {
  /** False when this installation has no portal address. */
  available: boolean;
  enabled: boolean;
  address: string | null;
  boards: { id: string; name: string }[];
  auth: PortalAuth;
  /** Google and Microsoft sign-in set up for this installation. */
  providers: { google: boolean; microsoft: boolean };
}

// What the portal app reads (from /papi).
export interface PortalColumn {
  key: string;
  name: string;
  done: boolean;
}
export interface PortalBoard {
  id: string;
  name: string;
  columns: PortalColumn[];
  fields: PortalField[];
}
export interface PortalMe {
  user: { id: string; name: string; email: string; locale: 'tr' | 'en' | null };
  account: { id: string; name: string };
  boards: PortalBoard[];
}
export interface PortalTask {
  id: string;
  boardId: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
  openedBy: string | null;
  dueDate?: string | null;
  priority?: string | null;
  assignees?: string[] | null;
  replies: number;
}
export interface PortalComment {
  id: string;
  body: string;
  createdAt: string;
  fromCustomer: boolean;
  mine: boolean;
  author: string | null;
}
export interface PortalTaskDetail extends PortalTask {
  board: PortalBoard;
  comments: PortalComment[];
}
export interface PortalOrg {
  name: string;
  locale: 'tr' | 'en';
  logoUrl: string | null;
  signIn: PortalSignInOptions;
}

// ------------------------------------------------------------ signing in

/** Ways people at customers can sign in; each company chooses which are on. */
export const PORTAL_METHODS = ['email', 'google', 'microsoft', 'passkey', 'password'] as const;
export type PortalMethod = (typeof PORTAL_METHODS)[number];
export const PORTAL_SESSION_DAYS = [1, 7, 30, 90] as const;

export interface PortalAuth {
  /** A link and a six-digit code by email. */
  email: boolean;
  google: boolean;
  microsoft: boolean;
  /** Fingerprint, face or device PIN (WebAuthn), added after a first sign-in. */
  passkey: boolean;
  password: boolean;
  /** How long a sign-in lasts on a device. */
  sessionDays: (typeof PORTAL_SESSION_DAYS)[number];
  /** Email the person when they sign in without an email link (Google, Microsoft, passkey, password). */
  notify: boolean;
}

export const DEFAULT_PORTAL_AUTH: PortalAuth = { email: true, google: true, microsoft: true, passkey: true, password: false, sessionDays: 30, notify: true };

export function portalAuthOf(raw: unknown): PortalAuth {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const flag = (k: keyof PortalAuth) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : (DEFAULT_PORTAL_AUTH[k] as boolean));
  const days = (PORTAL_SESSION_DAYS as readonly number[]).includes(r.sessionDays as number) ? (r.sessionDays as PortalAuth['sessionDays']) : DEFAULT_PORTAL_AUTH.sessionDays;
  return { email: flag('email'), google: flag('google'), microsoft: flag('microsoft'), passkey: flag('passkey'), password: flag('password'), sessionDays: days, notify: flag('notify') };
}

/** What the sign-in page offers (company choice and what this installation can do). */
export type PortalSignInOptions = Record<PortalMethod, boolean>;

export interface PortalAccount {
  email: string;
  methods: PortalSignInOptions;
  password: { set: boolean; setAt: string | null };
  passkeys: { id: string; name: string; createdAt: string; lastUsedAt: string | null }[];
  identities: { provider: 'google' | 'microsoft'; email: string; lastUsedAt: string | null }[];
}
