// Records kept under an account — contacts, opportunities, and whatever
// else a company tracks (risks, renewals, cases…). Built-in kinds come with
// fields Curahold knows how to use; anything else is the company's own.
import { phrase as P, phraseIn, type Locale } from './i18n';
import type { AccountField, FieldOption, Localized } from './model';

export const RECORD_KINDS = ['contact', 'opportunity', 'ticket', 'custom'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export interface RecordType {
  id: string;
  key: string;
  name: { one: Localized; other: Localized };
  kind: RecordKind;
  fields: AccountField[];
  position: number;
  archivedAt: string | null;
  /** Records of this type that are not archived. */
  count?: number;
  /** The columns its table shows, as the company chose them; null is Curahold's choice. */
  columns?: string[] | null;
}

export interface LinkInfo {
  connectionId: string;
  provider: string;
  remoteId: string;
  url: string | null;
}

export interface AppRecord {
  id: string;
  typeId: string;
  accountId: string | null;
  /** Who this one reports to (another record of the same kind and account) — the org chart. */
  parentId: string | null;
  accountName?: string | null;
  name: string;
  ownerId: string | null;
  fields: Record<string, string | number | null>;
  source: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  links?: LinkInfo[];
  /** The currency of its amounts; null is the company's. */
  currency?: string | null;
  createdBy?: string | null;
  /** Goes up with every change; a save sends the one it started from (baseVersion). */
  version?: number;
}

/** A comment under a record (an opportunity's thread). */
export interface RecordComment {
  id: string;
  recordId: string;
  authorId: string | null;
  body: string;
  mentions: string[];
  createdAt: string;
  files: import('./model').FileMeta[];
}

/** A record opened on its own: its thread, its files and the tasks that belong to it. */
export interface RecordDetail extends AppRecord {
  comments: RecordComment[];
  files: import('./model').FileMeta[];
  tasks: import('./model').Task[];
}

/** Built-in columns a record table can show besides the record's own fields. */
export const RECORD_BUILTIN_COLUMNS = ['account', 'owner', 'created_by', 'created_at', 'updated_at'] as const;


/** Where a stakeholder stands towards us. Keys are fixed; labels can be renamed. */
export const STANCES = [
  { key: 'champion', label: P('rtype.champion') },
  { key: 'supporter', label: P('rtype.supporter') },
  { key: 'neutral', label: P('rtype.neutral') },
  { key: 'skeptic', label: P('rtype.skeptic') },
  { key: 'blocker', label: P('rtype.blocker') },
];

/** How much say a stakeholder has in the decision. */
export const DECISION_LEVELS = [
  { key: 'decision_maker', label: P('rtype.decision_maker') },
  { key: 'approver', label: P('rtype.approver_budget') },
  { key: 'influencer', label: P('rtype.influencer') },
  { key: 'evaluator', label: P('rtype.evaluator') },
  { key: 'user', label: P('rtype.user') },
];

/** Where a support ticket stands. Every support tool's own states fold into these four. */
export const TICKET_STATUSES = [
  { key: 'open', label: P('rtype.open'), color: 'coral' as const },
  { key: 'pending', label: P('rtype.waiting'), color: 'honey' as const },
  { key: 'solved', label: P('rtype.solved'), color: 'leaf' as const },
  { key: 'closed', label: P('rtype.closed'), color: 'stone' as const },
];
export const TICKET_PRIORITIES = [
  { key: 'low', label: P('task.priority.low') },
  { key: 'normal', label: P('task.priority.normal') },
  { key: 'high', label: P('task.priority.high') },
  { key: 'urgent', label: P('task.priority.urgent'), color: 'coral' as const },
];
/** Still needing an answer. */
export const TICKET_OPEN = ['open', 'pending'];

/** Any tool's ticket state in Curahold's four ("Problem Solved", "Waiting on customer", "Kapandı"…). */
export function ticketStatusOf(v: unknown): 'open' | 'pending' | 'solved' | 'closed' {
  const s = String(v ?? '').toLocaleLowerCase('tr');
  if (/clos|kapan|kapal|cancel|iptal|merged/.test(s)) return 'closed';
  if (/solv|resolv|done|complete|provided|çözül|tamam/.test(s)) return 'solved';
  if (/pend|wait|hold|snooz|beklem|awaiting/.test(s)) return 'pending';
  return 'open';
}

export function ticketPriorityOf(v: unknown): 'low' | 'normal' | 'high' | 'urgent' {
  const s = String(v ?? '').toLocaleLowerCase('tr');
  if (/urgent|critical|highest|blocker|acil|kritik/.test(s)) return 'urgent';
  if (/high|major|yüksek/.test(s)) return 'high';
  if (/low|minor|trivial|düşük/.test(s)) return 'low';
  return 'normal';
}

/** Contact fields shown first, in this order, wherever there is little room. */
export const CONTACT_COLUMNS = ['title', 'decision', 'stance', 'email'];

/** Opportunity status options: the one thing every CRM agrees on. */
export const OPPORTUNITY_STATUS = [
  { key: 'open', label: P('rtype.deal_open') },
  { key: 'won', label: P('rtype.won') },
  { key: 'lost', label: P('rtype.lost') },
];

/** Stages a deal moves through until it is won or lost; a company renames or replaces them, a CRM brings its own. */
export const OPPORTUNITY_STAGES: FieldOption[] = [
  { key: 'discovery', label: P('rtype.discovery'), color: 'sky' },
  { key: 'proposal', label: P('rtype.proposal'), color: 'honey' },
  { key: 'negotiation', label: P('rtype.negotiation'), color: 'plum' },
  { key: 'commit', label: P('rtype.commit'), color: 'sea' },
];
/** What the deal is: a new customer, more from an existing one, or a renewal. */
export const OPPORTUNITY_KINDS: FieldOption[] = [
  { key: 'new', label: P('rtype.new_business'), color: 'sky' },
  { key: 'expansion', label: P('rtype.expansion'), color: 'leaf' },
  { key: 'renewal', label: P('rtype.renewal'), color: 'stone' },
];

export const BUILTIN_TYPES: Record<Exclude<RecordKind, 'custom'>, { key: string; name: RecordType['name']; fields: AccountField[] }> = {
  contact: {
    key: 'contact',
    name: { one: P('rtype.contact'), other: P('rtype.contacts') },
    fields: [
      { key: 'first_name', label: P('rtype.first_name'), type: 'text' },
      { key: 'last_name', label: P('rtype.last_name'), type: 'text' },
      { key: 'title', label: P('rtype.job_title'), type: 'text' },
      { key: 'email', label: P('rtype.email'), type: 'email' },
      { key: 'phone', label: P('rtype.phone'), type: 'text' },
      { key: 'linkedin', label: P('rtype.linkedin'), type: 'url' },
      { key: 'decision', label: P('rtype.decision_role'), type: 'select', options: DECISION_LEVELS },
      { key: 'stance', label: P('rtype.stance_towards_us'), type: 'select', options: STANCES },
    ],
  },
  ticket: {
    key: 'ticket',
    name: { one: P('rtype.support_ticket'), other: P('rtype.support_tickets') },
    fields: [
      { key: 'status', label: P('rtype.status'), type: 'select', options: TICKET_STATUSES },
      { key: 'priority', label: P('rtype.priority'), type: 'select', options: TICKET_PRIORITIES },
      { key: 'opened_at', label: P('rtype.opened'), type: 'date' },
      { key: 'solved_at', label: P('rtype.solved_at'), type: 'date' },
      { key: 'requester', label: P('rtype.requester'), type: 'email' },
      { key: 'channel', label: P('rtype.channel'), type: 'text' },
      { key: 'url', label: P('rtype.link'), type: 'url' },
    ],
  },
  opportunity: {
    key: 'opportunity',
    name: { one: P('rtype.opportunity'), other: P('rtype.opportunities') },
    fields: [
      { key: 'amount', label: P('rtype.amount'), type: 'money' },
      { key: 'close_date', label: P('rtype.close_date'), type: 'date' },
      { key: 'stage', label: P('rtype.stage'), type: 'select', options: OPPORTUNITY_STAGES },
      { key: 'status', label: P('rtype.status'), type: 'select', options: OPPORTUNITY_STATUS },
      { key: 'kind', label: P('rtype.type'), type: 'select', options: OPPORTUNITY_KINDS },
    ],
  },
};

/**
 * Kinds of record a company can add in one click (Settings → Records), on
 * top of contacts and opportunities. They are ordinary custom types: once
 * added, their names and fields are the company's to change.
 */
export const RECORD_PRESETS: { key: string; name: RecordType['name']; hint: Localized; fields: AccountField[] }[] = [
  {
    key: 'agreement',
    name: { one: P('rtype.agreement'), other: P('rtype.agreements') },
    hint: P('rtype.contracts_with_their_link_dates_and'),
    fields: [
      { key: 'link', label: P('rtype.link'), type: 'url' },
      { key: 'start_date', label: P('rtype.starts'), type: 'date' },
      { key: 'end_date', label: P('rtype.ends'), type: 'date' },
      { key: 'value', label: P('rtype.value'), type: 'money' },
      {
        key: 'status',
        label: P('rtype.status'),
        type: 'select',
        options: [
          { key: 'draft', label: P('rtype.draft'), color: 'stone' },
          { key: 'signed', label: P('rtype.signed'), color: 'leaf' },
          { key: 'expired', label: P('rtype.expired'), color: 'coral' },
        ],
      },
    ],
  },
  {
    key: 'risk',
    name: { one: P('rtype.risk'), other: P('rtype.risks') },
    hint: P('rtype.what_could_lose_a_customer_how'),
    fields: [
      {
        key: 'severity',
        label: P('rtype.severity'),
        type: 'select',
        options: [
          { key: 'low', label: P('task.priority.low'), color: 'sky' },
          { key: 'medium', label: P('rtype.medium'), color: 'honey' },
          { key: 'high', label: P('task.priority.high'), color: 'coral' },
        ],
      },
      {
        key: 'reason',
        label: P('rtype.reason'),
        type: 'select',
        options: [
          { key: 'price', label: P('rtype.price'), color: 'honey' },
          { key: 'product', label: P('rtype.product_fit'), color: 'plum' },
          { key: 'champion', label: P('rtype.champion_left'), color: 'rose' },
          { key: 'service', label: P('rtype.service'), color: 'sky' },
          { key: 'other', label: P('rtype.other'), color: 'stone' },
        ],
      },
      { key: 'at_stake', label: P('rtype.at_stake'), type: 'money' },
      {
        key: 'status',
        label: P('rtype.status'),
        type: 'select',
        options: [
          { key: 'open', label: P('rtype.open'), color: 'coral' },
          { key: 'handled', label: P('rtype.handled'), color: 'leaf' },
        ],
      },
    ],
  },
  {
    key: 'request',
    name: { one: P('rtype.product_request'), other: P('rtype.product_requests') },
    hint: P('rtype.what_customers_ask_the_product_for'),
    fields: [
      {
        key: 'priority',
        label: P('rtype.priority'),
        type: 'select',
        options: [
          { key: 'nice', label: P('rtype.nice_to_have'), color: 'sky' },
          { key: 'important', label: P('rtype.important'), color: 'honey' },
          { key: 'blocker', label: P('rtype.blocker'), color: 'coral' },
        ],
      },
      {
        key: 'status',
        label: P('rtype.status'),
        type: 'select',
        options: [
          { key: 'new', label: P('rtype.new'), color: 'stone' },
          { key: 'planned', label: P('rtype.planned'), color: 'plum' },
          { key: 'shipped', label: P('rtype.shipped'), color: 'leaf' },
          { key: 'declined', label: P('rtype.declined'), color: 'rose' },
        ],
      },
      { key: 'link', label: P('rtype.link'), type: 'url' },
    ],
  },
  {
    key: 'quote',
    name: { one: P('rtype.quote'), other: P('rtype.quotes') },
    hint: P('rtype.proposals_sent_to_customers_the_amount'),
    fields: [
      { key: 'amount', label: P('rtype.amount'), type: 'money' },
      { key: 'valid_until', label: P('rtype.valid_until'), type: 'date' },
      {
        key: 'status',
        label: P('rtype.status'),
        type: 'select',
        options: [
          { key: 'draft', label: P('rtype.draft'), color: 'stone' },
          { key: 'sent', label: P('rtype.sent'), color: 'sky' },
          { key: 'accepted', label: P('rtype.accepted'), color: 'leaf' },
          { key: 'declined', label: P('rtype.declined'), color: 'coral' },
        ],
      },
      { key: 'link', label: P('rtype.link'), type: 'url' },
    ],
  },
];

/** Account fields offered when opportunities or contacts are switched on. */
export const ROLLUP_PRESETS: { kind: RecordKind; field: AccountField }[] = [
  {
    kind: 'opportunity',
    field: { key: 'open_pipeline', label: P('rtype.open_pipeline'), type: 'money', rollup: { type: 'opportunity', fn: 'sum', field: 'amount', where: { field: 'status', option: 'open' } } },
  },
  {
    kind: 'opportunity',
    field: { key: 'next_close', label: P('rtype.next_close_date'), type: 'date', rollup: { type: 'opportunity', fn: 'min', field: 'close_date', where: { field: 'status', option: 'open' } } },
  },
  {
    kind: 'opportunity',
    field: { key: 'open_opportunities', label: P('rtype.open_opportunities'), type: 'number', rollup: { type: 'opportunity', fn: 'count', where: { field: 'status', option: 'open' } } },
  },
  { kind: 'ticket', field: { key: 'open_tickets', label: P('rtype.open_tickets'), type: 'number', rollup: { type: 'ticket', fn: 'count', where: { field: 'status', option: 'open' } } } },
  { kind: 'ticket', field: { key: 'tickets', label: P('rtype.support_tickets_2'), type: 'number', rollup: { type: 'ticket', fn: 'count' } } },
  { kind: 'contact', field: { key: 'contacts', label: P('rtype.contacts_2'), type: 'number', rollup: { type: 'contact', fn: 'count' } } },
  { kind: 'contact', field: { key: 'champions', label: P('rtype.champions'), type: 'number', rollup: { type: 'contact', fn: 'count', where: { field: 'stance', option: 'champion' } } } },
  { kind: 'contact', field: { key: 'blockers', label: P('rtype.blockers'), type: 'number', rollup: { type: 'contact', fn: 'count', where: { field: 'stance', option: 'blocker' } } } },
];

export function typeLabel(t: Pick<RecordType, 'name'>, locale: Locale, plural = true): string {
  const l = plural ? t.name.other : t.name.one;
  return phraseIn(l, locale);
}

/** "Ada Demir" from first and last name; whichever is there. */
export function fullName(first: unknown, last: unknown): string {
  return [first, last].map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean).join(' ');
}

/** Best guess at first and last name from a full name (last word is the surname). */
export function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return { first: parts[0] ?? '', last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

/**
 * What the Renewals view shows beside each customer: its open renewal
 * opportunity, and the agreements kept as records (the latest first).
 * Agreement links kept in a customer's own fields are read from the customer.
 */
export interface RenewalLinks {
  deal: { id: string; name: string; stage: string | null; amount: number | null; currency: string | null; typeKey: string } | null;
  agreements: { recordId: string; name: string; url: string | null; typeKey: string }[];
}

/** Words that mark a kind of record, or a field, as an agreement (a contract). */
export const AGREEMENT_RE = /agreement|contract|s[oö]zle[sş]me|anla[sş]ma/i;
