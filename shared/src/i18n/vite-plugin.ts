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
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { dictionaries, LOCALES, type Locale } from './index';

const PREFIX = 'virtual:curahold-dict/';
const RESOLVED = '\0curahold-dict:';

export interface I18nPluginOptions {
  /** Resolve `shared/src/i18n` (index) to the dictionary-free core. */
  swap: boolean;
  /** Ship only the keys this returns true for (default: all). */
  keys?: (key: string) => boolean;
}

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
  const all = new Set(ALL_KEYS);
  const used = new Set<string>();
  const prefixes = new Set<string>();
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  for (const f of dirs.flatMap(files)) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/(['"`])([A-Za-z][\w.-]{1,100})\1/g)) if (all.has(m[2])) used.add(m[2]);
    for (const m of s.matchAll(/`([A-Za-z]\w*(?:\.[\w-]+)*\.)\$\{/g)) prefixes.add(m[1]);
  }
  for (const k of ALL_KEYS) if ([...prefixes].some((p) => k.startsWith(p))) used.add(k);
  return (k) => used.has(k);
}

export function i18nForBrowser({ swap, keys }: I18nPluginOptions): Plugin {
  return {
    name: 'curahold-i18n',
    enforce: 'pre',
    async resolveId(source, importer, opts) {
      if (source.startsWith(PREFIX)) return RESOLVED + source.slice(PREFIX.length);
      if (!swap || !importer || !/i18n(\/index(\.ts)?)?$/.test(source) || source.includes('virtual:')) return null;
      const r = await this.resolve(source, importer, { ...opts, skipSelf: true });
      if (r && /[\\/]shared[\\/]src[\\/]i18n[\\/]index\.ts$/.test(r.id)) return r.id.replace(/index\.ts$/, 'core.ts');
      return null;
    },
    load(id) {
      if (!id.startsWith(RESOLVED)) return null;
      const locale = id.slice(RESOLVED.length) as Locale;
      if (!LOCALES.includes(locale)) throw new Error(`unknown locale ${locale}`);
      // JSON.parse of one string literal parses faster than an object literal.
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(filledDictionary(locale, keys)))});`;
    },
  };
}
