// The sales site is written in every language the app speaks. A language that
// misses a string, or still carries the English one, would ship a page that is
// half translated — so both are failures here, not review comments.
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../shared/src/i18n';
import { COPY, SITE_LOCALES, type SiteCopy } from '../site/content';

type Leaves = Map<string, string>;

/** Every string in a copy object, keyed by its path ("tour.steps.0.title"). */
function leaves(value: unknown, path = '', out: Leaves = new Map()): Leaves {
  if (typeof value === 'string') out.set(path, value);
  else if (Array.isArray(value)) value.forEach((v, i) => leaves(v, path ? `${path}.${i}` : String(i), out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) leaves(v, path ? `${path}.${k}` : k, out);
  else throw new Error(`site copy holds something that is not text at "${path}"`);
  return out;
}

const en = leaves(COPY.en as SiteCopy);

// Strings that are rightly the same as English: an example address is Latin
// letters in every language, and Turkish product teams say "Blog" and "Sprint".
const SAME_AS_ENGLISH: Record<string, string[]> = {
  '*': ['signIn.placeholder'],
  tr: ['nav.blog', 'tour.ui.sprint'],
};

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(' ');

describe('sales site copy', () => {
  it('is written in every language the app speaks', () => {
    expect([...SITE_LOCALES].sort()).toEqual([...LOCALES].sort());
  });

  for (const locale of SITE_LOCALES.filter((l) => l !== 'en')) {
    describe(locale, () => {
      const mine = leaves(COPY[locale] as SiteCopy);

      it('has exactly the strings English has', () => {
        expect([...mine.keys()].sort()).toEqual([...en.keys()].sort());
      });

      it('leaves no string empty', () => {
        expect([...mine].filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
      });

      it('does not still carry the English wording', () => {
        const allowed = new Set([...SAME_AS_ENGLISH['*'], ...(SAME_AS_ENGLISH[locale] ?? [])]);
        const same = [...mine].filter(([k, v]) => v === en.get(k) && !allowed.has(k)).map(([k]) => k);
        expect(same).toEqual([]);
      });

      it('keeps the values the site fills in', () => {
        const broken = [...mine].filter(([k, v]) => placeholders(v) !== placeholders(en.get(k) ?? '')).map(([k]) => k);
        expect(broken).toEqual([]);
      });
    });
  }
});
