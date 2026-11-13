import { en, type MessageKey } from './en';
import { tr } from './tr';
import { ar } from './ar';
import { he } from './he';
import { fa } from './fa';
import { zhHans } from './zh-Hans';
import { zhHant } from './zh-Hant';
import { ja } from './ja';
import { ko } from './ko';

// The languages Curahold speaks. English and Turkish are fully written; the
// others are turned on with their own correct name and reading direction, and
// fall back to English for any phrase not yet translated (see `translate`), so
// adding a language is safe before its dictionary is complete.
export type Locale = 'en' | 'tr' | 'ar' | 'he' | 'fa' | 'zh-Hans' | 'zh-Hant' | 'ja' | 'ko';

export interface LocaleInfo {
  /** The language's name in its own words — what the picker shows. */
  name: string;
  /** Its English name, for places that list languages in English. */
  english: string;
  /** Reading direction; 'rtl' for Arabic, Hebrew and Persian. */
  dir: 'ltr' | 'rtl';
  /** The BCP-47 tag for dates, numbers and letter case. */
  bcp47: string;
}

// Names are the endonyms (each language's own name), kept exact on purpose.
export const LOCALE_INFO: Record<Locale, LocaleInfo> = {
  en: { name: 'English', english: 'English', dir: 'ltr', bcp47: 'en' },
  tr: { name: 'Türkçe', english: 'Turkish', dir: 'ltr', bcp47: 'tr' },
  ar: { name: 'العربية', english: 'Arabic', dir: 'rtl', bcp47: 'ar' },
  he: { name: 'עברית', english: 'Hebrew', dir: 'rtl', bcp47: 'he' },
  fa: { name: 'فارسی', english: 'Persian', dir: 'rtl', bcp47: 'fa' },
  'zh-Hans': { name: '简体中文', english: 'Chinese (Simplified)', dir: 'ltr', bcp47: 'zh-Hans' },
  'zh-Hant': { name: '繁體中文', english: 'Chinese (Traditional)', dir: 'ltr', bcp47: 'zh-Hant' },
  ja: { name: '日本語', english: 'Japanese', dir: 'ltr', bcp47: 'ja' },
  ko: { name: '한국어', english: 'Korean', dir: 'ltr', bcp47: 'ko' },
};

export const LOCALES = Object.keys(LOCALE_INFO) as Locale[];
export const isRtl = (locale: Locale) => LOCALE_INFO[locale].dir === 'rtl';
export const bcp47Of = (locale: Locale) => LOCALE_INFO[locale].bcp47;

// Fully written dictionaries first, then the ones that fall back to English.
export const dictionaries: Record<Locale, Partial<Record<MessageKey, string>>> = {
  en,
  tr,
  ar,
  he,
  fa,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  ja,
  ko,
};
export type { MessageKey };

// The company's own words for the things it manages. Stored on the org as
//   { "account": { "en": { "one": "Client", "other": "Clients" }, "tr": {...} } }
export interface Terms {
  account?: Partial<Record<Locale, { one?: string; other?: string }>>;
}

const DEFAULT_TERMS: Record<Locale, { one: string; other: string }> = {
  en: { one: 'Account', other: 'Accounts' },
  tr: { one: 'Müşteri', other: 'Müşteriler' },
  ar: { one: 'عميل', other: 'العملاء' },
  he: { one: 'לקוח', other: 'לקוחות' },
  fa: { one: 'مشتری', other: 'مشتریان' },
  'zh-Hans': { one: '客户', other: '客户' },
  'zh-Hant': { one: '客戶', other: '客戶' },
  ja: { one: '顧客', other: '顧客' },
  ko: { one: '고객', other: '고객' },
};

export function accountWords(locale: Locale, terms?: Terms | null) {
  const custom = terms?.account?.[locale];
  const base = DEFAULT_TERMS[locale] ?? DEFAULT_TERMS.en;
  return {
    one: custom?.one?.trim() || base.one,
    other: custom?.other?.trim() || base.other,
  };
}

export function normalizeLocale(value: unknown, fallback: Locale = 'en'): Locale {
  return typeof value === 'string' && (LOCALES as string[]).includes(value) ? (value as Locale) : fallback;
}

export type Vars = Record<string, string | number>;

// t('auth.signInTo', { org: 'Demo' }) → "Sign in to Demo".
// {account}/{accounts} are always available from the terms; lower-case
// variants {account_l}/{accounts_l} are filled for use inside sentences.
// A phrase missing from the chosen language falls back to English.
export function translate(locale: Locale, key: MessageKey, vars: Vars = {}, terms?: Terms | null): string {
  const template = dictionaries[locale]?.[key] ?? dictionaries.en[key] ?? key;
  const words = accountWords(locale, terms);
  const lower = (s: string) => s.toLocaleLowerCase(bcp47Of(locale));
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
