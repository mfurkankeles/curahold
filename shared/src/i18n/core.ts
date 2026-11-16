// The dictionary-free core of the i18n module: languages, their names and
// directions, the company's own words, and `translate`. It carries no
// dictionary itself; `translate` reads whatever has been registered.
//
// - The server, the sales-site build and the tests import `./index`, which
//   registers all nine dictionaries synchronously (and re-exports this file).
// - The web app and the portal are built with `index` swapped for this file
//   (see ./vite-plugin.ts): they register only the language in use, fetched on
//   demand, already filled with English wherever a phrase is not yet translated.
import type { MessageKey } from './en';

export type Dictionary = Partial<Record<MessageKey, string>>;

const registry: Partial<Record<Locale, Dictionary>> = {};

/** The registered dictionaries (all nine through `./index`; only loaded ones in the browser). */
export const dictionaries = registry as Record<Locale, Dictionary>;
export function registerDictionary(locale: Locale, dict: Dictionary) {
  registry[locale] = dict;
}
export const hasDictionary = (locale: Locale) => registry[locale] !== undefined;
export type { MessageKey };

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
  const template = registry[locale]?.[key] ?? registry.en?.[key] ?? key;
  const words = accountWords(locale, terms);
  const lower = (s: string) => s.toLocaleLowerCase(bcp47Of(locale));
  const all: Vars = {
    account: words.one,
    accounts: words.other,
    account_l: lower(words.one),
    accounts_l: lower(words.other),
    ...vars,
  };
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (Object.prototype.hasOwnProperty.call(all, name) ? String(all[name]) : m));
}

/**
 * One phrase in every language, read from the dictionaries when asked — the
 * form built-in content takes (template boards and fields, record types, ready
 * reports and pages). Show it with `labelOf`/`pick` in the reader's language;
 * when it is written into a company's data, JSON keeps the values present then:
 * all nine on the server (every dictionary registered), the active one in the
 * browser. Stored data is never translated again afterwards.
 */
export function phrase(key: MessageKey): Partial<Record<Locale, string>> {
  const out = {} as Partial<Record<Locale, string>>;
  for (const l of LOCALES) Object.defineProperty(out, l, { enumerable: true, get: () => registry[l]?.[key] });
  return out;
}

/** The first text a phrase has: the reader's language, then English, then any language it was stored in. */
export function phraseIn(l: Partial<Record<Locale, string>> | undefined, locale: Locale): string {
  if (!l) return '';
  return l[locale] ?? l.en ?? Object.values(l).find((v) => typeof v === 'string' && v !== '') ?? '';
}

// ---------------------------------------------------------------- dates, numbers and money
//
// Everything that formats or reads a date, a number or an amount asks these,
// so each language gets its own order and separators — never a two-way branch.

/**
 * The tag Intl formats with. English keeps the day-before-month order it has
 * always shown ("15 Nov 2026"); Arabic keeps the Western digits its dictionary
 * uses. Every other language formats exactly as its own tag says.
 */
export function intlTag(locale: Locale | string): string {
  const l = normalizeLocale(locale);
  return l === 'en' ? 'en-GB' : l === 'ar' ? 'ar-u-nu-latn' : bcp47Of(l);
}

/** The digit-group and decimal marks people type in this language ("1.250,50" in Turkish). */
export function numberMarks(locale: Locale | string): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(intlTag(locale)).formatToParts(12345.6);
  return { group: parts.find((p) => p.type === 'group')?.value ?? ',', decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.' };
}

/** Whether "03/04" means the 3rd of April here (day first) rather than March 4th. Gregorian, as typed. */
export function dayFirst(locale: Locale): boolean {
  const order = new Intl.DateTimeFormat(`${bcp47Of(locale)}-u-ca-gregory`, { day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(new Date(Date.UTC(2027, 11, 31)));
  return order.findIndex((p) => p.type === 'day') < order.findIndex((p) => p.type === 'month');
}

/** What separates the columns of a spreadsheet file here: ";" where the decimal mark is a comma. */
/**
 * The languages the help centre is written in (scripts/build-docs.ts). Help
 * search and links use the person's language when it is one of them, English
 * otherwise; this list grows when the help centre does.
 */
export const HELP_LANGUAGES = ['en', 'tr', 'ar'] as const satisfies readonly Locale[];
export type HelpLanguage = (typeof HELP_LANGUAGES)[number];
export const helpLanguageOf = (locale: Locale): HelpLanguage => ((HELP_LANGUAGES as readonly Locale[]).includes(locale) ? (locale as HelpLanguage) : 'en');

/** A language's name as the reader says it ("Japanese" for an English reader, "Japonca" for a Turkish one). */
export function languageName(of: Locale, reader: Locale): string {
  try {
    return new Intl.DisplayNames([intlTag(reader)], { type: 'language' }).of(bcp47Of(of)) ?? LOCALE_INFO[of].name;
  } catch {
    return LOCALE_INFO[of].name;
  }
}

export const csvSeparator = (locale: Locale | string) => (numberMarks(locale).decimal === ',' ? ';' : ',');
