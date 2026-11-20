// Builds the sales site (curahold.com) into dist/site: English at /, every
// other language under /<locale>/. Plain HTML and one small script — it can be served by any static
// host (Cloudflare Pages on the apex domain). Words are in site/content.ts;
// prices and what each plan includes come from shared/src/billing.ts and the
// app's own dictionaries.
//
//   npx tsx scripts/build-site.ts [outDir]
//
// Addresses can be changed for a preview with SITE_APP_URL, SITE_DEMO_URL,
// SITE_DOCS_URL and SITE_BASE_DOMAIN.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { INTERVALS, PLANS, PLAN_KEYS, PRICE_CURRENCY, type PlanKey } from '../shared/src/billing';
import { translate, dictionaries, LOCALE_INFO, bcp47Of, accountWords, type MessageKey, type Vars } from '../shared/src/i18n';
import { FAVICON, MARK } from '../site/brand';
import { SITE_LANGS } from '../site/locales';
import { BLOG_LOCALES, blogPosts, SITE_LOCALES, siteBlog, siteConsent, siteCopy, siteStory, type BlogBlock, type BlogPost, type SiteLocale } from '../site/content';
import { hubCopy } from '../site/hub-content';
import { infoCopy } from '../site/info';
import { CLOSED_X_ROBOTS, TDMREP_JSON, TDM_HEADER, TDM_META, robotsTxt } from '../shared/src/compliance/crawlers';
import { legalNotice } from '../shared/src/compliance/notice';
import { AB } from '../site/ab/config';
import { DEPTS, FEATURES, ICON_GO, ICON_PLAY, PAGE, headerHtml, whyBriefHtml, whyHtml, type Version } from './site-chrome';
import { conceptAPage, conceptCPage, conceptAWords } from './site-concepts';
import { classesIn, minifyCss, pruneCss } from './site-css';
import { hubPages } from './site-hub';
import { innerPages, type InnerPage, type PageUrls } from './site-pages';

const ROOT = join(import.meta.dirname, '..');
const OUT = process.argv[2] ?? join(ROOT, 'dist', 'site');
const APP = (process.env.SITE_APP_URL ?? 'https://app.curahold.com').replace(/\/$/, '');
const DEMO = process.env.SITE_DEMO_URL ?? '/demo/';
const DOCS = (process.env.SITE_DOCS_URL ?? `${APP}/docs`).replace(/\/$/, '');
const BASE_DOMAIN = process.env.SITE_BASE_DOMAIN ?? 'curahold.com';
// Where "Try it free" / "Go to the product" lead: the trial request form once it ships
// (SITE_TRIAL_URL=https://app.curahold.com/trial), the self-serve sign-up until then.
const TRIAL = process.env.SITE_TRIAL_URL ?? `${APP}/signup`;
// Which animated version the classic site's "AI version" switch opens: 'a' (one customer,
// start to finish) or 'c' (the orbit). The other one stays reachable at its own address.
const AI_VERSION: 'a' | 'c' = process.env.SITE_AI_VERSION === 'c' ? 'c' : 'a';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Which languages the help pages and demo hub are built in. The site falls
// back to English for any locale they do not cover yet.
const DOCS_LANGS = new Set<SiteLocale>(['en', 'tr']);
const DEMO_LANGS = new Set<SiteLocale>(['en', 'tr']);


const CHECK = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const OPEN = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
const CHAIN = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.6 9.4l2.8-2.8M6.9 5.1l.9-.9a2.1 2.1 0 0 1 3 3l-.9.9M9.1 10.9l-.9.9a2.1 2.1 0 0 1-3-3l.9-.9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
const CURSOR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 3.2l13.4 8.2-5.9 1.5-2.9 5.6z" fill="#fff" stroke="#17133a" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
const LOCK = `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.2" y="7" width="9.6" height="6.6" rx="1.8" fill="currentColor"/><path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
// The night sky behind every page: the grid is drawn by the stylesheet, these are the few glowing dots.
const SKY = `<div class="sky" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>`;
/** The integrations strip's control: pause, and the play mark it turns into. */
const PAUSE = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 2.5v7M8.5 2.5v7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const SPARK = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l1.5 4.4L14 7.5 9.5 9.1 8 13.5 6.5 9.1 2 7.5l4.5-1.6z" fill="currentColor"/></svg>`;

// The tools Curahold speaks to, for the strip under the hero. Brand names are
// the same in every language, so they are not translated. These are the
// integrations the product really has — nothing here is a customer.
const INTEGRATIONS = [
  'Slack', 'Microsoft Teams', 'Google Chat', 'Salesforce', 'HubSpot', 'Jira', 'Dynamics 365',
  'Pipedrive', 'Zoho', 'Bitrix24', 'Freshsales', 'Zendesk Sell', 'Google Sheets', 'Excel', 'Google BigQuery', 'Claude', 'ChatGPT',
];

// Everything the page shows inside a product render is invented demo data: the
// demo's own companies and people. Accounts come the way the app lists them,
// whoever needs attention first. `chip` names which hero signal a row carries.
const ACCOUNTS = [
  { name: 'Marevo', band: 'risk', score: 48, chip: 'review' },
  { name: 'Oreli Cosmetics', band: 'risk', score: 53, chip: 'renewal' },
  { name: 'Northwind Retail', band: 'watch', score: 66, chip: null },
  { name: 'Keystone Foods', band: 'watch', score: 71, chip: null },
  { name: 'Marisol Mobility', band: 'good', score: 92, chip: null },
] as const;

// Why Marevo scores 48: points earned out of the points each signal can give
// (the app shows exactly this under "Why?"). 5 + 3 + 0 + 15 + 15 + 10 = 48 of
// 100. The last one only fits the roomier desktop stage.
const WHY = [
  { got: 5, of: 25 },
  { got: 3, of: 20 },
  { got: 0, of: 15 },
  { got: 15, of: 15 },
  { got: 15, of: 15 },
  { got: 10, of: 10, wide: true },
] as const;

// The sprint in the film, index-aligned with tour.ui.tasks: which column, story
// points, epic and owner. 26 points; 8 are done until the `lands` card arrives
// in Done, 13 after. `wide` cards only fit the roomier desktop stage.
const SPRINT = [
  { col: 'doing', pts: 8, epic: 1, who: 'LB' },
  { col: 'review', pts: 5, epic: 2, who: 'ZT', wide: true },
  { col: 'done', pts: 5, epic: 0, who: 'ZT' },
  { col: 'done', pts: 5, epic: 0, who: 'AD', lands: true },
  { col: 'done', pts: 3, epic: 1, who: 'LB', wide: true },
] as const;

/** What each plan brings (the app's own words): Team's list, then what Business adds. */
const TEAM_POINTS: MessageKey[] = ['billing.point.boards', 'billing.point.customers', 'billing.point.meetings', 'billing.point.reports', 'billing.point.chat'];
const BUSINESS_POINTS: MessageKey[] = ['billing.point.crm', 'billing.point.portal', 'billing.point.playbooks'];

// ------------------------------------------------------------------ SEO + consent

// The site's own origin, for canonical URLs, Open Graph and the sitemap.
const ORIGIN = (process.env.SITE_ORIGIN ?? `https://${BASE_DOMAIN}`).replace(/\/$/, '');

// Analytics ids are read at build time and baked into each page's consent
// config. Absent → empty strings, and the banner and every loader simply do
// nothing (site/consent.js skips itself when no id is set).
const SITE_IDS = {
  ga4: process.env.SITE_GA4_ID ?? '', // GA4 Measurement ID, e.g. G-XXXXXXXXXX (analytics)
  meta: process.env.SITE_META_PIXEL_ID ?? '', // Meta (Facebook) Pixel ID (marketing)
  tiktok: process.env.SITE_TIKTOK_PIXEL_ID ?? '', // TikTok Pixel ID (marketing)
};

// The consent library's switches (shared/src/consent/core.ts). The advertising
// pixels stay off even with an id until CURAHOLD_MARKETING_PIXELS=1; each choice
// is logged (version, text hash, country) at the app's public consent endpoint.
const CONSENT_FLAGS = {
  marketingPixels: process.env.CURAHOLD_MARKETING_PIXELS === '1',
  logUrl: process.env.SITE_CONSENT_LOG_URL ?? `https://app.${BASE_DOMAIN}/api/consent-event`,
  surface: 'site',
};

// Prefer an owner-supplied raster (site/og.png) for share cards; fall back to
// the generated SVG. A 1200×630 PNG renders on more platforms than SVG does.
const OG_IMAGE = existsSync(join(ROOT, 'site', 'og.png')) ? 'og.png' : 'og.svg';
const OG_IMAGE_URL = `${ORIGIN}/assets/${OG_IMAGE}`;

/** The root-relative path a locale's landing page is served at ('/', '/tr/', …). */
const localeBase = (locale: SiteLocale) => (locale === 'en' ? '/' : `/${locale}/`);
/** The blog's root-relative base for a locale, falling back to the English blog. */
const blogBaseOf = (locale: SiteLocale) => (BLOG_LOCALES.includes(locale) ? `${localeBase(locale)}blog/` : '/blog/');
/** '../' repeated to climb from a page `depth` segments deep back to the site root. */
const upTo = (depth: number) => '../'.repeat(depth);
/** JSON safe to embed inside a <script> (no </script> break-out). */
const jsonForScript = (obj: unknown) => JSON.stringify(obj).replace(/</g, '\\u003c');

/** The consent config + loader for one page: words in its language, the site ids, the cookie-policy link. */
function consentTags(locale: SiteLocale, rel: string, policyUrl: string): string {
  const cfg = { strings: siteConsent(locale), ids: SITE_IDS, policyUrl, ab: AB.enabled, ...CONSENT_FLAGS };
  return `<script>window.__curaConsent=${jsonForScript(cfg)};</script>\n<script src="${rel}assets/consent.js" defer></script>`;
}

/** Canonical, Open Graph, Twitter card and robots tags shared by every page. */
function seoTags(opts: { canonical: string; title: string; description: string; locale: SiteLocale; ogType: 'website' | 'article'; image: string; noindex?: boolean }): string {
  const { canonical, title, description, locale, ogType, image } = opts;
  const alt = SITE_LOCALES.filter((l) => l !== locale)
    .map((l) => `<meta property="og:locale:alternate" content="${SITE_LANGS[l]}">`)
    .join('\n');
  return [
    `<link rel="canonical" href="${esc(canonical)}">`,
    // Search engines yes; AI training and text-and-data mining no (shared/src/compliance/crawlers.ts).
    `<meta name="robots" content="${opts.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'}, noai, noimageai">`,
    TDM_META,
    `<meta property="og:type" content="${ogType}">`,
    `<meta property="og:site_name" content="Curahold">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:locale" content="${SITE_LANGS[locale]}">`,
    alt,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
  ].join('\n');
}

const jsonLdTag = (obj: unknown) => `<script type="application/ld+json">${jsonForScript(obj)}</script>`;
const orgNode = { '@type': 'Organization', '@id': `${ORIGIN}/#org`, name: 'Curahold', url: `${ORIGIN}/`, logo: OG_IMAGE_URL };

/** schema.org for the landing page: the organisation, the site, and the product. */
function landingJsonLd(locale: SiteLocale, canonical: string, description: string): string {
  return jsonLdTag({
    '@context': 'https://schema.org',
    '@graph': [
      orgNode,
      { '@type': 'WebSite', '@id': `${ORIGIN}/#site`, url: `${ORIGIN}/`, name: 'Curahold', inLanguage: bcp47Of(locale), publisher: { '@id': `${ORIGIN}/#org` } },
      {
        '@type': 'SoftwareApplication',
        name: 'Curahold',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description,
        url: canonical,
        // The landing page names only the lowest price (its summary says "from …"); every offer is on /pricing/.
        offers: { '@type': 'AggregateOffer', priceCurrency: PRICE_CURRENCY, lowPrice: String(LOWEST_PRICE), highPrice: String(HIGHEST_PRICE), offerCount: PLAN_KEYS.length * INTERVALS.length, url: `${ORIGIN}${localeBase(locale)}${PAGE.pricing}` },
        publisher: { '@id': `${ORIGIN}/#org` },
      },
    ],
  });
}

