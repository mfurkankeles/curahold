// Cookie + browser-storage inventory, generated from the code.
//
//   npx tsx scripts/compliance/inventory.ts           report what the scan finds
//   npx tsx scripts/compliance/inventory.ts --write   write the JSON and the nine cookie pages
//   npx tsx scripts/compliance/inventory.ts --check   exit 1 when the code, the registry
//                                                     (shared/src/compliance/storage.ts) and
//                                                     the written files disagree
//
// What it scans: the browser code of every surface (web/src — product, portal,
// demo, console —, web/public — the service worker —, site/ — the sales site,
// its concept pages and A/B test —, docs/site/assets — the documentation's
// own scripts) for localStorage / sessionStorage keys, document.cookie writes,
// service-worker caches and third-party script hosts; and api/src for the
// cookies the server sets. Anything found that the registry does not list
// fails the check, and so does a registry line the code no longer has.
//
// Outputs: docs/compliance/storage-inventory.json (machine-readable, with the
// files each item was found in) and docs/site/<lang>/legal-cookies.md in all
// eleven languages. Both are deterministic: the date is the policy version's.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES, type Locale } from '../../shared/src/i18n/core';
import { COOKIE_POLICY_VERSION } from '../../shared/src/compliance/version';
import { PURPOSES, STORAGE, nameMatches, needsConsent, type StorageItem, type StorageType } from '../../shared/src/compliance/storage';
import { COOKIE_PAGE } from '../../shared/src/compliance/cookieText';
import { resolveKoParticles } from '../../shared/src/i18n/koParticles';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BROWSER_DIRS = ['web/src', 'web/portal', 'web/public', 'site', 'docs/site/assets', 'shared/src/consent'];
export const SERVER_DIRS = ['api/src'];
const CODE = /\.(ts|tsx|js|mjs)$/;

export interface Found {
  name: string;
  type: StorageType;
  files: string[];
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'node_modules' && name !== 'dist') walk(p, out);
    } else if (CODE.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

/** A key that looks like one of ours (the scan's guard against unrelated strings). */
const KEY_SHAPE = /^(app|desk|curahold|cura)[_-][a-z][a-z0-9_*-]*$/;
const strip = (s: string) => s.replace(/\$\{[^}]*\}/g, '*');

