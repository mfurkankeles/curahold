// Types shared by the API and the web app.
import type { Locale, Terms } from './i18n';

export const PERMS = [
  'org.manage',
  'users.manage',
  'teams.manage',
  'boards.view_all',
  'boards.manage_all',
  'tasks.delete_any',
  'privacy.manage',
  'audit.view',
  'accounts.manage',
  'accounts.view_all',
  'accounts.view_team',
  'automations.manage',
  'connections.manage',
] as const;
export type Perm = (typeof PERMS)[number];

/** How permissions are grouped on the roles screen, in reading order. */
export const PERM_GROUPS: { key: string; perms: Perm[] }[] = [
  { key: 'company', perms: ['org.manage', 'audit.view', 'privacy.manage'] },
  { key: 'people', perms: ['users.manage', 'teams.manage'] },
  { key: 'work', perms: ['boards.view_all', 'boards.manage_all', 'tasks.delete_any'] },
  { key: 'accounts', perms: ['accounts.manage'] },
  { key: 'connect', perms: ['automations.manage', 'connections.manage'] },
];

/** Permissions that open the admin area (the rest change what people see in their daily work). */
export const ADMIN_PERMS: Perm[] = ['org.manage', 'users.manage', 'teams.manage', 'audit.view', 'privacy.manage', 'accounts.manage', 'automations.manage', 'connections.manage'];

/** Starting points offered when an administrator adds a role. */
export const ROLE_PRESETS: { key: string; perms: Perm[] }[] = [
  { key: 'blank', perms: ['accounts.view_all'] },
  { key: 'lead', perms: ['boards.view_all', 'teams.manage', 'tasks.delete_any', 'accounts.manage', 'accounts.view_all', 'automations.manage'] },
  { key: 'ops', perms: ['accounts.manage', 'accounts.view_all', 'automations.manage', 'connections.manage'] },
  { key: 'people', perms: ['users.manage', 'teams.manage', 'accounts.view_all'] },
  { key: 'observer', perms: ['boards.view_all', 'audit.view', 'accounts.view_all'] },
];

/**
 * Which customers a role sees. Kept as two permissions so the database can
 * check them, but shown and chosen as one setting.
 */
export const ACCOUNT_SCOPES = ['all', 'team', 'own'] as const;
export type AccountScope = (typeof ACCOUNT_SCOPES)[number];
export const SCOPE_PERMS: Perm[] = ['accounts.view_all', 'accounts.view_team'];
/** The permissions shown as yes/no switches (reach is shown on its own). */
export const GRANT_PERMS: Perm[] = PERMS.filter((p) => !SCOPE_PERMS.includes(p));
export function scopeOf(perms: readonly string[]): AccountScope {
  return perms.includes('accounts.view_all') ? 'all' : perms.includes('accounts.view_team') ? 'team' : 'own';
}
export function withScope(perms: Perm[], scope: AccountScope): Perm[] {
  const rest = perms.filter((p) => !SCOPE_PERMS.includes(p));
  return scope === 'all' ? [...rest, 'accounts.view_all'] : scope === 'team' ? [...rest, 'accounts.view_team'] : rest;
}

export type BoardAccessLevel = 'view' | 'edit' | 'manage';

/** What one person can do, as the roles screen explains it. */
export interface PersonAccess {
  userId: string;
  name: string;
  email: string;
  status: UserStatus;
  seat: Seat;
  roleId: string;
  roleName: string;
  roleKey: string;
  perms: Perm[];
  teams: { id: string; name: string; lead: boolean }[];
  boards: { id: string; name: string; level: BoardAccessLevel; via: 'all' | 'company' | 'team' | 'member' | 'creator' }[];
}

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const SEATS = ['full', 'viewer'] as const;
export type Seat = (typeof SEATS)[number];

