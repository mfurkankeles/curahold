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
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLANS, PRICE_CURRENCY, type PlanKey } from '../shared/src/billing';
import { translate, dictionaries, LOCALE_INFO, bcp47Of, accountWords, type MessageKey, type Vars } from '../shared/src/i18n';
import { FAVICON, MARK } from '../site/brand';
import { BLOG_LOCALES, blogPosts, SITE_LOCALES, siteBlog, siteConsent, siteCopy, type BlogBlock, type BlogPost, type SiteLocale } from '../site/content';

const ROOT = join(import.meta.dirname, '..');
const OUT = process.argv[2] ?? join(ROOT, 'dist', 'site');
const APP = (process.env.SITE_APP_URL ?? 'https://app.curahold.com').replace(/\/$/, '');
const DEMO = process.env.SITE_DEMO_URL ?? '/demo/';
const DOCS = (process.env.SITE_DOCS_URL ?? `${APP}/docs`).replace(/\/$/, '');
const BASE_DOMAIN = process.env.SITE_BASE_DOMAIN ?? 'curahold.com';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Which languages the help pages and demo hub are built in. The site falls
// back to English for any locale they do not cover yet.
const DOCS_LANGS = new Set<SiteLocale>(['en', 'tr']);
const DEMO_LANGS = new Set<SiteLocale>(['en', 'tr']);

// English lives at the root, every other language under /<locale>/. This is the
// relative href from the page in `from` to the page in `to`.
const localeHref = (from: SiteLocale, to: SiteLocale) => {
  const up = from === 'en' ? '' : '../';
  return to === 'en' ? up || './' : `${up}${to}/`;
};

const CHECK = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const OPEN = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
const CHAIN = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.6 9.4l2.8-2.8M6.9 5.1l.9-.9a2.1 2.1 0 0 1 3 3l-.9.9M9.1 10.9l-.9.9a2.1 2.1 0 0 1-3-3l.9-.9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
const CURSOR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 3.2l13.4 8.2-5.9 1.5-2.9 5.6z" fill="#fff" stroke="#17133a" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
const LOCK = `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.2" y="7" width="9.6" height="6.6" rx="1.8" fill="currentColor"/><path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
const PLAY = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.3v9.4a.6.6 0 0 0 .9.5l7.6-4.7a.6.6 0 0 0 0-1L5.9 2.8a.6.6 0 0 0-.9.5z" fill="currentColor"/></svg>`;
// The night sky behind every page: the grid is drawn by the stylesheet, these are the few glowing dots.
const SKY = `<div class="sky" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>`;
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

// Prefer an owner-supplied raster (site/og.png) for share cards; fall back to
// the generated SVG. A 1200×630 PNG renders on more platforms than SVG does.
const OG_IMAGE = existsSync(join(ROOT, 'site', 'og.png')) ? 'og.png' : 'og.svg';
const OG_IMAGE_URL = `${ORIGIN}/assets/${OG_IMAGE}`;

// og:locale wants language_TERRITORY; these are the conventional pairs.
const OG_LOCALE: Record<SiteLocale, string> = {
  en: 'en_US', tr: 'tr_TR', ar: 'ar_AR', he: 'he_IL', fa: 'fa_IR',
  'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW', ja: 'ja_JP', ko: 'ko_KR',
};

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
  const cfg = { strings: siteConsent(locale), ids: SITE_IDS, policyUrl };
  return `<script>window.__curaConsent=${jsonForScript(cfg)};</script>\n<script src="${rel}assets/consent.js" defer></script>`;
}

/** Canonical, Open Graph, Twitter card and robots tags shared by every page. */
function seoTags(opts: { canonical: string; title: string; description: string; locale: SiteLocale; ogType: 'website' | 'article'; image: string }): string {
  const { canonical, title, description, locale, ogType, image } = opts;
  const alt = SITE_LOCALES.filter((l) => l !== locale)
    .map((l) => `<meta property="og:locale:alternate" content="${OG_LOCALE[l]}">`)
    .join('\n');
  return [
    `<link rel="canonical" href="${esc(canonical)}">`,
    `<meta name="robots" content="index, follow, max-image-preview:large">`,
    `<meta property="og:type" content="${ogType}">`,
    `<meta property="og:site_name" content="Curahold">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:locale" content="${OG_LOCALE[locale]}">`,
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
        offers: { '@type': 'Offer', price: String(PLANS.team.price.month), priceCurrency: PRICE_CURRENCY },
        publisher: { '@id': `${ORIGIN}/#org` },
      },
    ],
  });
}

