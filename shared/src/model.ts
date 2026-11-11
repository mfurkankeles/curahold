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
  'automations.manage',
] as const;
export type Perm = (typeof PERMS)[number];

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

export interface AccountField {
  key: string;
  label: Localized;
  type: FieldType;
  options?: { key: string; label: Localized }[];
}

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
}

export interface ProviderInfo {
  id: string;
  kind: ConnectionKind;
  twoWay: boolean;
  /** Ready on this server (credentials configured), or only possible through a webhook. */
  available: boolean;
  setup: 'oauth' | 'webhook';
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

export const NOTIFY_EVENTS = ['assigned', 'mentioned', 'comment', 'digest', 'automation'] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

export interface NotifyPrefs {
  /** "auto": the first linked chat app, else email. */
  channel: 'auto' | 'email' | 'none' | string;
  events: Partial<Record<NotifyEvent, boolean>>;
  digestHour: number;
  defaultBoardId?: string | null;
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
