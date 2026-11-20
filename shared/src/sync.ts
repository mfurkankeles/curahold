// Two-way sync with a CRM or spreadsheet: what the other side offers
// (objects and fields), how an administrator maps them onto Curahold, and
// what each run did. Shared so the mapping screen shows exactly what the
// sync engine will do.

export const CRM_PROVIDERS = ['salesforce', 'hubspot', 'dynamics', 'pipedrive', 'zoho', 'gsheets', 'excel'] as const;
/**
 * Support tools, connected with the tool's own address and an API key (no app registration). Tickets are read;
 * Zendesk, Freshdesk, Intercom and Front also take changes back (status, priority, assignee, a new ticket, a reply).
 * Zoho Desk signs in with Zoho instead of a key (the Zoho CRM app registration) and also takes changes back.
 */
export const SUPPORT_PROVIDERS = ['zendesk', 'freshdesk', 'intercom', 'jsm', 'front', 'zohodesk'] as const;
export type SupportProvider = (typeof SUPPORT_PROVIDERS)[number];
/** Data warehouses: rows from a query the administrator writes, read only, connected with a service-account key. */
export const WAREHOUSE_PROVIDERS = ['bigquery', 'snowflake'] as const;
export type WarehouseProvider = (typeof WAREHOUSE_PROVIDERS)[number];
/**
 * Mailboxes (Gmail, Outlook): recent mail is attached to the matching customer as a timeline activity, and a reply
 * can be sent and logged back as an activity. Signed in with Google / Microsoft (OAuth), or connected with an
 * injected refresh token where this server has no app registration (development, tests).
 */
export const MAILBOX_PROVIDERS = ['gmail', 'outlook'] as const;
export type MailboxProvider = (typeof MAILBOX_PROVIDERS)[number];
/**
 * Calendars (Google Calendar, Outlook Calendar): meetings that took place with a customer's people become meetings on
 * that customer's timeline, and a meeting planned in Curahold can be put in the calendar. Signed in like mailboxes.
 */
export const CALENDAR_PROVIDERS = ['gcal', 'outlookcal'] as const;
export type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];
/**
 * Event streams that push into Curahold (Segment): track / identify events arrive at a signed inbound address and
 * become timeline activities (and link to a contact) under the customer matched by the event's email. Nothing is
 * pulled on a schedule and nothing is written back, so they are read-only sources with no mapping.
 */
export const EVENT_PROVIDERS = ['segment'] as const;
/**
 * WhatsApp Business (Cloud API) with the company's own Meta app: customers' messages arrive at a signed callback
 * address and land on the customer found by the sender's number; a reply or a template goes back. Nothing is mapped.
 */
export const MESSAGE_PROVIDERS = ['whatsapp'] as const;
export type MessageProvider = (typeof MESSAGE_PROVIDERS)[number];
export type EventProvider = (typeof EVENT_PROVIDERS)[number];
/** Sources that never receive the standard entity changes (accounts, records, tasks) Curahold queues for a CRM. */
export const READ_ONLY_PROVIDERS: readonly string[] = ['jsm', 'bigquery', 'snowflake', 'segment', 'whatsapp', 'gcal', 'outlookcal'];
/**
 * CRMs connected with what the administrator brings from the CRM itself (a
 * webhook address, an API key, an access token): two-way like the others, and
 * nothing has to be registered on the server.
 */
export const KEYED_CRM_PROVIDERS = ['bitrix24', 'freshsales', 'zendesksell', 'odoocrm'] as const;
export type KeyedCrmProvider = (typeof KEYED_CRM_PROVIDERS)[number];
/**
 * Developer tools whose issues, epics and sprints are kept in step with Curahold's own (two-way). Jira Cloud only:
 * signed in with Atlassian (3LO) where this server has an app registration, otherwise with an API token. Data Center
 * and Server are out of scope.
 */
export const DEV_PROVIDERS = ['jira'] as const;
export type DevProvider = (typeof DEV_PROVIDERS)[number];
/** Where commits, branches and pull requests come from (webhooks into Curahold, not a sync). Azure DevOps: service hooks. */
export const DEV_HOSTS = ['github', 'gitlab', 'azuredevops'] as const;
export type DevHost = (typeof DEV_HOSTS)[number];
/** Accounting programs, read only (see accounting.ts); `finfile` is a file in the template's columns. */
export type AccountingSource = 'zohobooks' | 'xero' | 'odoo' | 'freee' | 'parasut' | 'quickbooks' | 'stripe' | 'finfile';
export type CrmProvider =
  | (typeof CRM_PROVIDERS)[number]
  | AccountingSource
  | KeyedCrmProvider
  | SupportProvider
  | WarehouseProvider
  | MailboxProvider
  | CalendarProvider
  | EventProvider
  | MessageProvider
  | DevProvider
  | 'demo';

