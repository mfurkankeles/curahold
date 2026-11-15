import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  accountWords,
  bcp47Of,
  dictionaries,
  hasDictionary,
  LOCALE_INFO,
  normalizeLocale,
  registerDictionary,
  translate,
  type Dictionary,
  type Locale,
  type MessageKey,
  type Terms,
  type Vars,
} from '../../../shared/src/i18n/core';
import { afterQuiet } from './api';
import { formatDate } from './format';

// One language at a time, in two parts (see shared/src/i18n/vite-plugin.ts):
// the phrases the first screen uses, then the rest of the language. Each is its
// own chunk, already filled with English where a phrase is not translated yet.
// The first screen draws as soon as the first part is in; every other screen is
// a lazy chunk whose import also waits for the rest (`afterFullLanguage`, added
// to each such import by the build). Literal imports, so the bundler sees each.
type Part = () => Promise<{ default: Dictionary }>;
const LOADERS: Record<Locale, Part> = {
  en: () => import('virtual:curahold-dict/en'),
  tr: () => import('virtual:curahold-dict/tr'),
  ar: () => import('virtual:curahold-dict/ar'),
  he: () => import('virtual:curahold-dict/he'),
  fa: () => import('virtual:curahold-dict/fa'),
  'zh-Hans': () => import('virtual:curahold-dict/zh-Hans'),
  'zh-Hant': () => import('virtual:curahold-dict/zh-Hant'),
  ja: () => import('virtual:curahold-dict/ja'),
  ko: () => import('virtual:curahold-dict/ko'),
};
const REST_LOADERS: Record<Locale, Part> = {
  en: () => import('virtual:curahold-dict/en/rest'),
  tr: () => import('virtual:curahold-dict/tr/rest'),
  ar: () => import('virtual:curahold-dict/ar/rest'),
  he: () => import('virtual:curahold-dict/he/rest'),
  fa: () => import('virtual:curahold-dict/fa/rest'),
  'zh-Hans': () => import('virtual:curahold-dict/zh-Hans/rest'),
  'zh-Hant': () => import('virtual:curahold-dict/zh-Hant/rest'),
  ja: () => import('virtual:curahold-dict/ja/rest'),
  ko: () => import('virtual:curahold-dict/ko/rest'),
};
const pending = new Map<Locale, Promise<void>>();
const restPending = new Map<Locale, Promise<void>>();
const parts = new Map<Locale, { first?: Dictionary; rest?: Dictionary }>();
/** Told when the rest of a language lands, so what is on screen draws again. */
const listeners = new Set<() => void>();

function put(l: Locale, part: 'first' | 'rest', dict: Dictionary) {
  const p = { ...parts.get(l), [part]: dict };
  parts.set(l, p);
  // Registered only once the first part is here: before that the language is not "loaded".
  if (p.first) registerDictionary(l, p.rest ? { ...p.first, ...p.rest } : p.first);
  if (p.first && p.rest) listeners.forEach((f) => f());
}
const hasRest = (l: Locale) => !!parts.get(l)?.rest;
/** The whole language is in (a dictionary registered some other way, as in the demo, counts as whole). */
const isWhole = (l: Locale) => hasDictionary(l) && (hasRest(l) || !parts.get(l)?.first);

/** Fetches the rest of a language (once). */
function loadRest(l: Locale): Promise<void> {
  if (isWhole(l)) return Promise.resolve();
  let p = restPending.get(l);
  if (!p) {
    p = REST_LOADERS[l]().then(
      (m) => put(l, 'rest', m.default),
      (e) => {
        restPending.delete(l);
        throw e;
      },
    );
    restPending.set(l, p);
  }
  return p;
}

// The language the screens are being drawn in; lazy screens wait for all of it.
let target: Locale | null = null;
let decided: () => void = () => undefined;
const targetSet = new Promise<void>((r) => (decided = r));

/** The language the screens are drawn in (set by I18nProvider): its rest is fetched, and lazy screens wait for it. */
function drawIn(l: Locale) {
  target = l;
  decided();
}

/** Fetches and registers a language's first part (once). Resolves when `t` can speak it. */
export function loadLocale(l: Locale): Promise<void> {
  if (hasDictionary(l)) return Promise.resolve();
  let p = pending.get(l);
  if (!p) {
    p = LOADERS[l]().then(
      (m) => {
        put(l, 'first', m.default);
        rememberHint(l);
      },
      (e) => {
        pending.delete(l);
        throw e;
      },
    );
    pending.set(l, p);
  }
  return p;
}

/**
 * A lazy screen's import, resolved once the language it will be drawn in is all
 * here (a failed download does not hold the screen: it draws, missing phrases fall
 * back as usual). The build wraps every dynamic import in web/src with this.
 */