const breadcrumb = (items: { name: string; url: string }[]) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
});

// ------------------------------------------------------------------- the footer

// Shared by the landing page and the blog so the legal links and language list
// never drift apart. Cross-page links are root-relative, so they are correct
// whatever depth the page sits at.
function footerHtml(locale: SiteLocale): string {
  const c = siteCopy(locale);
  const base = localeBase(locale);
  const demo = DEMO_LANGS.has(locale) && locale !== 'en' ? `${DEMO}${locale}/` : DEMO;
  const docsLocale = DOCS_LANGS.has(locale) ? locale : 'en';
  const docs = `${DOCS}/${docsLocale}/`;
  const legal = (slug: string) => `${DOCS}/${docsLocale}/legal-${slug}/`;
  const footLang = SITE_LOCALES.filter((l) => l !== locale)
    .map((l) => `<a href="${localeBase(l)}" hreflang="${bcp47Of(l)}" lang="${bcp47Of(l)}">${esc(LOCALE_INFO[l].name)}</a>`)
    .join(' · ');
  return `<footer class="foot">
  <div class="wrap">
    <div class="foot__in">
      <div>
        <a class="brand" href="${base}">${MARK}Curahold</a>
        <p class="foot__story">${esc(c.footer.story)}</p>
      </div>
      <div>
        <h3>${esc(c.nav.product)}</h3>
        <ul>
          <li><a href="${base}#pricing">${esc(c.nav.pricing)}</a></li>
          <li><a href="${demo}">${esc(c.nav.demo)}</a></li>
          <li><a href="${blogBaseOf(locale)}">${esc(c.nav.blog)}</a></li>
          <li><a href="${docs}">${esc(c.footer.help)}</a></li>
        </ul>
      </div>
      <div>
        <h3>${esc(c.footer.legal)}</h3>
        <ul>
          <li><a href="${legal('terms')}">${esc(c.footer.links.terms)}</a></li>
          <li><a href="${legal('privacy')}">${esc(c.footer.links.privacy)}</a></li>
          <li><a href="${legal('kvkk')}">${esc(c.footer.links.kvkk)}</a></li>
          <li><a href="${legal('dpa')}">${esc(c.footer.links.dpa)}</a></li>
          <li><a href="${legal('subprocessors')}">${esc(c.footer.links.subprocessors)}</a></li>
          <li><a href="${legal('cookies')}">${esc(c.footer.links.cookies)}</a></li>
        </ul>
      </div>
    </div>
    <div class="foot__base">
      <span>© ${new Date().getFullYear()} ${esc(c.footer.company)}</span>
      <span class="foot__langs">${footLang}</span>
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

/** The shared top bar for blog pages: brand, the main-site nav, a language link and the trial button. */
function blogHeader(locale: SiteLocale): string {
  const c = siteCopy(locale);
  const base = localeBase(locale);
  const demo = DEMO_LANGS.has(locale) && locale !== 'en' ? `${DEMO}${locale}/` : DEMO;
  const docsLocale = DOCS_LANGS.has(locale) ? locale : 'en';
  const docs = `${DOCS}/${docsLocale}/`;
  const signup = `${APP}/signup`;
  const other = BLOG_LOCALES.filter((l) => l !== locale);
  const langNav = other
    .map((l) => `<a class="top__lang" href="${localeBase(l)}blog/" hreflang="${bcp47Of(l)}" lang="${bcp47Of(l)}">${esc(LOCALE_INFO[l].name)}</a>`)
    .join('');
  return `<header class="top">
  <div class="wrap top__in">
    <a class="brand" href="${base}">${MARK}Curahold</a>
    <nav class="top__nav" aria-label="${esc(c.nav.product)}">
      <a href="${base}#product">${esc(c.nav.product)}</a>
      <a href="${base}#pricing">${esc(c.nav.pricing)}</a>
      <a href="${demo}">${esc(c.nav.demo)}</a>
      <a href="${blogBaseOf(locale)}" aria-current="page">${esc(c.nav.blog)}</a>
      <a href="${docs}">${esc(c.nav.help)}</a>
    </nav>
    <div class="top__end">
      ${langNav}
      <a class="btn btn--primary" href="${signup}">${esc(c.nav.tryFree)}</a>
    </div>
  </div>
</header>`;
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
<link rel="preload" href="${opts.rel}assets/bricolage-grotesque-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${opts.rel}assets/site.css">
<link rel="stylesheet" href="${opts.rel}assets/consent.css">
</head>`;
}

