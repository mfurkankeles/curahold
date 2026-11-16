// The demo company is written once, in Turkish, and said again in each language
// the demo is offered in (scripts/seed-words). A language that forgets a text
// would show that text in Turkish in the middle of its own: this keeps every
// language saying everything English says (English itself is checked against
// what the seed really sends, by the browser check of the demo: tests/e2e/demo.ts).
import { describe, expect, it } from 'vitest';
import { SEED_LOCALES, seedWords } from '../scripts/seed-words';
import { LOCALE_INFO } from '../shared/src/i18n';

describe('the demo company in every language', async () => {
  const en = (await seedWords('en')).words;
  for (const l of SEED_LOCALES.filter((x) => x !== 'tr' && x !== 'en')) {
    const { locale, words } = await seedWords(l);
    it(`${l}: says everything`, () => {
      expect(locale).toBe(l);
      expect(Object.keys(en.text).filter((k) => !(k in words.text))).toEqual([]);
      expect(Object.entries(words.text).filter(([, v]) => !v.trim())).toEqual([]);
    });
    it(`${l}: its own people, money and clock`, () => {
      expect(new Set(Object.values(words.people)).size).toBe(6);
      expect(() => new Intl.NumberFormat(LOCALE_INFO[l].bcp47, { style: 'currency', currency: words.money.currency }).format(1)).not.toThrow();
      expect(words.money.rate).toBeGreaterThan(0);
      expect(() => new Intl.DateTimeFormat('en', { timeZone: words.timezone })).not.toThrow();
      for (const k of Object.keys(words.money.abroad)) expect(k in en.text, k).toBe(true);
    });
  }
  it('English and Turkish keep their own words', () => {
    expect(SEED_LOCALES.slice(0, 2)).toEqual(['en', 'tr']);
    expect(Object.keys(en.text).length).toBeGreaterThan(150);
  });
});