/** What an administrator types to connect with a key. */
export const KEY_FIELDS: Record<
  SupportProvider | KeyedCrmProvider | WarehouseProvider | MailboxProvider | CalendarProvider | EventProvider | MessageProvider | DevProvider | 'odoo' | 'parasut' | 'stripe',
  { key: string; secret?: boolean; optional?: boolean; placeholder: string }[]
> = {
  bitrix24: [{ key: 'webhook', secret: true, placeholder: 'https://yourcompany.bitrix24.com/rest/1/••••••••/' }],
  freshsales: [
    { key: 'domain', placeholder: 'yourcompany.myfreshworks.com' },
    { key: 'token', secret: true, placeholder: '••••••••' },
  ],
  zendesksell: [{ key: 'token', secret: true, placeholder: '••••••••' }],
  // Odoo CRM: the same four things as Odoo accounting (one key may serve both connections).
  odoocrm: [
    { key: 'url', placeholder: 'https://yourcompany.odoo.com' },
    { key: 'database', optional: true, placeholder: 'yourcompany' },
    { key: 'login', placeholder: 'sales@yourcompany.com' },
    { key: 'apiKey', secret: true, placeholder: '••••••••' },
  ],
  zendesk: [
    { key: 'subdomain', placeholder: 'yourcompany' },
    { key: 'email', placeholder: 'agent@yourcompany.com' },
    { key: 'token', secret: true, placeholder: '••••••••' },
  ],
  freshdesk: [
    { key: 'domain', placeholder: 'yourcompany' },
    { key: 'token', secret: true, placeholder: '••••••••' },
  ],
  intercom: [
    { key: 'region', placeholder: 'us' },
    { key: 'token', secret: true, placeholder: '••••••••' },
  ],
  jsm: [
    { key: 'site', placeholder: 'yourcompany' },
    { key: 'email', placeholder: 'agent@yourcompany.com' },
    { key: 'token', secret: true, placeholder: '••••••••' },
  ],
  front: [{ key: 'token', secret: true, placeholder: '••••••••' }],
  // Signed in with Zoho: nothing to type.
  zohodesk: [],
  jira: [
    { key: 'site', placeholder: 'yourcompany' },
    { key: 'email', placeholder: 'you@yourcompany.com' },
    { key: 'token', secret: true, placeholder: '••••••••' },
  ],
  bigquery: [
    { key: 'serviceAccount', secret: true, placeholder: '{ "type": "service_account", "project_id": "…", "private_key": "…", "client_email": "…" }' },
    { key: 'name', placeholder: 'customer-health' },
    { key: 'query', placeholder: 'SELECT customer_id, name, health_score, updated_at FROM `project.dataset.table`' },
    { key: 'idColumn', placeholder: 'customer_id' },
    { key: 'modifiedColumn', optional: true, placeholder: 'updated_at' },
    { key: 'location', optional: true, placeholder: 'EU' },
  ],
  snowflake: [
    { key: 'account', placeholder: 'ab12345.eu-west-1' },
    { key: 'user', placeholder: 'CURAHOLD_READER' },
    { key: 'privateKey', secret: true, placeholder: '-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----' },
    { key: 'name', placeholder: 'customer-health' },
    { key: 'query', placeholder: 'SELECT customer_id, name, health_score, updated_at FROM analytics.crm.health' },
    { key: 'idColumn', placeholder: 'CUSTOMER_ID' },
    { key: 'modifiedColumn', optional: true, placeholder: 'UPDATED_AT' },
    { key: 'warehouse', optional: true, placeholder: 'ANALYTICS_WH' },
    { key: 'role', optional: true, placeholder: 'CURAHOLD_READER' },
  ],
  gmail: [{ key: 'refreshToken', secret: true, placeholder: '1//0g…' }],
  outlook: [{ key: 'refreshToken', secret: true, placeholder: '0.AXoA…' }],
  gcal: [
    { key: 'email', placeholder: 'you@yourcompany.com' },
    { key: 'refreshToken', secret: true, placeholder: '1//0g…' },
  ],
  outlookcal: [
    { key: 'email', placeholder: 'you@yourcompany.com' },
    { key: 'refreshToken', secret: true, placeholder: '0.AXoA…' },
  ],
  segment: [{ key: 'signingSecret', secret: true, placeholder: 'a shared secret, 16+ characters' }],
  whatsapp: [
    { key: 'phoneNumberId', placeholder: '106540352242922' },
    { key: 'accessToken', secret: true, placeholder: 'EAAG••••••••' },
    { key: 'appSecret', secret: true, placeholder: '••••••••••••••••••••••••••••••••' },
  ],
  // Accounting programs connected with a key (the rest sign in, or take a file).
  odoo: [
    { key: 'url', placeholder: 'https://yourcompany.odoo.com' },
    { key: 'database', optional: true, placeholder: 'yourcompany' },
    { key: 'login', placeholder: 'finance@yourcompany.com' },
    { key: 'apiKey', secret: true, placeholder: '••••••••' },
  ],
  // A restricted key with Read on Customers, Invoices and Events only.
  stripe: [{ key: 'key', secret: true, placeholder: 'rk_live_••••••••' }],
  // The password is used once, to get a renewable key, and is not kept.
  parasut: [
    { key: 'companyId', placeholder: '123456' },
    { key: 'clientId', placeholder: '••••••••' },
    { key: 'clientSecret', secret: true, placeholder: '••••••••' },
    { key: 'username', placeholder: 'finance@yourcompany.com' },
    { key: 'password', secret: true, placeholder: '••••••••' },
  ],
};

