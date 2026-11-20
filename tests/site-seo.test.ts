// The sales site's search basics, checked on a real build (scripts/build-site.ts into a temp
// folder): every indexable page has a title and description of a useful length for its script,
// hreflang comes from the one language list (site/locales.ts), the animated versions stay out of
// search, the structured data quotes exactly the prices in shared/src/billing.ts, and no page's
// headings skip a level. Decisions behind these rules: docs/ADR/0020-site-seo-and-crawlers.md.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INTERVALS, PLANS, PLAN_KEYS } from '../shared/src/billing';
import { bcp47Of } from '../shared/src/i18n';
import { blogPosts, BLOG_LOCALES } from '../site/content';
import { infoCopy } from '../site/info';
import { SITE_LOCALES, type SiteLocale } from '../site/locales';

const ROOT = join(import.meta.dirname, '..');
let out = '';

/** Chinese, Japanese and Korean fit about twice the meaning per character, so their ranges are their own. */
const wide = (l: string) => /^(ja|ko|zh)/.test(l);
const TITLE = (l: string): [number, number] => (wide(l) ? [25, 40] : [45, 60]);
const DESC = (l: string): [number, number] => (wide(l) ? [70, 100] : [100, 160]);
const within = (n: number, [lo, hi]: [number, number]) => n >= lo && n <= hi;
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Every built page: its path under the site root and its HTML. */
function pages(): { path: string; html: string }[] {
  const found: { path: string; html: string }[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (e.name === 'index.html') found.push({ path: `/${relative(out, dir).split(/[\\/]/).join('/')}${dir === out ? '' : '/'}`.replace('//', '/'), html: readFileSync(join(dir, e.name), 'utf8') });
    }
  };
  walk(out);
  return found.filter((p) => !p.path.startsWith('/demo/'));
}
const indexable = () => pages().filter((p) => !/name="robots" content="noindex/.test(p.html));
const langOf = (html: string) => /<html lang="([^"]+)"/.exec(html)![1];
const ldOf = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].flatMap((m) => JSON.parse(m[1])['@graph'] ?? [JSON.parse(m[1])]);
const sitemapLocs = () => {
  const index = readFileSync(join(out, 'sitemap.xml'), 'utf8');
  return [...index.matchAll(/<loc>[^<]*\/(sitemap-[^<]+\.xml)<\/loc>/g)].flatMap((m) => [...readFileSync(join(out, m[1]), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]));
};

beforeAll(() => {
  out = mkdtempSync(join(tmpdir(), 'site-seo-'));
  execFileSync(process.execPath, ['--import', 'tsx', join(ROOT, 'scripts', 'build-site.ts'), out], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, SITE_LASTMOD: '2026-11-20' } });
}, 120_000);
afterAll(() => {
  if (out) rmSync(out, { recursive: true, force: true });
});

describe('search titles and descriptions', () => {
  for (const l of SITE_LOCALES) {
    it(`${l}: every page's are written for search, in range and unique`, () => {
      const seo = Object.entries(infoCopy(l).seo);
      for (const [page, [title, desc]] of seo) {
        expect(within(title.length, TITLE(l)), `${l} ${page} title ${title.length}: ${title}`).toBe(true);
        expect(within(desc.replace(/\{\w+\}/g, '$15').length, DESC(l)), `${l} ${page} description ${desc.length}`).toBe(true);
        expect(title).toContain('Curahold');
      }
      expect(new Set(seo.map(([, [t]]) => t)).size).toBe(seo.length);
    });
  }
  for (const l of BLOG_LOCALES) {
    it(`${l}: blog posts have their own search title and description`, () => {
      for (const p of blogPosts(l)) {
        expect(within(p.seo[0].length, TITLE(l)), p.seo[0]).toBe(true);
        expect(within(p.seo[1].length, DESC(l)), p.slug).toBe(true);
      }
    });
  }
  it('every indexable built page carries them, in range for its language', () => {
    const bad = indexable().flatMap(({ path, html }) => {
      const l = langOf(html);
      const title = unesc(/<title>(.*?)<\/title>/s.exec(html)?.[1] ?? '');
      const desc = unesc(/<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '');
      const t = TITLE(l);
      return [...(within(title.length, [Math.min(t[0], 45), t[1]]) ? [] : [`${path} title ${title.length}`]), ...(within(desc.length, wide(l) ? [70, 160] : [100, 160]) ? [] : [`${path} description ${desc.length}`])];
    });
    expect(bad).toEqual([]);
  });
});

