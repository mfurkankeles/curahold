// Which languages the demo company can be written in, and the few helpers the
// seeds share. Each language is its own file, loaded only when it is asked for
// (the live demo carries one language's sample data, not nine).
import type { Locale } from '../../shared/src/i18n/core';
import type { SeedWords } from './types';

export type { PersonKey, SeedWords } from './types';

const LOADERS: Partial<Record<Locale, () => Promise<{ words: SeedWords }>>> = {
  en: () => import('./en'),
  tr: () => import('./tr'),
};

/** The languages the demo company can be written in, English first. */
export const SEED_LOCALES = Object.keys(LOADERS) as Locale[];

/** The demo company's words in a language; English where it has none of its own. */
export async function seedWords(locale: Locale): Promise<{ locale: Locale; words: SeedWords }> {
  const load = LOADERS[locale];
  return load ? { locale, words: (await load()).words } : { locale: 'en', words: (await LOADERS.en!()).words };
}

/**
 * Texts the seed sent that the language does not say (the browser checks of the
 * demo read this: tests/e2e/demo.ts). Turkish is the source and never misses.
 */
export const untranslated = new Set<string>();

/** A value in a request body that a person wrote (not an id, a date, an address or a key). */
const isText = (s: string) => /\p{L}/u.test(s) && /\s|[^\x00-\x7F]/.test(s) && !/^[\w.+-]+@[\w.-]+$|^https?:|^\d{4}-\d{2}-\d{2}/.test(s);

/** The seed's Turkish text in the company's language. A comment keeps its @mention and says the rest. */
export function sayer(locale: Locale, w: SeedWords) {
  if (locale === 'tr') return (s: string) => s;
  // What is already in the language (a name the seed put together from these words, say) stays as it is.
  const said = new Set([...Object.values(w.text), ...Object.values(w.people), w.company, w.teams.cs, w.teams.am]);
  const say = (s: string): string => {
    const own = w.text[s];
    if (own !== undefined) return own;
    if (said.has(s)) return s;
    const m = /^(@\[[^\]]+\]\([^)]+\) )(.+)$/s.exec(s);
    if (m) return m[1] + say(m[2]);
    if (isText(s)) untranslated.add(s);
    return s;
  };
  return say;
}

/** Every text inside a request body, said in the company's language. */
export function deepSay(say: (s: string) => string) {
  const deep = <T>(v: T): T => {
    if (typeof v === 'string') return say(v) as T;
    if (Array.isArray(v)) return v.map(deep) as T;
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)])) as T;
    return v;
  };
  return deep;
}

/** An amount written in US dollars, in the company's currency: multiplied, then kept to three figures. */
export function amount(w: SeedWords, usd: number): number {
  const v = usd * w.money.rate;
  if (!v) return 0;
  const unit = 10 ** Math.max(0, Math.floor(Math.log10(Math.abs(v))) - 2);
  return Math.round(v / unit) * unit;
}

/** A customer's person's full name. */
export const nameOf = (w: SeedWords, say: (s: string) => string, first: string, last: string) => w.fullName(say(first), say(last));
