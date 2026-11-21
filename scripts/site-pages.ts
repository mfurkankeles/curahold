// The inner pages the header's menu points to, so no menu item is a dead end:
// a page per team and per feature, solutions, integrations, pricing, questions,
// security and privacy, "Why Curahold" and About. Each returns the page's <main>;
// scripts/build-site.ts wraps it in the shared head, header, footer and consent.
import { siteCopy, type SiteLocale } from '../site/content';
import { infoCopy } from '../site/info';
import type { DeptKey, FeatureKey, Point } from '../site/info/types';
import { DEPTS, FEATURES, GLYPH, ICON_BACK, INTEGRATION_GROUPS, PAGE, SOON_DEPTS, ctaPair, flowHtml, localeBase, whyHtml } from './site-chrome';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface PageUrls {
  trial: string;
  demo: string;
  docs: string;
  devDocs: string;
  contact: string;
  legal: (slug: string) => string;
}

/** The pricing page's blocks, built where the prices are (scripts/build-site.ts). */
export interface PricingParts {
  plans: string;
  compare: string;
  faq: string;
  /** schema.org offers for the page at `url`. */
  offers: (url: string) => object;
  /** Fills {team} and {business} in a sentence with the yearly seat prices. */
  fill: (s: string) => string;
  /** schema.org FAQPage for a list of questions. */
  faqLd: (items: { q: string; a: string }[]) => object;
}

export interface InnerPage {
  /** Path under the language base, e.g. 'teams/sales/'. */
  path: string;
  title: string;
  description: string;
  /** The page's name in the breadcrumb. */
  crumb: string;
  main: string;
  /** Extra schema.org nodes for the page, given its canonical address. */
  ld?: (url: string) => object[];
}

const RELATED: Record<DeptKey, FeatureKey[]> = {
  inside: ['meetings', 'sync', 'reports'],
  sales: ['renewals', 'reports', 'sync'],
  onboarding: ['renewals', 'portal', 'health'],
  success: ['health', 'meetings', 'portal'],
  product: ['sprints', 'meetings', 'sync'],
  finance: ['reports', 'health', 'sync'],
};

/** An inner page's header: the Back crumb, its title and lead, and (unless compact) the two calls to action. */
/** The Back link every opened page starts with (owner rule: Back on every page, same place): home by default. */
export function backLink(locale: SiteLocale, href = localeBase(locale), label = infoCopy(locale).common.home): string {
  return `<a class="ip__back" href="${esc(href)}">${ICON_BACK}<span>${esc(label)}</span></a>`;
}

/** The Back bar for a page without the inner-page hero (/why/): the same crumbs, in the same place. */
function backBar(locale: SiteLocale, crumb: string): string {
  const c = infoCopy(locale);
  return `<div class="wrap ip__bar"><nav class="ip__crumbs" aria-label="${esc(c.common.home)}">${backLink(locale)}<span aria-hidden="true">/</span><span>${esc(crumb)}</span></nav></div>`;
}

export function hero(locale: SiteLocale, o: { crumb?: string; title: string; lead: string; glyph?: string; soon?: boolean; urls: PageUrls; compact?: boolean }): string {
  const c = infoCopy(locale);
  // The first crumb is the page's Back, in the same place on every inner page.
  const crumbs = `<nav class="ip__crumbs" aria-label="${esc(c.common.home)}">${backLink(locale)}${o.crumb ? `<span aria-hidden="true">/</span><span>${esc(o.crumb)}</span>` : ''}</nav>`;
  return `<header class="ip__hero${o.compact ? ' ip__hero--compact' : ''}">
    <div class="wrap">
      ${crumbs}
      ${o.glyph ? `<span class="ip__glyph">${o.glyph}</span>` : ''}
      <h1>${esc(o.title)}${o.soon ? ` <span class="ip__soon">${esc(c.nav.soon)}</span>` : ''}</h1>
      <p class="ip__lead">${esc(o.lead)}</p>
      ${o.compact ? '' : `<div class="ip__ctas">${ctaPair(locale, o.urls)}</div>`}
    </div>
  </header>${o.compact ? '' : '<!--fold-->'}`;
}

/** A ruled list of claims: the heading on one side, its sentence on the other. */
const points = (list: Point[], cls = '') =>
  `<ul class="ip__points${cls}">${list.map(([h, p]) => `<li><h2>${esc(h)}</h2><p>${esc(p)}</p></li>`).join('')}</ul>`;

