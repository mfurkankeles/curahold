// Adds words to every dictionary at once, or changes ones already there (CLAUDE.md: every user-facing string in
// every dictionary in shared/src/i18n/). The language list comes from LOCALES in shared/src/i18n/core.ts, so a new
// language is picked up as soon as its dictionary file exists.
//
//   npx tsx scripts/add-strings.ts strings.json           (npm run strings -- strings.json)
//   npx tsx scripts/add-strings.ts strings.json --check   say what would change, write nothing
//
// strings.json holds, per key, the words in every language:
//   { "widgets.title": { "en": "Widgets", "tr": "Parçacıklar", "ar": "…", "he": "…", "fa": "…",
//                        "zh-Hans": "…", "zh-Hant": "…", "ja": "…", "ko": "…" } }
//
// A key missing a language is refused (nothing is written), so no dictionary falls behind. The old two-language
// form `["English", "Türkçe"]` is refused with a message saying which languages are missing. Keys already present
// (single- or double-quoted) get the new words in place; new keys go at the end of each dictionary. Then
// `npm run typecheck` makes `t('widgets.title')` known everywhere, and `npm run test:i18n` checks every language.
// Write the words as a native product writer would, with terms from shared/src/i18n/glossary.ts.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES } from '../shared/src/i18n/core';

const DIR = join(import.meta.dirname, '..', 'shared', 'src', 'i18n');
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const check = args.includes('--check');
if (!file) {
  console.error('Usage: npx tsx scripts/add-strings.ts strings.json [--check]');
  process.exit(1);
}

const langs = LOCALES.filter((l) => existsSync(join(DIR, `${l}.ts`)));
const missingFiles = LOCALES.filter((l) => !langs.includes(l));
if (missingFiles.length) console.warn(`No dictionary file yet for: ${missingFiles.join(', ')} (skipped)`);

const input = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, string> | string[]>;
const problems: string[] = [];
for (const [key, value] of Object.entries(input)) {
  if (!/^[\w.]+$/.test(key)) problems.push(`"${key}": keys are letters, digits, "_" and "."`);
  else if (Array.isArray(value)) problems.push(`"${key}": give an object with every language (${langs.join(', ')}), not a pair`);
  else {
    const missing = langs.filter((l) => typeof value?.[l] !== 'string' || !value[l].trim());
    if (missing.length) problems.push(`"${key}": missing ${missing.join(', ')}`);
  }
}
if (problems.length) {
  console.error(`Nothing written:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
const words = input as Record<string, Record<string, string>>;

/** A string as the dictionaries write it: in single quotes, with quotes and backslashes escaped. */
const literal = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
/** An entry's key on its own line, in either quote style. */
const KEY_LINE = /^\s*(['"])([\w.]+)\1:/;

for (const lang of langs) {
  const path = join(DIR, `${lang}.ts`);
  const lines = readFileSync(path, 'utf8').split('\n');
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const m = KEY_LINE.exec(lines[i]);
    if (m && m[2] in words) {
      // One entry per line in these files; an entry wrapped over lines would be left half-replaced, so stop.
      if (!/,\s*(\/\/.*)?$/.test(lines[i])) throw new Error(`${lang}.ts line ${i + 1}: "${m[2]}" spans lines; join it first`);
      lines[i] = `  ${literal(m[2])}: ${literal(words[m[2]][lang])},`;
      seen.add(m[2]);
    }
  }
  let text = lines.join('\n');
  const added = Object.keys(words)
    .filter((k) => !seen.has(k))
    .map((k) => `  ${literal(k)}: ${literal(words[k][lang])},\n`)
    .join('');
  // The dictionary's closing line: `} as const;` in en.ts, `};` elsewhere.
  const close = Math.max(text.lastIndexOf('\n} as const;'), text.lastIndexOf('\n};')) + 1;
  if (close <= 0) throw new Error(`${lang}.ts: cannot find where the dictionary closes`);
  text = text.slice(0, close) + added + text.slice(close);
  if (!check) writeFileSync(path, text);
  console.log(`${lang}: ${seen.size} changed, ${Object.keys(words).length - seen.size} added${check ? ' (check only)' : ''}`);
}
