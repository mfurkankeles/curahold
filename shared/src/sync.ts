// Two-way sync with a CRM or spreadsheet: what the other side offers
// (objects and fields), how an administrator maps them onto Tendwell, and
// what each run did. Shared so the mapping screen shows exactly what the
// sync engine will do.

export const CRM_PROVIDERS = ['salesforce', 'hubspot', 'dynamics', 'pipedrive', 'zoho', 'gsheets', 'excel'] as const;
/** Support tools: read only, connected with the tool's own address and an API key (no app registration). */
export const SUPPORT_PROVIDERS = ['zendesk', 'freshdesk', 'intercom', 'jsm'] as const;
export type SupportProvider = (typeof SUPPORT_PROVIDERS)[number];
export type CrmProvider = (typeof CRM_PROVIDERS)[number] | SupportProvider | 'demo';

/** What an administrator types to connect a support tool. */
export const KEY_FIELDS: Record<SupportProvider, { key: string; secret?: boolean; placeholder: string }[]> = {
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
};

/** Spreadsheets: rows are found by a key column instead of a CRM id. */
export const TABULAR: CrmProvider[] = ['gsheets', 'excel'];

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

export type TargetKind = 'account' | 'record' | 'task';

/**
 * Local side of a field mapping:
 *  - accounts: "name", "owner", "f:<field key>"
 *  - records:  "name", "owner", "account", "f:<field key>"
 *  - tasks:    "title", "description", "due", "assignee", "done", "account"
 */
export interface FieldMap {
  remote: string;
  local: string;
  /** "both" writes Tendwell changes back; "pull" only reads. */
  dir: 'both' | 'pull';
}

export interface ObjectMap {
  remote: string;
  label: string;
  target: TargetKind;
  /** Record type key, when target is "record". */
  typeKey?: string;
  /** Board for tasks coming in, when target is "task". */
  boardId?: string;
  enabled: boolean;
  /** Also create items made in Tendwell on the other side. */
  create: boolean;
  /**
   * Only connect to what Tendwell already has: an organisation in a support
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
  /** Remote user id → Tendwell person id (null: leave unassigned). Matches by email otherwise. */
  owners: Record<string, string | null>;
  /** Who wins when the same field changed on both sides since the last run. */
  conflict: 'latest' | 'crm' | 'tendwell';
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
  errors: { object: string; remoteId?: string; name?: string; message: string }[];
}

export interface SyncPreviewObject {
  remote: string;
  label: string;
  /** Items found on the other side (null when the service can't count cheaply). */
  total: number | null;
  /** Of those, how many already exist in Tendwell and will be linked, not duplicated. */
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

export const emptyStats = (): SyncStats => ({ created: 0, updated: 0, archived: 0, pushed: 0, failed: 0 });