/** The closing call to action every inner page ends with. */
export function closing(locale: SiteLocale, urls: PageUrls): string {
  const c = infoCopy(locale);
  return `<section class="cta">
    <div class="wrap">
      <div class="cta__card">
        <div class="cta__sky" aria-hidden="true"></div>
        <h2>${esc(c.common.ctaTitle)}</h2>
        <p>${esc(c.common.ctaText)}</p>
        <div class="cta__row">${ctaPair(locale, urls)}</div>
      </div>
    </div>
  </section>`;
}

function featureLinks(locale: SiteLocale, title: string, keys: FeatureKey[]): string {
  const c = infoCopy(locale);
  const base = localeBase(locale);
  return `<section class="ip__rel"><div class="wrap"><h2>${esc(title)}</h2><ul>${keys
    .map((k) => `<li><a href="${base}${PAGE.feature(k)}"><span class="hx__ic">${GLYPH[k]}</span><span><b>${esc(c.features[k].name)}</b><small>${esc(c.features[k].short)}</small></span></a></li>`)
    .join('')}</ul></div></section>`;
}

/** Every inner page of one language. `pricing` carries the pricing page's blocks and schema. */
export function innerPages(locale: SiteLocale, urls: PageUrls, pricing: PricingParts): InnerPage[] {
  const c = infoCopy(locale);
  const s = siteCopy(locale);
  const base = localeBase(locale);
  const out: InnerPage[] = [];

  for (const k of DEPTS) {
    const d = c.depts[k];
    out.push({
      path: PAGE.dept(k),
      title: c.seo[k][0],
      crumb: d.name,
      description: c.seo[k][1],
      main: `${hero(locale, { crumb: d.name, title: d.title, lead: d.lead, glyph: GLYPH[k], soon: SOON_DEPTS.has(k), urls })}
  <section class="ip__body"><div class="wrap">${points(d.next ? [...d.points, d.next] : d.points)}<p class="ip__who"><b>${esc(c.common.forWho)}</b> ${esc(d.forWho)}</p>${flowHtml(locale, k)}</div></section>
  ${featureLinks(locale, c.common.uses, RELATED[k])}
  ${closing(locale, urls)}`,
    });
  }
  for (const k of FEATURES) {
    const f = c.features[k];
    const others = FEATURES.filter((x) => x !== k);
    const i = FEATURES.indexOf(k);
    out.push({
      path: PAGE.feature(k),
      title: c.seo[k][0],
      crumb: f.name,
      description: c.seo[k][1],
      main: `${hero(locale, { crumb: f.name, title: f.title, lead: f.lead, glyph: GLYPH[k], urls })}
  <section class="ip__body"><div class="wrap">${points(f.points)}</div></section>
  ${featureLinks(locale, c.common.related, [others[i % others.length], others[(i + 2) % others.length], others[(i + 4) % others.length]])}
  ${closing(locale, urls)}`,
    });
  }

  const so = c.solutions;
  const group = (id: string, title: string, list: Point[]) =>
    `<section class="ip__group"><div class="wrap"><h2 class="ip__gh">${esc(title)}</h2><ul class="ip__tiles">${list.map(([h, p], i) => `<li id="${id}-${i + 1}"><h3>${esc(h)}</h3><p>${esc(p)}</p></li>`).join('')}</ul></div></section>`;
  out.push({
    path: PAGE.solutions,
    title: c.seo.solutions[0],
    crumb: c.nav.solutions,
    description: c.seo.solutions[1],
    main: `${hero(locale, { crumb: c.nav.solutions, title: so.title, lead: so.lead, urls })}
  ${group('role', c.nav.byRole, so.roles)}
  ${group('size', c.nav.bySize, so.sizes)}
  ${group('industry', c.nav.byIndustry, so.industries)}
  ${group('region', c.nav.byRegion, so.regions)}
  ${closing(locale, urls)}`,
  });

  const ig = c.integrations;
  const groups = INTEGRATION_GROUPS.map(({ key, names, soon }) => {
    const gr = ig.groups[key];
    return `<li id="int-${key}" class="ip__int"><h2>${esc(gr.name)}${soon ? ` <span class="ip__soon">${esc(c.nav.soon)}</span>` : ''}</h2><p>${esc(gr.text)}</p>${names.length ? `<ul class="ip__names">${names.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</li>`;
  }).join('');
  out.push({
    path: PAGE.integrations,
    title: c.seo.integrations[0],
    crumb: c.nav.integrations,
    description: c.seo.integrations[1],
    main: `${hero(locale, { crumb: c.nav.integrations, title: ig.title, lead: ig.lead, urls })}
  <section class="ip__body"><div class="wrap"><ul class="ip__ints">${groups}</ul>
    <div class="ip__note"><h2>${esc(ig.missing[0])}</h2><p>${esc(ig.missing[1])}</p><a href="${esc(urls.devDocs)}">${esc(c.nav.developers[0])}</a></div></div></section>
  ${closing(locale, urls)}`,
  });

  out.push({
    path: PAGE.pricing,
    title: c.seo.pricing[0],
    crumb: c.pricingPage.title,
    description: pricing.fill(c.seo.pricing[1]),
    // Prices in the first screen at 1440 × 900: a compact header (no buttons: each plan has its own), then the plans.
    main: `${hero(locale, { crumb: c.pricingPage.title, title: c.pricingPage.title, lead: c.pricingPage.lead, urls, compact: true })}
  ${pricing.plans}
  ${pricing.compare}
  <!--fold-->
  ${pricing.faq}
  <section class="ip__body"><div class="wrap"><h2 class="ip__gh">${esc(c.pricingPage.dontTitle)}</h2>${points(c.pricingPage.dont, ' ip__points--dont')}</div></section>
  ${closing(locale, urls)}`,
    ld: (url) => [pricing.offers(url), pricing.faqLd(c.pricingPage.faq)],
  });

  const faqItems = [...s.faq.items, ...c.faqPage.more];
  const faqs = faqItems.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('');
  out.push({
    path: PAGE.faq,
    title: c.seo.faq[0],
    crumb: c.faqPage.title,
    description: c.seo.faq[1],
    main: `${hero(locale, { crumb: c.faqPage.title, title: c.faqPage.title, lead: c.faqPage.lead, urls })}
  <section class="faq calm"><div class="wrap faq__in"><div class="faq__list">${faqs}</div></div></section>
  ${closing(locale, urls)}`,
    // The landing page shows some of these too; only this page marks them up, as search engines ask.
    ld: () => [pricing.faqLd(faqItems)],
  });

  const docs: [string, string][] = [
    [s.footer.links.privacy, urls.legal('privacy')],
    [s.footer.links.kvkk, urls.legal('kvkk')],
    [s.footer.links.dpa, urls.legal('dpa')],
    [s.footer.links.subprocessors, urls.legal('subprocessors')],
    [s.footer.links.cookies, urls.legal('cookies')],
    [s.footer.links.accessibility, urls.legal('accessibility')],
    [s.footer.links.terms, urls.legal('terms')],
    [s.footer.links.refunds, urls.legal('refunds')],
    [s.footer.links.sla, urls.legal('sla')],
    [s.footer.links.aup, urls.legal('aup')],
    [s.footer.links.orderForm, urls.legal('order-form')],
    [s.footer.links.disclosure, `${urls.docs}responsible-disclosure/`],
  ];
  out.push({
    path: PAGE.trust,
    title: c.seo.trust[0],
    crumb: c.trust.title,
    description: c.seo.trust[1],
    main: `${hero(locale, { crumb: c.trust.title, title: c.trust.title, lead: c.trust.lead, glyph: GLYPH.trust, urls })}
  <section class="ip__body"><div class="wrap">${points(c.trust.points)}
    <div class="ip__note" id="legal"><h2>${esc(s.footer.legal)}</h2><ul class="ip__docs">${docs.map(([n, u]) => `<li><a href="${esc(u)}">${esc(n)}</a></li>`).join('')}</ul>
    <p><a href="${esc(urls.contact)}">${esc(c.trust.pack)}</a></p></div></div></section>
  ${closing(locale, urls)}`,
  });

  out.push({
    path: PAGE.why,
    title: c.seo.why[0],
    crumb: c.why.title,
    description: c.seo.why[1],
    main: `${backBar(locale, c.why.title)}${whyHtml(locale, { headingLevel: 1, urls })}`,
  });

  out.push({
    path: PAGE.about,
    title: c.seo.about[0],
    crumb: c.about.title,
    description: c.seo.about[1],
    main: `<p class="ip__review" role="note">${esc(c.about.review)}</p>
  ${hero(locale, { crumb: c.nav.about, title: c.about.title, lead: c.about.lead, urls })}
  <section class="ip__body"><div class="wrap">${points(c.about.points)}<p class="ip__who"><a href="${base}${PAGE.why}">${esc(c.why.title)}</a></p></div></section>
  ${closing(locale, urls)}`,
  });
  return out;
}