const breadcrumb = (items: { name: string; url: string }[]) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
});

/**
 * When the site's sources last changed (YYYY-MM-DD), for <lastmod>: SITE_LASTMOD if set, else the
 * newest git commit touching site/ or the site scripts. undefined when neither can say: a wrong
 * date is worse for crawling than none.
 */
function siteLastmod(): string | undefined {
  if (process.env.SITE_LASTMOD) return process.env.SITE_LASTMOD;
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', 'site', 'scripts/build-site.ts', 'scripts/site-chrome.ts', 'scripts/site-pages.ts', 'scripts/site-concepts.ts'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : undefined;
  } catch {
    return undefined;
  }
}

// --------------------------------------------------------- shared page parts

/** Every address a page of one language links to. */
function urlsOf(locale: SiteLocale): PageUrls & { blog: string; releases: string; quickstart: string; selfHost: string; contact: string } {
  const docsLocale = DOCS_LANGS.has(locale) ? locale : 'en';
  return {
    trial: TRIAL,
    demo: DEMO_LANGS.has(locale) && locale !== 'en' ? `${DEMO}${locale}/` : DEMO,
    docs: `${DOCS}/${docsLocale}/`,
    devDocs: `${DOCS}/${docsLocale}/developers/`,
    releases: `${DOCS}/${docsLocale}/release-notes/`,
    blog: blogBaseOf(locale),
    legal: (slug: string) => `${DOCS}/${docsLocale}/legal-${slug}/`,
    quickstart: `${DOCS}/${docsLocale}/quickstart/`,
    selfHost: `${DOCS}/${docsLocale}/self-hosting/`,
    contact: `${DOCS}/${docsLocale}/getting-help/`,
  };
}

/** The newest entry of the help centre's release notes (month and title), for the Resources panel. */
function newestRelease(locale: SiteLocale): { when: string; title: string } | undefined {
  if (!DOCS_LANGS.has(locale)) return undefined;
  const file = join(ROOT, 'docs', 'site', locale, 'release-notes.md');
  if (!existsSync(file)) return undefined;
  const md = readFileSync(file, 'utf8');
  const when = /^## (.+)$/m.exec(md)?.[1];
  const title = /^### (.+)$/m.exec(md)?.[1];
  return when && title ? { when, title } : undefined;
}

/** The shared header for a page at `page` (its path under the language base). */
function chromeHeader(locale: SiteLocale, page: string, version: Version, langPath?: (l: SiteLocale) => string): string {
  const u = urlsOf(locale);
  return headerHtml({ locale, page, version, langPath, aiVersion: AI_VERSION, urls: { ...u, legal: `${localeBase(locale)}${PAGE.trust}#legal` }, news: newestRelease(locale), signIn: `${localeBase(locale)}#signin` });
}

/** The scripts every page ends with: the header's, the consent-bound measurement, the consent banner. */
function chromeTail(locale: SiteLocale, rel: string, version: Version | 'page'): string {
  const ab = { page: version === 'classic' ? 'main' : version, endpoint: AB.enabled ? AB.endpoint : '' };
  return `<script src="${rel}assets/chrome.js" defer></script>
<script>window.__curaAb=${jsonForScript(ab)};</script>
<script src="${rel}assets/measure.js" defer></script>
${consentTags(locale, rel, urlsOf(locale).legal('cookies'))}`;
}

const CLOSE_X = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

/**
 * Sign in: every company has its own address. The same dialog on every page that has a header.
 * A <dialog> closes on Esc by itself; the close button sits in the end corner at 44 × 44 (owner rule for every popup).
 */
function signinDialog(locale: SiteLocale): string {
  const c = siteCopy(locale);
  return `<dialog class="signin" id="signin" data-base="${esc(BASE_DOMAIN)}" aria-labelledby="signin-title">
  <form>
    <button class="signin__x" type="button" data-close aria-label="${esc(c.signIn.close)}" title="${esc(c.signIn.close)}">${CLOSE_X}</button>
    <h2 id="signin-title">${esc(c.signIn.title)}</h2>
    <p>${esc(c.signIn.text)}</p>
    <label class="signin__field"><input name="slug" autocomplete="organization" spellcheck="false" aria-label="${esc(c.signIn.label)}" placeholder="${esc(c.signIn.placeholder)}" required><span>.${esc(BASE_DOMAIN)}</span></label>
    <div class="signin__row">
      <button class="hx__btn hx__btn--solid" type="submit">${ICON_GO}<span>${esc(c.signIn.go)}</span></button>
    </div>
    <p class="signin__none"><a href="${esc(TRIAL)}">${esc(c.signIn.none)}</a></p>
  </form>
</dialog>`;
}

/** US dollars as the site writes them in a language: "$15" everywhere, so the sign stays whole inside right-to-left text. */
function moneyIn(locale: SiteLocale): (n: number) => string {
  const nf = new Intl.NumberFormat(bcp47Of(locale), { style: 'currency', currency: PRICE_CURRENCY, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 });
  return (n) => nf.formatToParts(n).map((p) => (p.type === 'currency' && PRICE_CURRENCY === 'USD' ? '$' : p.value)).join('');
}

/** The cheapest seat price a month (a yearly Team seat), for "from …" lines and AggregateOffer. */
const LOWEST_PRICE = Math.min(...PLAN_KEYS.flatMap((k) => INTERVALS.map((i) => PLANS[k].price[i])));
const HIGHEST_PRICE = Math.max(...PLAN_KEYS.flatMap((k) => INTERVALS.map((i) => PLANS[k].price[i])));

/**
 * The plans on /pricing/, yearly first with a monthly switch. Never hidden for a scroll
 * animation: prices are what this page is for. Plan names are h2 (the page's h1 is "Pricing").
 */
function plansHtml(locale: SiteLocale): string {
  const c = siteCopy(locale);
  const t = (k: MessageKey) => translate(locale, k);
  const money = moneyIn(locale);
  const plan = (key: PlanKey) => {
    const p = PLANS[key];
    const points = (key === 'team' ? TEAM_POINTS : BUSINESS_POINTS).map((k) => `<li>${CHECK}<span>${esc(t(k))}</span></li>`).join('');
    return `<div class="plan${key === 'business' ? ' plan--business' : ''}">
          <h2 class="plan__name">${esc(t(`billing.plan.${key}` as MessageKey))}</h2>
          <p class="plan__price"><span class="plan__amount" data-month="${esc(money(p.price.month))}" data-year="${esc(money(p.price.year))}">${esc(money(p.price.year))}</span><span class="plan__per" data-month="${esc(c.pricing.perSeat)}" data-year="${esc(c.pricing.perSeatYearly)}">${esc(c.pricing.perSeatYearly)}</span></p>
          <ul>${key === 'business' ? `<li class="plan__plus">${esc(c.pricing.business)}</li>` : ''}${points}</ul>
          <a class="btn ${key === 'business' ? 'btn--primary' : 'btn--ghost'}" href="${esc(TRIAL)}" data-ab="go">${ICON_GO}<span>${esc(infoCopy(locale).nav.tryFree)}</span></a>
        </div>`;
  };
  return `<section class="pricing pricing--page" id="pricing">
    <div class="wrap">
      <div class="pricing__top">
        <div class="pricing__switch" role="group" aria-label="${esc(c.nav.pricing)}">
          <button type="button" data-interval="month" aria-pressed="false">${esc(c.pricing.monthly)}</button>
          <button type="button" data-interval="year" aria-pressed="true">${esc(c.pricing.yearly)}<small>${esc(c.pricing.save)}</small></button>
        </div>
      </div>
      <div class="plans">${plan('team')}${plan('business')}</div>
      <p class="pricing__fine">${esc(c.pricing.fine)}</p>
    </div>
  </section>`;
}

/** The comparison table under the plans: what each plan includes, from the same lists the plans and the app use. */
function compareHtml(locale: SiteLocale): string {
  const pp = infoCopy(locale).pricingPage;
  const t = (k: MessageKey) => translate(locale, k);
  const money = moneyIn(locale);
  const yes = `<td>${CHECK}<span class="vh">${esc(pp.included)}</span></td>`;
  const no = `<td><span class="cmp__no" aria-hidden="true">—</span><span class="vh">${esc(pp.notIncluded)}</span></td>`;
  const row = (label: string, cells: string) => `<tr><th scope="row">${esc(label)}</th>${cells}</tr>`;
  // Each amount isolated (<bdi>) so the yearly price comes first in reading order in either direction.
  const price = (k: PlanKey) => `<td class="cmp__price"><bdi>${esc(money(PLANS[k].price.year))}</bdi> / <bdi>${esc(money(PLANS[k].price.month))}</bdi></td>`;
  const rows = [
    row(pp.priceRow, price('team') + price('business')),
    ...TEAM_POINTS.map((k) => row(t(k), yes + yes)),
    ...BUSINESS_POINTS.map((k) => row(t(k), no + yes)),
    row(pp.viewers, `<td>${esc(pp.free)}</td><td>${esc(pp.free)}</td>`),
  ].join('');
  return `<section class="ip__body cmp" aria-labelledby="cmp-title"><div class="wrap">
    <h2 class="ip__gh" id="cmp-title">${esc(pp.compareTitle)}</h2>
    <div class="cmp__scroll"><table class="cmp__t"><colgroup><col><col class="cmp__plan"><col class="cmp__plan"></colgroup>
      <thead><tr><th scope="col">${esc(pp.feature)}</th><th scope="col">${esc(t('billing.plan.team'))}</th><th scope="col">${esc(t('billing.plan.business'))}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="cmp__ent">${esc(pp.enterprise[0])} <a href="${esc(urlsOf(locale).contact)}">${esc(pp.enterprise[1])}</a></p>
  </div></section>`;
}

/** A list of questions as the FAQ blocks draw them (<details>, open by tap, readable without script). */
const faqList = (items: { q: string; a: string }[]) => items.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('');

/** The pricing page's own questions. */
function pricingFaqHtml(locale: SiteLocale): string {
  const pp = infoCopy(locale).pricingPage;
  return `<section class="faq calm" aria-labelledby="pfaq-title"><div class="wrap faq__in"><h2 id="pfaq-title">${esc(pp.faqTitle)}</h2><div class="faq__list">${faqList(pp.faq)}</div></div></section>`;
}

/** The landing page's pricing: two lines and a link to /pricing/ (the full table lives there). */
function pricingSummaryHtml(locale: SiteLocale): string {
  const c = siteCopy(locale);
  return `<section class="psum" aria-labelledby="psum-title">
    <div class="wrap psum__in">
      <div><h2 id="psum-title">${esc(c.pricing.title)}</h2><p class="psum__line">${esc(c.pricing.summary.replace('{from}', moneyIn(locale)(LOWEST_PRICE)))}</p></div>
      <a class="btn btn--ghost btn--big" href="${localeBase(locale)}${PAGE.pricing}">${ICON_GO}<span>${esc(c.pricing.see)}</span></a>
    </div>
  </section>`;
}

/**
 * schema.org offers for /pricing/: one Offer per plan and billing interval, priced per seat
 * a month exactly as the page shows them (money: shared/src/billing.ts is the only source).
 */
