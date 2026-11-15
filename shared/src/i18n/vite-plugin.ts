// Build-time side of loading one language at a time in the browser (the web
// app, the portal and the demo). Used only by the vite configs; never shipped.
//
// 1. Swap: with `swap` on, every import of `shared/src/i18n` (index, which
//    pulls in all nine dictionaries) resolves to `./core` instead — same names,
//    no dictionary. Nothing in the app's code has to know. The demo leaves it
//    off: it runs the API in the tab, and the API needs every language at once.
// 2. Serve: `virtual:curahold-dict/<locale>` is one language as a module of its
//    own (its own small chunk), already filled with English wherever a phrase is
//    not translated yet — so a complete language costs one download and an
//    incomplete one still never shows a raw key. `keys` narrows what ships (the
//    portal needs a few hundred phrases, not thousands).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { dictionaries, LOCALES, type Locale } from './index';

const PREFIX = 'virtual:curahold-dict/';
/**
 * Keys only the server reads, never shipped to a browser: report-source field names
 * (api/src/lib/reportEngine.ts) and the template's word for customers, read when a
 * company is created. (The demo runs the server in the tab with every dictionary.)
 */
export const SERVER_ONLY = /^(rsrc|tpl\.term)\./;
const RESOLVED = '\0curahold-dict:';

export interface I18nPluginOptions {
  /** Resolve `shared/src/i18n` (index) to the dictionary-free core. */
  swap: boolean;
  /** Ship only the keys this returns true for (default: all). */
  keys?: (key: string) => boolean;
  /**
   * Ship each language in two parts: `virtual:curahold-dict/<l>` holds what the
   * files reached statically from `entries` use; `virtual:curahold-dict/<l>/rest`
   * the rest. Dynamic imports in files under `dirs` are wrapped so they resolve
   * only once the rest is in (`loader` exports `afterFullLanguage`); an import
   * marked first-screen is left alone. Without this option the rest is empty.
   */
  first?: { entries: string[]; dirs: string[]; loader: string };
}
const REST = '/rest';
// Its own name, so its chunk reads _curahold-rest_<locale>.
const RESOLVED_REST = '\0curahold-rest:';

/** Every key in English, the language that defines them. */
export const ALL_KEYS = Object.keys(dictionaries.en);

/** One language, filled with English for what it lacks, narrowed to `keep`. */
export function filledDictionary(locale: Locale, keep: (key: string) => boolean = () => true): Record<string, string> {
  const own = dictionaries[locale] as Record<string, string | undefined>;
  const en = dictionaries.en as Record<string, string>;
  const out: Record<string, string> = {};
  for (const k of ALL_KEYS) if (keep(k)) out[k] = own[k] ?? en[k];
  return out;
}

/**
 * The keys a set of source files can ask for: every quoted string that is a
 * key, and every key under a static prefix used in a template (`portal.method.${x}`).
 */
export function keysUsedIn(dirs: string[]): (key: string) => boolean {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  return keysUsedInFiles(dirs.flatMap(files));
}