export function afterFullLanguage<M>(load: Promise<M>): Promise<M> {
  const whole = targetSet.then(() => (target ? loadRest(target).catch(() => undefined) : undefined));
  return Promise.all([load, whole]).then(([m]) => m);
}
export const isLocaleLoaded = hasDictionary;

// The language this browser last read in, so its dictionary can be fetched
// while the app is still asking who the person is.
const HINT = 'app_locale_hint';
function rememberHint(l: Locale) {
  try {
    localStorage.setItem(HINT, l);
  } catch {
    /* private mode */
  }
}
/** The language this browser chose, or last read in; null on a first visit. */
export function likelyLocale(): Locale | null {
  try {
    const v = localStorage.getItem(HINT);
    return storedLocale() ?? (v ? normalizeLocale(v) : null);
  } catch {
    return null;
  }
}
/** Starts fetching the language the next screen will most likely be in (if there is a good guess). */
export function preloadLikelyLocale() {
  const l = likelyLocale();
  if (l) void loadLocale(l).catch(() => undefined);
}

export interface I18n {
  locale: Locale;
  t: (key: MessageKey, vars?: Vars) => string;
  words: { one: string; other: string };
  fmtDate: (iso: string, opts?: Intl.DateTimeFormatOptions) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ locale: wanted, terms, hold, children }: { locale: Locale; terms?: Terms | null; hold?: boolean; children: ReactNode }) {
  // The language on screen: the wanted one once its dictionary is here. Until
  // then the previous one stays (switching never shows raw keys); on the very
  // first load nothing is drawn — the page is blank at that moment anyway.
  const [shown, setShown] = useState<Locale | null>(() => (hasDictionary(wanted) ? wanted : null));
  // `hold`: the language is not decided yet (the app is still asking the server);
  // fetch nothing on a guess, so a first visit never downloads two dictionaries.
  const [, redraw] = useState(0);
  useEffect(() => {
    const f = () => redraw((n) => n + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  useEffect(() => {
    if (hold && !hasDictionary(wanted)) return;
    let live = true;
    drawIn(wanted);
    loadLocale(wanted)
      .then(() => {
        // A switch waits for the whole language. On the first load the rest comes once
        // the first screen's own requests are in (or at once, if a lazy screen asks).
        if (shown) return loadRest(wanted).catch(() => undefined);
        afterQuiet(() => void loadRest(wanted).catch(() => undefined));
      })
      .catch(() => (wanted === 'en' ? Promise.reject(new Error('no dictionary')) : loadLocale('en').then(() => 'en' as const)))
      .then((got) => live && setShown(got ?? wanted))
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // (`shown` only picks how much to wait for; it is not a reason to fetch again.)
  }, [wanted, hold]);
  // Checked while drawing too: the moment a dictionary lands, every render speaks it.
  const locale: Locale = hasDictionary(wanted) && (isWhole(wanted) || !shown || shown === wanted) ? wanted : (shown ?? wanted);
  // The page reads in the language's own direction: right-to-left for Arabic,
  // Hebrew and Persian. Set on <html> so the whole layout follows.
  useEffect(() => {
    const el = document.documentElement;
    el.lang = bcp47Of(locale);
    el.dir = LOCALE_INFO[locale].dir;
    return () => {
      el.dir = 'ltr';
    };
  }, [locale]);
  const value = useMemo<I18n>(() => {
    return {
      locale,
      // A phrase from the rest of the language, asked for before the rest is here
      // (one the first screen's files do not name, such as a key the server sent):
      // blank for that moment, never the raw key; the rest's arrival draws it again.
      t: (key, vars) => (restPending.has(locale) && !hasRest(locale) && dictionaries[locale]?.[key] === undefined ? '' : translate(locale, key, vars, terms)),
      words: accountWords(locale, terms),
      fmtDate: (iso, opts) => formatDate(iso, locale, opts),
    };
  }, [locale, terms, parts.get(locale)?.rest]);
  if (!shown && !hasDictionary(wanted)) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('I18nProvider missing');
  return v;
}

const STORE = 'app_locale';
export function storedLocale(): Locale | null {
  try {
    const v = localStorage.getItem(STORE);
    return v ? normalizeLocale(v) : null;
  } catch {
    return null;
  }
}
export function storeLocale(l: Locale) {
  try {
    localStorage.setItem(STORE, l);
  } catch {
    /* private mode */
  }
}
// English first. Turkish (and any later language) is a choice: a person picks it
// in their settings or on the sign-in page, or an administrator makes it the
// company's language. Nothing is guessed from the browser, so everyone who
// opens the same link starts on the same screen.
let start: Locale = 'en';
export const startLocale = (): Locale => start;
/** The try-it demo opens in the language its sample data was written in. */
export function setStartLocale(l: Locale) {
  start = l;
}