function offersLd(locale: SiteLocale, url: string): object {
  const c = siteCopy(locale);
  const offers = PLAN_KEYS.flatMap((k) =>
    INTERVALS.map((i) => {
      const price = String(PLANS[k].price[i]);
      const per = i === 'year' ? c.pricing.perSeatYearly : c.pricing.perSeat;
      return {
        '@type': 'Offer',
        name: `${translate(locale, `billing.plan.${k}` as MessageKey)} · ${i === 'year' ? c.pricing.yearly : c.pricing.monthly}`,
        url,
        price,
        priceCurrency: PRICE_CURRENCY,
        priceSpecification: { '@type': 'UnitPriceSpecification', price, priceCurrency: PRICE_CURRENCY, unitCode: 'MON', unitText: per, billingDuration: i === 'year' ? 'P1Y' : 'P1M', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitText: 'seat' } },
      };
    }),
  );
  return { '@type': 'SoftwareApplication', '@id': `${url}#app`, name: 'Curahold', applicationCategory: 'BusinessApplication', operatingSystem: 'Web', url, offers: { '@type': 'AggregateOffer', priceCurrency: PRICE_CURRENCY, lowPrice: String(LOWEST_PRICE), highPrice: String(HIGHEST_PRICE), offerCount: offers.length, offers }, publisher: { '@id': `${ORIGIN}/#org` } };
}

/** schema.org FAQPage for questions shown in full on one page (only one page carries each set). */
const faqLd = (items: { q: string; a: string }[]) => ({ '@type': 'FAQPage', mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });

/** hreflang alternates for a path that exists in every language. */
const alternatesFor = (path: string) =>
  [...SITE_LOCALES.map((l) => `<link rel="alternate" hreflang="${bcp47Of(l)}" href="${ORIGIN}${localeBase(l)}${path}">`), `<link rel="alternate" hreflang="x-default" href="${ORIGIN}/${path}">`].join('\n');

/** An inner page, complete: head, header, its main, footer, sign-in, scripts. */
function innerDoc(locale: SiteLocale, p: InnerPage): string {
  const info = LOCALE_INFO[locale];
  const depth = p.path.split('/').filter(Boolean).length + (locale === 'en' ? 0 : 1);
  const rel = upTo(depth);
  const canonical = `${ORIGIN}${localeBase(locale)}${p.path}`;
  const c = infoCopy(locale);
  const ld = jsonLdTag({ '@context': 'https://schema.org', '@graph': [orgNode, { '@type': 'WebPage', name: p.title, url: canonical, inLanguage: bcp47Of(locale) }, breadcrumb([{ name: c.common.home, url: `${ORIGIN}${localeBase(locale)}` }, { name: p.crumb, url: canonical }]), ...(p.ld?.(canonical) ?? [])] });
  return `<!doctype html>
<html lang="${bcp47Of(locale)}" dir="${info.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
${seoTags({ canonical, title: p.title, description: p.description, locale, ogType: 'website', image: OG_IMAGE_URL })}
<meta name="theme-color" content="#17133a">
<link rel="icon" href="${FAVICON}">
${alternatesFor(p.path)}
${ld}
${fontPreload(locale, rel)}
<script>document.documentElement.classList.add('js')</script>
${cssSlot('page', rel)}
</head>
<body class="inner">
${SKY}
<a class="skip" href="#main">${esc(siteCopy(locale).nav.skip)}</a>
${chromeHeader(locale, p.path, 'classic')}
<main id="main">
  ${p.main}
</main>
${footerHtml(locale)}
${signinDialog(locale)}
${p.path === PAGE.pricing ? `<script src="${rel}assets/site.js" defer></script>` : ''}
${chromeTail(locale, rel, 'page')}
</body>
</html>
`;
}

/** One of the animated versions, complete, at /<lang>/ai/ (A) or /<lang>/orbit/ (C). */
function conceptDoc(locale: SiteLocale, which: 'a' | 'c'): string {
  const path = which === 'a' ? PAGE.ai : PAGE.orbit;
  const rel = upTo(locale === 'en' ? 1 : 2);
  const canonical = `${ORIGIN}${localeBase(locale)}${path}`;
  const words = conceptAWords(locale);
  const title = which === 'a' ? words.title : words.title;
  // The animated versions tell the landing page's story again, so they stay out of search
  // results (noindex, links still followed) and out of the sitemap. A canonical pointing to the
  // landing page would be a hint search engines ignore when two pages differ this much;
  // noindex is a rule they keep (docs/ADR/0020-site-seo-and-crawlers.md).
  const head = `${seoTags({ canonical, title, description: words.desc, locale, ogType: 'website', image: OG_IMAGE_URL, noindex: true })}
<link rel="icon" href="${FAVICON}">
<link rel="stylesheet" href="${rel}assets/chrome.css">
<link rel="stylesheet" href="${rel}assets/consent.css">`;
  const u = urlsOf(locale);
  const n = infoCopy(locale).nav;
  const parts = {
    locale,
    rel,
    head,
    header: chromeHeader(locale, path, which),
    why: whyHtml(locale, { headingLevel: 2, urls: u, compact: true }),
    footer: footerHtml(locale),
    tail: `${signinDialog(locale)}\n${chromeTail(locale, rel, which)}`,
    trial: TRIAL,
    demo: u.demo,
    tryFree: n.tryFree,
    demoLabel: n.demo,
  };
  return which === 'a' ? conceptAPage(parts) : conceptCPage(parts);
}

// ------------------------------------------------------------------- the footer

// Shared by the landing page and the blog so the legal links and language list
// never drift apart. Column titles are not headings: the footer is not part of a page's outline. Cross-page links are root-relative, so they are correct
// whatever depth the page sits at.
function footerHtml(locale: SiteLocale): string {
  const c = siteCopy(locale);
  // © with the right years, Curahold™ and the copyright/trade-secret line (shared/src/compliance/notice.ts).
  const notice = legalNotice((k, v) => translate(locale, k, v));
  const n = infoCopy(locale);
  const base = localeBase(locale);
  const u = urlsOf(locale);
  const footLang = SITE_LOCALES.filter((l) => l !== locale)
    .map((l) => `<a href="${localeBase(l)}" hreflang="${bcp47Of(l)}" lang="${bcp47Of(l)}">${esc(LOCALE_INFO[l].name)}</a>`)
    .join(' · ');
  const li = (href: string, label: string) => `<li><a href="${esc(href)}">${esc(label)}</a></li>`;
  return `<footer class="foot">
  <div class="foot__wrap">
    <div class="foot__in">
      <div>
        <a class="foot__brand" href="${base}">${MARK}Curahold</a>
        <p class="foot__story">${esc(c.footer.story)}</p>
      </div>
      <div>
        <p class="foot__h">${esc(n.nav.product)}</p>
        <ul>
          ${DEPTS.map((k) => li(`${base}${PAGE.dept(k)}`, n.depts[k].name)).join('')}
          ${li(`${base}${PAGE.integrations}`, n.nav.integrations)}
          ${li(`${base}${PAGE.pricing}`, n.nav.pricing)}
        </ul>
      </div>
      <div>
        <p class="foot__h">${esc(n.nav.features)}</p>
        <ul>${FEATURES.slice(0, 6).map((k) => li(`${base}${PAGE.feature(k)}`, n.features[k].name)).join('')}</ul>
      </div>
      <div>
        <p class="foot__h">${esc(n.nav.resources)}</p>
        <ul>
          ${li(u.demo, n.nav.demo)}
          ${li(u.docs, n.nav.help[0])}
          ${li(u.devDocs, n.nav.developers[0])}
          ${li(u.blog, n.nav.blog[0])}
          ${li(`${base}resources/`, hubCopy(locale).nav[0])}
          ${li(`${base}${PAGE.faq}`, n.nav.faq[0])}
          ${li(`${base}${PAGE.why}`, n.nav.why)}
          ${li(`${base}${PAGE.about}`, n.nav.about)}
        </ul>
      </div>
      <div>
        <p class="foot__h">${esc(c.footer.legal)}</p>
        <ul>
          ${li(`${base}${PAGE.trust}`, n.nav.trust[0])}
          ${li(u.legal('terms'), c.footer.links.terms)}
          ${li(u.legal('privacy'), c.footer.links.privacy)}
          ${li(u.legal('kvkk'), c.footer.links.kvkk)}
          ${li(u.legal('dpa'), c.footer.links.dpa)}
          ${li(u.legal('subprocessors'), c.footer.links.subprocessors)}
          ${li(u.legal('cookies'), c.footer.links.cookies)}
        </ul>
      </div>
    </div>
    <div class="foot__base">
      <span>${esc(notice.rights)}</span>
      <span class="foot__langs">${footLang}</span>
      <small class="foot__notice">${esc(notice.protected)}</small>
    </div>
  </div>
</footer>`;
}

// --------------------------------------------------------------------- the blog

const blogBlockHtml = (b: BlogBlock): string => {
  if ('h' in b) return `<h2>${esc(b.h)}</h2>`;
  if ('p' in b) return `<p>${esc(b.p)}</p>`;
  if ('ul' in b) return `<ul>${b.ul.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
  return `<blockquote>${esc(b.quote)}</blockquote>`;
};

const fmtDate = (locale: SiteLocale, iso: string) =>
  new Intl.DateTimeFormat(bcp47Of(locale), { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${iso}T12:00:00Z`));

/** The shared header on blog pages: language links go to that language's blog, or its landing page where it has none. */
function blogHeader(locale: SiteLocale, page = 'blog/'): string {
  return chromeHeader(locale, page, 'classic', (l) => (BLOG_LOCALES.includes(l) ? page : ''));
}

/** The <head> shared by blog pages: title, description, SEO, hreflang over the blog locales, fonts and styles. */
function blogHead(locale: SiteLocale, opts: { title: string; description: string; canonical: string; path: string; ogType: 'website' | 'article'; rel: string; extraLd?: string }): string {
  const info = LOCALE_INFO[locale];
  const alternates = [
    ...BLOG_LOCALES.map((l) => `<link rel="alternate" hreflang="${bcp47Of(l)}" href="${ORIGIN}${localeBase(l)}${opts.path}">`),
    `<link rel="alternate" hreflang="x-default" href="${ORIGIN}/${opts.path}">`,
  ].join('\n');
  return `<!doctype html>
<html lang="${bcp47Of(locale)}" dir="${info.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
${seoTags({ canonical: opts.canonical, title: opts.title, description: opts.description, locale, ogType: opts.ogType, image: OG_IMAGE_URL })}
<meta name="theme-color" content="#17133a">
<link rel="icon" href="${FAVICON}">
${alternates}
${opts.extraLd ?? ''}
${fontPreload(locale, opts.rel)}
${cssSlot('blog', opts.rel)}
</head>`;
}

function blogIndexPage(locale: SiteLocale): string {
  const b = siteBlog(locale);
  const posts = blogPosts(locale);
  const rel = upTo(locale === 'en' ? 1 : 2);
  const canonical = `${ORIGIN}${blogBaseOf(locale)}`;
  const cards = posts
    .map(
      (p) => `<article class="post-card">
        <a class="post-card__link" href="${blogBaseOf(locale)}${p.slug}/">
          <span class="post-card__tag">${esc(p.tags[0] ?? '')}</span>
          <h2 class="post-card__title">${esc(p.title)}</h2>
          <p class="post-card__desc">${esc(p.description)}</p>
          <span class="post-card__meta"><time datetime="${p.date}">${esc(fmtDate(locale, p.date))}</time> · ${p.readMinutes} ${esc(b.minRead)}</span>
        </a>
      </article>`,
    )
    .join('\n');
  const ld = jsonLdTag({
    '@context': 'https://schema.org',
    '@graph': [
      orgNode,
      {
        '@type': 'Blog',
        '@id': `${canonical}#blog`,
        url: canonical,
        name: b.title,
        description: b.metaDescription,
        inLanguage: bcp47Of(locale),
        publisher: { '@id': `${ORIGIN}/#org` },
        blogPost: posts.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: `${canonical}${p.slug}/`, datePublished: p.date })),
      },
      breadcrumb([
        { name: 'Curahold', url: `${ORIGIN}${localeBase(locale)}` },
        { name: b.nav, url: canonical },
      ]),
    ],
  });
  return `${blogHead(locale, { title: b.metaTitle, description: b.metaDescription, canonical, path: 'blog/', ogType: 'website', rel, extraLd: ld })}
<body class="blog">
${SKY}
<a class="skip" href="#main">${esc(siteCopy(locale).nav.skip)}</a>
${blogHeader(locale)}
<main id="main" class="wrap blog-wrap">
  <header class="blog-hero">
    <h1>${esc(b.title)}</h1>
    <p class="lead">${esc(b.lead)}</p>
  </header>
  <div class="post-grid">
${cards}
  </div>
</main>
${footerHtml(locale)}
${signinDialog(locale)}
${chromeTail(locale, rel, 'page')}
</body>
</html>
`;
}

