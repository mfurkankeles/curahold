import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  accountWords,
  bcp47Of,
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

// One language at a time: each dictionary is its own chunk, fetched when that
// language is first needed (already filled with English where a phrase is not
// translated yet — see shared/src/i18n/vite-plugin.ts). Literal imports, so
// the bundler can see each one.
const LOADERS: Record<Locale, () => Promise<{ default: Dictionary }>> = {
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
const pending = new Map<Locale, Promise<void>>();

/** Fetches and registers a language (once). Resolves when `t` can speak it. */
export function loadLocale(l: Locale): Promise<void> {
  if (hasDictionary(l)) return Promise.resolve();
  let p = pending.get(l);
  if (!p) {
    p = LOADERS[l]().then(
      (m) => {
        registerDictionary(l, m.default);
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
  useEffect(() => {
    if (hold && !hasDictionary(wanted)) return;
    let live = true;
    loadLocale(wanted)
      .catch(() => (wanted === 'en' ? Promise.reject(new Error('no dictionary')) : loadLocale('en').then(() => 'en' as const)))
      .then((got) => live && setShown(got ?? wanted))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [wanted, hold]);
  // Checked while drawing too: the moment a dictionary lands, every render speaks it.
  const locale: Locale = hasDictionary(wanted) ? wanted : (shown ?? wanted);
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
    const tag = bcp47Of(locale);
    return {
      locale,
      t: (key, vars) => translate(locale, key, vars, terms),
      words: accountWords(locale, terms),
      fmtDate: (iso, opts) => {
        const d = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
        return new Intl.DateTimeFormat(tag, opts ?? { day: 'numeric', month: 'short' }).format(d);
      },
    };
  }, [locale, terms]);
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