/** The same, for a list of files. */
export function keysUsedInFiles(list: string[]): (key: string) => boolean {
  const all = new Set(ALL_KEYS);
  const used = new Set<string>();
  const prefixes = new Set<string>();
  for (const f of list) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/(['"`])([A-Za-z][\w.-]{1,100})\1/g)) if (all.has(m[2])) used.add(m[2]);
    for (const m of s.matchAll(/`([A-Za-z]\w*(?:\.[\w-]+)*\.)\$\{/g)) prefixes.add(m[1]);
  }
  for (const k of ALL_KEYS) if ([...prefixes].some((p) => k.startsWith(p))) used.add(k);
  return (k) => used.has(k);
}

/**
 * Every source file the given entry files reach through static imports (not
 * `import()`, not `import type`): what is on screen before any lazy chunk loads.
 * The dictionaries themselves (shared/src/i18n) are left out.
 */
export function staticClosure(entries: string[]): string[] {
  const seen = new Set<string>();
  const find = (p: string) => [p, `${p}.ts`, `${p}.tsx`, join(p, 'index.ts'), join(p, 'index.tsx')].find((f) => existsSync(f) && statSync(f).isFile());
  const visit = (file: string) => {
    if (seen.has(file) || /[\\/]shared[\\/]src[\\/]i18n[\\/]/.test(file) || !/\.(ts|tsx)$/.test(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:^|[\n;])\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s*)?(['"])(\.{1,2}\/[^'"]+)\1/g)) {
      const f = find(resolve(dirname(file), m[2]));
      if (f) visit(f);
    }
  };
  for (const e of entries) visit(resolve(e));
  return [...seen];
}

/**
 * Marks on a dynamic import that does not wait for the rest of the language: part of
 * the first screen (`import(/* first-screen *\/ './pages/Home')`), or code that draws
 * no phrases at all (`/* no-phrases *\/`).
 */
const MARKS = ['first-screen', 'no-phrases'];
const DYNAMIC = /\bimport\(\s*(\/\*([^*]*)\*\/\s*)?(['"])(\.{1,2}\/[^'"]+)\3\s*\)/g;

export function i18nForBrowser({ swap, keys, first }: I18nPluginOptions): Plugin {
  // Split in two: the phrases the first screen's own files use come with it;
  // the rest follows, and every other screen waits for it (see `transform`).
  let firstKeys: ((key: string) => boolean) | null = null;
  const firstOf = () => (firstKeys ??= first ? keysUsedInFiles(staticClosure(first.entries)) : () => true);
  const inScope = (id: string) => !!first && first.dirs.some((d) => id.startsWith(resolve(d) + sep)) && /\.(ts|tsx)$/.test(id);
  return {
    name: 'curahold-i18n',
    enforce: 'pre',
    async resolveId(source, importer, opts) {
      if (source.startsWith(PREFIX)) {
        const name = source.slice(PREFIX.length);
        return name.endsWith(REST) ? RESOLVED_REST + name.slice(0, -REST.length) : RESOLVED + name;
      }
      if (!swap || !importer || !/i18n(\/index(\.ts)?)?$/.test(source) || source.includes('virtual:')) return null;
      const r = await this.resolve(source, importer, { ...opts, skipSelf: true });
      if (r && /[\\/]shared[\\/]src[\\/]i18n[\\/]index\.ts$/.test(r.id)) return r.id.replace(/index\.ts$/, 'core.ts');
      return null;
    },
    load(id) {
      const rest = id.startsWith(RESOLVED_REST);
      if (!rest && !id.startsWith(RESOLVED)) return null;
      const locale = id.slice((rest ? RESOLVED_REST : RESOLVED).length) as Locale;
      if (!LOCALES.includes(locale)) throw new Error(`unknown locale ${locale}`);
      // Server-only keys never reach a browser, in either part.
      const keep = (k: string) => !SERVER_ONLY.test(k) && (keys ? keys(k) : true);
      const part = first ? (rest ? (k: string) => keep(k) && !firstOf()(k) : (k: string) => keep(k) && firstOf()(k)) : rest ? () => false : keep;
      // JSON.parse of one string literal parses faster than an object literal.
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(filledDictionary(locale, part)))});`;
    },
    // Every other screen is a lazy chunk: its import also waits for the rest of
    // the language, so no screen past the first can ever draw a missing phrase.
    // The chunk still downloads at once; only drawing it waits.
    transform(code, id) {
      if (!inScope(id) || !code.includes('import(') || id.endsWith(`${sep}i18n.tsx`)) return null;
      let hit = false;
      const out = code.replace(DYNAMIC, (all, _c, note: string | undefined) => {
        if (MARKS.some((m) => note?.includes(m))) return all;
        hit = true;
        return `__curaholdFull(${all})`;
      });
      if (!hit) return null;
      return { code: `import { afterFullLanguage as __curaholdFull } from ${JSON.stringify(first!.loader)};\n${out}`, map: null };
    },
  };
}
