import { en, type MessageKey } from './en';
import { tr } from './tr';

export type Locale = 'en' | 'tr';
export const LOCALES: Locale[] = ['en', 'tr'];
export const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, tr };
export type { MessageKey };

// The company's own words for the things it manages. Stored on the org as
//   { "account": { "en": { "one": "Client", "other": "Clients" }, "tr": {...} } }
export interface Terms {
  account?: Partial<Record<Locale, { one?: string; other?: string }>>;
}

const DEFAULT_TERMS: Record<Locale, { one: string; other: string }> = {
  en: { one: 'Account', other: 'Accounts' },
  tr: { one: 'Müşteri', other: 'Müşteriler' },
};

export function accountWords(locale: Locale, terms?: Terms | null) {
  const custom = terms?.account?.[locale];
  return {
    one: custom?.one?.trim() || DEFAULT_TERMS[locale].one,
    other: custom?.other?.trim() || DEFAULT_TERMS[locale].other,
  };
}

export function normalizeLocale(value: unknown, fallback: Locale = 'en'): Locale {
  return value === 'tr' || value === 'en' ? value : fallback;
}

export type Vars = Record<string, string | number>;

// t('auth.signInTo', { org: 'Demo' }) → "Sign in to Demo".
// {account}/{accounts} are always available from the terms; lower-case
// variants {account_l}/{accounts_l} are filled for use inside sentences.
export function translate(locale: Locale, key: MessageKey, vars: Vars = {}, terms?: Terms | null): string {
  const template = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
  const words = accountWords(locale, terms);
  const lower = (s: string) => s.toLocaleLowerCase(locale === 'tr' ? 'tr-TR' : 'en-US');
  const all: Vars = {
    account: words.one,
    accounts: words.other,
    account_l: lower(words.one),
    accounts_l: lower(words.other),
    ...vars,
  };
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    Object.prototype.hasOwnProperty.call(all, name) ? String(all[name]) : m,
  );
}
