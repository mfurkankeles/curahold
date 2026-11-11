// English and Turkish stay complete and in step, and the interface has no
// text that bypasses the dictionaries.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@babel/parser';
import { describe, expect, it } from 'vitest';
import { en } from '../shared/src/i18n/en';
import { tr } from '../shared/src/i18n/tr';
import { accountWords, translate } from '../shared/src/i18n';

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
    const ALLOWED = /^(Tendwell|English|Türkçe|dev:)$/; // brand, language names, dev-only hint
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

describe('company vocabulary', () => {
  it('replaces the default word for customers', () => {
    const terms = { account: { tr: { one: 'Partner', other: 'Partnerler' } } };
    expect(translate('tr', 'board.searchPlaceholder', {}, terms)).toBe('Görev veya partner ara');
    expect(accountWords('en', terms).one).toBe('Account');
    expect(translate('en', 'board.searchPlaceholder')).toBe('Search tasks or accounts');
  });
});
