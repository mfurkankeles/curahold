// What every accounting adapter shares: it is read only (the object mapping,
// the people list and every write are empty or refused), and a few helpers for
// the shapes accounting programs answer in.
import type { AccountingSource } from '../../../../../shared/src/sync';
import { CrmError, type CrmAdapter } from '../types';

type AccountingParts = Omit<CrmAdapter, 'objects' | 'fields' | 'users' | 'list' | 'update' | 'create' | 'tabular' | 'readOnly' | 'provider'> & {
  provider: AccountingSource;
  accounting: NonNullable<CrmAdapter['accounting']>;
  finance: NonNullable<CrmAdapter['finance']>;
};

/** An accounting adapter: reads only. Anything that would write to the program throws, whoever calls it. */
export function accountingAdapter(parts: AccountingParts): CrmAdapter {
  const refuse = async (): Promise<never> => {
    throw new CrmError('Accounting connections are read only: nothing is written to the accounting program', 405);
  };
  return {
    tabular: false,
    readOnly: true,
    objects: async () => [],
    fields: async () => [],
    users: async () => [],
    list: async () => ({ rows: [], next: null }),
    update: refuse,
    create: refuse,
    ...parts,
  };
}

/** A string, trimmed, or null. */
export const str = (v: unknown): string | null => (v === null || v === undefined || v === false ? null : String(v).trim() || null);

/** Milliseconds or "/Date(…)/" or an ISO string, as ISO; null otherwise. */
export function isoOf(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  const ms = /\/Date\((-?\d+)/.exec(v);
  if (ms) return new Date(Number(ms[1])).toISOString();
  // "2026-11-12 09:30:00" (Odoo, UTC) and "2026-11-12T09:30:00+0300" (Zoho) both read.
  const t = Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v) ? `${v.replace(' ', 'T')}Z` : v.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