function blogPostPage(locale: SiteLocale, post: BlogPost): string {
  const b = siteBlog(locale);
  const rel = upTo(locale === 'en' ? 2 : 3);
  const canonical = `${ORIGIN}${blogBaseOf(locale)}${post.slug}/`;
  const bodyHtml = post.body.map(blogBlockHtml).join('\n');
  const ld = jsonLdTag({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        dateModified: post.date,
        inLanguage: bcp47Of(locale),
        keywords: post.tags.join(', '),
        mainEntityOfPage: canonical,
        url: canonical,
        author: { '@id': `${ORIGIN}/#org` },
        publisher: { '@id': `${ORIGIN}/#org` },
        image: OG_IMAGE_URL,
      },
      orgNode,
      breadcrumb([
        { name: 'Curahold', url: `${ORIGIN}${localeBase(locale)}` },
        { name: b.nav, url: `${ORIGIN}${blogBaseOf(locale)}` },
        { name: post.title, url: canonical },
      ]),
    ],
  });
  const tags = post.tags.map((t) => `<li class="post-tag">${esc(t)}</li>`).join('');
  return `${blogHead(locale, { title: post.seo[0], description: post.seo[1], canonical, path: `blog/${post.slug}/`, ogType: 'article', rel, extraLd: ld })}
<body class="blog">
${SKY}
<a class="skip" href="#main">${esc(siteCopy(locale).nav.skip)}</a>
${blogHeader(locale)}
<main id="main" class="wrap post-wrap">
  <article class="post">
    <nav class="post__back"><a href="${blogBaseOf(locale)}">← ${esc(b.backToBlog)}</a></nav>
    <header class="post__head">
      <h1>${esc(post.title)}</h1>
      <p class="post__meta"><span>${esc(b.updated)} <time datetime="${post.date}">${esc(fmtDate(locale, post.date))}</time></span> · <span>${post.readMinutes} ${esc(b.minRead)}</span></p>
    </header>
    <div class="post__body">
${bodyHtml}
    </div>
    <footer class="post__foot">
      <span class="post__tags-label">${esc(b.tags)}</span>
      <ul class="post__tags">${tags}</ul>
    </footer>
  </article>
</main>
${footerHtml(locale)}
${signinDialog(locale)}
${chromeTail(locale, rel, 'page')}
</body>
</html>
`;
}

