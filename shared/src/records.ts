// Records kept under an account — contacts, opportunities, and whatever
// else a company tracks (risks, renewals, cases…). Built-in kinds come with
// fields Tendwell knows how to use; anything else is the company's own.
import type { Locale } from './i18n';
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
  /** The columns its table shows, as the company chose them; null is Tendwell's choice. */
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

const L = (en: string, tr: string): Localized => ({ en, tr });

/** Where a stakeholder stands towards us. Keys are fixed; labels can be renamed. */
export const STANCES = [
  { key: 'champion', label: L('Champion', 'Güçlü destekçi') },
  { key: 'supporter', label: L('Supporter', 'Destekçi') },
  { key: 'neutral', label: L('Neutral', 'Nötr') },
  { key: 'skeptic', label: L('Skeptic', 'Şüpheci') },
  { key: 'blocker', label: L('Blocker', 'Engelleyici') },
];

/** How much say a stakeholder has in the decision. */
export const DECISION_LEVELS = [
  { key: 'decision_maker', label: L('Decision maker', 'Karar verici') },
  { key: 'approver', label: L('Approver (budget)', 'Onaylayan (bütçe)') },
  { key: 'influencer', label: L('Influencer', 'Etkileyen') },
  { key: 'evaluator', label: L('Evaluator', 'Değerlendiren') },
  { key: 'user', label: L('User', 'Kullanıcı') },
];

/** Where a support ticket stands. Every support tool's own states fold into these four. */
export const TICKET_STATUSES = [
  { key: 'open', label: L('Open', 'Açık'), color: 'coral' as const },
  { key: 'pending', label: L('Waiting', 'Beklemede'), color: 'honey' as const },
  { key: 'solved', label: L('Solved', 'Çözüldü'), color: 'leaf' as const },
  { key: 'closed', label: L('Closed', 'Kapandı'), color: 'stone' as const },
];
export const TICKET_PRIORITIES = [
  { key: 'low', label: L('Low', 'Düşük') },
  { key: 'normal', label: L('Normal', 'Normal') },
  { key: 'high', label: L('High', 'Yüksek') },
  { key: 'urgent', label: L('Urgent', 'Acil'), color: 'coral' as const },
];
/** Still needing an answer. */
export const TICKET_OPEN = ['open', 'pending'];

/** Any tool's ticket state in Tendwell's four ("Problem Solved", "Waiting on customer", "Kapandı"…). */
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
  { key: 'open', label: L('Open', 'Açık') },
  { key: 'won', label: L('Won', 'Kazanıldı') },
  { key: 'lost', label: L('Lost', 'Kaybedildi') },
];

/** Stages a deal moves through until it is won or lost; a company renames or replaces them, a CRM brings its own. */
export const OPPORTUNITY_STAGES: FieldOption[] = [
  { key: 'discovery', label: L('Discovery', 'Keşif'), color: 'sky' },
  { key: 'proposal', label: L('Proposal', 'Teklif'), color: 'honey' },
  { key: 'negotiation', label: L('Negotiation', 'Pazarlık'), color: 'plum' },
  { key: 'commit', label: L('Commit', 'Söz alındı'), color: 'sea' },
];
/** What the deal is: a new customer, more from an existing one, or a renewal. */
export const OPPORTUNITY_KINDS: FieldOption[] = [
  { key: 'new', label: L('New business', 'Yeni iş'), color: 'sky' },
  { key: 'expansion', label: L('Expansion', 'Genişleme'), color: 'leaf' },
  { key: 'renewal', label: L('Renewal', 'Yenileme'), color: 'stone' },
];

