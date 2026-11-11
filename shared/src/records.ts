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
}

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
