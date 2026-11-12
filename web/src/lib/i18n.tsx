import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { accountWords, normalizeLocale, translate, type Locale, type MessageKey, type Terms, type Vars } from '../../../shared/src/i18n';

export interface I18n {
  locale: Locale;
  t: (key: MessageKey, vars?: Vars) => string;
  words: { one: string; other: string };
  fmtDate: (iso: string, opts?: Intl.DateTimeFormatOptions) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ locale, terms, children }: { locale: Locale; terms?: Terms | null; children: ReactNode }) {
  const value = useMemo<I18n>(() => {
    const tag = locale === 'tr' ? 'tr-TR' : 'en-GB';
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
export function browserLocale(): Locale {
  return navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}
