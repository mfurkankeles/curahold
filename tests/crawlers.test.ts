// The crawler policy (shared/src/compliance/crawlers.ts) on every surface, and the
// legal notice (shared/src/compliance/notice.ts): search engines may read the
// marketing pages and the docs, AI crawlers nothing, the product nothing at all;
// the notices say only what is true (no patent claim, no ®).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { AI_CRAWLERS, CLOSED_ROBOTS, SCRAPERS, TDMREP_JSON, agentKind, robotsTxt } from '../shared/src/compliance/crawlers';
import { COPYRIGHT_FROM, copyrightYears, legalNotice } from '../shared/src/compliance/notice';
import { SECURITY_HEADERS } from '../api/src/lib/headers';
import { robotsFor } from '../api/src/lib/botGuard';
import { LOCALES, translate } from '../shared/src/i18n';
import { BASE, setup, type Env } from './helpers';

const ROOT = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** The agents a robots.txt group names, group by group, with what the group says. */
function groups(txt: string): { agents: string[]; rules: string[] }[] {
  return txt
    .split(/\n\s*\n/)
    .map((block) => block.split('\n').filter((l) => l && !l.startsWith('#')))
    .filter((l) => l.length)
    .map((lines) => ({ agents: lines.filter((l) => l.startsWith('User-agent:')).map((l) => l.slice(11).trim()), rules: lines.filter((l) => !l.startsWith('User-agent:')) }));
}

describe('robots.txt per surface', () => {
  it('the sales site: search engines in (the demo excepted), every AI crawler and site-analysis robot out, the sitemap named', () => {
    const txt = robotsTxt('site', { sitemap: 'https://curahold.com/sitemap.xml' });
    const g = groups(txt);
    const blocked = g.find((x) => x.rules.includes('Disallow: /') && !x.agents.includes('*')) ?? { agents: [] };
    for (const a of [...AI_CRAWLERS, ...SCRAPERS]) expect(blocked.agents).toContain(a);
    for (const a of ['Googlebot', 'Bingbot', 'YandexBot']) expect(g.flatMap((x) => x.agents)).not.toContain(a);
    expect(g.find((x) => x.agents.includes('*'))?.rules).toEqual(['Allow: /', 'Disallow: /demo/']);
    expect(txt).toContain('Sitemap: https://curahold.com/sitemap.xml');
  });

  it('the owner switch lets AI answer robots read the marketing pages, never the training crawlers', () => {
    const txt = robotsTxt('site', { allowAiAnswers: true });
    expect(txt).not.toContain('User-agent: OAI-SearchBot');
    expect(txt).toContain('User-agent: GPTBot');
    expect(txt).toContain('User-agent: ClaudeBot');
    expect(txt).toContain('User-agent: Google-Extended');
  });

  it('the app host: search engines read /docs/ only (central host); company hosts and self-hosted installs are closed', () => {
    const cfg = { centralHost: `app.${BASE}` };
    const central = robotsFor(cfg, `app.${BASE}`);
    expect(groups(central).find((x) => x.agents.includes('*'))?.rules).toEqual(['Allow: /docs/', 'Disallow: /']);
    expect(central).toContain('User-agent: GPTBot');
    expect(groups(robotsFor(cfg, `acme.${BASE}`))).toEqual([{ agents: ['*'], rules: ['Disallow: /'] }]);
    expect(groups(robotsFor({ ...cfg, singleTenantSlug: 'acme' }, `app.${BASE}`))).toEqual([{ agents: ['*'], rules: ['Disallow: /'] }]);
  });

  it('the static copies (app/demo build, portal) are the closed policy and the TDM reservation, word for word', () => {
    for (const dir of ['web/public', 'web/portal/public']) {
      expect(read(`${dir}/robots.txt`)).toBe(robotsTxt('closed'));
      expect(read(`${dir}/.well-known/tdmrep.json`)).toBe(TDMREP_JSON);
    }
    expect(JSON.parse(TDMREP_JSON)).toEqual([{ location: '/*', 'tdm-reservation': 1 }]);
  });
});

