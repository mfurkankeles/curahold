// The sales site's languages: the one list every page, the language menu, hreflang,
// the sitemap and Open Graph are built from (scripts/build-site.ts). Adding a language
// is a data change: put it here with its Open Graph locale and in SITE_FONTS, write its copy
// (site/content.ts, site/info/<lang>.ts, site/concepts/*-copy.ts, site/hub-content.ts), and
// TypeScript lists every place still missing it. tests/site-copy.test.ts holds the list to the app's languages.
import type { Locale } from '../shared/src/i18n';

/**
 * Each site language and its Open Graph locale (language_TERRITORY; ar_AR is the generic Arabic code social networks use).
 * Persian is the bare language, never tied to Iran: Curahold is never offered there (NEVER_OFFERED, MASTER-RULES).
 */
export const SITE_LANGS = {
  en: 'en_US',
  tr: 'tr_TR',
  ar: 'ar_AR',
  he: 'he_IL',
  fa: 'fa',
  'zh-Hans': 'zh_CN',
  'zh-Hant': 'zh_TW',
  ja: 'ja_JP',
  ko: 'ko_KR',
  hi: 'hi_IN',
  ms: 'ms_MY',
} as const satisfies Partial<Record<Locale, string>>;

/** A language the sales site is published in. */
export type SiteLocale = keyof typeof SITE_LANGS;

/** The site's languages, English first: the order of the language menu and of hreflang. */
export const SITE_LOCALES = Object.keys(SITE_LANGS) as SiteLocale[];

/** A slice of the site's two Latin faces (Figtree for text, Bricolage Grotesque for headlines). */
export type FontSubset = 'latin' | 'latin-ext';

/**
 * The font slices each language preloads (both faces of each). Latin-script languages list
 * the slices their letters need (Turkish needs latin-ext for ş, ğ and İ); other scripts list none and
 * read their system's own faces (the :lang rules in site/chrome.css), so they download
 * no font. A Record, so a new language cannot ship without saying which it is.
 */
export const SITE_FONTS: Record<SiteLocale, readonly FontSubset[]> = {
  en: ['latin'],
  tr: ['latin', 'latin-ext'],
  ar: [],
  he: [],
  fa: [],
  'zh-Hans': [],
  'zh-Hant': [],
  ja: [],
  ko: [],
  hi: [],
  ms: ['latin'],
};

/**
 * App languages the site is not written in yet. They get no page and no hreflang until
 * their site copy exists, so a search engine never lands on a half-English page.
 */
export const SITE_PENDING: readonly string[] = [];