export function page(locale: SiteLocale): string {
  const c = siteCopy(locale);
  const { tour, bento, cta } = c;
  const ui = tour.ui;
  const info = LOCALE_INFO[locale];
  const rel = locale === 'en' ? '' : '../';
  const signup = TRIAL;
  const canonical = `${ORIGIN}${localeBase(locale)}`;
  // The demo hub has a page per language; fall back to English where it has none.
  const demo = DEMO_LANGS.has(locale) && locale !== 'en' ? `${DEMO}${locale}/` : DEMO;
  const tag = bcp47Of(locale);
  // Persian copy writes Gregorian months, so its dates do too.
  const dateTag = locale === 'fa' ? 'fa-u-ca-gregory' : tag;
  // "$15" in every language: the fine print says the prices are US dollars, and a bare sign
  // (Arabic would otherwise write "US$") stays whole inside right-to-left text.
  const usd = (opts: Intl.NumberFormatOptions) => (n: number) =>
    new Intl.NumberFormat(tag, { style: 'currency', currency: PRICE_CURRENCY, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0, ...opts })
      .formatToParts(n)
      .map((p) => (p.type === 'currency' && PRICE_CURRENCY === 'USD' ? '$' : p.value))
      .join('');
  const moneyShort = usd({ notation: 'compact' });
  const num = (n: number) => new Intl.NumberFormat(tag, { useGrouping: false }).format(n);
  const at = (m: number, d: number, y = 2026) => new Date(Date.UTC(y, m - 1, d, 12));
  const dayFmt = new Intl.DateTimeFormat(dateTag, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const day = (m: number, d: number, y = 2026) => dayFmt.format(at(m, d, y));
  const clock = (h: number, m: number) => new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 12, h, m)));
  // Words that live in the app come from the app, in the page's own language.
  // A phrase the dictionary would answer in English is a bug here, not a fallback.
  const t = (k: MessageKey, vars: Vars = {}) => {
    if (dictionaries[locale][k] === undefined) throw new Error(`site: "${k}" has no ${locale} wording in the app's dictionary — carry it in site/content.ts`);
    return translate(locale, k, vars);
  };
  // Search engines want these as full addresses.
  const alternates = [...SITE_LOCALES.map((l) => `<link rel="alternate" hreflang="${bcp47Of(l)}" href="${ORIGIN}${localeBase(l)}">`), `<link rel="alternate" hreflang="x-default" href="${ORIGIN}/">`].join('\n');
  const accts = accountWords(locale).other;
  const band = (b: 'good' | 'watch' | 'risk') => t(`health.band.${b}` as MessageKey);
  const av = (init: string) => `<span class="av">${esc(init)}</span>`;
  // One animated part of a film scene: what it does and when (ms after the scene opens).
  const a = (kind: string, delay: number) => ` data-a="${kind}" style="--d:${delay}ms"`;

  // ------------------------------------------------------------ the hero film
  // Four scenes of one loop, drawn as the app's own dark theme. Each scene is
  // complete as it stands; the animations only decide how it arrives.

  // 1 — Health: the accounts, whoever needs attention first; Marevo opens with its reasons.
  const listRows = ACCOUNTS.map(
    (r, i) => `<div class="hl__row${i === 0 ? ' is-pick' : ''}"${a('up', 150 + i * 90)}>
                <span class="sco" data-band="${r.band}">${num(r.score)}</span>
                <span class="hl__name">${esc(r.name)}</span>
                ${r.chip ? `<span class="tag" data-band="${r.band}">${esc(ui.chips[r.chip])}</span>` : `<span class="hl__band" data-band="${r.band}">${esc(band(r.band))}</span>`}
              </div>`,
  ).join('');
  const whyText = [
    t('health.why.touch', { days: num(38), kind: t('health.touchKind.review') }),
    t('health.why.tasks', { n: num(3) }),
    t('health.why.championNone'),
    t('health.why.decision', { names: 'Selin Aytaç' }),
    t('health.why.blockersNone'),
    t('health.why.supportNone'),
  ];
  const whyRows = WHY.map((w, i) => {
    const share = w.got / w.of;
    return `<li${'wide' in w ? ' class="why--wide"' : ''} data-band="${share >= 0.7 ? 'good' : share >= 0.35 ? 'watch' : 'risk'}"${a('up', 2550 + i * 220)}>
                    <span class="why__t">${esc(whyText[i])}</span>
                    <span class="why__p">${num(w.got)}/${num(w.of)}</span>
                    <span class="why__bar"><i style="--w:${share.toFixed(2)}"></i></span>
                  </li>`;
  }).join('');
  const sceneHealth = `<div class="sc sc--health is-on" data-sc="0">
            <div class="hl">
              <div class="hl__head"><b>${esc(accts)}</b><span class="cnt">${num(17)}</span></div>
              ${listRows}
            </div>
            <div class="hd"${a('slide', 1950)}>
              <div class="hd__top"><b>${esc(ACCOUNTS[0].name)}</b><span class="tag" data-band="risk">${esc(ui.chips.review)}</span>${av('ZT')}</div>
              <div class="hd__body">
                <div class="hd__score">
                  <div class="ring" data-band="risk">
                    <svg viewBox="0 0 120 120"><circle class="ring__bg" cx="60" cy="60" r="50"/><circle class="ring__val" cx="60" cy="60" r="50" pathLength="100"${a('ring', 2250)}/></svg>
                    <span class="ring__n">${num(48)}</span>
                  </div>
                  <span class="hd__band" data-band="risk">${esc(band('risk'))}</span>
                  <span class="hd__trend">${esc(t('health.trend', { change: `−${num(12)}`, days: num(30) }))}</span>
                </div>
                <div class="why"><span class="why__h">${esc(t('health.why'))}</span><ul>${whyRows}</ul></div>
              </div>
            </div>
            <span class="cur cur--health">${CURSOR}</span>
          </div>`;

  // 2 — Promises: a logged meeting whose next steps become tasks with an owner and a date.
  const m = ui.meeting;
  // The date tile: the day's number, and the month as that language abbreviates it alone ("Nov", "11月").
  const mDay = dayFmt.formatToParts(at(11, 10)).find((x) => x.type === 'day')?.value ?? '';
  const mMonth = new Intl.DateTimeFormat(dateTag, { month: 'short', timeZone: 'UTC' }).format(at(11, 10));
  // The column is never empty: one task was already waiting there, and the meeting's two land under it.
  const task = (title: string, who: string, name: string, due: string, delay?: number) =>
    `<article class="tk"${delay === undefined ? '' : a('drop', delay)}><p>${esc(title)}</p><div class="tk__f">${av(who)}<span>${esc(name)}</span><span class="due">${esc(due)}</span></div></article>`;
  const scenePromise = `<div class="sc sc--promise" data-sc="1">
            <div class="mt">
              <div class="mt__head">
                <div class="mt__date"><b>${esc(mDay)}</b><span>${esc(mMonth)}</span></div>
                <div class="mt__main"><b>${esc(m.name)}</b><span>${esc(m.ours)}</span><span>${esc(m.theirs)}</span></div>
              </div>
              <div class="mt__steps">
                <span class="mt__h">${esc(t('meetings.nextSteps'))}</span>
                <span class="mt__step">${OPEN}<span>${esc(m.steps[0])}</span></span>
                <span class="mt__step"${a('type', 300)}>${OPEN}<span>${esc(m.steps[1])}</span></span>
                <span class="mt__save"${a('press', 1500)}>${esc(t('common.save'))}</span>
              </div>
            </div>
            <div class="mk">
              <div class="mk__h"><b>${esc(t('board.defaultColumns.todo'))}</b><span class="mk__toast"${a('pop', 2650)}>${CHECK}${esc(ui.tasksOpened)}</span></div>
              ${task(ui.todo, 'AD', 'Ada', day(11, 12))}
              ${task(m.steps[0], 'ZT', 'Zeynep', day(11, 14), 1900)}
              ${task(m.steps[1], 'LB', 'Lena', day(11, 22), 2150)}
            </div>
            <span class="cur cur--promise">${CURSOR}</span>
          </div>`;

  // 3 — Renewals: the setting is on, the day arrives, the work opens itself. Nobody clicks.
  // The playbook is there from the start, as the app lists it: steps counted back from the renewal.
  // When the day arrives each step becomes a task: its offset turns into a date and it gets its owner.
  const playTask = (title: string, before: number, due: string, delay: number) =>
    `<li style="--d:${delay}ms">${OPEN}<span class="rn__t">${esc(title)}</span><span class="rn__av">${av('ZT')}</span><span class="rn__when"><span class="rn__off">${esc(t('plans.stepBefore', { n: num(before) }))}</span><span class="due">${esc(due)}</span></span></li>`;
  const sceneRenew = `<div class="sc sc--renew" data-sc="2">
            <div class="rn__set">
              <span class="tog"><i></i></span><b>${esc(t('rhythm.renewalsOn'))}</b>
              <span class="tag">${esc(t('rhythm.daysAhead', { n: num(90) }))}</span>
            </div>
            <div class="rn__line">
              <div class="rn__who"><b>${esc(ACCOUNTS[1].name)}</b>${av('ZT')}</div>
              <div class="rn__track">
                <span class="rn__fill"${a('fill', 350)}></span>
                <span class="rn__mark"${a('hit', 1500)}></span>
                <span class="rn__end"></span>
              </div>
              <div class="rn__dates"><span>${esc(day(11, 16))}</span><span>${esc(day(2, 14, 2027))} · ${esc(t('targets.kind.renewal'))}</span></div>
            </div>
            <div class="rn__out">
              <div class="rn__h"><b>${esc(ui.playbook)}</b><span class="cnt">${num(3)}</span></div>
              <ul class="rn__tasks">
                ${playTask(ui.playbookSteps[0], 85, day(11, 21), 1700)}
                ${playTask(ui.playbookSteps[1], 75, day(12, 1), 1950)}
                ${playTask(ui.playbookSteps[2], 60, day(12, 16), 2200)}
              </ul>
              <div class="rn__deal"${a('pop', 2900)}><span class="rn__dk">${esc(t('records.kind.opportunity'))}</span><b>${esc(ACCOUNTS[1].name)}</b><span class="tag" data-band="good">${esc(t('targets.kind.renewal'))}</span></div>
            </div>
          </div>`;

  // 4 — Sprints: a card lands in Done, the points move, the burndown steps down.
  const spDone = SPRINT.filter((k) => k.col === 'done').reduce((n, k) => n + k.pts, 0);
  const spTotal = SPRINT.reduce((n, k) => n + k.pts, 0);
  const spBefore = spDone - SPRINT.filter((k) => 'lands' in k).reduce((n, k) => n + k.pts, 0);
  const points = (done: number) => ui.points.replace('{done}', num(done)).replace('{total}', num(spTotal));
  const spCard = (k: (typeof SPRINT)[number], i: number) =>
    `<article class="spc${'lands' in k ? ' spc--lands' : ''}${'wide' in k ? ' spc--wide' : ''}"${'lands' in k ? a('land', 2500) : ''}>
                  <div class="spc__t"><span class="spc__e" data-epic="${k.epic}">${esc(ui.epics[k.epic])}</span><span class="spc__p">${num(k.pts)}</span>${av(k.who)}</div>
                  <p>${esc(ui.tasks[i])}</p>
                  ${'lands' in k ? `<span class="spc__l">${CHAIN}${esc(t('task.links.blocks'))} · ${num(1)}</span>` : ''}
                </article>`;
  const spCol = (col: 'doing' | 'review' | 'done', label: string) => {
    const cards = SPRINT.map((k, i) => ({ k, i })).filter(({ k }) => k.col === col);
    return `<div class="sp__col${col === 'review' ? ' sp__col--wide' : ''}" data-col="${col}"><div class="sp__ch">${esc(label)}</div>${cards.map(({ k, i }) => spCard(k, i)).join('')}</div>`;
  };
  // Burndown, 26 points over ten days: the ideal line, the steps so far, and the step this card adds —
  // which lands the team exactly on the ideal line at the half-way mark.
  const burn = `<div class="sp__plot"><svg class="sp__burn" viewBox="0 0 300 96" preserveAspectRatio="none" aria-hidden="true">
                  <path class="sp__ideal" d="M4 8 L296 88"/>
                  <path class="sp__actual" d="M4 8 H48 V17 H92 V33 H136"/>
                  <path class="sp__step" d="M136 33 V48 H150" pathLength="100"${a('step', 3150)}/>
                </svg><span class="sp__dot"${a('pop', 3600)}></span></div>`;
  const sceneSprint = `<div class="sc sc--sprint" data-sc="3">
            <div class="sp__head">
              <b>${esc(ui.sprint)}</b><span class="tag" data-band="good">${esc(ui.active)}</span>
              <span class="sp__dates">${esc(dayFmt.formatRange(at(11, 3), at(11, 14)))}</span>
              <span class="sp__prog"><span class="sp__bar"><i data-a="grow" style="--d:3100ms;--from:${(spBefore / spTotal).toFixed(3)};--to:${(spDone / spTotal).toFixed(3)}"></i></span><span class="sp__pts"><span class="sp__was"${a('was', 3100)}>${esc(points(spBefore))}</span><span${a('now', 3100)}>${esc(points(spDone))}</span></span></span>
            </div>
            <div class="sp__cols">
              ${spCol('doing', t('board.defaultColumns.doing'))}
              ${spCol('review', ui.review)}
              ${spCol('done', t('board.defaultColumns.done'))}
            </div>
            <div class="sp__chart">
              <div class="sp__lg"><b>${esc(ui.burndown)}</b><em${a('now', 3600)}>${esc(ui.ptsLeft.replace('{n}', num(spTotal - spDone)))}</em><span class="sp__lgk"><span class="sp__k sp__k--i">${esc(ui.ideal)}</span><span class="sp__k sp__k--a">${esc(ui.actual)}</span></span></div>
              ${burn}
            </div>
            <span class="cur cur--sprint">${CURSOR}</span>
          </div>`;

  // ------------------------------------------------------- the scroll story
  // One customer, six steps, right after the hero. The steps are plain text, in
  // order; the stage is a picture (aria-hidden) built from the film's parts. The
  // script sets one number as the reader scrolls, --p from 0 to 6, and the
  // stylesheet draws every scene from it, so it plays backwards as well as
  // forwards. A part that follows the scroll names when, within its scene's
  // action (0–1), it starts and ends: --a and --b. Only in STORY_LOCALES.
  const story = siteStory(locale);
  const when = (from: number, to: number, more = '') => ` style="--a:${from};--b:${to}${more}"`;
  const storyHtml = (() => {
    if (!story) return '';
    const marevo = ACCOUNTS[0].name;
    type Band = 'good' | 'watch' | 'risk';
    const whyRow = (text: string, got: number, of: number, a: number, wide = false) => {
      const share = got / of;
      const b: Band = share >= 0.7 ? 'good' : share >= 0.35 ? 'watch' : 'risk';
      return `<li class="sa${wide ? ' why--wide' : ''}" data-band="${b}"${when(a, a + 0.2)}><span class="why__t">${esc(text)}</span><span class="why__p">${num(got)}/${num(of)}</span><span class="why__bar"><i style="--w:${share.toFixed(2)}"></i></span></li>`;
    };
    // The account as the app shows it: the score ring, its band, the trend and the reasons.
    // Scene 1 and scene 6 are the same screen: the score falls in the first and climbs back in the last.
    const health = (k: number, o: { from: number; to: number; b0: Band; b1: Band; at: [number, number]; top: string; trend: string; extra: string; rows: string }) => `<div class="ss ss--health" style="--k:${k}">
              <div class="hd__top"><b>${esc(marevo)}</b>${o.top}${av('ZT')}</div>
              <div class="hd__body">
                <div class="hd__score">
                  <div class="ring sr"${when(o.at[0], o.at[1], `;--v0:${o.from};--v1:${o.to};--c0:var(--${o.b0});--c1:var(--${o.b1})`)}>
                    <svg viewBox="0 0 120 120"><circle class="ring__bg" cx="60" cy="60" r="50"/><circle class="ring__val" cx="60" cy="60" r="50" pathLength="100"/></svg>
                    <span class="ring__n" data-count="${k},${o.at[0]},${o.at[1]},${o.from},${o.to}">${num(o.from)}</span>
                  </div>
                  <span class="xf"${when(o.at[0] + 0.15, o.at[1])}><span class="hd__band" data-band="${o.b0}">${esc(band(o.b0))}</span><span class="hd__band" data-band="${o.b1}">${esc(band(o.b1))}</span></span>
                  ${o.trend}
                </div>
                <div class="why">${o.extra}<span class="why__h">${esc(t('health.why'))}</span><ul>${o.rows}</ul></div>
              </div>
            </div>`;
    const reasons = (touch: string, tasks: string, at: number) =>
      [
        whyRow(touch, at === 0 ? 5 : 25, 25, 0.42 - at * 0.3),
        whyRow(tasks, at === 0 ? 3 : 20, 20, 0.52 - at * 0.3),
        whyRow(t('health.why.championNone'), 0, 15, 0.62 - at * 0.3),
        whyRow(t('health.why.decision', { names: 'Selin Aytaç' }), 15, 15, 0.72 - at * 0.3, true),
        whyRow(t('health.why.blockersNone'), 15, 15, 0.8 - at * 0.3, true),
      ].join('');
    const trendDown = t('health.trend', { change: `−${num(12)}`, days: num(30) });
    const trendUp = t('health.trend', { change: `+${num(37)}`, days: num(30) });

    // 1 — the score falls from 60 to 48 and the reasons line up under "Why?".
    const s1 = health(0, {
      from: 60, to: 48, b0: 'watch', b1: 'risk', at: [0, 0.4],
      top: `<span class="tag sa" data-band="risk"${when(0.3, 0.45)}>${esc(ui.chips.review)}</span>`,
      trend: `<span class="hd__trend sa"${when(0.25, 0.4)}>${esc(trendDown)}</span>`,
      extra: '',
      rows: reasons(t('health.why.touch', { days: num(38), kind: t('health.touchKind.review') }), t('health.why.tasks', { n: num(3) }), 0),
    });

    // 2 — the business review: a second next step is written down. That is the promise.
    const s2 = `<div class="ss ss--meet" style="--k:1">
              <div class="mt">
                <div class="mt__head">
                  <div class="mt__date"><b>${esc(mDay)}</b><span>${esc(mMonth)}</span></div>
                  <div class="mt__main"><b>${esc(m.name)}</b><span>${esc(m.ours)}</span><span>${esc(m.theirs)}</span></div>
                </div>
                <div class="mt__steps">
                  <span class="mt__h">${esc(t('meetings.nextSteps'))}</span>
                  <span class="mt__step">${OPEN}<span>${esc(m.steps[0])}</span></span>
                  <span class="mt__step mt__promise sv"${when(0.05, 0.25)}>${OPEN}<span class="sm"${when(0.1, 0.7)}>${esc(m.steps[1])}</span></span>
                  <span class="mt__save sv"${when(0.78, 0.95)}>${esc(t('common.save'))}</span>
                </div>
              </div>
            </div>`;

    // 3 — saved, the step is a task: on the board, and with its owner, date, account and sharing filled in.
    const field = (label: string, value: string, a: number) => `<div class="sa"${when(a, a + 0.14)}><dt>${esc(label)}</dt><dd>${value}</dd></div>`;
    const s3 = `<div class="ss ss--task" style="--k:2">
              <div class="mk st__col">
                <div class="mk__h"><b>${esc(t('board.defaultColumns.todo'))}</b></div>
                ${task(ui.todo, 'AD', 'Ada', day(11, 12))}
                <article class="tk sa"${when(0, 0.22)}><p>${esc(m.steps[1])}</p><div class="tk__f">${av('LB')}<span>Lena</span><span class="due">${esc(day(11, 22))}</span></div></article>
              </div>
              <div class="td">
                <span class="mk__toast sa"${when(0, 0.18)}>${CHECK}${esc(story.ui.opened)}</span>
                <div class="td__h">${OPEN}<b>${esc(m.steps[1])}</b></div>
                <dl class="td__f">
                  ${field(accountWords(locale).one, `<span class="td__acc">M</span>${esc(marevo)}`, 0.2)}
                  ${field(t('task.assignees'), `${av('LB')}Lena`, 0.34)}
                  ${field(t('task.due'), `<span class="due">${esc(day(11, 22))}</span>`, 0.48)}
                  ${field(story.ui.from, esc(m.name), 0.62)}
                  ${field(t('portal.share.label'), `<span class="tog sv"${when(0.84, 0.98)}><i></i></span>`, 0.76)}
                </dl>
              </div>
            </div>`;

    // 4 — Sprint 24: the card linked to the promise moves from review to Done; the points follow.
    const card = (i: number, epic: number, pts: number, who: string, more = '', attrs = '', link = '') => `<article class="spc${more}"${attrs}><div class="spc__t"><span class="spc__e" data-epic="${epic}">${esc(ui.epics[epic])}</span><span class="spc__p">${num(pts)}</span>${av(who)}</div><p>${esc(ui.tasks[i])}</p>${link}</article>`;
    const pts = (done: number) => ui.points.replace('{done}', num(done)).replace('{total}', num(26));
    const s4 = `<div class="ss ss--sprint" style="--k:3">
              <div class="sp__head">
                <b>${esc(ui.sprint)}</b><span class="tag" data-band="good">${esc(ui.active)}</span>
                <span class="sp__dates">${esc(dayFmt.formatRange(at(11, 10), at(11, 21)))}</span>
                <span class="sp__prog"><span class="sp__bar"><i class="sv"${when(0.7, 0.9, ';--from:.308;--to:.5')}></i></span><span class="sp__pts xf"${when(0.7, 0.9)}><span>${esc(pts(8))}</span><span>${esc(pts(13))}</span></span></span>
              </div>
              <div class="ssp">
                <div class="ssp__col ssp__col--doing"><div class="sp__ch">${esc(t('board.defaultColumns.doing'))}</div>${card(4, 1, 8, 'LB')}</div>
                <div class="ssp__col"><div class="sp__ch">${esc(ui.review)}</div>${card(1, 2, 5, 'ZT')}</div>
                <div class="ssp__col"><div class="sp__ch">${esc(t('board.defaultColumns.done'))}</div>${card(2, 0, 8, 'AD')}${card(0, 1, 5, 'LB', ' ssp__move sv', when(0.12, 0.66), `<span class="spc__l">${CHAIN}${esc(t('task.links.blocks'))} · ${num(1)}</span>`)}</div>
              </div>
              <div class="sp__chart">
                <div class="sp__lg"><b>${esc(ui.burndown)}</b><em class="xf"${when(0.7, 0.9)}><span>${esc(ui.ptsLeft.replace('{n}', num(18)))}</span><span>${esc(ui.ptsLeft.replace('{n}', num(13)))}</span></em><span class="sp__lgk"><span class="sp__k sp__k--i">${esc(ui.ideal)}</span><span class="sp__k sp__k--a">${esc(ui.actual)}</span></span></div>
                <div class="sp__plot"><svg class="sp__burn" viewBox="0 0 300 96" preserveAspectRatio="none"><path class="sp__ideal" d="M4 8 L296 88"/><path class="sp__actual" d="M4 8 H48 V17 H92 V33 H136"/><path class="sp__step sv"${when(0.66, 0.84)} d="M136 33 V48 H150" pathLength="100"/></svg><span class="sp__dot sv"${when(0.8, 0.9)}></span></div>
              </div>
            </div>`;

    // 5 — the customer's side: the shared task turns Done, and Zeynep's reply is under it.
    const s5 = `<div class="ss ss--portal" style="--k:4">
              <div class="spt">
                <div class="spt__top"><span class="pt__logo">M</span><b>${esc(t('portal.for', { account: marevo }))}</b>${av('SA')}</div>
                <div class="spt__tabs"><span class="is-on">${esc(t('portal.boards'))}</span><span>${esc(t('portal.requests'))}</span></div>
                <ul class="spt__list">
                  <li>${CHECK}<span>${esc(m.steps[0])}</span><em class="tag" data-band="good">${esc(t('portal.step.done'))}</em></li>
                  <li class="spt__it"><span class="xf"${when(0.25, 0.45)}>${OPEN}${CHECK}</span><span>${esc(m.steps[1])}</span><span class="xf"${when(0.25, 0.45)}><em class="tag" data-band="watch">${esc(t('portal.step.doing'))}</em><em class="tag" data-band="good">${esc(t('portal.step.done'))}</em></span></li>
                  <li class="spt__reply sa"${when(0.5, 0.8)}>${av('ZT')}<div><b>Zeynep</b><p>${esc(story.ui.reply)}</p></div></li>
                </ul>
              </div>
            </div>`;

    // 6 — the renewal closes as won, and the score climbs back from 48 to 85.
    const s6 = health(5, {
      from: 48, to: 85, b0: 'risk', b1: 'good', at: [0.22, 0.65],
      top: '',
      trend: `<span class="hd__trend xf"${when(0.3, 0.6)}><span>${esc(trendDown)}</span><span>${esc(trendUp)}</span></span>`,
      extra: `<div class="sdeal"><span class="sdeal__k">${esc(t('records.kind.opportunity'))}</span><b>${esc(t('renewal.dealName', { account: marevo, year: num(2027) }))}</b><span class="xf"${when(0, 0.2)}><span class="tag" data-band="watch">${esc(t('targets.kind.renewal'))}</span><span class="tag" data-band="good">${esc(t('tpl.won'))}</span></span></div>`,
      rows: reasons(t('health.why.touch', { days: num(6), kind: t('health.touchKind.meeting') }), t('health.why.tasksNone'), 1),
    });

    const crumbs6 = [`${accts} / ${marevo}`, `${t('meetings.title')} / ${m.kind}`, `${t('nav.boards')} / ${story.ui.board}`, `${t('nav.boards')} / ${ui.sprint}`, `${t('portal.board.title')} / ${marevo}`, `${t('nav.renewals')} / ${marevo}`];
    const steps = story.steps
      .map((s, i) => `<li class="story__step${i === 0 ? ' is-on' : ''}"><span class="story__n" aria-hidden="true">${num(i + 1)}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`)
      .join('');
    return `<section class="story" id="story" data-story aria-labelledby="story-title">
    <div class="wrap">
      <header class="story__head">
        <h2 id="story-title">${esc(story.title)}</h2>
        <p class="lead">${esc(story.lead)}</p>
      </header>
      <div class="story__track">
        <div class="story__pin" aria-hidden="true">
          <div class="film__win story__win">
            <div class="film__bar"><span class="film__dots"><i></i><i></i><i></i></span><span class="film__addr story__addr">${crumbs6.map((x, i) => `<span style="--k:${i}">${esc(x)}</span>`).join('')}</span></div>
            <div class="story__stage">
            ${s1}
            ${s2}
            ${s3}
            ${s4}
            ${s5}
            ${s6}
            </div>
            <span class="story__bar"><i></i></span>
          </div>
        </div>
        <ol class="story__steps">${steps}</ol>
      </div>
    </div>
  </section>`;
  })();
  const cue = story ? `<a class="cue" href="#story"><span class="cue__line" aria-hidden="true"><i></i></span><span>${esc(story.cue)}</span></a>` : '';

  const crumbs = [`${accts} / ${ACCOUNTS[0].name}`, `${t('meetings.title')} / ${m.kind}`, `${t('nav.renewals')} / ${ACCOUNTS[1].name}`, `${t('nav.boards')} / ${ui.sprint}`];
  const DURS = [7600, 7000, 7000, 7600];
  const tabs = tour.steps
    .map(
      (s, i) => `<button class="tour__tab${i === 0 ? ' is-on' : ''}" type="button" role="tab" id="tour-tab-${i}" aria-controls="tour-panel" aria-selected="${i === 0}" data-go="${i}" data-dur="${DURS[i]}">
          <span class="tour__bar" aria-hidden="true"><i></i></span>
          <span class="tour__name">${esc(s.tab)}</span>
          <span class="tour__title">${esc(s.title)}</span>
          <span class="tour__text">${esc(s.text)}</span>
        </button>`,
    )
    .join('');
  const nows = tour.steps.map((s, i) => `<div class="tour__nowi${i === 0 ? ' is-on' : ''}" data-now="${i}"><b>${esc(s.title)}</b><p>${esc(s.text)}</p></div>`).join('');

  // The headline arrives word by word. Languages written without spaces break where
  // the copy allows it (U+200B) and after their own commas, so a line never ends on a
  // stray character — and get no space between the parts.
  let wordNo = 0;
  const heroWords = c.hero.title
    .replace(/\u200b|(?<=[，、；])(?=\S)/g, '\u0001')
    .split(/(\s+|\u0001)/)
    .filter(Boolean)
    .map((w) => (w === '\u0001' ? '<wbr>' : /^\s+$/.test(w) ? ' ' : `<span class="w" style="--wi:${wordNo++}"><span>${esc(w)}</span></span>`))
    .join('');
  // One H1 says what Curahold is (the category, small) and what it does for you (the outcome).
  const heroTitle = `<span class="hero__k">${esc(c.hero.kicker)}</span> ${heroWords}`;
  const n = infoCopy(locale).nav;
  const [seoTitle, seoDesc] = infoCopy(locale).seo.home;
  const ctas = `<a class="btn btn--primary btn--big" href="${signup}" data-ab="go">${ICON_GO}<span>${esc(n.tryFree)}</span></a>
          <a class="btn btn--glass btn--big" href="${demo}" data-ab="demo">${ICON_PLAY}<span>${esc(n.demo)}</span></a>`;

  // ------------------------------------------------------------------ the bento
  const tile = (i: number) => `<div class="tile__c"><h3>${esc(bento.tiles[i].h)}</h3><p>${esc(bento.tiles[i].p)}</p></div>`;

  // Tile 1 — the assistant: a question, and an answer made of the demo's own accounts.
  const askRow = (r: (typeof ACCOUNTS)[number], text: string, n: number) =>
    `<li class="lp lp${n}"><span class="sco" data-band="${r.band}">${num(r.score)}</span><span class="ask__b"><b>${esc(r.name)}</b><span>${esc(text)}</span></span></li>`;
  const tileAsk = `<article class="tile tile--ask" data-live data-reveal>
          ${tile(0)}
          <div class="ask" aria-hidden="true">
            <p class="ask__q"><span>${esc(bento.ask.q)}</span></p>
            <div class="ask__a">
              <span class="ask__who">${SPARK}Claude<span class="ask__dots"><i></i><i></i><i></i></span></span>
              <p class="lp lp2">${esc(bento.ask.a)}</p>
              <ul>
                ${askRow(ACCOUNTS[0], ui.chips.review, 3)}
                ${askRow(ACCOUNTS[1], ui.chips.renewal, 4)}
                ${askRow(ACCOUNTS[2], band('watch'), 5)}
              </ul>
              <p class="ask__did lp lp6">${CHECK}<span>${esc(bento.ask.did)}</span></p>
            </div>
          </div>
        </article>`;

  // Tile 2 — the customer's side: a link in their email, then only what was shared with them.
  const tilePortal = `<article class="tile tile--portal" data-live data-reveal style="--i:1">
          ${tile(1)}
          <div class="pt" aria-hidden="true">
            <div class="pt__mail">
              <span class="pt__lbl">${esc(t('portal.email'))}</span>
              <span class="pt__field">selin@marevo.example</span>
              <span class="pt__btn">${esc(t('portal.sendLink'))}</span>
            </div>
            <div class="pt__win">
              <div class="pt__top"><span class="pt__logo">M</span><b>${esc(t('portal.for', { account: ACCOUNTS[0].name }))}</b>${av('SA')}</div>
              <div class="pt__tabs"><span class="is-on">${esc(t('portal.boards'))}</span><span>${esc(t('portal.requests'))}</span><em>${esc(t('portal.open', { n: num(2) }))}</em></div>
              <div class="pt__plan"><b>${esc(bento.portal.plan)}</b><span class="pt__bar"><i></i></span><span>${num(2)}/${num(3)}</span></div>
              <ul class="pt__list">
                <li class="is-done">${CHECK}<span>${esc(m.steps[0])}</span></li>
                <li class="pt__tick">${CHECK}<span>${esc(m.name)}</span></li>
                <li>${OPEN}<span>${esc(m.steps[1])}</span><em>${esc(t('portal.replies', { n: num(2) }))}</em></li>
              </ul>
              <span class="pt__new">+ ${esc(t('portal.new'))}</span>
            </div>
          </div>
        </article>`;

  // Tile 3 — sync: named tools on both sides of Curahold, changes travelling both ways.
  const beam = (name: string, i: number, side: 'a' | 'b') => `<li style="--i:${i}"><span>${esc(name)}</span><i class="sy__beam sy__beam--${side}"></i></li>`;
  // Under the hub, what "in step" means, one change at a time: a date arriving from the CRM,
  // a sprint task closing on both sides, a new task announced in chat.
  const ARROW = { in: 'M2 8h11M9 4l4 4-4 4', out: 'M14 8H3M7 4L3 8l4 4', both: 'M2 5.5h11M10 2.5l3 3-3 3M14 10.5H3M6 7.5l-3 3 3 3' };
  const syncEvent = (tool: string, dir: keyof typeof ARROW, what: string, state: string, i: number) =>
    `<p class="sy__ev${i === 0 ? ' is-own' : ''}" style="--i:${i}"><b>${esc(tool)}</b><svg viewBox="0 0 16 16"><path d="${ARROW[dir]}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${esc(what)} · <em>${esc(state)}</em></span></p>`;
  const tileSync = `<article class="tile tile--sync" data-live data-reveal style="--i:2">
          ${tile(2)}
          <div class="sy" aria-hidden="true">
            <ul class="sy__col sy__col--a">${['Salesforce', 'HubSpot', 'Jira'].map((n, i) => beam(n, i, 'a')).join('')}</ul>
            <div class="sy__hub">${MARK}<em>${esc(t('sync.dir.both'))}</em></div>
            <ul class="sy__col sy__col--b">${['Slack', 'Google Sheets', 'Microsoft Teams'].map((n, i) => beam(n, i, 'b')).join('')}</ul>
            <div class="sy__feed">
              ${syncEvent('Salesforce', 'in', ACCOUNTS[1].name, `${t('targets.kind.renewal')} ${day(2, 14, 2027)}`, 0)}
              ${syncEvent('Jira', 'both', ui.tasks[3], t('board.defaultColumns.done'), 1)}
              ${syncEvent('Slack', 'out', ui.playbookSteps[1], 'Zeynep', 2)}
            </div>
          </div>
        </article>`;

  // Tile 4 — the quarter: the app's own target meter (won, weighted open deals, an even pace) and the portfolio's bands.
  const tileReports = `<article class="tile tile--rep" data-live data-reveal style="--i:3">
          ${tile(3)}
          <div class="rp" aria-hidden="true">
            <div class="rp__h"><b>${esc(t('targets.title', { period: t('targets.quarter', { n: num(4), year: num(2026) }) }))}</b><span class="tag" data-band="good">${esc(t('targets.state.ahead'))}</span></div>
            <div class="rp__n"><b>${esc(moneyShort(170000))}</b><span>/ ${esc(moneyShort(250000))}</span></div>
            <div class="rp__meter"><i class="rp__won"></i><i class="rp__open"></i><span class="rp__pace"></span></div>
            <div class="rp__key"><span class="rp__k rp__k--won">${esc(t('targets.key.won'))}</span><span class="rp__k rp__k--open">${esc(t('targets.key.open'))}</span><span class="rp__k rp__k--pace">${esc(t('targets.key.pace'))}</span></div>
            <div class="rp__bands"><i data-band="risk" style="--w:2"></i><i data-band="watch" style="--w:3"></i><i data-band="good" style="--w:12"></i></div>
            <div class="rp__legend"><span data-band="risk">${num(2)} ${esc(band('risk'))}</span><span data-band="watch">${num(3)} ${esc(band('watch'))}</span><span data-band="good">${num(12)} ${esc(band('good'))}</span></div>
          </div>
        </article>`;

  // Tile 5 — nine languages: the same four menu items, in each language's own words and direction.
  const langOrder = [locale, ...SITE_LOCALES.filter((l) => l !== locale)];
  const langCards = langOrder
    .map(
      (l, i) => `<div class="lg__v${i === 0 ? ' is-own' : ''}" lang="${bcp47Of(l)}" dir="${LOCALE_INFO[l].dir}" style="--i:${i}">
              <span class="lg__pick">${esc(LOCALE_INFO[l].name)}</span>
              ${(['nav.home', 'nav.myTasks', 'nav.renewals', 'nav.reports'] as MessageKey[]).map((k, n) => `<span class="lg__it${n === 2 ? ' is-on' : ''}">${esc(translate(l, k))}</span>`).join('')}
            </div>`,
    )
    .join('');
  const tileLang = `<article class="tile tile--lang" data-live data-reveal style="--i:4">
          ${tile(4)}
          <div class="lg" aria-hidden="true">${langCards}</div>
        </article>`;

  // Tile 6 — security: each company behind its own wall, and the audit log as the app keeps it.
  const wall = (slug: string, n: number, i: number) => `<li style="--i:${i}"><span class="sec__lock">${LOCK}</span><span class="sec__w"><span class="sec__host">${esc(slug)}.${esc(BASE_DOMAIN)}</span><span class="sec__n">${esc(accts)}<b>${num(n)}</b></span></span></li>`;
  const logRow = (h: number, mm: number, who: string, what: string, i: number) => `<time class="sec__c" style="--i:${i}">${esc(clock(h, mm))}</time><span class="sec__c sec__e" style="--i:${i}"><b>${esc(who)}</b> <span>${esc(what)}</span></span>`;
  const tileSec = `<article class="tile tile--sec" data-live data-reveal style="--i:5">
          <div class="tile__c"><h3>${esc(bento.tiles[5].h)}</h3><p>${esc(bento.tiles[5].p)}</p>
            <ul class="facts">${bento.facts.map((f) => `<li>${CHECK}<span>${esc(f)}</span></li>`).join('')}</ul>
          </div>
          <div class="sec" aria-hidden="true">
            <ul class="sec__walls">${wall('company-a', 214, 0)}${wall('company-b', 58, 1)}${wall('company-c', 936, 2)}</ul>
            <div class="sec__log">
              <span class="sec__lh">${esc(t('settings.audit.when'))}</span><span class="sec__lh">${esc(t('settings.audit.who'))}</span><span class="sec__lh">${esc(t('settings.audit.what'))}</span>
              ${logRow(9, 41, 'Zeynep Tunç', t('audit.session.created'), 0)}
              ${logRow(9, 44, 'Ada Demir', t('audit.account.updated'), 1)}
              ${logRow(9, 52, 'Lena', t('audit.org.field_access'), 2)}
            </div>
          </div>
        </article>`;

  const faq = faqList(c.faq.items);
  const marquee = INTEGRATIONS.map((n) => `<span class="marq__item">${esc(n)}</span>`).join('');
  // The mark's own arc, drawn large behind the film: the C that holds.
  const arc = `<svg class="hero__arc" viewBox="0 0 420 420" aria-hidden="true"><defs><linearGradient id="arcg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8c7dff"/><stop offset=".55" stop-color="#5b4de8"/><stop offset="1" stop-color="#3fb596"/></linearGradient></defs><path d="M319.3 79.8A170 170 0 1 0 319.3 340.2" pathLength="100"/></svg>`;

  return `<!doctype html>
<html lang="${tag}" dir="${info.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(seoTitle)}</title>
<meta name="description" content="${esc(seoDesc)}">
${seoTags({ canonical, title: seoTitle, description: seoDesc, locale, ogType: 'website', image: OG_IMAGE_URL })}
<meta name="theme-color" content="#17133a">
<link rel="icon" href="${FAVICON}">
${alternates}
${landingJsonLd(locale, canonical, seoDesc)}
${fontPreload(locale, rel)}
<script>document.documentElement.classList.add('js')</script>
${cssSlot('home', rel)}
</head>
<body class="home">
${SKY}
<a class="skip" href="#main">${esc(c.nav.skip)}</a>
${chromeHeader(locale, '', 'classic')}
<main id="main">
  <section class="hero">
    <div class="wrap hero__in" data-tour>
      <div class="hero__text">
        <h1 class="hero__h">${heroTitle}</h1>
        <p class="hero__lead">${esc(c.hero.lead)}</p>
        <div class="hero__ctas">
          ${ctas}
        </div>
        <p class="hero__note">${esc(c.hero.note)}</p>
      </div>
      <div class="tour" id="product" role="tablist" aria-label="${esc(tour.label)}">
        ${tabs}
      </div>
      <div class="film" id="tour-panel" role="tabpanel" aria-labelledby="tour-tab-0">
        ${arc}
        <div class="film__win" aria-hidden="true">
          <div class="film__bar"><span class="film__dots"><i></i><i></i><i></i></span><span class="film__addr">${crumbs.map((x, i) => `<span${i === 0 ? ' class="is-on"' : ''} data-crumb="${i}">${esc(x)}</span>`).join('')}</span></div>
          <div class="film__stage">
          ${sceneHealth}
          ${scenePromise}
          ${sceneRenew}
          ${sceneSprint}
          </div>
        </div>
      </div>
      <div class="tour__now" aria-hidden="true">${nows}</div>
    </div>
    ${cue}
    <div class="strip" aria-label="${esc(c.hero.works)}">
      <p class="strip__label">${esc(c.hero.works)}</p>
      <button class="strip__toggle" type="button" aria-pressed="false" data-pause="${esc(c.hero.pause)}" data-play="${esc(c.hero.play)}">${PAUSE}<span>${esc(c.hero.pause)}</span></button>
      <div class="marq" aria-hidden="true"><div class="marq__track">${marquee}${marquee}</div></div>
    </div>
  </section>
  <!--fold-->

  ${storyHtml}

  <section class="bento pool" id="features">
    <div class="wrap">
      <h2 data-reveal>${esc(bento.title)}</h2>
      <p class="lead" data-reveal>${esc(bento.lead)}</p>
      <div class="bento__g">
        ${tileAsk}
        ${tilePortal}
        ${tileSync}
        ${tileReports}
        ${tileLang}
        ${tileSec}
      </div>
    </div>
  </section>

  ${whyBriefHtml(locale)}

  ${pricingSummaryHtml(locale)}

  <section class="faq calm">
    <div class="wrap faq__in">
      <h2 data-reveal>${esc(c.faq.title)}</h2>
      <div class="faq__list" data-reveal>${faq}</div>
    </div>
  </section>

  <section class="cta">
    <div class="wrap">
      <div class="cta__card" data-reveal>
        <div class="cta__sky" aria-hidden="true"></div>
        <h2>${esc(cta.title)}</h2>
        <p>${esc(cta.text)}</p>
        <div class="cta__row">
          ${ctas}
        </div>
      </div>
    </div>
  </section>
</main>
${footerHtml(locale)}
${signinDialog(locale)}
<script src="${rel}assets/site.js" defer></script>
${chromeTail(locale, rel, 'classic')}
</body>
</html>
`;
}

