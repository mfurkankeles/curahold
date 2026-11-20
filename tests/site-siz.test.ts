// Turkish on the sales site speaks to the reader as "siz", everywhere: the landing page,
// the menu and inner pages, the blog, the animated versions and the consent banner
// (shared/src/i18n/glossary.ts REGISTER.tr). This test walks every Turkish string the
// site builds from and fails on a "sen" form: the pronoun, a second-person singular verb
// ending, a singular possessive on "customer" or "data", or a bare imperative from the
// verbs the site uses to address the reader.
//
// What it leaves alone, and why:
// - Text drawn inside a product picture (keys under `ui`, and the animated version's
//   p_/d_/r_/t_/b_ keys): task titles and buttons as a team writes them in the app.
// - Product labels quoted in prose (“Müşteriyle paylaş”): they name a control.
// - One-word control labels (Kapat, Kaydet): Turkish interfaces write those as a bare
//   stem in either register, the same as the product.
import { describe, expect, it } from 'vitest';
import { A_COPY } from '../site/concepts/a-copy';
import { C_COPY } from '../site/concepts/c-copy';
import { siteBlog, blogPosts, siteCopy, siteStory } from '../site/content';
import { infoCopy } from '../site/info';
import { hubCopy } from '../site/hub-content';

/** Every string leaf of a value, with its dotted path. */
function leaves(v: unknown, path = ''): [string, string][] {
  if (typeof v === 'string') return [[path, v]];
  if (Array.isArray(v)) return v.flatMap((x, i) => leaves(x, `${path}.${i}`));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => leaves(x, path ? `${path}.${k}` : k));
  return [];
}

const SOURCES: Record<string, unknown> = {
  site: siteCopy('tr'),
  story: siteStory('tr'),
  blog: siteBlog('tr'),
  posts: blogPosts('tr'),
  info: infoCopy('tr'),
  conceptA: A_COPY.tr,
  conceptC: C_COPY.tr,
  hub: hubCopy('tr'),
};

/** Paths whose text sits inside a picture of the product, not addressed to the reader. */
const IN_PRODUCT = /(^|\.)ui\.|^conceptA\.(p|d|r|t|b)_/;

// A letter on either side means "inside a word" (\b does not know Turkish letters).
const W = (body: string) => new RegExp(`(?<!\\p{L})(?:${body})(?!\\p{L})`, 'iu');
const RULES: [name: string, re: RegExp][] = [
  ['pronoun', W('sen|seni|sana|senin|sende|senden|seninle|sence|kendin|kendine')],
  // görürsün, edeceksin, yapmalısın, geliyorsun, var mısın
  ['verb ending', /\p{L}+(?:r|k|yor|m[ae]l[ıi])s[ıiuü]n(?!\p{L})/iu],
  ['question', W('m[ıiuü]s[ıiuü]n')],
  ['possessive', W('müşterin|müşterine|müşterini|müşterinle|müşterinden|verin senin|verini|verine|verinle|verinden')],
  [
    'imperative',
    W(
      'dene|başla|başlat|gör|izle|kaydır|keşfet|seç|bağla|getir|aktar|sor|oku|yaz|git|hızında geç|kur|ekle|davet et|teslim et|tut|aç|incele|öğren|indir|sil|bak|iste|bırak|planla|gönder|paylaş|kaydet|kapat|hazırla|yönet|reddet|kabul et|işe koyul|adım at|ver',
    ),
  ],
];

const offences = (path: string, text: string) => {
  if (IN_PRODUCT.test(path)) return [];
  const prose = text.replace(/“[^”]*”/g, '');
  const oneWord = !/\s/.test(prose.trim());
  return RULES.filter(([name, re]) => !(name === 'imperative' && oneWord) && re.test(prose)).map(([name, re]) => `${path} [${name}: ${re.exec(prose)?.[0]}] ${text}`);
};

describe('Turkish site copy says "siz"', () => {
  it('finds the rules working on known "sen" forms', () => {
    for (const s of ['Şirketinin verisi sende', 'Bunu görürsün', 'Ücretsiz dene', 'Müşterine sor', 'Hazır mısın?']) expect(offences('x', s)).not.toEqual([]);
    for (const s of ['Ücretsiz deneyin', 'Kendini açıklayan skor', 'Müşterinin portalı', 'Kaydedin', 'Kapat', 'Ne olursa olsun']) expect(offences('x', s)).toEqual([]);
  });
  for (const [name, value] of Object.entries(SOURCES)) {
    it(`${name} has no "sen" form`, () => {
      expect(leaves(value, name).flatMap(([p, s]) => offences(p, s))).toEqual([]);
    });
  }
});
