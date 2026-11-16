// The sales site is written in every language the app speaks. A language that
// misses a string, or still carries the English one, would ship a page that is
// half translated — so both are failures here, not review comments.
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../shared/src/i18n';
import { COPY, SITE_LOCALES, STORY_COPY, STORY_LOCALES, type SiteCopy, type SiteStoryCopy } from '../site/content';
import { page } from '../scripts/build-site';

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

// The scroll story after the hero ships in English and Turkish first; the other
// seven languages get it on Thursday. Until a language is on this list, its page
// leaves the story out entirely — no English words on it, no empty section.
const STORY_NOW = ['en', 'tr'];

describe('the scroll story', () => {
  const enStory = leaves(STORY_COPY.en as SiteStoryCopy);

  it('ships in exactly the languages it is written in', () => {
    expect([...STORY_LOCALES].sort()).toEqual([...STORY_NOW].sort());
  });

  it('tells six steps', () => {
    for (const locale of STORY_LOCALES) expect(STORY_COPY[locale]?.steps).toHaveLength(6);
  });

  for (const locale of STORY_LOCALES.filter((l) => l !== 'en')) {
    it(`is written natively in ${locale}`, () => {
      const mine = leaves(STORY_COPY[locale] as SiteStoryCopy);
      expect([...mine.keys()].sort()).toEqual([...enStory.keys()].sort());
      expect([...mine].filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
      expect([...mine].filter(([k, v]) => v === enStory.get(k)).map(([k]) => k)).toEqual([]);
      expect([...mine].filter(([k, v]) => placeholders(v) !== placeholders(enStory.get(k) ?? '')).map(([k]) => k)).toEqual([]);
    });
  }

  for (const locale of SITE_LOCALES) {
    const ships = STORY_LOCALES.includes(locale);
    it(`${ships ? 'is on' : 'is cleanly absent from'} the ${locale} page`, () => {
      const html = page(locale);
      const parts = ['data-story', 'id="story"', 'class="cue"', 'href="#story"', 'class="story__'];
      for (const part of parts) expect(html.includes(part), `${locale}: ${part}`).toBe(ships);
      if (locale !== 'en') {
        const english = [STORY_COPY.en!.title, STORY_COPY.en!.cue, ...STORY_COPY.en!.steps.map((s) => s.title)];
        expect(english.filter((w) => html.includes(w))).toEqual([]);
      }
      if (ships) {
        const own = STORY_COPY[locale]!;
        for (const s of own.steps) expect(html).toContain(s.title);
      }
    });
  }
});
