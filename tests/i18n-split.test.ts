// The browser loads one language at a time (shared/src/i18n/vite-plugin.ts):
// the dictionary-free core, the filled per-language dictionaries, and the
// portal's narrowed set must say exactly what the full module says.
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dictionaries, LOCALES, translate, type MessageKey } from '../shared/src/i18n';
import { ALL_KEYS, filledDictionary, keysUsedIn } from '../shared/src/i18n/vite-plugin';

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

  it('the full module still translates every language synchronously', () => {
    expect(translate('tr', 'common.cancel')).toBe(dictionaries.tr['common.cancel']);
    expect(translate('ja', 'common.cancel')).toBe(dictionaries.ja['common.cancel'] ?? dictionaries.en['common.cancel']);
  });
});