export type RemoteFieldType =
  | 'id'
  | 'text'
  | 'textarea'
  | 'number'
  | 'money'
  | 'percent'
  | 'date'
  | 'datetime'
  | 'bool'
  | 'select'
  | 'multiselect'
  | 'email'
  | 'url'
  | 'phone'
  /** A link to another object (an account, a contact…). */
  | 'ref'
  /** A CRM user (owner, assignee). */
  | 'user'
  /** A spreadsheet column holding a person's email or name. */
  | 'person';

export interface RemoteField {
  name: string;
  label: string;
  type: RemoteFieldType;
  options?: { value: string; label: string }[];
  /** For `ref`: the objects it can point to. */
  refTo?: string[];
  updatable: boolean;
  createable?: boolean;
  required?: boolean;
  /** Provider details the adapter needs to write the field back. */
  extra?: Record<string, unknown>;
}

export type ObjectHint = 'account' | 'contact' | 'opportunity' | 'ticket' | 'task' | null;

export interface RemoteObject {
  name: string;
  label: string;
  labelPlural: string;
  custom: boolean;
  /** What this object most likely is, for suggestions. */
  hint: ObjectHint;
}

export interface RemoteUser {
  id: string;
  name: string;
  email: string | null;
}

export type TargetKind = 'account' | 'record' | 'task' | 'sprint';

/**
 * Local side of a field mapping:
 *  - accounts: "name", "owner", "f:<field key>"
 *  - records:  "name", "owner", "account", "f:<field key>"
 *  - tasks:    "title", "description", "due", "assignee", "done", "account", and for project work "stage" (the board
 *              column, by the other side's status), "issue_type", "story_points", "epic", "sprint"
 *  - sprints:  "name", "goal", "state", "starts_on", "ends_on"
 */
export interface FieldMap {
  remote: string;
  local: string;
  /** "both" writes Curahold changes back; "pull" only reads. */
  dir: 'both' | 'pull';
}

export interface ObjectMap {
  remote: string;
  label: string;
  target: TargetKind;
  /** Record type key, when target is "record". */
  typeKey?: string;
  /** Board for tasks (and sprints) coming in, when target is "task" or "sprint". */
  boardId?: string;
  /**
   * Tasks: the issue types (Curahold's keys) this object carries when a task made in Curahold is created on the other
   * side, so an epic goes to the epics and a story to the issues. All types when absent.
   */
  issueTypes?: string[];
  enabled: boolean;
  /** Also create items made in Curahold on the other side. */
  create: boolean;
  /**
   * Only connect to what Curahold already has: an organisation in a support
   * tool that matches no customer (by name or web address) is left out, and
   * so is a ticket whose customer cannot be found.
   */
  linkOnly?: boolean;
  fields: FieldMap[];
  /** Spreadsheets: the column that identifies a row. */
  key?: string;
}

export interface SyncConfig {
  objects: ObjectMap[];
  /** Remote user id → Curahold person id (null: leave unassigned). Matches by email otherwise. */
  owners: Record<string, string | null>;
  /** Who wins when the same field changed on both sides since the last run. */
  conflict: 'latest' | 'crm' | 'curahold';
  /** Spreadsheets: the file being synced. */
  file?: { id: string; name: string; url: string; driveId?: string };
  /** Set once the administrator finished the mapping and started the first sync. */
  startedAt?: string;
}

export interface SyncStats {
  created: number;
  updated: number;
  archived: number;
  pushed: number;
  failed: number;
}

