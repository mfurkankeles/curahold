// The dictionary-free core of the i18n module: languages, their names and
// directions, the company's own words, and `translate`. It carries no
// dictionary itself; `translate` reads whatever has been registered.
//
// - The server, the sales-site build and the tests import `./index`, which
//   registers all eleven dictionaries synchronously (and re-exports this file).
// - The web app and the portal are built with `index` swapped for this file
//   (see ./vite-plugin.ts): they register only the language in use, fetched on
//   demand, already filled with English wherever a phrase is not yet translated.
import type { MessageKey } from './en';
import { resolveKoParticles } from './koParticles';

export type Dictionary = Partial<Record<MessageKey, string>>;

const registry: Partial<Record<Locale, Dictionary>> = {};

/** The registered dictionaries (all eleven through `./index`; only loaded ones in the browser). */
export const dictionaries = registry as Record<Locale, Dictionary>;
/** Registers a language's dictionary (each dictionary file calls it), so translate() can find it. */
export function registerDictionary(locale: Locale, dict: Dictionary) {
  registry[locale] = dict;
}
/** Whether a language's dictionary is loaded yet (the browser loads them lazily). */
export const hasDictionary = (locale: Locale) => registry[locale] !== undefined;
export type { MessageKey };

// The languages Curahold speaks. English and Turkish are fully written; the
// others are turned on with their own correct name and reading direction, and
// fall back to English for any phrase not yet translated (see `translate`), so
// adding a language is safe before its dictionary is complete.
export type Locale = 'en' | 'tr' | 'ar' | 'he' | 'fa' | 'zh-Hans' | 'zh-Hant' | 'ja' | 'ko' | 'hi' | 'ms';

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
  hi: { name: 'हिन्दी', english: 'Hindi', dir: 'ltr', bcp47: 'hi' },
  ms: { name: 'Bahasa Melayu', english: 'Malay', dir: 'ltr', bcp47: 'ms' },
};

export const LOCALES = Object.keys(LOCALE_INFO) as Locale[];
/** Whether a language is written right to left (Arabic, Persian, Hebrew). */
export const isRtl = (locale: Locale) => LOCALE_INFO[locale].dir === 'rtl';
/** A language's BCP 47 tag, for Intl formatting and the `lang` attribute. */
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
  hi: { one: 'ग्राहक', other: 'ग्राहक' },
  ms: { one: 'Pelanggan', other: 'Pelanggan' },
};

/** The company's own words for "customer" in a language (its terms), else the dictionary's. */
export function accountWords(locale: Locale, terms?: Terms | null) {
  const custom = terms?.account?.[locale];
  const base = DEFAULT_TERMS[locale] ?? DEFAULT_TERMS.en;
  return {
    one: custom?.one?.trim() || base.one,
    other: custom?.other?.trim() || base.other,
  };
}

/** A supported language from any value, else `fallback`. */
export function normalizeLocale(value: unknown, fallback: Locale = 'en'): Locale {
  return typeof value === 'string' && (LOCALES as string[]).includes(value) ? (value as Locale) : fallback;
}

export type Vars = Record<string, string | number>;

// t('auth.signInTo', { org: 'Demo' }) → "Sign in to Demo".
// {account}/{accounts} are always available from the terms; lower-case
// variants {account_l}/{accounts_l} are filled for use inside sentences.
// A phrase missing from the chosen language falls back to English.
// A key with a "<key>.one" sibling takes that form when {n} is exactly 1 ("1 pt", "3 pts").
export function translate(locale: Locale, key: MessageKey, vars: Vars = {}, terms?: Terms | null): string {
  const dict = registry[locale]?.[key] !== undefined ? registry[locale] : registry.en;
  const one = vars.n === 1 || vars.n === '1' ? dict?.[`${key}.one` as MessageKey] : undefined;
  const template = one ?? dict?.[key] ?? key;
  const words = accountWords(locale, terms);
  const lower = (s: string) => s.toLocaleLowerCase(bcp47Of(locale));
  const all: Vars = {
    account: words.one,
    accounts: words.other,
    account_l: lower(words.one),
    accounts_l: lower(words.other),
    ...vars,
  };
  const text = agreeNumbers(locale, template, all).replace(/\{(\w+)\}/g, (m, name: string) => (Object.prototype.hasOwnProperty.call(all, name) ? String(all[name]) : m));
  // Korean particles depend on the name just filled in (Acme를, Velto는): ./koParticles.ts.
  return locale === 'ko' ? resolveKoParticles(text) : text;
}