describe('noindex and the TDM reservation on the product', () => {
  let env: Env;
  beforeAll(async () => {
    env = await setup();
  });

  it('the API answers robots.txt per host and tdmrep.json, with no company looked up', async () => {
    const central = await env.app.request(`https://app.${BASE}/robots.txt`);
    expect(central.status).toBe(200);
    expect(await central.text()).toContain('Allow: /docs/');
    const company = await env.app.request(`https://acme.${BASE}/robots.txt`);
    expect(await company.text()).toBe(robotsTxt('closed'));
    const tdm = await env.app.request(`https://acme.${BASE}/.well-known/tdmrep.json`);
    expect(await tdm.json()).toEqual([{ location: '/*', 'tdm-reservation': 1 }]);
    expect(tdm.headers.get('tdm-reservation')).toBe('1');
  });

  it('every API answer says noindex, nofollow and reserves TDM rights', async () => {
    const r = await env.app.request(`https://acme.${BASE}/api/health`);
    expect(r.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(r.headers.get('tdm-reservation')).toBe('1');
    expect(SECURITY_HEADERS['X-Robots-Tag']).toBe('noindex, nofollow');
  });

  it('the static app and portal headers and pages say the same; the docs drop noindex but keep noai', () => {
    const app = read('web/public/_headers');
    expect(app.split(/\n\s*\n/)[0]).toContain('X-Robots-Tag: noindex, nofollow');
    expect(app.split(/\n\s*\n/)[0]).toContain('tdm-reservation: 1');
    expect(app).toMatch(/\/docs\/\*\n(?:.*\n)*?\s+! X-Robots-Tag\n\s+X-Robots-Tag: noai, noimageai/);
    expect(read('web/portal/public/_headers')).toContain('X-Robots-Tag: noindex, nofollow');
    for (const html of ['web/index.html', 'web/portal/index.html']) {
      expect(read(html)).toContain(`<meta name="robots" content="${CLOSED_ROBOTS}" />`);
      expect(read(html)).toContain('<meta name="tdm-reservation" content="1" />');
    }
    // robots.txt reaches the Worker before the static files.
    expect(read('wrangler.toml')).toMatch(/run_worker_first = \[[^\]]*"\/robots\.txt"/);
  });
});

describe('robot names', () => {
  it('sorts AI crawlers, analysis robots, scripted tools and browsers', () => {
    expect(agentKind('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)')).toBe('ai');
    expect(agentKind('Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)')).toBe('ai');
    expect(agentKind('Mozilla/5.0 (compatible; AhrefsBot/7.0)')).toBe('scraper');
    expect(agentKind('curl/8.5.0')).toBe('tool');
    expect(agentKind('python-requests/2.32')).toBe('tool');
    expect(agentKind('')).toBe('empty');
    expect(agentKind('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15')).toBeNull();
    expect(agentKind('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBeNull();
  });
});

describe('the legal notice', () => {
  it('runs from the first year to this one', () => {
    expect(COPYRIGHT_FROM).toBe(2026);
    expect(copyrightYears(new Date('2026-11-19T12:00:00Z'))).toBe('2026');
    expect(copyrightYears(new Date('2028-01-02T12:00:00Z'))).toBe('2026–2028');
  });

  it('is in all nine languages with the years filled in, the ™ sign, and nothing untrue', () => {
    for (const l of LOCALES) {
      const n = legalNotice((k, v) => translate(l, k, v), new Date('2027-03-01T00:00:00Z'));
      expect(n.rights).toContain('© 2026–2027 Curahold');
      expect(n.protected).toContain('Curahold™');
      // Curahold holds no patent and no registration: never "patent", never ®.
      for (const s of [n.rights, n.protected]) {
        expect(s).not.toMatch(/patent|patentli|brevet|特許|专利|專利|특허|פטנט|براءة|ثبت اختراع|®/i);
      }
    }
    expect(translate('tr', 'legal.notice.rights', { years: '2026' })).toBe('© 2026 Curahold. Tüm hakları saklıdır.');
  });

  it('sits in the footers of the site, the docs and the demo hub, and on the app and portal sign-in pages', () => {
    expect(read('scripts/build-site.ts')).toContain('legalNotice(');
    expect(read('scripts/build-docs.ts')).toContain('legalNotice(');
    expect(read('scripts/build-demo-hub.ts')).toContain('legalNotice(');
    for (const f of ['web/src/pages/Auth.tsx', 'web/src/pages/Signup.tsx', 'web/src/pages/TrialRequest.tsx', 'web/src/pages/Onboarding.tsx']) expect(read(f)).toContain('<LegalNotice t={t} />');
    expect(read('web/portal/Portal.tsx')).toContain("'legal.notice.protected'");
    // Nowhere a year written by hand.
    for (const f of ['scripts/build-site.ts', 'scripts/build-docs.ts']) expect(read(f)).not.toContain('© ${new Date().getFullYear()}');
  });
});
