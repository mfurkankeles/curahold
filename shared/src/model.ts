// Types shared by the API and the web app.
import type { Rhythm } from './rhythm';
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
  'calendar.view_team',
] as const;
export type Perm = (typeof PERMS)[number];

/** How permissions are grouped on the roles screen, in reading order. */
export const PERM_GROUPS: { key: string; perms: Perm[] }[] = [
  { key: 'company', perms: ['org.manage', 'audit.view', 'privacy.manage'] },
  { key: 'people', perms: ['users.manage', 'teams.manage'] },
  { key: 'work', perms: ['boards.view_all', 'boards.manage_all', 'tasks.delete_any', 'calendar.view_team'] },
  { key: 'accounts', perms: ['accounts.manage'] },
  { key: 'connect', perms: ['automations.manage', 'connections.manage'] },
];

/** Permissions that open the admin area (the rest change what people see in their daily work). */
export const ADMIN_PERMS: Perm[] = ['org.manage', 'users.manage', 'teams.manage', 'audit.view', 'privacy.manage', 'accounts.manage', 'automations.manage', 'connections.manage'];

/** Starting points offered when an administrator adds a role. */
export const ROLE_PRESETS: { key: string; perms: Perm[] }[] = [
  { key: 'blank', perms: ['accounts.view_all'] },
  { key: 'lead', perms: ['boards.view_all', 'teams.manage', 'tasks.delete_any', 'accounts.manage', 'accounts.view_all', 'automations.manage', 'calendar.view_team'] },
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

// ---------------------------------------------------------------- product / project management

export const ISSUE_TYPES = ['epic', 'story', 'task', 'bug', 'subtask', 'spike'] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const SPRINT_STATES = ['future', 'active', 'closed'] as const;
export type SprintState = (typeof SPRINT_STATES)[number];

/** The Fibonacci scale offered for story points. Any number >= 0 is accepted; this is the picker's preset. */
export const FIBONACCI = [1, 2, 3, 5, 8, 13, 21] as const;

export interface Sprint {
  id: string;
  boardId: string;
  name: string;
  goal: string;
  state: SprintState;
  startsOn: string | null;
  endsOn: string | null;
  position: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Current totals of a sprint (the burndown history comes later). */
export interface SprintSummary {
  sprintId: string;
  totalPoints: number;
  donePoints: number;
  itemCount: number;
  doneCount: number;
  /** Items without story points. */
  unestimated: number;
  byType: Record<IssueType, { count: number; done: number; points: number }>;
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
  /** The customer portal is on (and this installation has an address for it). */
  portal?: boolean;
  /** Record the page for support (rrweb, inputs masked); the company can switch it off. */
  recordSessions?: boolean;
  /** Where the company stands with its plan (see billing.ts); always open while billing is off. */
  billing?: import('./billing').Access;
  /** Billing is set up on this installation (Paddle). */
  billingOn?: boolean;
  /** Targets, the review rhythm and when to nudge. */
  rhythm?: Rhythm;
  /** Other currencies in use and what one of each is worth in `currency`. */
  fx?: FxRates;
}

/** {"USD": 34.2}: one US dollar is 34.2 of the company's currency. */
export interface FxRates {
  rates: Record<string, number>;
  updatedAt: string | null;
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

/** Curahold's own option colours, named for what they look like. */
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
  /** Filled in by Curahold from records; read-only for people. */
  rollup?: Rollup;
  /** The health score: worked out by Curahold (see health.ts); read-only for people. */
  health?: true;
  access?: FieldAccess;
  /** Set by the server for the person asking: they can see it but not change it. */
  locked?: boolean;
}

/** Worked out by Curahold rather than typed in: rollups and the health score. */
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
  /** With ?signals=1: open work past its date, open work untouched for 14 days, the last touch. */
  overdueTasks?: number;
  stuckTasks?: number;
  lastTouchAt?: string | null;
  /** Days between business reviews for this customer; null follows the company's rhythm, 0 is none. */
  reviewDays?: number | null;
  lastReviewAt?: string | null;
  /** The currency of this customer's amounts; null is the company's. */
  currency?: string | null;
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
  /** The try-it demo only: the CRM this pretend connection stands in for, so the screens say its name. */
  standsFor?: string | null;
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
  /** Where the other side's administrator installs Curahold first, for services that ask for that (Salesforce). */
  installUrl?: string;
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

export const NOTIFY_EVENTS = ['assigned', 'mentioned', 'comment', 'following', 'digest', 'weekly', 'nudges', 'automation'] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

export interface NotifyPrefs {
  /** "auto": the first linked chat app, else email. */
  channel: 'auto' | 'email' | 'none' | string;
  events: Partial<Record<NotifyEvent, boolean>>;
  digestHour: number;
  defaultBoardId?: string | null;
  /** Hold notices between these hours (company time zone), e.g. 20 → 8. */
  quiet?: { from: number; to: number } | null;
  /** The person put away the "getting started" card on Home. */
  startHidden?: boolean;
  /** What the person starred, shown at the top of their menu (newest first). */
  favorites?: Favorite[];
}

/** A starred customer, record, board, report or dashboard: where it is, and its name when starred. */
export interface Favorite {
  kind: 'account' | 'record' | 'board' | 'report' | 'dashboard';
  id: string;
  name: string;
  /** The address it opens (a path inside the app). */
  to: string;
}
export const MAX_FAVORITES = 20;
/** A path inside the app, never a link elsewhere. */
export const FAVORITE_PATH = /^\/[A-Za-z0-9/_\-?=&.%]{0,200}$/;

/** First steps on Home, ticked off by what the person has done. */
export const START_STEPS = ['task', 'planned', 'touch', 'mention', 'calendar', 'notify'] as const;
export type StartStep = (typeof START_STEPS)[number];

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
  /** The platform owner sees the whole-business metrics screen. */
  owner?: boolean;
  sessionId: string;
  /** Set while an administrator looks at Curahold as this person (read only). */
  previewBy?: { id: string; name: string };
  /** Set while Curahold support is inside with this person's consent. */
  supportBy?: { staff: string; level: 'view' | 'edit'; until: string; grantId: string };
  /** Support access this person has given and not yet closed. */
  supportOpen?: { until: string; level: 'view' | 'edit'; count: number };
  /** Help requests where Curahold support has answered and the person has not opened the answer yet. */
  helpUnread?: number;
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
  /** Open to customers (the customer portal), or null. */
  portal: import('./portal').BoardPortal | null;
  /** The board's own task fields (type, outcome, link…). */
  taskFields: TaskField[];
  /** An intake form colleagues fill in to put a request on this board; null when off. */
  form: BoardForm | null;
  /** Finished tasks move to the board's archive after this many days; null keeps them on the board. */
  archiveDays: number | null;
}

export const TASK_FIELD_TYPES = ['text', 'number', 'money', 'date', 'select', 'url', 'email', 'person', 'checkbox'] as const;
export type TaskFieldType = (typeof TASK_FIELD_TYPES)[number];
export type TaskFieldValue = string | number | boolean | null;

export interface TaskField {
  key: string;
  label: Localized;
  type: TaskFieldType;
  options?: FieldOption[];
  /** "done": the task cannot be finished while this is empty. */
  required?: 'done' | null;
}

export interface BoardForm {
  on: boolean;
  title?: string;
  intro?: string;
  /** What it asks besides the title: "description", "account", "due" and the board's fields as "f:<key>". */
  fields: string[];
  /** The column requests land in (the first one when empty). */
  column?: string | null;
}

export interface TaskEvent {
  id: string;
  actorId: string | null;
  kind: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface TaskLink {
  taskId: string;
  title: string;
  boardId: string;
  boardName: string;
  /** Seen from this task: it blocks the other, it waits for the other (blocked_by), or they relate. */
  kind: 'blocks' | 'blocked_by' | 'relates';
  done: boolean;
}

export interface TimeEntry {
  id: string;
  userId: string;
  minutes: number;
  day: string;
  note: string;
  createdAt: string;
}

/** What a saved view keeps: who, how urgent, which customer, which values. */
export interface ViewFilters {
  q?: string;
  /** People ids; "me" means whoever looks. */
  assignees?: string[];
  priority?: Priority[];
  due?: ('late' | 'today' | 'week' | 'later' | 'none')[];
  accounts?: string[];
  /** Board's own select fields: field key → option keys. */
  fields?: Record<string, string[]>;
  view?: 'board' | 'list' | 'timeline';
}

export interface SavedView {
  id: string;
  boardId: string | null;
  name: string;
  filters: ViewFilters;
  shared: boolean;
  /** Made by the person asking (they may change or remove it). */
  mine: boolean;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  items: string[];
  mine: boolean;
}

/**
 * What a playbook's days count from: the day someone puts it on ('start'),
 * or — counting back — the customer's renewal date or the deal's close date.
 */
export type PlanAnchor = 'start' | 'renewal' | 'close';
export const PLAN_ANCHORS: readonly PlanAnchor[] = ['start', 'renewal', 'close'];

/** A playbook: a company's way of doing something, as tasks with dates. */
export interface PlanTemplate {
  id: string;
  name: string;
  /** A line or two on when to use it. */
  description: string;
  boardId: string;
  column: string | null;
  anchor: PlanAnchor;
  tasks: import('./automation').TaskBlueprint[];
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
  /** Shared with the customer in the portal. */
  portalShared?: boolean;
  /** Opened by someone at the customer, in the portal. */
  portalAuthorId?: string | null;
  portalAuthorName?: string | null;
  /** The board's own fields, by key. */
  fields?: Record<string, TaskFieldValue>;
  startDate?: string | null;
  /** How many unfinished tasks this one waits for. */
  blockedBy?: number;
  /** Finished (given where a list mixes open and finished work, such as a record's tasks). */
  done?: boolean;
  /** The record it belongs to (an opportunity, a ticket…). */
  recordId?: string | null;
  recordName?: string | null;
  recordType?: string | null;
  issueType?: IssueType;
  storyPoints?: number | null;
  epicId?: string | null;
  sprintId?: string | null;
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
  /** "customer": written for the customer (or by them) and shown in the portal. */
  visibility: 'internal' | 'customer';
  /** Written by someone at the customer, in the portal. */
  portalAuthorName?: string | null;
  /** Files and pictures that came with it. */
  files?: FileMeta[];
}

export interface FileMeta {
  id: string;
  taskId: string | null;
  recordId?: string | null;
  /** The comment it came with. */
  commentId?: string | null;
  name: string;
  size: number;
  mime: string;
  uploadedBy: string | null;
  createdAt: string;
}

export interface TaskDetail extends Task {
  /** For a subtask: the task it is a step of, so the way back is one click. */
  parent?: { id: string; title: string } | null;
  subtasks: Task[];
  comments: Comment[];
  files: FileMeta[];
  /** The person asking has stopped comment notices for this task. */
  muted?: boolean;
  events?: TaskEvent[];
  /** People following the task. */
  watchers?: string[];
  links?: TaskLink[];
  time?: { total: number; entries: TimeEntry[] };
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
  /** Curahold support's staff member, on support entries. */
  staff?: string;
}

// ---------------------------------------------------------------------- trash

export const TRASH_KINDS = ['account', 'record', 'task', 'activity', 'page', 'report', 'automation'] as const;
export type TrashKind = (typeof TRASH_KINDS)[number];
/** How long something deleted can still be put back. */
export const TRASH_DAYS = 30;

/** Something deleted that can still be put back. */
export interface TrashItem {
  id: string;
  kind: TrashKind;
  /** Its name or title when it was deleted. */
  label: string;
  /** How many things it holds: one as a rule; undoing an import puts many in at once. */
  count: number;
  /** The ids they had, and get again when put back (in a list, the first 100 when there are more). */
  ids: string[];
  /** Where it was: a task's board, the customer of a record or a timeline entry, a record's kind. */
  where: { boardId?: string; board?: string; accountId?: string; account?: string; type?: Localized; entry?: string; via?: 'import' };
  /** What went with it and comes back with it. */
  contents: { subtasks?: number; comments?: number; files?: number; records?: number; entries?: number; portalPeople?: number; timeEntries?: number; tasksLinked?: number };
  deletedBy: string | null;
  deletedAt: string;
  /** From this moment on it is gone for good. */
  purgeAt: string;
}

/** What putting something back did. */
export interface TrashRestored {
  kind: TrashKind;
  ids: string[];
  label: string;
  where: TrashItem['where'];
  /** It was already there (put back another way); nothing was changed. */
  already: boolean;
  /** Rows left out because what they belonged to has gone for good since, by table. */
  dropped: Record<string, number>;
  /** Links cleared because what they pointed at has gone since. */
  unlinked: { table: string; col: string; parent: string; n: number }[];
}

export interface ApiError {
  error: string;
  message: string;
  fields?: string[];
  current?: unknown;
}

// Mentions are stored in comment text as @[Name](uuid).
export const MENTION_RE = /@\[([^\]]{1,80})\]\(([0-9a-f-]{36})\)/g;

// ------------------------------------------------------------------ calendar

/** What can sit on a day: a task due, something held with a customer, a renewal, a business review falling due. */
export const CALENDAR_KINDS = ['task', 'meeting', 'call', 'review', 'renewal', 'reviewDue', 'planned'] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

export interface CalendarItem {
  /** Unique within an answer: the kind and the thing it is about. */
  id: string;
  kind: CalendarKind;
  /** The day, where the company is (YYYY-MM-DD). */
  date: string;
  /** The clock time for something that was held (HH:MM), else null. */
  time: string | null;
  title: string;
  /** Whose it is: assignees, the people who were there, the customer's owner. */
  personIds: string[];
  accountId?: string | null;
  accountName?: string | null;
  /** For a task: what opening it needs, and whether it is finished. */
  taskId?: string;
  boardId?: string;
  status?: string;
  done?: boolean;
  priority?: string | null;
  /** For something held: how long it took. */
  minutes?: number | null;
  /** For a planned meeting: the row to open, and which meeting kind it will be. */
  plannedId?: string;
  meetingKind?: string;
}

/** Whose calendars someone may open besides their own. */
export interface CalendarReach {
  can: boolean;
  /** Everyone in the company (an administrator), not only teammates. */
  everyone: boolean;
  teams: { id: string; name: string; memberIds: string[] }[];
  personIds: string[];
}
