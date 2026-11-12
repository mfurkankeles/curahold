// Nothing from the internal tool this product was rebuilt from may enter
// this repository: no company, person or customer names, no Slack or
// Salesforce ids. The forbidden words are stored only as hashes, so this
// test file itself contains none of them.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'screens']);
const SKIP_FILES = new Set(['package-lock.json', 'forbidden-hashes.json']);
const TEXT = /\.(ts|tsx|js|mjs|json|sql|md|css|html|toml|txt|ya?ml)$|^\.gitignore$/;

function files(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (TEXT.test(name) && !SKIP_FILES.has(name)) out.push(p);
  }
  return out;
}

const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const norm = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (c) => FOLD[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const forbidden = JSON.parse(readFileSync(join(ROOT, 'tests', 'fixtures', 'forbidden-hashes.json'), 'utf8')) as {
  unigrams: string[];
  bigrams: string[];
};
const uni = new Set(forbidden.unigrams);
const bi = new Set(forbidden.bigrams);

describe('no leftovers from the internal tool', () => {
  const all = files(ROOT);

  it('scans a meaningful number of files', () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it('contains no forbidden names (people, companies, customers, channels)', () => {
    const hits: string[] = [];
    for (const f of all) {
      const words = norm(readFileSync(f, 'utf8')).split(' ');
      for (let i = 0; i < words.length; i++) {
        if (uni.has(sha(words[i]))) hits.push(`${relative(ROOT, f)}: word #${i}`);
        if (i + 1 < words.length && bi.has(sha(`${words[i]} ${words[i + 1]}`))) hits.push(`${relative(ROOT, f)}: words #${i}-${i + 1}`);
      }
    }
    expect(hits).toEqual([]);
  });

  // The product had a working name before it was called what it is called now. Neither that name nor
  // the short prefixes made from it may come back (written here in pieces, so this file passes too).
  it('contains nothing of the old working name', () => {
    const name = new RegExp('tend' + 'well', 'i');
    const short = 't' + 'w';
    const prefixes = new RegExp(`\\b${short}[kar]?[_:-]|\\b${short}\\b|(?<![A-Za-z])${short.toUpperCase()}_[A-Z]`);
    const hits = all.filter((f) => {
      const text = readFileSync(f, 'utf8');
      return name.test(text) || prefixes.test(text);
    });
    expect(hits.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it('contains no Slack or Salesforce record ids', () => {
    const slack = /\b[CUGW]0[A-Z0-9]{8,10}\b/;
    const salesforce = /\b(001|003|006|00Q|500|a0[0-9A-Za-z])[0-9A-Za-z]{12}([0-9A-Za-z]{3})?\b/;
    const hits = all.filter((f) => {
      const text = readFileSync(f, 'utf8');
      return slack.test(text) || salesforce.test(text);
    });
    expect(hits.map((f) => relative(ROOT, f))).toEqual([]);
  });
});