// ------------------------------------------------------------------ styles per kind of page

type CssKind = 'home' | 'page' | 'blog';
/** Which hand-written sheets each kind of page draws from (scripts/site-css.ts cuts them down). */
const CSS_SOURCES: Record<CssKind, string[]> = {
  home: ['site.css', 'chrome.css', 'consent.css'],
  page: ['site.css', 'chrome.css', 'pages.css', 'consent.css'],
  blog: ['site.css', 'chrome.css', 'consent.css'],
};
/** Where a page's styles go; build() fills it once every page of that kind is known. */
const cssSlot = (kind: CssKind, rel: string) => `<!--css:${kind}:${rel}-->`;

/**
 * Latin pages preload the headline face; other scripts read their system faces (site/chrome.css
 * :lang rules), so they download no font at all.
 */
const fontPreload = (locale: SiteLocale, rel: string) =>
  locale === 'en' || locale === 'tr'
    ? // Turkish body text needs ş, ğ and İ from the latin-ext file too; found only through the CSS, it would arrive late.
      ['bricolage-grotesque-latin-wght-normal', 'figtree-latin-wght-normal', ...(locale === 'tr' ? ['figtree-latin-ext-wght-normal'] : [])].map((f) => `<link rel="preload" href="${rel}assets/${f}.woff2" as="font" type="font/woff2" crossorigin>`).join('\n')
    : '';

