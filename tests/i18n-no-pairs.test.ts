// Nothing in the code knows there are "two languages". Text lives in the nine
// dictionaries (built-in content through phrase(), see ARCHITECTURE.md), and
// dates, numbers and money are formatted for the person's language — never an
// English/Turkish pair written in place, never an "is it Turkish?" branch.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEMPLATES, pick } from '../shared/src/templates';
import { BUILTIN_TYPES, typeLabel } from '../shared/src/records';
import { REPORT_LIBRARY } from '../shared/src/reports';
import { LOCALES, dayFirst, intlTag, numberMarks } from '../shared/src/i18n';
import { parseDate, parseNumber } from '../shared/src/fields';

const ROOT = join(import.meta.dirname, '..');

/**
 * The help centre, its API reference and the demo hub are written in English and
 * Turkish only; making them nine-language waits for the owner's decision. They
 * are the only places allowed to branch on the language, and static.mts reports
 * them on a line of their own.
 */
export const TWO_LANGUAGE_PAGES = ['scripts/build-docs.ts', 'scripts/docs/api-reference.ts', 'scripts/build-demo-hub.ts'];

function sources(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'node_modules' && name !== 'i18n') sources(p, out);
    } else if (/\.(ts|tsx|mts)$/.test(name)) out.push(p);
  }
  return out;
}
const files = ['api', 'web', 'shared', 'scripts'].flatMap((d) => sources(join(ROOT, d))).map((f) => relative(ROOT, f));

const PAIR = /\bL\(\s*['"`]/;
const CHECKS = [/[=!]==\s*['"]tr['"]/, /['"]tr['"]\s*[=!]==/, /'tr-TR'\s*:\s*'en-/, /z\.enum\(\s*\[\s*'(en|tr)',\s*'(en|tr)'\s*\]\s*\)/];

describe('no text or check that assumes two languages', () => {
  it('writes no English/Turkish pair outside the dictionaries', () => {
    const hits = files.filter((f) => PAIR.test(readFileSync(join(ROOT, f), 'utf8')));
    expect(hits).toEqual([]);
  });

  it('asks "is it Turkish?" nowhere but the two-language help pages', () => {
    const hits: string[] = [];
    for (const f of files) {
      if (TWO_LANGUAGE_PAGES.includes(f) || f === 'scripts/quality/static.mts') continue; // the pages above; the measurement's own pattern
      readFileSync(join(ROOT, f), 'utf8')
        .split('\n')
        .forEach((line, i) => CHECKS.some((re) => re.test(line)) && hits.push(`${f}:${i + 1}`));
    }
    expect(hits).toEqual([]);
  });

  it('gives built-in content its own words in every language', () => {
    const tpl = TEMPLATES.sales;
    for (const l of LOCALES) {
      const board = pick(tpl.boards[0].name, l);
      expect(board, l).not.toBe('');
      if (l !== 'en') expect(board, l).not.toBe(pick(tpl.boards[0].name, 'en'));
      expect(tpl.terms.account?.[l]?.other, l).toBeTruthy();
      expect(typeLabel(BUILTIN_TYPES.contact, l), l).not.toBe('');
      expect(pick(REPORT_LIBRARY[0].name, l), l).not.toBe('');
    }
    // Written into a company's data, the server keeps all nine.
    const stored = JSON.parse(JSON.stringify(tpl.accountFields[0].label));
    expect(Object.keys(stored).sort()).toEqual([...LOCALES].sort());
  });

  it('reads typed numbers and dates the way each language writes them', () => {
    expect(parseNumber('1.250', 'tr')).toBe(1250);
    expect(parseNumber('1,250', 'en')).toBe(1250);
    expect(parseNumber('1,250', 'ja')).toBe(1250);
    expect(parseDate('03/04/2027', 'en')).toBe('2027-03-04');
    expect(parseDate('03/04/2027', 'he')).toBe('2027-04-03');
    expect(parseDate('2027/04/03', 'ja')).toBe('2027-04-03');
    expect(dayFirst('ar')).toBe(true);
    expect(numberMarks('tr')).toEqual({ group: '.', decimal: ',' });
    expect(new Intl.NumberFormat(intlTag('ar')).format(1250)).toBe('1,250');
  });
});