// Number agreement for languages where the noun after a count changes with the
// count beyond "one/other" (CLDR plural rules, Intl.PluralRules). A dictionary
// writes "{n} أيام"; the noun right after a numeric placeholder is put in the
// form the count needs: 3–10 plural (أيام), 11–99 singular accusative (يومًا),
// 1 and 100–102 singular (يوم); 0 and 2 take the plural.
// Each entry: [plural (3–10), singular, singular accusative (11–99)].
const COUNTED: Partial<Record<Locale, [string, string, string][]>> = {
  ar: [
    ['أيام', 'يوم', 'يومًا'], ['ساعات', 'ساعة', 'ساعة'], ['دقائق', 'دقيقة', 'دقيقة'], ['ثوانٍ', 'ثانية', 'ثانية'],
    ['أسابيع', 'أسبوع', 'أسبوعًا'], ['أشهر', 'شهر', 'شهرًا'], ['سنوات', 'سنة', 'سنة'], ['مرات', 'مرة', 'مرة'],
    ['مهام', 'مهمة', 'مهمة'], ['خطوات', 'خطوة', 'خطوة'], ['أشخاص', 'شخص', 'شخصًا'], ['عملاء', 'عميل', 'عميلًا'],
    ['صفوف', 'صف', 'صفًا'], ['ملفات', 'ملف', 'ملفًا'], ['مقاعد', 'مقعد', 'مقعدًا'], ['تذاكر', 'تذكرة', 'تذكرة'],
    ['قوائم', 'قائمة', 'قائمة'], ['عناصر', 'عنصر', 'عنصرًا'], ['حقول', 'حقل', 'حقلًا'], ['تغييرات', 'تغيير', 'تغييرًا'],
    ['سجلات', 'سجل', 'سجلًا'], ['أمور', 'أمر', 'أمرًا'], ['أدوار', 'دور', 'دورًا'], ['أجهزة', 'جهاز', 'جهازًا'],
    ['وعود', 'وعد', 'وعدًا'], ['مفاتيح', 'مفتاح', 'مفتاحًا'], ['مجموعات', 'مجموعة', 'مجموعة'], ['لوحات', 'لوحة', 'لوحة'],
    ['قواعد', 'قاعدة', 'قاعدة'], ['فواتير', 'فاتورة', 'فاتورة'], ['صفقات', 'صفقة', 'صفقة'], ['ردود', 'رد', 'ردًا'],
    ['دعوات', 'دعوة', 'دعوة'], ['جولات', 'جولة', 'جولة'], ['نقاط', 'نقطة', 'نقطة'], ['تعليقات', 'تعليق', 'تعليقًا'],
    ['طلبات', 'طلب', 'طلبًا'], ['رسائل', 'رسالة', 'رسالة'], ['حسابات', 'حساب', 'حسابًا'], ['شركات', 'شركة', 'شركة'],
    ['تجديدات', 'تجديد', 'تجديدًا'],
  ],
};