export interface SyncRun {
  id: string;
  mode: 'incremental' | 'full';
  /** change: sent right after an edit here. */
  trigger: 'schedule' | 'manual' | 'setup' | 'change';
  startedBy: string | null;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'ok' | 'partial' | 'error';
  /** Stopped to stay within its time; the next run carries on. */
  more: boolean;
  stats: Record<string, SyncStats>;
  /** `code` says in plain words what happened (shown translated, with the service's own message under it). */
  errors: { object: string; remoteId?: string; name?: string; message: string; code?: SyncErrorCode }[];
}

/**
 * What stopped a run, for the person who has to act: `rate` the service asked us to slow down (not a fault;
 * the next run carries on), `auth` the sign-in or key stopped working (reconnect), `permission` the account
 * may not read or write something, `unreachable` the service could not be reached.
 */
export type SyncErrorCode = 'rate' | 'auth' | 'permission' | 'unreachable';

/**
 * Which of the four plain explanations a service's own error text belongs to, or null when it is none of them.
 * Connections keep the vendor's message as it came (often English, sometimes a raw OAuth error such as
 * "expired access/refresh token"); screens show the plain sentence in the reader's language and the vendor
 * text under it, never the vendor text alone. Order matters: a 429 that also says "token" is a rate limit.
 */
export function troubleOf(message: string | null | undefined): SyncErrorCode | null {
  const m = (message ?? '').toLowerCase();
  if (!m.trim()) return null;
  if (/\b429\b|rate.?limit|too many requests|slow down|throttl|retry.?after|quota/.test(m)) return 'rate';
  if (/\b401\b|unauthori|invalid_grant|invalid.?token|expired|revoked|re-?connect|access.?token|refresh.?token|sign.?in|log.?in|credential|not authenticated|app removed|bad api key|invalid api key/.test(m)) return 'auth';
  if (/\b403\b|forbidden|permission|insufficient|not allowed|access denied|scope|kicked|not a member|not enough rights/.test(m)) return 'permission';
  if (/fetch failed|enotfound|econnrefused|etimedout|econnreset|getaddrinfo|network|timed? ?out|\b50[0234]\b|unavailable|unreachable|bad gateway/.test(m)) return 'unreachable';
  return null;
}

export interface SyncPreviewObject {
  remote: string;
  label: string;
  /** Items found on the other side (null when the service can't count cheaply). */
  total: number | null;
  /** Of those, how many already exist in Curahold and will be linked, not duplicated. */
  matched: number;
  sample: string[];
}

export interface SyncPreview {
  objects: SyncPreviewObject[];
  owners: { remoteId: string; name: string; email: string | null; userId: string | null }[];
}

/** Pending changes that could not be sent yet, for the "needs attention" list. */
export interface SyncProblem {
  entity: TargetKind;
  entityId: string;
  name: string;
  attempts: number;
  lastError: string | null;
  nextAt: string;
}

/** Zero counts for a sync run. */
export const emptyStats = (): SyncStats => ({ created: 0, updated: 0, archived: 0, pushed: 0, failed: 0 });

// ------------------------------------------------------- commits, branches, pull requests

export type DevLinkKind = 'branch' | 'pr' | 'commit';
export type DevLinkState = 'open' | 'merged' | 'closed';
export type DevChecks = 'none' | 'pending' | 'passing' | 'failing';

/** A branch, pull / merge request or commit that names a task (CURA-1a2b3c4d, or its whole id) in its name, title or message. */
export interface DevLink {
  id: string;
  taskId: string;
  provider: DevHost;
  kind: DevLinkKind;
  repo: string;
  /** The branch name, the pull request number or the commit sha. */
  ref: string;
  title: string;
  url: string | null;
  author: string | null;
  /** Commits have none. */
  state: DevLinkState | null;
  checks: DevChecks;
  headSha: string | null;
  openedAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
}

/** What a task card shows: how much code is open, merged, and how its checks stand. */
export interface DevSummary {
  branches: number;
  prs: number;
  commits: number;
  /** Open branches / pull requests. */
  open: number;
  merged: number;
  closed: number;
  /** The worst of the open pull requests' checks (failing, then pending, then passing). */
  checks: DevChecks;
}

export interface DevStatus {
  /** The key to put in a branch name, a title or a commit message: CURA-1a2b3c4d. */
  key: string;
  links: DevLink[];
  summary: DevSummary;
}

/** Settings → Connections: one host's webhook. */
export interface DevHookInfo {
  provider: DevHost;
  enabled: boolean;
  /** The address to give the host (the payload URL / webhook URL), and the secret to sign with. Administrators only. */
  url: string | null;
  secret: string | null;
  createdAt: string | null;
  /** The newest link made from it, if any. */
  lastLinkAt: string | null;
  links: number;
}

/** The text to put in a branch name, pull request title or commit message to link it to a task. */
export const devKey = (taskId: string) => `CURA-${taskId.replace(/-/g, '').slice(0, 8)}`;
