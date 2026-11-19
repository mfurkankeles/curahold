// The sales site's header and inner pages (site/info): every language carries
// every string in the English shape, nothing is left in English, and the claims
// that depend on the product's own rules stay in step with it.
import { describe, expect, it } from 'vitest';
import { INFO } from '../site/info';
import { TRIAL_MONTHS } from '../shared/src/billing';
import { DEPTS, CHAIN } from '../scripts/site-chrome';

const shape = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(shape) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)])) : typeof v;
const leaves = (v: unknown, path = ''): [string, string][] =>
  typeof v === 'string' ? [[path, v]] : Array.isArray(v) ? v.flatMap((x, i) => leaves(x, `${path}[${i}]`)) : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => leaves(x, `${path}.${k}`)) : [];
// Names and short labels that are the same in every language.
const SAME = new Set(['CRM', 'Blog', 'Curahold', 'API', 'AI', 'Türkiye']);

describe('site/info', () => {
  const en = INFO.en;
  for (const [locale, copy] of Object.entries(INFO)) {
    if (locale === 'en') continue;
    it(`${locale} has the English shape`, () => expect(shape(copy)).toEqual(shape(en)));
    it(`${locale} leaves nothing in English`, () => {
      const mine = new Map(leaves(copy));
      const left = leaves(en).filter(([p, s]) => mine.get(p) === s && !SAME.has(s) && /[a-z]{4,}/i.test(s));
      expect(left).toEqual([]);
    });
  }
  it('has six departments in the journey order, the first four one chain', () => {
    expect(DEPTS).toEqual(['inside', 'sales', 'onboarding', 'success', 'product', 'finance']);
    expect(CHAIN).toEqual(DEPTS.slice(0, 4));
    for (const copy of Object.values(INFO)) expect(copy.why.forWho).toHaveLength(DEPTS.length);
  });
  it('says the same trial length as the product', () => {
    expect(TRIAL_MONTHS).toBe(3);
    expect(en.nav.trialCard.title).toContain(String(TRIAL_MONTHS));
  });
});