function blogIndexPage(locale: SiteLocale): string {
  const b = siteBlog(locale);
  const posts = blogPosts(locale);
  const rel = upTo(locale === 'en' ? 1 : 2);
  const canonical = `${ORIGIN}${blogBaseOf(locale)}`;
  const docsLocale = DOCS_LANGS.has(locale) ? locale : 'en';
  const policyUrl = `${DOCS}/${docsLocale}/legal-cookies/`;
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
${consentTags(locale, rel, policyUrl)}
</body>
</html>
`;
}

function blogPostPage(locale: SiteLocale, post: BlogPost): string {
  const b = siteBlog(locale);
  const rel = upTo(locale === 'en' ? 2 : 3);
  const canonical = `${ORIGIN}${blogBaseOf(locale)}${post.slug}/`;
  const docsLocale = DOCS_LANGS.has(locale) ? locale : 'en';
  const policyUrl = `${DOCS}/${docsLocale}/legal-cookies/`;
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
  return `${blogHead(locale, { title: `${post.title} — Curahold`, description: post.description, canonical, path: `blog/${post.slug}/`, ogType: 'article', rel, extraLd: ld })}
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
${consentTags(locale, rel, policyUrl)}
</body>
</html>
`;
}

function page(locale: SiteLocale): string {
  const c = siteCopy(locale);
  const { tour, bento, cta } = c;
  const ui = tour.ui;
  const info = LOCALE_INFO[locale];
  const rel = locale === 'en' ? '' : '../';
  const signup = `${APP}/signup`;
  const canonical = `${ORIGIN}${localeBase(locale)}`;
  // The demo hub has a page per language; fall back to English where it has none.
  const demo = DEMO_LANGS.has(locale) && locale !== 'en' ? `${DEMO}${locale}/` : DEMO;
  const docsLocale = DOCS_LANGS.has(locale) ? locale : 'en';
  const docs = `${DOCS}/${docsLocale}/`;
  const legal = (slug: string) => `${DOCS}/${docsLocale}/legal-${slug}/`;
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
  const money = usd({});
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
  // Every other language, named by its own endonym.
  const others = SITE_LOCALES.filter((l) => l !== locale);
  const langLink = (l: SiteLocale, cls = '') => `<a${cls ? ` class="${cls}"` : ''} href="${localeHref(locale, l)}" hreflang="${bcp47Of(l)}" lang="${bcp47Of(l)}">${esc(LOCALE_INFO[l].name)}</a>`;
  const langNav =
    others.length === 1
      ? langLink(others[0], 'top__lang')
      : `<details class="lang"><summary class="top__lang">${esc(info.name)}</summary><div class="lang__menu">${others.map((l) => langLink(l)).join('')}</div></details>`;
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
  const heroTitle = c.hero.title
    .replace(/\u200b|(?<=[，、；])(?=\S)/g, '\u0001')
    .split(/(\s+|\u0001)/)
    .filter(Boolean)
    .map((w) => (w === '\u0001' ? '<wbr>' : /^\s+$/.test(w) ? ' ' : `<span class="w" style="--wi:${wordNo++}"><span>${esc(w)}</span></span>`))
    .join('');

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

  const plan = (key: PlanKey) => {
    const p = PLANS[key];
    const points = (key === 'team' ? TEAM_POINTS : BUSINESS_POINTS).map((k) => `<li>${CHECK}<span>${esc(t(k))}</span></li>`).join('');
    return `<div class="plan${key === 'business' ? ' plan--business' : ''}">
          <h3>${esc(t(`billing.plan.${key}` as MessageKey))}</h3>
          <p class="plan__price"><span class="plan__amount" data-month="${esc(money(p.price.month))}" data-year="${esc(money(p.price.year))}">${esc(money(p.price.year))}</span><span class="plan__per" data-month="${esc(c.pricing.perSeat)}" data-year="${esc(c.pricing.perSeatYearly)}">${esc(c.pricing.perSeatYearly)}</span></p>
          <ul>${key === 'business' ? `<li class="plan__plus">${esc(c.pricing.business)}</li>` : ''}${points}</ul>
          <a class="btn ${key === 'business' ? 'btn--primary' : 'btn--ghost'}" href="${signup}">${esc(c.pricing.choose)}</a>
        </div>`;
  };
  const faq = c.faq.items.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('');
  const marquee = INTEGRATIONS.map((n) => `<span class="marq__item">${esc(n)}</span>`).join('');
  // The mark's own arc, drawn large behind the film: the C that holds.
  const arc = `<svg class="hero__arc" viewBox="0 0 420 420" aria-hidden="true"><defs><linearGradient id="arcg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8c7dff"/><stop offset=".55" stop-color="#5b4de8"/><stop offset="1" stop-color="#3fb596"/></linearGradient></defs><path d="M319.3 79.8A170 170 0 1 0 319.3 340.2" pathLength="100"/></svg>`;

  return `<!doctype html>
<html lang="${tag}" dir="${info.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.description)}">
${seoTags({ canonical, title: c.title, description: c.description, locale, ogType: 'website', image: OG_IMAGE_URL })}
<meta name="theme-color" content="#17133a">
<link rel="icon" href="${FAVICON}">
${alternates}
${landingJsonLd(locale, canonical, c.description)}
<link rel="preload" href="${rel}assets/bricolage-grotesque-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${rel}assets/site.css">
<link rel="stylesheet" href="${rel}assets/consent.css">
</head>
<body class="home">
${SKY}
<a class="skip" href="#main">${esc(c.nav.skip)}</a>
<header class="top">
  <div class="wrap top__in">
    <a class="brand" href="./">${MARK}Curahold</a>
    <nav class="top__nav" aria-label="${esc(c.nav.product)}">
      <a href="#product">${esc(c.nav.product)}</a>
      <a href="#pricing">${esc(c.nav.pricing)}</a>
      <a href="${demo}">${esc(c.nav.demo)}</a>
      <a href="${blogBaseOf(locale)}">${esc(c.nav.blog)}</a>
      <a href="${docs}">${esc(c.nav.help)}</a>
    </nav>
    <div class="top__end">
      ${langNav}
      <a class="top__signin" href="#signin" data-signin>${esc(c.nav.signIn)}</a>
      <a class="btn btn--primary" href="${signup}">${esc(c.nav.tryFree)}</a>
    </div>
  </div>
</header>
<main id="main">
  <section class="hero">
    <div class="wrap hero__in" data-tour>
      <div class="hero__text">
        <h1 class="hero__h">${heroTitle}</h1>
        <p class="hero__lead">${esc(c.hero.lead)}</p>
        <div class="hero__ctas">
          <a class="btn btn--primary btn--big" href="${signup}">${esc(c.hero.primary)}</a>
          <a class="btn btn--glass btn--big" href="${demo}">${PLAY}${esc(c.nav.demo)}</a>
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
    <div class="strip" aria-label="${esc(c.hero.works)}">
      <p class="strip__label">${esc(c.hero.works)}</p>
      <div class="marq" aria-hidden="true"><div class="marq__track">${marquee}${marquee}</div></div>
    </div>
  </section>

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

  <section class="pricing calm pool" id="pricing">
    <div class="wrap">
      <div class="pricing__top">
        <div><h2 data-reveal>${esc(c.pricing.title)}</h2><p class="lead" data-reveal>${esc(c.pricing.lead)}</p></div>
        <div class="pricing__switch" role="group" data-reveal aria-label="${esc(c.nav.pricing)}">
          <button type="button" data-interval="month" aria-pressed="false">${esc(c.pricing.monthly)}</button>
          <button type="button" data-interval="year" aria-pressed="true">${esc(c.pricing.yearly)}<small>${esc(c.pricing.save)}</small></button>
        </div>
      </div>
      <div class="plans" data-reveal>${plan('team')}${plan('business')}</div>
      <p class="pricing__fine">${esc(c.pricing.fine)}</p>
    </div>
  </section>

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
          <a class="btn btn--primary btn--big" href="${signup}">${esc(c.hero.primary)}</a>
          <a class="btn btn--glass btn--big" href="${demo}">${PLAY}${esc(c.nav.demo)}</a>
        </div>
      </div>
    </div>
  </section>
</main>
${footerHtml(locale)}
<dialog class="signin" id="signin" data-base="${esc(BASE_DOMAIN)}" aria-labelledby="signin-title">
  <form>
    <h2 id="signin-title">${esc(c.signIn.title)}</h2>
    <p>${esc(c.signIn.text)}</p>
    <label class="signin__field"><input name="slug" autocomplete="organization" spellcheck="false" aria-label="${esc(c.signIn.label)}" placeholder="${esc(c.signIn.placeholder)}" required><span>.${esc(BASE_DOMAIN)}</span></label>
    <div class="signin__row">
      <button class="btn btn--primary" type="submit">${esc(c.signIn.go)}</button>
      <button class="btn btn--ghost" type="button" data-close>${esc(c.signIn.close)}</button>
    </div>
    <p class="signin__none"><a href="${signup}">${esc(c.signIn.none)}</a></p>
  </form>
</dialog>
<script src="${rel}assets/site.js" defer></script>
${consentTags(locale, rel, legal('cookies'))}
</body>
</html>
`;
}

mkdirSync(join(OUT, 'assets'), { recursive: true });
for (const locale of SITE_LOCALES) {
  const dir = locale === 'en' ? OUT : join(OUT, locale);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), page(locale));
}
copyFileSync(join(ROOT, 'site', 'site.css'), join(OUT, 'assets', 'site.css'));
copyFileSync(join(ROOT, 'site', 'site.js'), join(OUT, 'assets', 'site.js'));
copyFileSync(join(ROOT, 'site', 'consent.css'), join(OUT, 'assets', 'consent.css'));
copyFileSync(join(ROOT, 'site', 'consent.js'), join(OUT, 'assets', 'consent.js'));
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
  writeFileSync(join(dir, 'index.html'), blogIndexPage(locale));
  blogPageCount++;
  for (const post of blogPosts(locale)) {
    const pdir = join(dir, post.slug);
    mkdirSync(pdir, { recursive: true });
    writeFileSync(join(pdir, 'index.html'), blogPostPage(locale, post));
    blogPageCount++;
  }
}

// sitemap.xml with hreflang alternates, and robots.txt pointing to it.
const today = new Date().toISOString().slice(0, 10);
const latestPost = (locale: SiteLocale) => blogPosts(locale).reduce((m, p) => (p.date > m ? p.date : m), '1970-01-01');
const sitemapUrl = (loc: string, lastmod: string, priority: string, alternates: SiteLocale[], pathOf: (l: SiteLocale) => string) => {
  const links = [...alternates.map((l) => `    <xhtml:link rel="alternate" hreflang="${bcp47Of(l)}" href="${ORIGIN}${pathOf(l)}"/>`), `    <xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}${pathOf('en')}"/>`].join('\n');
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priority}</priority>\n${links}\n  </url>`;
};
const entries: string[] = [];
for (const l of SITE_LOCALES) entries.push(sitemapUrl(`${ORIGIN}${localeBase(l)}`, today, l === 'en' ? '1.0' : '0.8', SITE_LOCALES, localeBase));
for (const l of BLOG_LOCALES) entries.push(sitemapUrl(`${ORIGIN}${blogBaseOf(l)}`, latestPost(l), '0.6', BLOG_LOCALES, (x) => `${localeBase(x)}blog/`));
for (const l of BLOG_LOCALES) for (const post of blogPosts(l)) entries.push(sitemapUrl(`${ORIGIN}${blogBaseOf(l)}${post.slug}/`, post.date, '0.7', BLOG_LOCALES, (x) => `${localeBase(x)}blog/${post.slug}/`));
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`;
writeFileSync(join(OUT, 'sitemap.xml'), sitemap);
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);

// The demo hub and the live demo under /demo/ (built by npm run build:demo), when they are there.
const HUB = join(ROOT, 'dist', 'demo-hub');
if (existsSync(join(HUB, 'index.html'))) cpSync(HUB, join(OUT, 'demo'), { recursive: true });
console.log(`site: ${SITE_LOCALES.length} language${SITE_LOCALES.length === 1 ? '' : 's'} (${SITE_LOCALES.join(', ')}) → ${OUT} (${readFileSync(join(OUT, 'index.html'), 'utf8').length} bytes for English), ${blogPageCount} blog page${blogPageCount === 1 ? '' : 's'}, sitemap.xml + robots.txt${existsSync(join(HUB, 'index.html')) ? ', with the demo hub at /demo/' : ''}`);