export const BUILTIN_TYPES: Record<Exclude<RecordKind, 'custom'>, { key: string; name: RecordType['name']; fields: AccountField[] }> = {
  contact: {
    key: 'contact',
    name: { one: L('Contact', 'Kişi'), other: L('Contacts', 'Kişiler') },
    fields: [
      { key: 'first_name', label: L('First name', 'Ad'), type: 'text' },
      { key: 'last_name', label: L('Last name', 'Soyad'), type: 'text' },
      { key: 'title', label: L('Job title', 'Unvan'), type: 'text' },
      { key: 'email', label: L('Email', 'E-posta'), type: 'email' },
      { key: 'phone', label: L('Phone', 'Telefon'), type: 'text' },
      { key: 'linkedin', label: L('LinkedIn', 'LinkedIn'), type: 'url' },
      { key: 'decision', label: L('Decision role', 'Karar düzeyi'), type: 'select', options: DECISION_LEVELS },
      { key: 'stance', label: L('Stance towards us', 'Bize karşı duruşu'), type: 'select', options: STANCES },
    ],
  },
  ticket: {
    key: 'ticket',
    name: { one: L('Support ticket', 'Destek talebi'), other: L('Support tickets', 'Destek talepleri') },
    fields: [
      { key: 'status', label: L('Status', 'Durum'), type: 'select', options: TICKET_STATUSES },
      { key: 'priority', label: L('Priority', 'Öncelik'), type: 'select', options: TICKET_PRIORITIES },
      { key: 'opened_at', label: L('Opened', 'Açıldı'), type: 'date' },
      { key: 'solved_at', label: L('Solved', 'Çözüldü'), type: 'date' },
      { key: 'requester', label: L('Requester', 'Talep eden'), type: 'email' },
      { key: 'channel', label: L('Channel', 'Kanal'), type: 'text' },
      { key: 'url', label: L('Link', 'Bağlantı'), type: 'url' },
    ],
  },
  opportunity: {
    key: 'opportunity',
    name: { one: L('Opportunity', 'Fırsat'), other: L('Opportunities', 'Fırsatlar') },
    fields: [
      { key: 'amount', label: L('Amount', 'Tutar'), type: 'money' },
      { key: 'close_date', label: L('Close date', 'Kapanış tarihi'), type: 'date' },
      { key: 'stage', label: L('Stage', 'Aşama'), type: 'select', options: OPPORTUNITY_STAGES },
      { key: 'status', label: L('Status', 'Durum'), type: 'select', options: OPPORTUNITY_STATUS },
      { key: 'kind', label: L('Type', 'Tür'), type: 'select', options: OPPORTUNITY_KINDS },
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
    name: { one: L('Agreement', 'Sözleşme'), other: L('Agreements', 'Sözleşmeler') },
    hint: L('Contracts with their link, dates and value; the Renewals view shows them.', 'Bağlantısı, tarihleri ve tutarıyla sözleşmeler; Yenilemeler görünümünde çıkar.'),
    fields: [
      { key: 'link', label: L('Link', 'Bağlantı'), type: 'url' },
      { key: 'start_date', label: L('Starts', 'Başlangıç'), type: 'date' },
      { key: 'end_date', label: L('Ends', 'Bitiş'), type: 'date' },
      { key: 'value', label: L('Value', 'Tutar'), type: 'money' },
      {
        key: 'status',
        label: L('Status', 'Durum'),
        type: 'select',
        options: [
          { key: 'draft', label: L('Draft', 'Taslak'), color: 'stone' },
          { key: 'signed', label: L('Signed', 'İmzalandı'), color: 'leaf' },
          { key: 'expired', label: L('Expired', 'Süresi doldu'), color: 'coral' },
        ],
      },
    ],
  },
  {
    key: 'risk',
    name: { one: L('Risk', 'Risk'), other: L('Risks', 'Riskler') },
    hint: L('What could lose a customer, how bad it is, and what is being done.', 'Bir müşteriyi kaybettirebilecek şey, ne kadar ciddi olduğu ve ne yapıldığı.'),
    fields: [
      {
        key: 'severity',
        label: L('Severity', 'Ciddiyet'),
        type: 'select',
        options: [
          { key: 'low', label: L('Low', 'Düşük'), color: 'sky' },
          { key: 'medium', label: L('Medium', 'Orta'), color: 'honey' },
          { key: 'high', label: L('High', 'Yüksek'), color: 'coral' },
        ],
      },
      {
        key: 'reason',
        label: L('Reason', 'Neden'),
        type: 'select',
        options: [
          { key: 'price', label: L('Price', 'Fiyat'), color: 'honey' },
          { key: 'product', label: L('Product fit', 'Ürün uyumu'), color: 'plum' },
          { key: 'champion', label: L('Champion left', 'Destekçi ayrıldı'), color: 'rose' },
          { key: 'service', label: L('Service', 'Hizmet'), color: 'sky' },
          { key: 'other', label: L('Other', 'Diğer'), color: 'stone' },
        ],
      },
      { key: 'at_stake', label: L('At stake', 'Risk altındaki tutar'), type: 'money' },
      {
        key: 'status',
        label: L('Status', 'Durum'),
        type: 'select',
        options: [
          { key: 'open', label: L('Open', 'Açık'), color: 'coral' },
          { key: 'handled', label: L('Handled', 'Çözüldü'), color: 'leaf' },
        ],
      },
    ],
  },
  {
    key: 'request',
    name: { one: L('Product request', 'Ürün talebi'), other: L('Product requests', 'Ürün talepleri') },
    hint: L('What customers ask the product for, and how much it matters to them.', 'Müşterilerin üründen istedikleri ve onlar için ne kadar önemli olduğu.'),
    fields: [
      {
        key: 'priority',
        label: L('Priority', 'Öncelik'),
        type: 'select',
        options: [
          { key: 'nice', label: L('Nice to have', 'Olsa iyi olur'), color: 'sky' },
          { key: 'important', label: L('Important', 'Önemli'), color: 'honey' },
          { key: 'blocker', label: L('Blocker', 'Engelleyici'), color: 'coral' },
        ],
      },
      {
        key: 'status',
        label: L('Status', 'Durum'),
        type: 'select',
        options: [
          { key: 'new', label: L('New', 'Yeni'), color: 'stone' },
          { key: 'planned', label: L('Planned', 'Planlandı'), color: 'plum' },
          { key: 'shipped', label: L('Shipped', 'Yayında'), color: 'leaf' },
          { key: 'declined', label: L('Declined', 'Reddedildi'), color: 'rose' },
        ],
      },
      { key: 'link', label: L('Link', 'Bağlantı'), type: 'url' },
    ],
  },
  {
    key: 'quote',
    name: { one: L('Quote', 'Teklif'), other: L('Quotes', 'Teklifler') },
    hint: L('Proposals sent to customers: the amount, until when, and the answer.', 'Müşterilere gönderilen teklifler: tutar, geçerlilik ve yanıt.'),
    fields: [
      { key: 'amount', label: L('Amount', 'Tutar'), type: 'money' },
      { key: 'valid_until', label: L('Valid until', 'Geçerlilik'), type: 'date' },
      {
        key: 'status',
        label: L('Status', 'Durum'),
        type: 'select',
        options: [
          { key: 'draft', label: L('Draft', 'Taslak'), color: 'stone' },
          { key: 'sent', label: L('Sent', 'Gönderildi'), color: 'sky' },
          { key: 'accepted', label: L('Accepted', 'Kabul edildi'), color: 'leaf' },
          { key: 'declined', label: L('Declined', 'Reddedildi'), color: 'coral' },
        ],
      },
      { key: 'link', label: L('Link', 'Bağlantı'), type: 'url' },
    ],
  },
];

/** Account fields offered when opportunities or contacts are switched on. */
export const ROLLUP_PRESETS: { kind: RecordKind; field: AccountField }[] = [
  {
    kind: 'opportunity',
    field: { key: 'open_pipeline', label: L('Open pipeline', 'Açık fırsat tutarı'), type: 'money', rollup: { type: 'opportunity', fn: 'sum', field: 'amount', where: { field: 'status', option: 'open' } } },
  },
  {
    kind: 'opportunity',
    field: { key: 'next_close', label: L('Next close date', 'En yakın kapanış'), type: 'date', rollup: { type: 'opportunity', fn: 'min', field: 'close_date', where: { field: 'status', option: 'open' } } },
  },
  {
    kind: 'opportunity',
    field: { key: 'open_opportunities', label: L('Open opportunities', 'Açık fırsat sayısı'), type: 'number', rollup: { type: 'opportunity', fn: 'count', where: { field: 'status', option: 'open' } } },
  },
  { kind: 'ticket', field: { key: 'open_tickets', label: L('Open tickets', 'Açık destek talebi'), type: 'number', rollup: { type: 'ticket', fn: 'count', where: { field: 'status', option: 'open' } } } },
  { kind: 'ticket', field: { key: 'tickets', label: L('Support tickets', 'Destek talebi sayısı'), type: 'number', rollup: { type: 'ticket', fn: 'count' } } },
  { kind: 'contact', field: { key: 'contacts', label: L('Contacts', 'Kişi sayısı'), type: 'number', rollup: { type: 'contact', fn: 'count' } } },
  { kind: 'contact', field: { key: 'champions', label: L('Champions', 'Güçlü destekçi sayısı'), type: 'number', rollup: { type: 'contact', fn: 'count', where: { field: 'stance', option: 'champion' } } } },
  { kind: 'contact', field: { key: 'blockers', label: L('Blockers', 'Engelleyici sayısı'), type: 'number', rollup: { type: 'contact', fn: 'count', where: { field: 'stance', option: 'blocker' } } } },
];

export function typeLabel(t: Pick<RecordType, 'name'>, locale: Locale, plural = true): string {
  const l = plural ? t.name.other : t.name.one;
  return l?.[locale] ?? l?.en ?? l?.tr ?? '';
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
