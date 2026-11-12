// Quality measurements that need no server: sizes of what the browser downloads,
// the dictionaries, leftovers of old names, and how tidy the styles are.
// It reads the repository and the last build (npm run build, npm run build:site).
//
//   npx tsx scripts/quality/static.mts
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { en } from '../../shared/src/i18n/en';
import { tr } from '../../shared/src/i18n/tr';

const root = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const files = execSync('git ls-files', { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
const gz = (p: string) => gzipSync(readFileSync(p), { level: 9 }).length;
const out: string[] = [];
const say = (topic: string, text: string) => out.push(`${topic.padEnd(12)} ${text}`);

// ---------------------------------------------------------------- what the first screen downloads
for (const [name, dir] of [['app', 'dist/web'], ['portal', 'dist/portal'], ['sales site', 'dist/site']] as const) {
  const index = join(root, dir, 'index.html');
  if (!existsSync(index)) {
    say('download', `${name}: not built`);
    continue;
  }
  const html = readFileSync(index, 'utf8');
  const first = [...html.matchAll(/<(?:script[^>]+src|link[^>]+rel="(?:modulepreload|stylesheet)"[^>]+href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u));
  const path = (u: string) => join(root, dir, u.replace(/^\//, ''));
  const js = first.filter((u) => u.endsWith('.js')).reduce((n, u) => n + gz(path(u)), 0);
  const css = first.filter((u) => u.endsWith('.css')).reduce((n, u) => n + gz(path(u)), 0);
  const all = existsSync(join(root, dir, 'assets')) ? execSync(`ls ${join(root, dir, 'assets')}`, { encoding: 'utf8' }).split('\n').filter((f) => f.endsWith('.js')) : [];
  const allJs = all.reduce((n, f) => n + gz(join(root, dir, 'assets', f)), 0);
  say('download', `${name}: first screen ${kb(js)} script + ${kb(css)} styles + ${kb(gzipSync(html).length)} page (gzip); every script together ${kb(allJs)} in ${all.length} file(s)`);
}

// ---------------------------------------------------------------- dictionaries and the company's own words
{
  const ek = Object.keys(en);
  const tk = new Set(Object.keys(tr));
  const missing = ek.filter((k) => !tk.has(k));
  const same = ek.filter((k) => tk.has(k) && (en as any)[k] === (tr as any)[k] && /[a-z]{4,}/i.test((en as any)[k]) && !/^[\W\d{}a-z_]*$/.test((en as any)[k])).length;
  say('words', `${ek.length} texts in English, ${tk.size} in Turkish; missing in Turkish: ${missing.length}; identical in both (worth a look): ${same}`);
  // A text that says "customer" in so many words ignores the company's own term ({account}, {accounts}…).
  const fixed = (dict: Record<string, string>, word: RegExp) => Object.entries(dict).filter(([, v]) => word.test(v)).length;
  const withTerm = Object.values(en).filter((v) => /\{accounts?(_l)?\}/.test(v)).length;
  say('words', `texts that use the company's own word for a customer: ${withTerm}; texts that say it in fixed words: ${fixed(en, /\b(customers?|clients?)\b/i)} English, ${fixed(tr, /müşteri/i)} Turkish`);
  say('words', `other fixed words a company may call differently: "deal/opportunity" ${fixed(en, /\b(deals?|opportunit(y|ies))\b/i)} texts, "contact" ${fixed(en, /\bcontacts?\b/i)}, "renewal" ${fixed(en, /\brenewals?\b/i)}, "board" ${fixed(en, /\bboards?\b/i)}`);
  // A third language: every place that knows there are exactly two.
  const src = files.filter((f) => /^(api|web|shared|scripts)\/.*\.(ts|tsx)$/.test(f) && !f.includes('/i18n/'));
  let twoWay = 0;
  let pairs = 0;
  for (const f of src) {
    const s = read(f);
    twoWay += (s.match(/locale === 'tr'|locale === "tr"|=== 'tr' \?/g) ?? []).length;
    pairs += (s.match(/\bL\('/g) ?? []).length;
  }
  say('words', `places in the code that assume exactly two languages: ${twoWay} "is it Turkish?" checks, ${pairs} texts written as an English/Turkish pair outside the dictionaries`);
}

// ---------------------------------------------------------------- old names
{
  const tracked = files.filter((f) => !f.startsWith('tests/fixtures/') && !/\.(png|ico|woff2?|wasm)$/.test(f) && f !== 'package-lock.json');
  const count = (re: RegExp) => {
    let n = 0;
    const where = new Set<string>();
    for (const f of tracked) {
      const m = read(f).match(re);
      if (m) {
        n += m.length;
        where.add(f);
      }
    }
    return `${n} in ${where.size} file(s)`;
  };
  // Written in pieces, so this file does not count itself.
  const old = 'tend' + 'well';
  const short = 't' + 'w';
  say('old names', `the old working name: ${count(new RegExp(old, 'gi'))}; its short prefixes in any form: ${count(new RegExp(`\\b${short}[kar]?[_:-]|\\b${short}\\b|(?<![A-Za-z])${short.toUpperCase()}_[A-Z]`, 'g'))}`);
  const brand = tracked.filter((f) => /\.(ts|tsx|css|html|md|toml|yml|json)$/.test(f));
  let named = 0;
  const inFiles = new Set<string>();
  for (const f of brand) {
    const m = read(f).match(/curahold/gi);
    if (m) {
      named += m.length;
      inFiles.add(f);
    }
  }
  say('old names', `the product's name is written out ${named} times in ${inFiles.size} files (one place to change it: not yet)`);
}

// ---------------------------------------------------------------- styles
{
  const css = files.filter((f) => /^web\/(src|portal)\/.*\.css$/.test(f) || f === 'site/site.css');
  const tsx = files.filter((f) => /^web\/.*\.tsx$/.test(f));
  const inline = tsx.reduce((n, f) => n + (read(f).match(/style=\{\{/g) ?? []).length, 0);
  let hex = 0;
  const radii = new Set<string>();
  const sizes = new Set<string>();
  const times: number[] = [];
  let offGrid = 0;
  let spaces = 0;
  for (const f of css) {
    const s = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    // Colours written straight into a rule, not taken from a token (the token lists themselves do not count).
    for (const rule of s.match(/[^{}]+\{[^{}]*\}/g) ?? []) {
      const [sel, body] = [rule.slice(0, rule.indexOf('{')), rule.slice(rule.indexOf('{'))];
      if (/:root|\[data-theme/.test(sel) && /--[a-z-]+:/.test(body)) continue;
      hex += (body.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length;
      for (const m of body.matchAll(/border-radius:\s*([^;}]+)/g)) radii.add(m[1].trim());
      for (const m of body.matchAll(/font-size:\s*([^;}]+)/g)) sizes.add(m[1].trim());
      for (const m of body.matchAll(/(?:transition|animation)[a-z-]*:\s*([^;}]+)/g)) for (const t of m[1].matchAll(/(?<![\w.])(\d*\.?\d+)(ms|s)\b/g)) times.push(Number(t[1]) * (t[2] === 's' ? 1000 : 1));
      for (const m of body.matchAll(/(?:padding|margin|gap)[a-z-]*:\s*([^;}]+)/g))
        for (const px of m[1].matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)px/g)) {
          spaces++;
          if (Number(px[1]) % 4 !== 0) offGrid++;
        }
    }
  }
  const moving = times.filter((t) => t >= 50);
  const outside = moving.filter((t) => t < 150 || t > 200).length;
  say('styles', `styles written on one element in the screens (style={{…}}): ${inline}; colours written straight into rules instead of tokens: ${hex}`);
  say('styles', `different corner radii: ${radii.size}; different text sizes: ${sizes.size}; spacing values off the 4 px grid: ${offGrid} of ${spaces} (${Math.round((offGrid / spaces) * 100)}%)`);
  say('styles', `animation and transition times: ${moving.length}, of which ${outside} are outside 150–200 ms (shortest ${Math.min(...moving)} ms, longest ${Math.max(...moving)} ms)`);
}

// ---------------------------------------------------------------- dependencies, tests
{
  let audit = 'could not run';
  try {
    const j = JSON.parse(execSync('npm audit --json 2>/dev/null || true', { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }));
    const v = j.metadata?.vulnerabilities ?? {};
    audit = `critical ${v.critical ?? 0}, high ${v.high ?? 0}, moderate ${v.moderate ?? 0}, low ${v.low ?? 0}`;
  } catch {
    /* offline */
  }
  say('safety', `known holes in the libraries (npm audit, all of them): ${audit}`);
  const tests = files.filter((f) => /^tests\/[^/]+\.test\.ts$/.test(f));
  const cases = tests.reduce((n, f) => n + (read(f).match(/^\s*(it|test)\(/gm) ?? []).length, 0);
  const e2e = (read('tests/e2e/run.ts').match(/^\s*await step\(|^step\(|check\('/gm) ?? []).length;
  say('tests', `${cases} tests in ${tests.length} files; browser journeys in tests/e2e/run.ts: ${e2e || 'see the run'}`);
}

console.log(out.join('\n'));