// English: a dictionary writes "{n} days"; for exactly 1 the noun right after the count is singular
// ("1 day", "1 renewal" — a renewals list once said "1 renewals"). A key's own "<key>.one" form still
// wins (for a sentence whose verb changes too). Every noun the dictionary counts is listed here.
const SINGULAR: Partial<Record<Locale, Record<string, string>>> = {
  en: Object.fromEntries(
    (
      'days tasks rows steps files weeks points changes minutes records items times lists roles months seats hours tours rules kinds ' +
      'invitations permissions fields customers renewals deals contacts cards subtasks comments links passkeys values questions datasets ' +
      'invoices boards updates people:person replies:reply entries:entry deliveries:delivery accounts opportunities:opportunity companies:company'
    )
      .split(' ')
      .map((w) => (w.includes(':') ? (w.split(':') as [string, string]) : [w, w.slice(0, -1)])),
  ),
};
// Hebrew: a dictionary writes "{n} ימים"; for exactly 1 Hebrew says the noun and then "one", which agrees in gender
// ("יום אחד", "משימה אחת"), not "1 ימים". An adjective right after the noun turns singular too and "one" moves after
// it ("משימה פתוחה אחת"). Each entry: plural: singular/gender. A key's own "<key>.one" form still wins.
const HE_ONE: Record<string, [string, 'm' | 'f']> = Object.fromEntries(
  (
    'ימים:יום/m משימות:משימה/f שורות:שורה/f אנשים:אדם/m קבצים:קובץ/m שינויים:שינוי/m שבועות:שבוע/m רשומות:רשומה/f ' +
    'צעדים:צעד/m פריטים:פריט/m פעמים:פעם/f פניות:פנייה/f מפתחות:מפתח/m מושבים:מושב/m דברים:דבר/m תשובות:תשובה/f ' +
    'תפקידים:תפקיד/m תגובות:תגובה/f שלבים:שלב/m שדות:שדה/m רשימות:רשימה/f קריאות:קריאה/f כלים:כלי/m ' +
    'חשבוניות:חשבונית/f חודשים:חודש/m הזמנות:הזמנה/f אוטומציות:אוטומציה/f שעות:שעה/f דקות:דקה/f מכשירים:מכשיר/m ' +
    'לקוחות:לקוח/m כרטיסים:כרטיס/m עסקאות:עסקה/f חידושים:חידוש/m הודעות:הודעה/f שאלות:שאלה/f ערכים:ערך/m ' +
    'כללים:כלל/m חשבונות:חשבון/m סיורים:סיור/m שניות:שנייה/f שנים:שנה/f לוחות:לוח/m קישורים:קישור/m מסמכים:מסמך/m'
  )
    .split(' ')
    .map((e) => {
      const [plural, rest] = e.split(':');
      const [singular, g] = rest.split('/');
      return [plural, [singular, g as 'm' | 'f']];
    }),
);
const HE_ADJ: Record<string, string> = {
  פתוחות: 'פתוחה', פתוחים: 'פתוח', ממתינים: 'ממתין', ממתינות: 'ממתינה', תקועים: 'תקוע', תקועות: 'תקועה',
  חדשים: 'חדש', חדשות: 'חדשה', נוספים: 'נוסף', נוספות: 'נוספת', פעילים: 'פעיל', פעילות: 'פעילה',
  מלאים: 'מלא', מלאות: 'מלאה', מחוברים: 'מחובר', מחוברות: 'מחוברת', מקושרים: 'מקושר', מקושרות: 'מקושרת',
  אחרים: 'אחר', אחרות: 'אחרת', דחופים: 'דחוף', דחופות: 'דחופה',
};
// A verb right before or after the counted noun agrees with it once it is singular: [masculine, feminine].
const HE_VERB: Record<string, [string, string]> = {
  הועברו: ['הועבר', 'הועברה'], שונו: ['שונה', 'שונתה'], נוספו: ['נוסף', 'נוספה'], נותרו: ['נותר', 'נותרה'],
  נפתחו: ['נפתח', 'נפתחה'], נכנסו: ['נכנס', 'נכנסה'], הושמטו: ['הושמט', 'הושמטה'], הוסרו: ['הוסר', 'הוסרה'],
  יוצאו: ['יוצא', 'יוצאה'], נשלחו: ['נשלח', 'נשלחה'], נשמרו: ['נשמר', 'נשמרה'], הושלמו: ['הושלם', 'הושלמה'],
  עודכנו: ['עודכן', 'עודכנה'], נמחקו: ['נמחק', 'נמחקה'], עברו: ['עבר', 'עברה'], יתווספו: ['יתווסף', 'תתווסף'],
  דורשות: ['דורש', 'דורשת'], דורשים: ['דורש', 'דורשת'], ממתינות: ['ממתין', 'ממתינה'], ממתינים: ['ממתין', 'ממתינה'],
  מגיעים: ['מגיע', 'מגיעה'], מגיעות: ['מגיע', 'מגיעה'], עוברים: ['עובר', 'עוברת'], נכשלים: ['נכשל', 'נכשלת'],
  יכולים: ['יכול', 'יכולה'], יוכלו: ['יוכל', 'תוכל'], מחכים: ['מחכה', 'מחכה'],
};
const heWords = (o: object) => Object.keys(o).join('|');
const heOnePattern = new RegExp(
  `(?:(ש?)(${heWords(HE_VERB)}) )?(?:(?<![\\p{L}\\p{M}])([ובלמכהש]{1,3})-)?\\{(\\w+)\\} (${heWords(HE_ONE)})(?: (${heWords(HE_ADJ)}))?(?: (ש?)(${heWords(HE_VERB)}))?(?![\\p{L}\\p{M}])`,
  'gu',
);
const heEveryPattern = new RegExp(`(?<![\\p{L}\\p{M}])כל \\{(\\w+)\\} (${heWords(HE_ONE)})(?![\\p{L}\\p{M}])`, 'gu');
const singularPattern = new Map<Locale, RegExp>();
const pluralRules = new Map<Locale, Intl.PluralRules>();
const countedPattern = new Map<Locale, { re: RegExp; forms: Map<string, [string, string, string]> }>();

