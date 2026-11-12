// Adds words to both dictionaries at once, or changes ones already there.
//
//   npx tsx scripts/add-strings.ts strings.json
//
// strings.json holds pairs, English first:
//   { "widgets.title": ["Widgets", "Parçacıklar"], "widgets.empty": ["No widgets yet", "Henüz parçacık yok"] }
//
// A key that exists gets the new words in place; a new key goes at the end of
// shared/src/i18n/en.ts and tr.ts. Then `npm run typecheck` makes `t('widgets.title')`
// known everywhere, and `npm test` checks both languages have every key.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npx tsx scripts/add-strings.ts strings.json');
  process.exit(1);
}
const pairs = JSON.parse(readFileSync(file, 'utf8')) as Record<string, [string, string]>;
for (const [key, value] of Object.entries(pairs)) {
  if (!/^[\w.]+$/.test(key) || !Array.isArray(value) || value.length !== 2) throw new Error(`"${key}": expected ["English", "Türkçe"]`);
}

/** A string as the dictionaries write it: in single quotes, with quotes and backslashes escaped. */
const literal = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

for (const [lang, at, end] of [
  ['en', 0, '} as const;'],
  ['tr', 1, '};'],
] as const) {
  const path = join(import.meta.dirname, '..', 'shared', 'src', 'i18n', `${lang}.ts`);
  const lines = readFileSync(path, 'utf8').split('\n');
  const seen = new Set<string>();
  // Change the keys that are already there, on their own line.
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*'([\w.]+)':/.exec(lines[i]);
    if (m && m[1] in pairs) {
      lines[i] = `  ${literal(m[1])}: ${literal(pairs[m[1]][at])},`;
      seen.add(m[1]);
    }
  }
  // Add the new ones before the dictionary closes.
  let text = lines.join('\n');
  const added = Object.entries(pairs)
    .filter(([k]) => !seen.has(k))
    .map(([k, v]) => `  ${literal(k)}: ${literal(v[at])},\n`)
    .join('');
  const close = text.lastIndexOf(end);
  text = text.slice(0, close) + added + text.slice(close);
  writeFileSync(path, text);
  console.log(`${lang}: ${seen.size} changed, ${Object.keys(pairs).length - seen.size} added`);
}
