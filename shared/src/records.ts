// Records kept under an account — contacts, opportunities, and whatever
// else a company tracks (risks, renewals, cases…). Built-in kinds come with
// fields Tendwell knows how to use; anything else is the company's own.
import type { Locale } from './i18n';
import type { AccountField, Localized } from './model';

export const RECORD_KINDS = ['contact', 'opportunity', 'custom'] as const;
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

/** Opportunity status options: the one thing every CRM agrees on. */
export const OPPORTUNITY_STATUS = [
  { key: 'open', label: L('Open', 'Açık') },
  { key: 'won', label: L('Won', 'Kazanıldı') },
  { key: 'lost', label: L('Lost', 'Kaybedildi') },
];

export const BUILTIN_TYPES: Record<Exclude<RecordKind, 'custom'>, { key: string; name: RecordType['name']; fields: AccountField[] }> = {
  contact: {
    key: 'contact',
    name: { one: L('Contact', 'Kişi'), other: L('Contacts', 'Kişiler') },
    fields: [
      { key: 'email', label: L('Email', 'E-posta'), type: 'email' },
      { key: 'phone', label: L('Phone', 'Telefon'), type: 'text' },
      { key: 'title', label: L('Job title', 'Unvan'), type: 'text' },
    ],
  },
  opportunity: {
    key: 'opportunity',
    name: { one: L('Opportunity', 'Fırsat'), other: L('Opportunities', 'Fırsatlar') },
    fields: [
      { key: 'amount', label: L('Amount', 'Tutar'), type: 'money' },
      { key: 'close_date', label: L('Close date', 'Kapanış tarihi'), type: 'date' },
      { key: 'stage', label: L('Stage', 'Aşama'), type: 'select', options: [] },
      { key: 'status', label: L('Status', 'Durum'), type: 'select', options: OPPORTUNITY_STATUS },
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
  { kind: 'contact', field: { key: 'contacts', label: L('Contacts', 'Kişi sayısı'), type: 'number', rollup: { type: 'contact', fn: 'count' } } },
];

export function typeLabel(t: Pick<RecordType, 'name'>, locale: Locale, plural = true): string {
  const l = plural ? t.name.other : t.name.one;
  return l?.[locale] ?? l?.en ?? l?.tr ?? '';
}