function agreeNumbers(locale: Locale, template: string, vars: Vars): string {
  const single = SINGULAR[locale];
  if (single && template.includes('{')) {
    let re = singularPattern.get(locale);
    if (!re) singularPattern.set(locale, (re = new RegExp(`\\{(\\w+)\\} (${Object.keys(single).join('|')})(?![\\p{L}\\p{M}])`, 'gu')));
    return template.replace(re, (m, name: string, word: string) => (String(vars[name]) === '1' ? `{${name}} ${single[word]}` : m));
  }
  if (locale === 'he' && template.includes('{')) {
    // "Every 1 day" is just "every day" (כל יום).
    const every = template.replace(heEveryPattern, (m, name: string, noun: string) => (String(vars[name]) === '1' ? `כל ${HE_ONE[noun][0]}` : m));
    // The company's own word for customers counts too ("{n} {accounts}"); its gender is not recorded, so the default
    // word's (לקוח, masculine) is used.
    const own = every.replace(/\{(\w+)\} \{(accounts|accounts_l)\}/g, (m, name: string, word: string) => (String(vars[name]) === '1' ? `{${word === 'accounts' ? 'account' : 'account_l'}} אחד` : m));
    return own.replace(heOnePattern, (m, preSh: string, pre: string | undefined, prefix: string | undefined, name: string, noun: string, adj?: string, postSh?: string, post?: string) => {
      if (String(vars[name]) !== '1') return m;
      const [singular, g] = HE_ONE[noun];
      const verb = (v: string) => HE_VERB[v][g === 'f' ? 1 : 0];
      // A one-letter prefix takes a hyphen before a numeral ("ב-3") and attaches to a word ("בשורה").
      const phrase = `${prefix ?? ''}${singular}${adj ? ` ${HE_ADJ[adj]}` : ''} ${g === 'f' ? 'אחת' : 'אחד'}`;
      return `${pre ? `${preSh}${verb(pre)} ` : ''}${phrase}${post ? ` ${postSh ?? ''}${verb(post)}` : ''}`;
    });
  }
  const nouns = COUNTED[locale];
  if (!nouns || !template.includes('{')) return template;
  let p = countedPattern.get(locale);
  if (!p) {
    const forms = new Map<string, [string, string, string]>();
    for (const e of nouns) for (const w of e) forms.set(w, e);
    const words = [...forms.keys()].sort((a, b) => b.length - a.length).join('|');
    p = { re: new RegExp(`\\{(\\w+)\\} (${words})(?![\\p{L}\\p{M}])`, 'gu'), forms };
    countedPattern.set(locale, p);
  }
  let rules = pluralRules.get(locale);
  if (!rules) pluralRules.set(locale, (rules = new Intl.PluralRules(bcp47Of(locale))));
  const { forms } = p;
  return template.replace(p.re, (m, name: string, word: string) => {
    const v = vars[name];
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
    if (!Number.isInteger(n) || n < 0) return m;
    const [plural, singular, accusative] = forms.get(word)!;
    const cat = rules.select(n);
    const noun = cat === 'few' ? plural : cat === 'many' ? accusative : cat === 'one' || cat === 'other' ? singular : plural;
    return `{${name}} ${noun}`;
  });
}

/**
 * One phrase in every language, read from the dictionaries when asked — the
 * form built-in content takes (template boards and fields, record types, ready
 * reports and pages). Show it with `labelOf`/`pick` in the reader's language;
 * when it is written into a company's data, JSON keeps the values present then:
 * all eleven on the server (every dictionary registered), the active one in the
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
 * The languages the help centre is written in (scripts/build-docs.ts): all
 * eleven. Help search, CuraAI answers and help links use the person's own
 * language; a page a language has no translation of yet (developer pages,
 * legal texts outside English and Turkish) is built there as the English page
 * with a note, so every link resolves. tests/i18n-help.test.ts checks this
 * list against the docs folders.
 */
export const HELP_LANGUAGES = ['en', 'tr', 'ar', 'he', 'fa', 'zh-Hans', 'zh-Hant', 'ja', 'ko', 'hi', 'ms'] as const satisfies readonly Locale[];
export type HelpLanguage = (typeof HELP_LANGUAGES)[number];
/** The help docs' language for a locale: the same when docs exist in it, else English. */
export const helpLanguageOf = (locale: Locale): HelpLanguage => ((HELP_LANGUAGES as readonly Locale[]).includes(locale) ? (locale as HelpLanguage) : 'en');

/** A language's name as the reader says it ("Japanese" for an English reader, "Japonca" for a Turkish one). */
export function languageName(of: Locale, reader: Locale): string {
  try {
    return new Intl.DisplayNames([intlTag(reader)], { type: 'language' }).of(bcp47Of(of)) ?? LOCALE_INFO[of].name;
  } catch {
    return LOCALE_INFO[of].name;
  }
}

/** The CSV column separator a spreadsheet expects in a locale: ";" where the decimal mark is a comma. */
export const csvSeparator = (locale: Locale | string) => (numberMarks(locale).decimal === ',' ? ';' : ',');