export const USER_STATUSES = ['active', 'invited', 'disabled', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const VISIBILITIES = ['org', 'team', 'private'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const MAX_FILE_MB = 10;
export const MAX_LOGO_KB = 1024;
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;

export interface Column {
  key: string;
  name: string;
  done: boolean;
}

export interface OrgPublic {
  slug: string;
  name: string;
  locale: Locale;
  loginMethods: { email: true; google: boolean; microsoft: boolean };
  maxDevices: number;
  /** Someone without an account may ask to join (with an address at one of the company's domains). */
  joinRequests: boolean;
  /** The company's own logo, if an administrator added one. */
  logoUrl: string | null;
}

export interface Org {
  id: string;
  slug: string;
  name: string;
  locale: Locale;
  timezone: string;
  terms: Terms;
  plan: string;
  maxDevices: number;
  currency: string;
  template: string;
  domains: string[];
  joinRequests: boolean;
  autoJoin: boolean;
  accountFields: AccountField[];
  /** Whether the health score is on, and where its bands start. */
  health?: { enabled: boolean; bands: { watch: number; good: number } };
  setup: SetupState;
  logoUrl: string | null;
}

export interface SetupState {
  done?: SetupStep[];
  finishedAt?: string;
  ownerHints?: { email: string | null; name: string | null; count: number }[];
}
export const SETUP_STEPS = ['company', 'messaging', 'accounts', 'people', 'automations'] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

// --------------------------------------------------------------- accounts

export type Localized = Partial<Record<Locale, string>>;

export const FIELD_TYPES = ['text', 'number', 'money', 'date', 'select', 'url', 'email'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** Tendwell's own option colours, named for what they look like. */
export const OPTION_COLORS = ['sea', 'leaf', 'honey', 'coral', 'sky', 'plum', 'stone', 'rose'] as const;
export type OptionColor = (typeof OPTION_COLORS)[number];

export interface FieldOption {
  key: string;
  label: Localized;
  /** The value a connected CRM or spreadsheet uses for this option. */
  value?: string;
  color?: OptionColor;
}

/**
 * Who sees and who changes one field, as role keys. Empty or missing means
 * everyone (changing still needs a full seat). People who run the company
 * settings always see and change every field.
 */
export interface FieldAccess {
  view?: string[];
  edit?: string[];
}

/** A value worked out from the records under an account, e.g. "open pipeline". */
export interface Rollup {
  /** Record type key, e.g. "opportunity". */
  type: string;
  fn: 'count' | 'sum' | 'min' | 'max';
  /** Record field to add up or compare (not needed for count). */
  field?: string;
  /** Only records whose select field has this option. */
  where?: { field: string; option: string };
}

export interface AccountField {
  key: string;
  label: Localized;
  type: FieldType;
  options?: FieldOption[];
  /** Filled in by Tendwell from records; read-only for people. */
  rollup?: Rollup;
  /** The health score: worked out by Tendwell (see health.ts); read-only for people. */
  health?: true;
  access?: FieldAccess;
  /** Set by the server for the person asking: they can see it but not change it. */
  locked?: boolean;
}

/** Worked out by Tendwell rather than typed in: rollups and the health score. */
export const calculated = (f: Pick<AccountField, 'rollup' | 'health'> | undefined | null) => !!(f?.rollup || f?.health);

export interface Account {
  id: string;
  name: string;
  ownerId: string | null;
  teamId: string | null;
  fields: Record<string, string | number | null>;
  source: string;
  externalId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  openTasks?: number;
  lastActivityAt?: string | null;
}

export interface ImportResult {
  batch: string;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; reason: string }[];
  unmatchedOwners: { email: string | null; name: string | null; count: number }[];
}

// -------------------------------------------------------------- messaging

export type ConnectionKind = 'messaging' | 'source' | 'support' | 'calendar';

export interface Connection {
  id: string;
  kind: ConnectionKind;
  provider: string;
  label: string;
  status: 'active' | 'error' | 'disabled';
  lastError: string | null;
  lastOkAt: string | null;
  createdAt: string;
  twoWay: boolean;
  /** Channels the app can post to (two-way providers) — webhooks are a channel themselves. */
  channels: { id: string; name: string }[];
  linkedPeople: number;
  /** CRMs and spreadsheets: where the sync stands. */
  sync?: {
    startedAt: string | null;
    objects: number;
    lastRun: { id: string; status: 'running' | 'ok' | 'partial' | 'error'; at: string } | null;
    /** Changes made here still waiting to reach the other side. */
    pending: number;
    /** Of those, how many failed at least once. */
    failing: number;
    file: { name: string; url: string } | null;
  };
}

export interface ProviderInfo {
  id: string;
  kind: ConnectionKind;
  twoWay: boolean;
  /** Ready on this server (credentials configured), or only possible through a webhook. */
  available: boolean;
  /** key: the administrator pastes the tool's address and an API key. */
  setup: 'oauth' | 'webhook' | 'key';
}

export interface Notification {
  id: string;
  kind: string;
  taskId: string | null;
  actorId: string | null;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

export const NOTIFY_EVENTS = ['assigned', 'mentioned', 'comment', 'digest', 'weekly', 'automation'] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

export interface NotifyPrefs {
  /** "auto": the first linked chat app, else email. */
  channel: 'auto' | 'email' | 'none' | string;
  events: Partial<Record<NotifyEvent, boolean>>;
  digestHour: number;
  defaultBoardId?: string | null;
  /** Hold notices between these hours (company time zone), e.g. 20 → 8. */
  quiet?: { from: number; to: number } | null;
}

export interface DeliveryOption {
  id: string; // 'email' | 'none' | connection id
  provider: string;
  label: string;
  linked: boolean;
}

// ------------------------------------------------------------ joining

export interface JoinRequest {
  id: string;
  email: string;
  name: string;
  note: string | null;
  createdAt: string;
}

export interface Person {
  id: string;
  name: string;
  email: string;
  seat: Seat;
  status: UserStatus;
}

export interface Me {
  user: Person & { locale: Locale | null; roleId: string; roleKey: string; perms: Perm[]; onboardedAt: string | null; prefs: NotifyPrefs };
  org: Org;
  teamIds: string[];
  sessionId: string;
  /** Set while an administrator looks at Tendwell as this person (read only). */
  previewBy?: { id: string; name: string };
}

export interface Role {
  id: string;
  key: string;
  name: string;
  perms: Perm[];
  system: boolean;
}

export interface Team {
  id: string;
  name: string;
  leadId: string | null;
  memberIds: string[];
}

export interface AdminUser extends Person {
  roleId: string;
  teamIds: string[];
  lastActiveAt: string | null;
  createdAt: string;
}

export interface Board {
  id: string;
  name: string;
  visibility: Visibility;
  teamId: string | null;
  columns: Column[];
  memberIds: string[];
  createdBy: string | null;
  canManage: boolean;
  notify: BoardNotify[];
}

export interface BoardNotify {
  connectionId: string;
  channel: string | null;
  events: ('created' | 'done')[];
}

export interface Task {
  id: string;
  boardId: string;
  parentId: string | null;
  title: string;
  description: string;
  status: string;
  assigneeIds: string[];
  accountId: string | null;
  accountName: string | null;
  dueDate: string | null;
  priority: Priority;
  position: number;
  version: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  subtaskCount?: number;
  subtaskDone?: number;
  commentCount?: number;
  repeat?: Repeat | null;
}

/** A task that comes back: when it is done, the next copy is made with a new due date. */
export interface Repeat {
  every: number;
  unit: 'day' | 'week' | 'month';
  /** Count from the due date (a fixed rhythm) or from the day it was done. */
  from: 'due' | 'done';
}

export interface Comment {
  id: string;
  taskId: string;
  authorId: string | null;
  body: string;
  mentions: string[];
  createdAt: string;
}

export interface FileMeta {
  id: string;
  taskId: string;
  name: string;
  size: number;
  mime: string;
  uploadedBy: string | null;
  createdAt: string;
}

export interface TaskDetail extends Task {
  subtasks: Task[];
  comments: Comment[];
  files: FileMeta[];
  /** The person asking has stopped comment notices for this task. */
  muted?: boolean;
}

export interface SessionInfo {
  id: string;
  deviceLabel: string | null;
  method: 'magic' | 'oauth';
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  at: string;
}

export interface ApiError {
  error: string;
  message: string;
  fields?: string[];
  current?: unknown;
}

// Mentions are stored in comment text as @[Name](uuid).
export const MENTION_RE = /@\[([^\]]{1,80})\]\(([0-9a-f-]{36})\)/g;
