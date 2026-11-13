// Builds the sales site (curahold.com) into dist/site: English at /, Turkish
// at /tr/. Plain HTML and one small script — it can be served by any static
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
import { translate, LOCALE_INFO, bcp47Of, accountWords, type MessageKey } from '../shared/src/i18n';
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
const DONE = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#2f8f78"/><path d="M4.8 8.2l2.1 2.1L11.3 6" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const OPEN = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="#75719a" stroke-width="1.6"/></svg>`;

// The tools Curahold speaks to, for the strip under the hero. Brand names are
// the same in every language, so they are not translated. These are the same
// integrations named in the tools section below — nothing here is a customer.
const INTEGRATIONS = [
  'Slack', 'Microsoft Teams', 'Google Chat', 'Salesforce', 'HubSpot', 'Dynamics 365',
  'Pipedrive', 'Zoho', 'Bitrix24', 'Freshsales', 'Zendesk Sell', 'Google Sheets', 'Excel', 'Google BigQuery', 'Claude', 'ChatGPT',
];

// A faithful render of the real Accounts board for the product showcase — the
// same card, health bands and signal chips the app uses, with invented demo
// companies and the demo's own people. Labels come from the app's own
// dictionaries, so the shot speaks every language. Nothing here is a real
// customer. `chip` names which hero signal to show; null is a calm, healthy card.
const BOARD = [
  { name: 'Marevo', band: 'risk', score: 48, chip: 'review', who: 'Zeynep', init: 'ZT' },
  { name: 'Northwind Retail', band: 'watch', score: 66, chip: 'health', who: 'Ada', init: 'AD' },
  { name: 'Keystone Foods', band: 'watch', score: 71, chip: 'step', who: 'Selin', init: 'SA' },
  { name: 'Marisol Mobility', band: 'good', score: 92, chip: null, who: 'Lena', init: 'LB' },
  { name: 'Brightwell Retail', band: 'good', score: 85, chip: null, who: 'Ada', init: 'AD' },
  { name: 'Oreli Cosmetics', band: 'risk', score: 53, chip: 'renewal', who: 'Zeynep', init: 'ZT' },
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
  const blogLabel = c.footer.blog ?? siteBlog(locale).nav;
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
        <h4>${esc(c.nav.product)}</h4>
        <ul>
          <li><a href="${base}#pricing">${esc(c.nav.pricing)}</a></li>
          <li><a href="${demo}">${esc(c.nav.demo)}</a></li>
          <li><a href="${blogBaseOf(locale)}">${esc(blogLabel)}</a></li>
          <li><a href="${docs}">${esc(c.footer.help)}</a></li>
        </ul>
      </div>
      <div>
        <h4>${esc(c.footer.legal)}</h4>
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
      <a href="${blogBaseOf(locale)}" aria-current="page">${esc(c.footer.blog ?? siteBlog(locale).nav)}</a>
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
<a class="skip" href="#main">${locale === 'tr' ? 'İçeriğe geç' : 'Skip to content'}</a>
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
<a class="skip" href="#main">${locale === 'tr' ? 'İçeriğe geç' : 'Skip to content'}</a>
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
  const info = LOCALE_INFO[locale];
  const rel = locale === 'en' ? '' : '../';
  const signup = `${APP}/signup`;
  const canonical = `${ORIGIN}${localeBase(locale)}`;
  // The demo hub has a page per language; fall back to English where it has none.
  const demo = DEMO_LANGS.has(locale) && locale !== 'en' ? `${DEMO}${locale}/` : DEMO;
  const docsLocale = DOCS_LANGS.has(locale) ? locale : 'en';
  const docs = `${DOCS}/${docsLocale}/`;
  const legal = (slug: string) => `${DOCS}/${docsLocale}/legal-${slug}/`;
  const money = (n: number) => new Intl.NumberFormat(bcp47Of(locale), { style: 'currency', currency: PRICE_CURRENCY, maximumFractionDigits: 0 }).format(n);
  const t = (k: MessageKey) => translate(locale, k);
  // Every other language, named by its own endonym. One other → a direct link,
  // as today; more than one → a small menu. hreflang lists them all.
  const others = SITE_LOCALES.filter((l) => l !== locale);
  const langLink = (l: SiteLocale, cls = '') => `<a${cls ? ` class="${cls}"` : ''} href="${localeHref(locale, l)}" hreflang="${bcp47Of(l)}" lang="${bcp47Of(l)}">${esc(LOCALE_INFO[l].name)}</a>`;
  const langNav =
    others.length === 1
      ? langLink(others[0], 'top__lang')
      : `<details class="lang"><summary class="top__lang">${esc(info.name)}</summary><div class="lang__menu">${others.map((l) => langLink(l)).join('')}</div></details>`;
  const alternates = [...SITE_LOCALES.map((l) => `<link rel="alternate" hreflang="${bcp47Of(l)}" href="${localeHref(locale, l)}">`), `<link rel="alternate" hreflang="x-default" href="${localeHref(locale, 'en')}">`].join('\n');
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
  const chips = [
    ['calm', c.hero.chips.renewal],
    ['late', c.hero.chips.review],
    ['task', c.hero.chips.step],
    ['watch', c.hero.chips.health],
  ]
    .map(([tone, text], i) => `<li class="chip" data-tone="${tone}" style="--i:${i}">${esc(text)}</li>`)
    .join('');
  const steps = c.year.steps.map((s, i) => `<li data-reveal style="--i:${i}"><h3>${esc(s.name)}</h3><p>${esc(s.text)}</p></li>`).join('');
  const tools = c.tools.rows.map((r, i) => `<div data-reveal style="--i:${i}"><dt>${esc(r.label)}</dt><dd>${esc(r.names)}</dd></div>`).join('');
  const faq = c.faq.items.map((f, i) => `<details data-reveal style="--i:${i}"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('');
  const m = c.meeting.card;

  // The product showcase: an app window holding the real Accounts board. Every
  // label is pulled from the app's own dictionaries so it reads in each language.
  const accts = accountWords(locale).other;
  const navItems = [
    ['home', t('nav.home')],
    ['boards', t('nav.boards')],
    ['accounts', accts],
    ['meetings', t('meetings.title')],
    ['reports', t('nav.reports')],
  ]
    .map(([key, label]) => `<span class="app__nav${key === 'accounts' ? ' is-on' : ''}">${esc(label)}</span>`)
    .join('');
  const cards = BOARD.map((b, i) => {
    const chip = b.chip ? `<div class="ac__chips"><span class="ac__chip" data-band="${b.band}">${esc(c.hero.chips[b.chip])}</span></div>` : '';
    const bandWord = t(`health.band.${b.band}` as MessageKey);
    return `<article class="ac" data-band="${b.band}" data-reveal style="--i:${i}">
            <div class="ac__head"><span class="ac__name">${esc(b.name)}</span><span class="ac__score" data-band="${b.band}" data-count="${b.score}">0</span></div>
            ${chip}
            <div class="ac__foot">
              <span class="ac__owner"><span class="ac__ava">${esc(b.init)}</span>${esc(b.who)}</span>
              <span class="ac__owner-l">${esc(t('accounts.owner'))}</span>
              <span class="ac__flag" data-band="${b.band}">${esc(bandWord)}</span>
            </div>
          </article>`;
  }).join('');
  const showcase = `  <section class="showcase" id="see">
    <div class="wrap">
      <h2 data-reveal>${esc(c.product.title)}</h2>
      <p class="lead" data-reveal>${esc(c.product.lead)}</p>
      <div class="app" data-reveal="app" aria-hidden="true">
        <div class="app__bar"><span class="app__dots"><i></i><i></i><i></i></span><span class="app__addr">${esc(accts)}</span></div>
        <div class="app__body">
          <nav class="app__side"><span class="app__org">${MARK}<b>Curahold</b></span>${navItems}</nav>
          <div class="app__main">
            <div class="app__head"><h3>${esc(accts)}</h3><span class="app__count">${BOARD.length}</span></div>
            <div class="app__grid">${cards}</div>
          </div>
        </div>
      </div>
    </div>
  </section>`;

  // Second product window: the task board (kanban). Task titles reuse the copy
  // already translated for the meeting card and the year timeline.
  const DUE = `${esc(m.day)} ${esc(m.month)}`;
  const ktask = (title: string, init: string, i: number, opts: { due?: boolean; prio?: string; done?: boolean } = {}) =>
    `<article class="kt${opts.done ? ' is-done' : ''}" data-reveal style="--i:${i}">
              <p class="kt__t">${esc(title)}</p>
              <div class="kt__f"><span class="kt__ava">${esc(init)}</span>${opts.due ? `<span class="kt__due">${DUE}</span>` : ''}${opts.done ? `<span class="kt__done">${DONE}</span>` : `<span class="kt__dot" data-prio="${opts.prio ?? 'med'}"></span>`}</div>
            </article>`;
  const kcol = (titleKey: MessageKey, n: number, body: string) =>
    `<div class="kb__col"><div class="kb__h">${esc(t(titleKey))}<span>${n}</span></div><div class="kb__cards">${body}</div></div>`;
  const kanban = `  <section class="board">
    <div class="wrap">
      <h3 class="showcase__cap" data-reveal>${esc(c.product.work)}</h3>
      <div class="app app--wide" data-reveal="app" aria-hidden="true">
        <div class="app__bar"><span class="app__dots"><i></i><i></i><i></i></span><span class="app__addr">${esc(t('nav.boards'))}</span></div>
        <div class="app__main app__main--kb">
          <div class="kb">
            ${kcol('board.defaultColumns.todo', 2, ktask(c.year.steps[0].name, 'ZT', 0, { due: true, prio: 'high' }) + ktask(c.meeting.card.open, 'LB', 1, { prio: 'med' }))}
            ${kcol('board.defaultColumns.doing', 2, ktask(c.meeting.card.done, 'ZT', 2, { due: true, prio: 'high' }) + ktask(c.year.steps[1].name, 'AD', 3, { prio: 'low' }))}
            ${kcol('board.defaultColumns.done', 1, ktask(c.meeting.card.name, 'SA', 4, { done: true }))}
          </div>
        </div>
      </div>
    </div>
  </section>`;

  // Third product window: the portfolio's health, three bands and one stacked bar.
  const pfTile = (band: string, n: number, i: number) =>
    `<div class="pf__tile" data-band="${band}" data-reveal style="--i:${i}"><span class="pf__n" data-count="${n}">0</span><span class="pf__l">${esc(t(`health.band.${band}` as MessageKey))}</span></div>`;
  const portfolio = `  <section class="board">
    <div class="wrap">
      <h3 class="showcase__cap" data-reveal>${esc(c.product.portfolio)}</h3>
      <div class="app" data-reveal="app" aria-hidden="true">
        <div class="app__bar"><span class="app__dots"><i></i><i></i><i></i></span><span class="app__addr">${esc(t('nav.reports'))}</span></div>
        <div class="app__main app__main--pf">
          <div class="pf__tiles">${pfTile('risk', 2, 0)}${pfTile('watch', 3, 1)}${pfTile('good', 12, 2)}</div>
          <div class="pf__bar" data-reveal><span class="pf__seg" data-band="risk" style="--w:11.8%"></span><span class="pf__seg" data-band="watch" style="--w:17.6%"></span><span class="pf__seg" data-band="good" style="--w:70.6%"></span></div>
        </div>
      </div>
    </div>
  </section>`;

  // Fourth product window: one customer's health page — the score ring with its
  // reasons, and the account's timeline. Reasons and timeline labels come from
  // the app's own dictionaries (filled with demo values), so it localises too.
  const CIRC = 339;
  const reasons = (
    [
      ['risk', translate(locale, 'health.why.touch', { days: 38, kind: translate(locale, 'health.touchKind.review') })],
      ['risk', translate(locale, 'health.why.tasks', { n: 3 })],
      ['watch', translate(locale, 'health.why.championNone')],
    ] as const
  )
    .map(([st, text], i) => `<li data-state="${st}" data-reveal style="--i:${i}"><span>${esc(text)}</span></li>`)
    .join('');
  const tline = (
    [
      ['meeting', translate(locale, 'timeline.kind.meeting'), c.meeting.card.name, `10 ${m.month}`, false],
      ['note', translate(locale, 'timeline.kind.note'), c.meeting.card.notes, `8 ${m.month}`, false],
      ['done', '', c.meeting.card.done, `5 ${m.month}`, true],
    ] as const
  )
    .map(
      ([k, kind, text, when, done], i) =>
        `<li class="tl__ev" data-reveal style="--i:${i}"><span class="tl__dot" data-k="${k}">${done ? DONE : ''}</span><div class="tl__b">${kind ? `<span class="tl__kind">${esc(kind)}</span>` : ''}<p class="tl__txt${done ? ' is-done' : ''}">${esc(text)}</p><span class="tl__when">${esc(when)}</span></div></li>`,
    )
    .join('');
  const customer = `  <section class="board">
    <div class="wrap">
      <h3 class="showcase__cap" data-reveal>${esc(c.product.detail)}</h3>
      <div class="app app--wide" data-reveal="app" aria-hidden="true">
        <div class="app__bar"><span class="app__dots"><i></i><i></i><i></i></span><span class="app__addr">${esc(BOARD[0].name)}</span></div>
        <div class="app__main app__main--cust">
          <div class="cust__panel">
            <div class="cust__top"><span class="cust__name">${esc(BOARD[0].name)}</span><span class="cust__chip">${esc(c.hero.chips.renewal)}</span></div>
            <div class="ring" data-band="risk">
              <svg viewBox="0 0 128 128" aria-hidden="true"><circle class="ring__bg" cx="64" cy="64" r="54"/><circle class="ring__fill" cx="64" cy="64" r="54" style="--circ:${CIRC};--off:${Math.round(CIRC * 0.52)}"/></svg>
              <div class="ring__c"><span class="ring__n" data-count="48">0</span><span class="ring__l" data-band="risk">${esc(t('health.band.risk'))}</span></div>
            </div>
            <div class="why"><span class="why__h">${esc(t('health.why'))}</span><ul class="why__list">${reasons}</ul></div>
          </div>
          <div class="cust__tl"><span class="tl__h">${esc(t('timeline.title'))}</span><ul class="tl">${tline}</ul></div>
        </div>
      </div>
    </div>
  </section>`;

  // Fifth product window: a reports chart — the one visual the page still lacks.
  // Month labels come localised from Intl; the bars grow on reveal. Demo shape.
  const months = Array.from({ length: 8 }, (_, k) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (7 - k));
    return new Intl.DateTimeFormat(bcp47Of(locale), { month: 'short' }).format(d);
  });
  const heights = [34, 42, 38, 50, 54, 50, 66, 76];
  const repBars = months
    .map((mn, k) => `<div class="rep__col" data-reveal style="--i:${k}"><span class="rep__bar" style="--h:${heights[k]}%"></span><span class="rep__x">${esc(mn)}</span></div>`)
    .join('');
  const reports = `  <section class="board">
    <div class="wrap">
      <h3 class="showcase__cap" data-reveal>${esc(c.product.reports)}</h3>
      <div class="app app--wide" data-reveal="app" aria-hidden="true">
        <div class="app__bar"><span class="app__dots"><i></i><i></i><i></i></span><span class="app__addr">${esc(t('nav.reports'))}</span></div>
        <div class="app__main app__main--rep">
          <div class="rep__head"><h3>${esc(t('nav.reports'))}</h3><span class="rep__trend">▲ 18%</span></div>
          <div class="rep__chart">${repBars}</div>
        </div>
      </div>
    </div>
  </section>`;
  return `<!doctype html>
<html lang="${c.lang}" dir="${info.dir}">
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
<body>
<a class="skip" href="#main">${locale === 'tr' ? 'İçeriğe geç' : 'Skip to content'}</a>
<header class="top">
  <div class="wrap top__in">
    <a class="brand" href="${locale === 'en' ? './' : './'}">${MARK}Curahold</a>
    <nav class="top__nav" aria-label="${esc(c.nav.product)}">
      <a href="#product">${esc(c.nav.product)}</a>
      <a href="#pricing">${esc(c.nav.pricing)}</a>
      <a href="${demo}">${esc(c.nav.demo)}</a>
      <a href="${blogBaseOf(locale)}">${esc(c.footer.blog ?? siteBlog(locale).nav)}</a>
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
  <section class="wrap hero">
    <div class="hero__aura" aria-hidden="true"></div>
    <div class="hero__text">
      <h1>${esc(c.hero.title)}</h1>
      <p class="hero__lead">${esc(c.hero.lead)}</p>
      <div class="hero__ctas">
        <a class="btn btn--primary btn--big" href="${signup}">${esc(c.hero.primary)}</a>
        <a class="btn btn--ghost btn--big" href="${demo}">${esc(c.hero.secondary)}</a>
      </div>
      <p class="hero__note">${esc(c.hero.note)}</p>
    </div>
    <figure class="hold" aria-label="${esc(`${c.hero.customer}: ${Object.values(c.hero.chips).join('; ')}`)}">
      <svg class="hold__arc" viewBox="0 0 420 420" aria-hidden="true"><path d="M319.3 79.8A170 170 0 1 0 319.3 340.2"/></svg>
      <div class="hold__customer" aria-hidden="true"><span class="hold__dot"></span><span class="hold__name">${esc(c.hero.customer)}</span></div>
      <ul class="hold__chips" aria-hidden="true">${chips}</ul>
    </figure>
  </section>

  <section class="strip" aria-label="${esc(c.tools.marquee)}">
    <div class="wrap"><p class="strip__label" data-reveal>${esc(c.tools.marquee)}</p></div>
    <div class="marq" aria-hidden="true"><div class="marq__track">${INTEGRATIONS.map((n) => `<span class="marq__item">${esc(n)}</span>`).join('')}${INTEGRATIONS.map((n) => `<span class="marq__item">${esc(n)}</span>`).join('')}</div></div>
  </section>

${showcase}

${customer}

  <section class="year" id="product">
    <div class="wrap">
      <h2 data-reveal>${esc(c.year.title)}</h2>
      <p class="lead" data-reveal>${esc(c.year.lead)}</p>
      <ol class="year__steps">${steps}</ol>
    </div>
  </section>

  <section class="band">
    <div class="wrap band__in">
      <div class="band__text" data-reveal>
        <h2>${esc(c.meeting.title)}</h2>
        <p>${esc(c.meeting.text)}</p>
      </div>
      <div class="meetflow" aria-hidden="true">
        <div class="mcard" data-reveal="card">
          <div class="mcard__date"><span class="mcard__day">${esc(m.day)}</span><span class="mcard__month">${esc(m.month)}</span></div>
          <div class="mcard__main">
            <div class="mcard__head"><span class="mcard__kind">${esc(m.kind)}</span><span class="mcard__name">${esc(m.name)}</span></div>
            <p class="mcard__who"><span>${esc(m.ours)}</span><span>${esc(m.theirs)}</span></p>
            <p class="mcard__notes">${esc(m.notes)}</p>
          </div>
        </div>
        <div class="flowarrow" data-reveal><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v14M6 12.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <div class="tasks">
          <span class="tasks__h">${esc(m.steps)}</span>
          <div class="tcard" data-reveal style="--i:0"><span class="tcard__box" data-done>${DONE}</span><div class="tcard__b"><p class="tcard__t is-done">${esc(m.done)}</p><span class="tcard__f"><span class="tcard__ava">ZT</span>${DUE}</span></div></div>
          <div class="tcard" data-reveal style="--i:1"><span class="tcard__box">${OPEN}</span><div class="tcard__b"><p class="tcard__t">${esc(m.open)}</p><span class="tcard__f"><span class="tcard__ava">LB</span>${esc(m.openWho)}</span></div></div>
        </div>
      </div>
    </div>
  </section>

${kanban}

${reports}

  <section class="tools">
    <div class="wrap">
      <h2 data-reveal>${esc(c.tools.title)}</h2>
      <p class="lead" data-reveal>${esc(c.tools.lead)}</p>
      <dl class="tools__list">${tools}</dl>
      <p class="tools__none">${esc(c.tools.none)}</p>
    </div>
  </section>

${portfolio}

  <section class="pricing" id="pricing">
    <div class="wrap">
      <h2 data-reveal>${esc(c.pricing.title)}</h2>
      <p class="lead" data-reveal>${esc(c.pricing.lead)}</p>
      <div class="pricing__switch" role="group" data-reveal aria-label="${esc(c.nav.pricing)}">
        <button type="button" data-interval="month" aria-pressed="false">${esc(c.pricing.monthly)}</button>
        <button type="button" data-interval="year" aria-pressed="true">${esc(c.pricing.yearly)}<small>${esc(c.pricing.save)}</small></button>
      </div>
      <div class="plans" data-reveal>${plan('team')}${plan('business')}</div>
      <p class="pricing__fine">${esc(c.pricing.fine)}</p>
    </div>
  </section>

  <section class="faq">
    <div class="wrap">
      <h2 data-reveal>${esc(c.faq.title)}</h2>
      <div class="faq__list">${faq}</div>
    </div>
  </section>
</main>
${footerHtml(locale)}
<dialog class="signin" id="signin" data-base="${esc(BASE_DOMAIN)}" aria-labelledby="signin-title">
  <form>
    <h2 id="signin-title">${esc(c.signIn.title)}</h2>
    <p>${esc(c.signIn.text)}</p>
    <label class="signin__field"><input name="slug" autocomplete="organization" spellcheck="false" aria-label="${esc(c.signIn.label)}" placeholder="${locale === 'tr' ? 'sirketin' : 'yourcompany'}" required><span>.${esc(BASE_DOMAIN)}</span></label>
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
const OG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#17133a"/><g transform="translate(96,206)"><rect width="120" height="120" rx="28" fill="#241f52"/><path d="M86 34A45 45 0 1 0 86 86" fill="none" stroke="#eceafe" stroke-width="11" stroke-linecap="round"/><circle cx="60" cy="60" r="12" fill="#3fb596"/></g><text x="240" y="302" font-family="'Bricolage Grotesque','Figtree',sans-serif" font-size="94" font-weight="700" fill="#ffffff">Curahold</text><text x="98" y="436" font-family="'Figtree',sans-serif" font-size="38" fill="#a8a3d8">Task management for customer success and account teams</text></svg>`;
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
