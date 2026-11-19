// The sales site's A/B test (site/ab): the edge only ever splits consenting human
// visitors on a landing page, keeps a participant on their variant, and stays off
// until the config says otherwise.
import { describe, expect, it } from 'vitest';
import { AB } from '../site/ab/config';
// @ts-expect-error — plain JS module for the edge, no types
import { decide, landingPrefix, pick } from '../site/ab/worker.js';

const on = { ...AB, enabled: true };
const human = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';
const req = (o: Partial<{ method: string; path: string; ua: string; cookie: string }> = {}) => ({ method: 'GET', path: '/', ua: human, cookie: 'cura_consent=a1', ...o });

describe('the A/B edge', () => {
  it('is not live: the shipped config is off', () => {
    expect(AB.enabled).toBe(false);
    expect(decide(req(), AB, 0.5)).toBeNull();
  });
  it('defaults to three versions: classic, A and C', () => {
    expect(AB.variants.map((v) => v.id)).toEqual(['main', 'a', 'c']);
  });
  it('leaves out anyone without analytics consent, and sets nothing for them', () => {
    expect(decide(req({ cookie: '' }), on, 0.5)).toBeNull();
    expect(decide(req({ cookie: 'cura_consent=a0' }), on, 0.5)).toBeNull();
  });
  it('shows bots the classic page', () => {
    expect(decide(req({ ua: 'Mozilla/5.0 (compatible; Googlebot/2.1)' }), on, 0.9)).toBeNull();
  });
  it('splits only landing pages', () => {
    expect(landingPrefix('/', on)).toBe('');
    expect(landingPrefix('/tr/', on)).toBe('tr/');
    expect(landingPrefix('/tr/pricing/', on)).toBeNull();
    expect(decide(req({ path: '/assets/site.css' }), on, 0.9)).toBeNull();
    expect(decide(req({ method: 'POST' }), on, 0.9)).toBeNull();
  });
  it('assigns by weight, serves the version under the same address and keeps it', () => {
    const first = decide(req({ path: '/tr/' }), on, 0.99);
    expect(first).toMatchObject({ variant: 'c', page: '/tr/orbit/' });
    expect(first.setCookie).toMatch(/^cura_ab=v1\.c; Max-Age=2592000; Path=\/; SameSite=Lax; Secure$/);
    const again = decide(req({ path: '/tr/', cookie: 'cura_consent=a1; cura_ab=v1.c' }), on, 0.01);
    expect(again).toMatchObject({ variant: 'c', setCookie: null });
    expect(pick(on.variants, 0).id).toBe('main');
    expect(pick(on.variants, 0.5).id).toBe('a');
  });
  it('ignores a cookie from an older experiment', () => {
    expect(decide(req({ cookie: 'cura_consent=a1; cura_ab=v0.c' }), on, 0)).toMatchObject({ variant: 'main', page: '/' });
  });
  it('keeps languages outside the test on the classic page', () => {
    expect(decide(req({ path: '/ja/' }), { ...on, locales: ['en', 'tr'] }, 0.9)).toBeNull();
  });
});