/** `const NAME = 'value'` (or a template) in one file. */
function constants(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])([^'"`\n]{1,80})\2/g)) map.set(m[1]!, strip(m[3]!));
  return map;
}

function add(found: Map<string, Found>, name: string, type: StorageType, file: string) {
  const id = `${type}:${name}`;
  const f = found.get(id) ?? { name, type, files: [] };
  if (!f.files.includes(file)) f.files.push(file);
  found.set(id, f);
}

/** Everything the code stores or loads, with where it was found. */
export function scan(root: string = ROOT): Found[] {
  const found = new Map<string, Found>();
  for (const file of BROWSER_DIRS.flatMap((d) => walk(join(root, d)))) {
    const rel = relative(root, file);
    const text = readFileSync(file, 'utf8');
    const consts = constants(text);
    const resolve = (arg: string) => {
      const t = arg.trim();
      const lit = /^(['"`])([^'"`]+)\1$/.exec(t);
      if (lit) return strip(lit[2]!);
      return consts.get(t);
    };
    // 1. Web storage: direct calls, constants, then a helper's literal keys.
    const kinds = new Set<StorageType>();
    for (const m of text.matchAll(/\b(localStorage|sessionStorage)\s*\.\s*(?:getItem|setItem|removeItem)\(\s*([^,)]+)/g)) {
      const type = m[1] as StorageType;
      kinds.add(type);
      const name = resolve(m[2]!);
      if (name && KEY_SHAPE.test(name)) add(found, name, type, rel);
    }
    if (kinds.size) {
      // Keys handed to a small helper (remembered('app_cal_view', …), read(LAST_BOARD)): any call's first argument of our key shape.
      const type: StorageType = kinds.has('localStorage') ? 'localStorage' : 'sessionStorage';
      for (const m of text.matchAll(/(?<![.\w$])[A-Za-z_$][\w$]*\(\s*((['"`])[^'"`\n]{2,60}\2|[A-Z][A-Z0-9_]{2,})\s*[,)]/g)) {
        const name = resolve(m[1]!);
        if (!name || !KEY_SHAPE.test(name)) continue;
        if (![...found.values()].some((f) => f.name === name)) add(found, name, type, rel);
      }
    }
    // 2. Cookies written by page scripts.
    for (const m of text.matchAll(/document\.cookie\s*=\s*['"`]([A-Za-z0-9_-]+)=/g)) add(found, m[1]!, 'cookie', rel);
    for (const m of text.matchAll(/\bcookie\s*:\s*'([a-z][a-z0-9_]{2,40})'/g)) add(found, m[1]!, 'cookie', rel);
    // 3. Service-worker caches: `${VERSION}-shell` and friends.
    if (/\bcaches\.open\(/.test(text)) {
      const version = consts.get('VERSION');
      for (const m of text.matchAll(/`\$\{VERSION\}-([a-z]+)`/g)) if (version) add(found, `${version}-${m[1]}`, 'cache', rel);
    }
    // 4. Third-party scripts: a script element's source or a loader call.
    for (const line of text.split('\n')) {
      if (!/(\.src\s*=|addScript\(|injectScript\(|loadScript\(|<script[^>]*\bsrc=|importScripts\()/.test(line)) continue;
      for (const m of line.matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})/g)) add(found, m[1]!, 'script', rel);
      // A loader that assigns a constant (`s.src = SCRIPT`, humanCheck.tsx): the constant's own address counts too.
      for (const m of line.matchAll(/\.src\s*=\s*([A-Z][A-Z0-9_]*)\b/g)) {
        const host = /^https:\/\/([a-z0-9.-]+\.[a-z]{2,})/.exec(consts.get(m[1]!) ?? '')?.[1];
        if (host) add(found, host, 'script', rel);
      }
    }
  }
  for (const file of SERVER_DIRS.flatMap((d) => walk(join(root, d)))) {
    const rel = relative(root, file);
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\b[A-Z_]*COOKIE\s*=\s*'([a-z][a-z0-9_]+)'/g)) add(found, m[1]!, 'cookie', rel);
    for (const m of text.matchAll(/\bsetCookie\(\s*c\s*,\s*'([a-z][a-z0-9_]+)'/g)) add(found, m[1]!, 'cookie', rel);
  }
  return [...found.values()].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

/** The registry line a found item belongs to (by host for scripts, by name pattern otherwise). */
export function lineFor(f: Found, registry: StorageItem[] = STORAGE): StorageItem | undefined {
  if (f.type === 'script') return registry.find((r) => r.third?.host === f.name);
  return registry.find((r) => r.type === f.type && (nameMatches(r.name, f.name) || nameMatches(f.name, r.name)));
}

/**
 * Compares the cookies and storage found in the code with the registry: `unknown` (used but not declared) and `stale`
 * (declared but no longer used). The compliance test fails on either, so the cookie policy stays true (privacy).
 */
export function compare(found: Found[], registry: StorageItem[] = STORAGE) {
  const unknown = found.filter((f) => !lineFor(f, registry));
  const stale = registry.filter((r) => !r.planned && !found.some((f) => lineFor(f, [r])));
  return { unknown, stale };
}

// ------------------------------------------------------------------ outputs

export const POLICY_DATE = COOKIE_POLICY_VERSION.slice(0, 10);

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function countries(codes: string[], locale: Locale): string {
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  const list = new Intl.ListFormat([locale], { type: 'conjunction' });
  return list.format(codes.map((c) => names.of(c) ?? c));
}

function durationText(item: StorageItem, locale: Locale): string {
  const d = item.duration;
  return fill(COOKIE_PAGE[locale].duration[d.kind], 'n' in d ? { n: d.n } : {});
}

/** Rows: items with the same type, category, purpose, duration and surfaces share one row. */
function rows(locale: Locale): string[][] {
  const t = COOKIE_PAGE[locale];
  const groups = new Map<string, StorageItem[]>();
  for (const it of STORAGE) {
    const key = it.third ? `third:${it.name}` : JSON.stringify([it.type, it.category, it.purpose, it.duration, it.surfaces, it.conditional ?? ''])
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }
  return [...groups.values()].map((items) => {
    const it = items[0]!;
    const notes = [PURPOSES[it.purpose][locale]];
    if (it.third?.sets) notes.push(fill(t.setsOwn, { cookies: it.third.sets }));
    if (it.identifier && !it.third) notes.push(t.identifier);
    if (it.conditional && it.conditional !== 'checkout') notes.push(t.onlyIf);
    const name = items.map((i) => (i.third ? i.name : `\`${i.label ?? i.name}\``)).join(', ');
    // Korean writes 으로/로 by the last country's sound (미국으로, 영국으로): ../../shared/src/i18n/koParticles.ts.
    const filled = it.third ? fill(t.thirdParty, { company: it.third.company, countries: countries(it.third.countries, locale) }) : t.firstParty;
    const party = locale === 'ko' ? resolveKoParticles(filled) : filled;
    return [name, t.types[it.type], t.categories[it.category].name, notes.join(' '), durationText(it, locale), party, it.surfaces.map((s) => t.surfaces[s]).join(', ')];
  });
}

/** The cookie policy page in one language, generated from the storage registry. */
export function cookiePage(locale: Locale): string {
  const t = COOKIE_PAGE[locale];
  const h = t.head;
  const table = [
    `| ${[h.name, h.type, h.category, h.purpose, h.duration, h.party, h.where].join(' | ')} |`,
    `| ${Array(7).fill('---').join(' | ')} |`,
    ...rows(locale).map((r) => `| ${r.map(cell).join(' | ')} |`),
  ];
  const cats = (['necessary', 'preferences', 'analytics', 'marketing'] as const).map((c) => `- **${t.categories[c].name}** — ${t.categories[c].body}`);
  return [
    '---',
    `title: ${t.title}`,
    'section: legal',
    'order: 6',
    `summary: ${t.summary}`,
    '---',
    '<!-- Generated by scripts/compliance/inventory.ts from shared/src/compliance/storage.ts. Do not edit by hand. -->',
    `# ${t.title}`,
    '',
    `> **${t.draft}** ${fill(t.generated, { version: COOKIE_POLICY_VERSION, date: POLICY_DATE })}`,
    '',
    t.intro,
    '',
    `## ${t.rulesTitle}`,
    '',
    ...t.rules.map((r) => `- ${r}`),
    '',
    `## ${t.categoriesTitle}`,
    '',
    ...cats,
    '',
    `## ${t.listTitle}`,
    '',
    ...table,
    '',
    `## ${t.thirdTitle}`,
    '',
    t.thirdBody,
    '',
    `## ${t.changeTitle}`,
    '',
    t.changeBody,
    '',
    `## ${t.contactTitle}`,
    '',
    t.contactBody,
    '',
  ].join('\n');
}

/** The storage inventory as JSON (each item, its category and whether it was found), for the trust page. */
export function inventoryJson(found: Found[]): string {
  const items = STORAGE.map((it) => ({
    name: it.label ?? it.name,
    pattern: it.name,
    type: it.type,
    category: it.category,
    consentRequired: needsConsent(it.category),
    purpose: PURPOSES[it.purpose].en,
    duration: it.duration,
    party: it.third ? 'third' : 'first',
    company: it.third?.company ?? 'Curahold',
    countries: it.third?.countries ?? [],
    host: it.third?.host ?? null,
    providerCookies: it.third?.sets ?? null,
    identifier: !!it.identifier,
    surfaces: it.surfaces,
    onlyWhen: it.conditional ?? null,
    planned: it.planned ?? null,
    foundIn: found.filter((f) => lineFor(f, [it])).flatMap((f) => f.files).sort(),
  }));
  return `${JSON.stringify({ policyVersion: COOKIE_POLICY_VERSION, date: POLICY_DATE, draft: 'taslak — avukat onayı gerekli', items }, null, 2)}\n`;
}

/** Every file the inventory writes, with its content. */
export function outputs(root: string = ROOT): Map<string, string> {
  const out = new Map<string, string>();
  out.set(join(root, 'docs', 'compliance', 'storage-inventory.json'), inventoryJson(scan(root)));
  for (const l of LOCALES) out.set(join(root, 'docs', 'site', l, 'legal-cookies.md'), cookiePage(l));
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const found = scan();
  const { unknown, stale } = compare(found);
  for (const f of unknown) console.log(`unknown ${f.type} "${f.name}" in ${f.files.join(', ')} — add it to shared/src/compliance/storage.ts`);
  for (const r of stale) console.log(`stale registry line ${r.type} "${r.name}" — the code no longer has it`);
  let bad = unknown.length + stale.length;
  for (const [path, content] of outputs()) {
    const rel = relative(ROOT, path);
    const now = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (args.includes('--write')) {
      if (now !== content) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content);
        console.log(`wrote ${rel}`);
      }
    } else if (args.includes('--check') && now !== content) {
      console.log(`out of date: ${rel} (run with --write)`);
      bad++;
    }
  }
  console.log(`${found.length} items found in the code, ${STORAGE.length} registry lines, ${bad} problem(s)`);
  if (args.includes('--check') && bad) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