describe('languages and indexing', () => {
  it('lists exactly the site languages in hreflang, as absolute addresses', () => {
    const home = readFileSync(join(out, 'index.html'), 'utf8');
    const langs = [...home.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="(https:\/\/[^"]+)">/g)].map((m) => m[1]);
    expect(langs).toEqual([...SITE_LOCALES.map((l) => bcp47Of(l)), 'x-default']);
  });
  it('keeps the animated versions out of search and out of the sitemaps', () => {
    const locs = sitemapLocs();
    for (const l of SITE_LOCALES) {
      const base = l === 'en' ? '' : `${l}/`;
      for (const p of ['ai', 'orbit']) {
        const html = readFileSync(join(out, base, p, 'index.html'), 'utf8');
        expect(html).toContain('<meta name="robots" content="noindex, follow');
        expect(html).not.toContain('<link rel="alternate" hreflang=');
        expect(locs.some((u) => u.endsWith(`/${base}${p}/`))).toBe(false);
      }
    }
  });
  it('puts every indexable page in a sitemap, and nothing else', () => {
    const locs = new Set(sitemapLocs());
    const canon = indexable().map((p) => /<link rel="canonical" href="([^"]+)">/.exec(p.html)![1]);
    expect(canon.filter((u) => !locs.has(u))).toEqual([]);
    expect(locs.size).toBe(canon.length);
  });
  it('never ties Persian to Iran (Curahold is never offered there): no fa_IR or fa-IR on any built page', () => {
    const tied = pages().filter((p) => /fa[_-]IR/i.test(p.html)).map((p) => p.path);
    expect(tied).toEqual([]);
  });

  it('shares a PNG picture, not an SVG', () => {
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toMatch(/<meta property="og:image" content="[^"]+\.png">/);
    expect(existsSync(join(out, 'assets', 'og.png'))).toBe(true);
  });
});

describe('structured data', () => {
  const at = (l: SiteLocale, path: string) => readFileSync(join(out, l === 'en' ? '' : l, path, 'index.html'), 'utf8');
  for (const l of SITE_LOCALES) {
    it(`${l}: /pricing/ offers every plan and interval at the billing price, per seat a month`, () => {
      const app = ldOf(at(l, 'pricing')).find((n) => n['@type'] === 'SoftwareApplication');
      const offers = app.offers.offers as { price: string; priceSpecification: { billingDuration: string } }[];
      expect(offers).toHaveLength(PLAN_KEYS.length * INTERVALS.length);
      const want = PLAN_KEYS.flatMap((k) => INTERVALS.map((i) => `${PLANS[k].price[i]}:${i === 'year' ? 'P1Y' : 'P1M'}`)).sort();
      expect(offers.map((o) => `${o.price}:${o.priceSpecification.billingDuration}`).sort()).toEqual(want);
    });
  }
  it('names the lowest seat price on the landing page, the one its summary says', () => {
    const app = ldOf(readFileSync(join(out, 'index.html'), 'utf8')).find((n) => n['@type'] === 'SoftwareApplication');
    const low = Math.min(...PLAN_KEYS.flatMap((k) => INTERVALS.map((i) => PLANS[k].price[i])));
    expect(app.offers.lowPrice).toBe(String(low));
  });
  it('marks up questions only where they are shown in full, once', () => {
    const withFaq = indexable().filter((p) => ldOf(p.html).some((n) => n['@type'] === 'FAQPage')).map((p) => p.path.replace(/^\/[a-z]{2}(-Han[st])?\//, '/'));
    expect(new Set(withFaq)).toEqual(new Set(['/faq/', '/pricing/']));
  });
});

describe('headings', () => {
  it('never skip a level on an indexable page, and the footer has none', () => {
    const bad = indexable().flatMap(({ path, html }) => {
      const main = html.slice(0, html.indexOf('<footer'));
      const levels = [...main.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
      const skips = levels.some((b, i) => i > 0 && b - levels[i - 1] > 1);
      const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'));
      return [...(skips ? [`${path} ${levels.join('')}`] : []), ...(/<h[1-6][\s>]/.test(footer) ? [`${path} footer`] : []), ...((html.match(/<h1[\s>]/g) ?? []).length === 1 ? [] : [`${path} h1`])];
    });
    expect(bad).toEqual([]);
  });
});