/** Pages waiting for their styles: written once the styles of their kind are cut. */
const pending: { file: string; html: string }[] = [];
const emit = (file: string, html: string) => pending.push({ file, html });

/**
 * Cuts each kind of page's styles to the classes it uses, writes them as one hashed file
 * (cached for good), inlines what the first screen needs (everything above <!--fold-->), and
 * loads the file without blocking the first paint, at low priority (media=print until it
 * arrives) so the fonts are fetched first. Then writes the pages.
 */
function writePages(): string {
  const report: string[] = [];
  for (const kind of Object.keys(CSS_SOURCES) as CssKind[]) {
    const mine = pending.filter((p) => p.html.includes(`<!--css:${kind}:`));
    if (!mine.length) continue;
    const full = minifyCss(CSS_SOURCES[kind].map((f) => readFileSync(join(ROOT, 'site', f), 'utf8')).join('\n'));
    const used = new Set<string>();
    const first = new Set<string>();
    for (const p of mine) {
      for (const c of classesIn(p.html)) used.add(c);
      const fold = p.html.indexOf('<!--fold-->');
      // A page without a fold mark (the blog: short pages) is all first screen.
      for (const c of classesIn(fold < 0 ? p.html : p.html.slice(0, fold))) first.add(c);
    }
    const sheet = pruneCss(full, used);
    const critical = pruneCss(full, first);
    const name = `${kind}.${createHash('sha256').update(sheet).digest('hex').slice(0, 10)}.css`;
    writeFileSync(join(OUT, 'assets', name), sheet);
    report.push(`${kind} ${Math.round(critical.length / 1024)} KB inline + ${Math.round(sheet.length / 1024)} KB file`);
    for (const p of mine) {
      p.html = p.html.replace(/<!--css:(\w+):([^>]*)-->/, (_m, _k, rel: string) =>
        // Inline, a font's url() is read from the page, not from assets/: point it there.
        `<style>${critical.replace(/url\((?![a-z]+:|\/|#)/g, `url(${rel}assets/`)}</style>\n<link rel="stylesheet" href="${rel}assets/${name}" media="print" onload="this.media='all'">\n<noscript><link rel="stylesheet" href="${rel}assets/${name}"></noscript>`,
      ).replace('<!--fold-->', '');
    }
  }
  for (const p of pending) writeFileSync(p.file, p.html);
  return report.join(', ');
}

// Run as a script, it writes the site; imported (by a test), it only lends page().
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) build();

