// The browser loads one language at a time (shared/src/i18n/vite-plugin.ts):
// the dictionary-free core, the filled per-language dictionaries, and the
// portal's narrowed set must say exactly what the full module says.
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dictionaries, LOCALES, translate, type MessageKey } from '../shared/src/i18n';
import { ALL_KEYS, filledDictionary, i18nForBrowser, keysUsedIn, keysUsedInFiles, staticClosure } from '../shared/src/i18n/vite-plugin';

describe('one language at a time', () => {
  it('a filled dictionary has every key and reads like translate() with all nine loaded', () => {
    for (const l of LOCALES) {
      const d = filledDictionary(l);
      expect(Object.keys(d).length).toBe(ALL_KEYS.length);
      for (const k of ALL_KEYS) expect(d[k]).toBe(dictionaries[l][k as MessageKey] ?? dictionaries.en[k as MessageKey]);
    }
  });

  it('complete languages ship as written, with no English mixed in', () => {
    for (const l of ['en', 'tr'] as const) {
      const d = filledDictionary(l);
      for (const k of ALL_KEYS) expect(d[k]).toBe(dictionaries[l][k as MessageKey]);
    }
  });

  it('the portal set holds every key the portal code names', () => {
    const keep = keysUsedIn([fileURLToPath(new URL('../web/portal', import.meta.url))]);
    for (const k of ['portal.missing', 'errors.server', 'common.cancel', 'common.loading', 'portal.method.google', 'task.priority.high']) {
      if (ALL_KEYS.includes(k)) expect(keep(k), k).toBe(true);
    }
    expect(keep('auth.signInTo')).toBe(false);
    expect(ALL_KEYS.filter(keep).length).toBeLessThan(ALL_KEYS.length / 4);
  });

  it('the app ships the first screen\'s phrases first, the rest after: every phrase in exactly one part', async () => {
    const web = (p: string) => fileURLToPath(new URL(`../web/${p}`, import.meta.url));
    const first = { entries: [web('src/main.tsx'), web('src/pages/Home.tsx')], dirs: [web('src')], loader: web('src/lib/i18n.tsx') };
    const files = staticClosure(first.entries);
    expect(files).toContain(web('src/components/Shell.tsx'));
    expect(files.some((f) => f.includes('/shared/src/i18n/'))).toBe(false); // the dictionaries are not "code that names a key"
    expect(files).not.toContain(web('src/pages/BoardPage.tsx')); // a lazy screen
    const plugin = i18nForBrowser({ swap: true, first }) as any;
    const load = async (src: string) => JSON.parse(JSON.parse(/JSON\.parse\((.*)\);$/.exec(await plugin.load(await plugin.resolveId(src, undefined, {})))![1]));
    const keep = keysUsedInFiles(files);
    for (const l of ['tr', 'ja'] as const) {
      const a = await load(`virtual:curahold-dict/${l}`);
      const b = await load(`virtual:curahold-dict/${l}/rest`);
      expect({ ...a, ...b }).toEqual(filledDictionary(l));
      expect(Object.keys(a).filter((k) => k in b)).toEqual([]);
      for (const k of Object.keys(a)) expect(keep(k)).toBe(true);
      expect(Object.keys(a).length).toBeLessThan(ALL_KEYS.length / 4);
    }
    // Lazy screens wait for the rest; the import marked first-screen does not.
    const out = plugin.transform(`a(() => import('./pages/Board')); b(() => import(/* first-screen */ './pages/Home'));`, web('src/App.tsx'));
    expect(out.code).toContain(`__curaholdFull(import('./pages/Board'))`);
    expect(out.code).toContain(`import(/* first-screen */ './pages/Home')`);
    expect(out.code).not.toContain(`__curaholdFull(import(/* first-screen */`);
    expect(plugin.transform(`import('./x')`, fileURLToPath(new URL('../web/portal/x.tsx', import.meta.url)))).toBe(null);
  });

  it('the full module still translates every language synchronously', () => {
    expect(translate('tr', 'common.cancel')).toBe(dictionaries.tr['common.cancel']);
    expect(translate('ja', 'common.cancel')).toBe(dictionaries.ja['common.cancel'] ?? dictionaries.en['common.cancel']);
  });
});
