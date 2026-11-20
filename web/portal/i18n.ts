// The portal's languages, one at a time: each is a small chunk of only the
// phrases the portal uses (vite.portal.config.ts), fetched when first needed.
import { useEffect, useState } from 'react';
import { hasDictionary, registerDictionary, type Dictionary, type Locale } from '../../shared/src/i18n/core';

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
  hi: () => import('virtual:curahold-dict/hi'),
  ms: () => import('virtual:curahold-dict/ms'),
};
const pending = new Map<Locale, Promise<void>>();

/** Fetches and registers a language once; never rejects (English stands in). */
export function loadLocale(l: Locale): Promise<void> {
  if (hasDictionary(l)) return Promise.resolve();
  let p = pending.get(l);
  if (!p) {
    p = LOADERS[l]()
      .then((m) => registerDictionary(l, m.default))
      .catch(() => {
        pending.delete(l);
        return l === 'en' ? undefined : loadLocale('en');
      });
    pending.set(l, p);
  }
  return p;
}

/** The language to draw in: `wanted` once loaded, the previous one until then, null at first. */
export function useShownLocale(wanted: Locale): Locale | null {
  const [shown, setShown] = useState<Locale | null>(() => (hasDictionary(wanted) ? wanted : null));
  useEffect(() => {
    let live = true;
    void loadLocale(wanted).then(() => live && setShown(hasDictionary(wanted) ? wanted : 'en'));
    return () => {
      live = false;
    };
  }, [wanted]);
  // Checked while drawing too: the moment a dictionary lands, every render speaks it.
  return hasDictionary(wanted) ? wanted : shown;
}