function build() {
  mkdirSync(join(OUT, 'assets'), { recursive: true });
  for (const locale of SITE_LOCALES) {
    const dir = locale === 'en' ? OUT : join(OUT, locale);
    mkdirSync(dir, { recursive: true });
    emit(join(dir, 'index.html'), page(locale));
    // The inner pages the menu points to, and the two animated versions.
    for (const p of innerPages(locale, urlsOf(locale), { plans: plansHtml(locale), compare: compareHtml(locale), faq: pricingFaqHtml(locale), offers: (url) => offersLd(locale, url), faqLd, fill: (t) => t.replace('{team}', moneyIn(locale)(PLANS.team.price.year)).replace('{business}', moneyIn(locale)(PLANS.business.price.year)) })) {
      mkdirSync(join(dir, p.path), { recursive: true });
      emit(join(dir, p.path, 'index.html'), innerDoc(locale, p));
    }
    for (const p of hubPages(locale, urlsOf(locale), ORIGIN)) {
      mkdirSync(join(dir, p.path), { recursive: true });
      emit(join(dir, p.path, 'index.html'), innerDoc(locale, p));
    }
    for (const [which, path] of [['a', PAGE.ai], ['c', PAGE.orbit]] as const) {
      mkdirSync(join(dir, path), { recursive: true });
      writeFileSync(join(dir, path, 'index.html'), conceptDoc(locale, which));
    }
  }
  copyFileSync(join(ROOT, 'site', 'site.js'), join(OUT, 'assets', 'site.js'));
  copyFileSync(join(ROOT, 'site', 'consent.css'), join(OUT, 'assets', 'consent.css'));
  copyFileSync(join(ROOT, 'site', 'consent.js'), join(OUT, 'assets', 'consent.js'));
  // The animated versions still link the shared header's and the consent banner's sheets as they are.
  for (const f of ['chrome.css', 'chrome.js']) copyFileSync(join(ROOT, 'site', f), join(OUT, 'assets', f));
  copyFileSync(join(ROOT, 'site', 'ab', 'measure.js'), join(OUT, 'assets', 'measure.js'));
  // The A/B edge script ships only once the test is switched on (site/ab/config.ts).
  if (AB.enabled) writeFileSync(join(OUT, '_worker.js'), `const AB = ${JSON.stringify(AB)};\n${readFileSync(join(ROOT, 'site', 'ab', 'worker.js'), 'utf8')}`);
  // The same open fonts as the app (SIL OFL), served from the site itself: no third party sees a visit.
  for (const [pkg, names] of [
    ['figtree', ['figtree-latin-wght-normal.woff2', 'figtree-latin-ext-wght-normal.woff2']],
    ['bricolage-grotesque', ['bricolage-grotesque-latin-wght-normal.woff2', 'bricolage-grotesque-latin-ext-wght-normal.woff2']],
  ] as const) {
    for (const name of names) {
      const from = join(ROOT, 'node_modules', '@fontsource-variable', pkg, 'files', name);
      if (existsSync(from)) copyFileSync(from, join(OUT, 'assets', name));
    }
  }
  // A share-card image. An owner-supplied raster (site/og.png) is preferred and
  // copied through; the generated SVG is always written as a free fallback.
  const ownOgPng = join(ROOT, 'site', 'og.png');
  if (existsSync(ownOgPng)) copyFileSync(ownOgPng, join(OUT, 'assets', 'og.png'));
  const OG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#17133a"/><g transform="translate(96,206)"><rect width="120" height="120" rx="28" fill="#241f52"/><path d="M86 34A45 45 0 1 0 86 86" fill="none" stroke="#eceafe" stroke-width="11" stroke-linecap="round"/><circle cx="60" cy="60" r="12" fill="#3fb596"/></g><text x="240" y="302" font-family="'Bricolage Grotesque','Figtree',sans-serif" font-size="94" font-weight="700" fill="#ffffff">Curahold</text><text x="98" y="436" font-family="'Figtree',sans-serif" font-size="38" fill="#a8a3d8">Tasks, sprints and customer renewals in one place</text></svg>`;
  writeFileSync(join(OUT, 'assets', 'og.svg'), OG_SVG);

  // The blog: an index and a post per language that has native posts (en, tr).
  let blogPageCount = 0;
  for (const locale of BLOG_LOCALES) {
    const dir = locale === 'en' ? join(OUT, 'blog') : join(OUT, locale, 'blog');
    mkdirSync(dir, { recursive: true });
    emit(join(dir, 'index.html'), blogIndexPage(locale));
    blogPageCount++;
    for (const post of blogPosts(locale)) {
      const pdir = join(dir, post.slug);
      mkdirSync(pdir, { recursive: true });
      emit(join(pdir, 'index.html'), blogPostPage(locale, post));
      blogPageCount++;
    }
  }

  const cssReport = writePages();

  // The sitemaps: one per language (each page with its hreflang alternates) and an index
  // (sitemap.xml) that robots.txt points to. No <priority> (search engines ignore it);
  // <lastmod> is when the site's sources last changed in git, or a blog post's own date,
  // and is left out rather than guessed when git cannot say.
  const lastmod = siteLastmod();
  const sitemapUrl = (loc: string, mod: string | undefined, alternates: SiteLocale[], pathOf: (l: SiteLocale) => string) => {
    const links = [...alternates.map((l) => `    <xhtml:link rel="alternate" hreflang="${bcp47Of(l)}" href="${ORIGIN}${pathOf(l)}"/>`), `    <xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}${pathOf('en')}"/>`].join('\n');
    return `  <url>\n    <loc>${loc}</loc>\n${mod ? `    <lastmod>${mod}</lastmod>\n` : ''}${links}\n  </url>`;
  };
  const indexedPaths = ['', ...innerPages('en', urlsOf('en'), { plans: '', compare: '', faq: '', offers: () => ({}), faqLd, fill: (t) => t }).map((p) => p.path), ...hubPages('en', urlsOf('en'), ORIGIN).map((p) => p.path)];
  const sitemaps: string[] = [];
  for (const l of SITE_LOCALES) {
    const entries = indexedPaths.map((path) => sitemapUrl(`${ORIGIN}${localeBase(l)}${path}`, lastmod, SITE_LOCALES, (x) => `${localeBase(x)}${path}`));
    if (BLOG_LOCALES.includes(l)) {
      entries.push(sitemapUrl(`${ORIGIN}${blogBaseOf(l)}`, blogPosts(l).reduce((m, p) => (p.date > m ? p.date : m), '1970-01-01'), BLOG_LOCALES, (x) => `${localeBase(x)}blog/`));
      for (const post of blogPosts(l)) entries.push(sitemapUrl(`${ORIGIN}${blogBaseOf(l)}${post.slug}/`, post.date, BLOG_LOCALES, (x) => `${localeBase(x)}blog/${post.slug}/`));
    }
    const name = `sitemap-${l}.xml`;
    writeFileSync(join(OUT, name), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`);
    sitemaps.push(`  <sitemap>\n    <loc>${ORIGIN}/${name}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </sitemap>`);
  }
  writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps.join('\n')}\n</sitemapindex>\n`);
  // The crawler policy (shared/src/compliance/crawlers.ts): search engines in, AI crawlers out, the TDM reservation.
  writeFileSync(join(OUT, 'robots.txt'), robotsTxt('site', { sitemap: `${ORIGIN}/sitemap.xml`, allowAiAnswers: process.env.SITE_AI_CRAWLERS === 'allow', allowScrapers: process.env.SITE_SEO_ROBOTS === 'allow' }));
  mkdirSync(join(OUT, '.well-known'), { recursive: true });
  writeFileSync(join(OUT, '.well-known', 'tdmrep.json'), TDMREP_JSON);
  writeFileSync(join(OUT, '_headers'), `/*\n  ${TDM_HEADER.name}: ${TDM_HEADER.value}\n\n/demo/*\n  X-Robots-Tag: ${CLOSED_X_ROBOTS}\n`);

  // The demo hub and the live demo under /demo/ (built by npm run build:demo), when they are there.
  const HUB = join(ROOT, 'dist', 'demo-hub');
  if (existsSync(join(HUB, 'index.html'))) cpSync(HUB, join(OUT, 'demo'), { recursive: true });
  console.log(`styles: ${cssReport}`);
  console.log(`site: ${SITE_LOCALES.length} language${SITE_LOCALES.length === 1 ? '' : 's'} (${SITE_LOCALES.join(', ')}) → ${OUT} (${readFileSync(join(OUT, 'index.html'), 'utf8').length} bytes for English), ${blogPageCount} blog page${blogPageCount === 1 ? '' : 's'}, sitemaps + robots.txt${existsSync(join(HUB, 'index.html')) ? ', with the demo hub at /demo/' : ''}`);
}
