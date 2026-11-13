// English and Turkish stay complete and in step, and the interface has no
// text that bypasses the dictionaries.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@babel/parser';
import { describe, expect, it } from 'vitest';
import { en } from '../shared/src/i18n/en';
import { tr } from '../shared/src/i18n/tr';
import { accountWords, translate, LOCALES, LOCALE_INFO, dictionaries, isRtl, bcp47Of, type Locale, type MessageKey } from '../shared/src/i18n';

const ROOT = join(import.meta.dirname, '..');
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function sources(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('dictionaries', () => {
  it('have exactly the same keys', () => {
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort());
  });

  it('have no empty text', () => {
    for (const [k, v] of [...Object.entries(en), ...Object.entries(tr)]) expect(v.trim(), k).not.toBe('');
  });

  it('use the same placeholders in both languages', () => {
    const allowedExtra = new Set(['account', 'accounts', 'account_l', 'accounts_l']);
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      const a = placeholders(en[key]).filter((p) => !allowedExtra.has(p));
      const b = placeholders(tr[key]).filter((p) => !allowedExtra.has(p));
      expect(b, key).toEqual(a);
    }
  });

  it('every key used in the code exists', () => {
    const files = [...sources(join(ROOT, 'web', 'src')), ...sources(join(ROOT, 'api', 'src'))];
    const missing: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/\bt(?:ranslate)?\((?:[a-zA-Z.]+,\s*)?'([a-z][\w]*\.[\w.]+)'/g)) {
        if (!(m[1] in en)) missing.push(`${f.replace(ROOT, '')}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('dynamic keys are covered: errors, permissions, priorities, statuses, audit actions', async () => {
    const { PERMS, PRIORITIES, USER_STATUSES } = await import('../shared/src/model');
    for (const p of PERMS) expect(`perm.${p}` in en, p).toBe(true);
    for (const p of PRIORITIES) expect(`task.priority.${p}` in en, p).toBe(true);
    for (const s of USER_STATUSES) expect(`settings.people.status.${s}` in en, s).toBe(true);
    const errorsSrc = readFileSync(join(ROOT, 'api', 'src', 'lib', 'errors.ts'), 'utf8');
    const codes = [...errorsSrc.matchAll(/^\s+\| '(\w+)'/gm)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(15);
    for (const c of codes) expect(`errors.${c}` in en, c).toBe(true);
    const apiSrc = sources(join(ROOT, 'api', 'src')).map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const m of apiSrc.matchAll(/action: '([\w.]+)'/g)) expect(`audit.${m[1]}` in en, m[1]).toBe(true);
  });
});

describe('the interface has no hard-coded text', () => {
  it('no plain words in JSX text or in user-facing attributes', () => {
    const ALLOWED = /^(Curahold|English|Türkçe|dev:)$/; // brand, language names, dev-only hint
    const ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt']);
    const offenders: string[] = [];
    for (const f of sources(join(ROOT, 'web', 'src')).filter((x) => x.endsWith('.tsx'))) {
      const ast = parse(readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] });
      const walk = (node: any) => {
        if (!node || typeof node.type !== 'string') return;
        if (node.type === 'JSXText') {
          const words = node.value.trim();
          if (/[A-Za-zÇĞİÖŞÜçğıöşü]{2,}/.test(words) && !ALLOWED.test(words)) offenders.push(`${f.replace(ROOT, '')}:${node.loc.start.line} "${words}"`);
        }
        if (node.type === 'JSXAttribute' && ATTRS.has(node.name?.name) && node.value?.type === 'StringLiteral' && /[A-Za-z]{2,}/.test(node.value.value) && !ALLOWED.test(node.value.value)) {
          offenders.push(`${f.replace(ROOT, '')}:${node.loc.start.line} ${node.name.name}="${node.value.value}"`);
        }
        for (const key of Object.keys(node)) {
          if (key === 'loc' || key === 'start' || key === 'end') continue;
          const v = node[key];
          if (Array.isArray(v)) v.forEach(walk);
          else if (v && typeof v === 'object') walk(v);
        }
      };
      walk(ast.program);
    }
    expect(offenders).toEqual([]);
  });
});

describe('the locale registry', () => {
  const EXPECTED: Locale[] = ['en', 'tr', 'ar', 'he', 'fa', 'zh-Hans', 'zh-Hant', 'ja', 'ko'];

  it('lists every supported locale once', () => {
    expect([...LOCALES].sort()).toEqual([...EXPECTED].sort());
  });

  it('describes each locale with a native name, English name, direction and BCP-47 tag', () => {
    const tags = new Set<string>();
    for (const l of LOCALES) {
      const info = LOCALE_INFO[l];
      expect(info.name.trim(), `${l} name`).not.toBe('');
      expect(info.english.trim(), `${l} english`).not.toBe('');
      expect(['ltr', 'rtl'], `${l} dir`).toContain(info.dir);
      expect(info.bcp47.trim(), `${l} bcp47`).not.toBe('');
      expect(tags.has(info.bcp47), `${l} bcp47 unique`).toBe(false);
      tags.add(info.bcp47);
      expect(bcp47Of(l)).toBe(info.bcp47);
      expect(isRtl(l)).toBe(info.dir === 'rtl');
    }
  });

  it('marks exactly the MENA scripts as right-to-left', () => {
    expect(LOCALES.filter(isRtl).sort()).toEqual(['ar', 'fa', 'he']);
  });

  it('has a dictionary for every locale, English and Turkish complete', () => {
    for (const l of LOCALES) expect(dictionaries[l], l).toBeTruthy();
    expect(Object.keys(dictionaries.en).length).toBeGreaterThan(100);
    expect(Object.keys(dictionaries.tr).length).toBe(Object.keys(dictionaries.en).length);
  });

  it('falls back to English for any key a locale has not translated yet', () => {
    // The new markets are translated surface by surface, so each still has keys
    // it has not reached. A missing key reads the English; a present one reads
    // its own language. Both directions are proven here.
    const partial = LOCALES.find((l) => l !== 'en' && Object.keys(dictionaries[l]).length < Object.keys(dictionaries.en).length);
    expect(partial, 'a partially-translated locale to prove the fallback').toBeTruthy();
    const enKeys = Object.keys(dictionaries.en) as MessageKey[];
    const missing = enKeys.find((k) => !(k in dictionaries[partial!]) && !/\{/.test(dictionaries.en[k]!));
    expect(missing, 'a placeholder-free untranslated key').toBeTruthy();
    expect(translate(partial!, missing!)).toBe(dictionaries.en[missing!]);
    const own = (Object.keys(dictionaries[partial!]) as MessageKey[]).find((k) => dictionaries[partial!][k] !== dictionaries.en[k]);
    if (own) expect(translate(partial!, own)).toBe(dictionaries[partial!][own]);
    // The account noun is localized for every market, dictionary or not.
    expect(translate(partial!, 'board.searchPlaceholder')).toContain(accountWords(partial!).other);
  });

  it('keeps every functional placeholder a key uses, in every locale', () => {
    // {org}, {email}, {n}, {max}… must survive translation intact; the account
    // noun family ({accounts_l}…) is substituted specially and excluded here.
    const acct = new Set(['account', 'accounts', 'account_l', 'accounts_l']);
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((p) => !acct.has(p)).sort();
    const problems: string[] = [];
    for (const l of LOCALES) {
      if (l === 'en') continue;
      for (const key of Object.keys(dictionaries[l]) as MessageKey[]) {
        const want = ph(dictionaries.en[key] ?? '').join(',');
        const got = ph(dictionaries[l][key]!).join(',');
        if (want !== got) problems.push(`${l} ${key}: en[${want}] vs [${got}]`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('gives every locale a customer noun, native where set and English otherwise', () => {
    for (const l of LOCALES) {
      const w = accountWords(l);
      expect(w.one.trim(), `${l} one`).not.toBe('');
      expect(w.other.trim(), `${l} other`).not.toBe('');
    }
    // The new target-market locales carry their own native noun, not the English one.
    for (const l of ['ar', 'he', 'fa', 'ja', 'ko', 'zh-Hans', 'zh-Hant'] as Locale[]) {
      expect(accountWords(l).one, l).not.toBe(accountWords('en').one);
    }
  });
});

describe('company vocabulary', () => {
  it('replaces the default word for customers', () => {
    const terms = { account: { tr: { one: 'Partner', other: 'Partnerler' } } };
    expect(translate('tr', 'board.searchPlaceholder', {}, terms)).toBe('Görev veya partner ara');
    expect(accountWords('en', terms).one).toBe('Account');
    expect(translate('en', 'board.searchPlaceholder')).toBe('Search tasks or accounts');
  });
});
