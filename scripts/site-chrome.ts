// The parts every page of the sales site shares, whichever version it is (classic,
// concept A, concept C, the inner pages, the blog): the informative sticky header
// with its mega menu, and the "Why Curahold" block. Styles: site/chrome.css;
// behaviour: site/chrome.js. Words: site/info/<locale>.ts.
import { LOCALE_INFO, bcp47Of } from '../shared/src/i18n';
import { MARK } from '../site/brand';
import { SITE_LOCALES, type SiteLocale } from '../site/content';
import { infoCopy } from '../site/info';
import type { DeptKey, FeatureKey, IntegrationGroup } from '../site/info/types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** English at the root, every other language under /<locale>/. */
export const localeBase = (locale: SiteLocale) => (locale === 'en' ? '/' : `/${locale}/`);

/** Where each inner page lives under a language's base. Slugs are the same in every language. */
export const DEPT_SLUG: Record<DeptKey, string> = { sales: 'sales', success: 'customer-success', product: 'product', finance: 'finance' };
export const FEATURE_SLUG: Record<FeatureKey, string> = {
  health: 'health-score', meetings: 'meetings', sprints: 'boards-and-sprints', portal: 'customer-portal',
  renewals: 'renewals-and-automations', assistant: 'ai-connector', reports: 'reports', sync: 'two-way-sync',
};
export const DEPTS: DeptKey[] = ['sales', 'success', 'product', 'finance'];
export const FEATURES: FeatureKey[] = ['health', 'meetings', 'sprints', 'portal', 'renewals', 'assistant', 'reports', 'sync'];
/** What is not shipped yet carries the "Coming soon" label wherever it appears. */
export const SOON_DEPTS = new Set<DeptKey>(['finance']);
export const PAGE = {
  why: 'why/', about: 'about/', pricing: 'pricing/', faq: 'faq/', trust: 'trust/', integrations: 'integrations/', solutions: 'solutions/',
  dept: (k: DeptKey) => `teams/${DEPT_SLUG[k]}/`,
  feature: (k: FeatureKey) => `features/${FEATURE_SLUG[k]}/`,
  ai: 'ai/', orbit: 'orbit/',
};

/**
 * The integrations, by group, with the names as each vendor writes them (never
 * translated). Only connectors the product has; `soon` groups are built but not
 * yet published, and are labelled so.
 */
export const INTEGRATION_GROUPS: { key: IntegrationGroup; names: string[]; soon?: boolean }[] = [
  { key: 'crm', names: ['Salesforce', 'HubSpot', 'Dynamics 365', 'Pipedrive', 'Zoho CRM', 'Bitrix24', 'Freshsales', 'Zendesk Sell'] },
  { key: 'chat', names: ['Slack', 'Microsoft Teams', 'Google Chat'] },
  { key: 'support', names: ['Zendesk', 'Freshdesk', 'Intercom', 'Jira Service Management', 'Front'] },
  { key: 'mail', names: ['Gmail', 'Outlook'] },
  { key: 'sheets', names: ['Google Sheets', 'Excel'] },
  { key: 'data', names: ['Google BigQuery', 'Snowflake', 'Segment'] },
  { key: 'dev', names: ['Jira'] },
  { key: 'ai', names: ['Claude', 'ChatGPT'] },
  { key: 'signin', names: ['Google', 'Microsoft', 'SAML 2.0', 'OpenID Connect', 'SCIM'] },
  { key: 'api', names: ['REST API', 'Webhooks'] },
  { key: 'automation', names: ['Zapier', 'Make'], soon: true },
  { key: 'accounting', names: [], soon: true },
];

// Small line glyphs, drawn for Curahold (16 × 16, currentColor).
const g = (d: string) => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const GLYPH: Record<DeptKey | FeatureKey | 'help' | 'developers' | 'releases' | 'trust' | 'blog' | 'faq' | 'why' | 'about', string> = {
  sales: g('M2 12.5l4-4 3 2.5 5-6M10.5 5H14v3.5'),
  success: g('M2 8.5h2.6l1.6-3.5 2.8 6.5 1.6-3H14'),
  product: g('M8 2.2l5.6 3L8 8.2 2.4 5.2zM2.4 8.2L8 11.2l5.6-3M2.4 11.1L8 14l5.6-2.9'),
  finance: g('M8 2v12M11.2 4.6C10.6 3.6 9.4 3 8 3 6.2 3 5 4 5 5.3c0 3.2 6.2 1.8 6.2 5.2C11.2 11.9 9.8 13 8 13c-1.5 0-2.8-.6-3.4-1.8'),
  health: g('M8 13.6S2.4 10.2 2.4 6.1A2.9 2.9 0 0 1 8 4.8a2.9 2.9 0 0 1 5.6 1.3c0 4.1-5.6 7.5-5.6 7.5z'),
  meetings: g('M3 3.8h10a.8.8 0 0 1 .8.8v8.2a.8.8 0 0 1-.8.8H3a.8.8 0 0 1-.8-.8V4.6a.8.8 0 0 1 .8-.8zM2.2 6.8h11.6M5.2 2.4v2.6M10.8 2.4v2.6M5.4 9.8l1.6 1.4 3-3'),
  sprints: g('M2.6 2.6h3.2v10.8H2.6zM6.4 2.6h3.2v7H6.4zM10.2 2.6h3.2v4.4h-3.2z'),
  portal: g('M4 14V2.6h8V14M2.4 14h11.2M9.6 8.4v.2'),
  renewals: g('M13 6.2A5.2 5.2 0 0 0 3.4 5M3 9.8A5.2 5.2 0 0 0 12.6 11M3.2 2.4v2.8H6M12.8 13.6v-2.8H10'),
  assistant: g('M8 1.8l1.4 4 4 1.4-4 1.4-1.4 4-1.4-4-4-1.4 4-1.4zM13 11.4l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z'),
  reports: g('M2.4 13.6h11.2M4 11V7.4M7 11V4M10 11V8.6M13 11V5.6'),
  sync: g('M2.6 5.6h9.6l-2.4-2.4M13.4 10.4H3.8l2.4 2.4'),
  help: g('M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM6.2 6.2a1.9 1.9 0 0 1 3.6.8c0 1.3-1.8 1.6-1.8 2.8M8 11.6v.1'),
  developers: g('M5.4 4.4L2 8l3.4 3.6M10.6 4.4L14 8l-3.4 3.6M9.2 3L6.8 13'),
  releases: g('M2.4 2.4h5.4l5.8 5.8-5.4 5.4-5.8-5.8zM5.4 5.4v.1'),
  trust: g('M8 1.8l5.4 2v4.1c0 3.2-2.3 5.4-5.4 6.3-3.1-.9-5.4-3.1-5.4-6.3V3.8zM5.6 8l1.7 1.7L10.6 6.4'),
  blog: g('M10.6 2.6l2.8 2.8-7.8 7.8H2.8v-2.8zM9 4.2L11.8 7'),
  faq: g('M2.6 3h10.8v7.6H8.2L5 13.4v-2.8H2.6z'),
  why: g('M8 2v3M8 11v3M2 8h3M11 8h3M8 6.2A1.8 1.8 0 1 0 8 9.8 1.8 1.8 0 0 0 8 6.2z'),
  about: g('M8 7.2A2.6 2.6 0 1 0 8 2a2.6 2.6 0 0 0 0 5.2zM3 14c.5-2.6 2.6-4.4 5-4.4s4.5 1.8 5 4.4'),
};
const CARET = `<svg class="hx__caret" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.6L6 7.6l3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SPARK = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l1.5 4.4L14 7.5 9.5 9.1 8 13.5 6.5 9.1 2 7.5l4.5-1.6z" fill="currentColor"/></svg>`;
const GLOBE = `<svg class="hx__globe" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.2A6.2 6.2 0 1 0 8 1.8a6.2 6.2 0 0 0 0 12.4zM1.8 8h12.4M8 1.8c1.7 1.8 2.5 3.9 2.5 6.2S9.7 12.4 8 14.2M8 1.8C6.3 3.6 5.5 5.7 5.5 8s.8 4.4 2.5 6.2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>`;
const BACK = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.6 8h10.8M6.4 4.2L2.6 8l3.8 3.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export type Version = 'classic' | 'a' | 'c';

export interface HeaderOpts {
  locale: SiteLocale;
  /** This page's path under the language base ('' for the landing page, 'why/' …): language links keep it. */
  page: string;
  /** Which version of the site this page belongs to: the switch points to the other one. */
  version: Version;
  /** The page's path for a given language, when it is not simply the same path (the blog). */
  langPath?: (l: SiteLocale) => string;
  /** Which animated version the classic site's switch opens. */
  aiVersion: Exclude<Version, 'classic'>;
  urls: { trial: string; demo: string; docs: string; devDocs: string; releases: string; blog: string; quickstart: string; selfHost: string; legal: string; contact: string };
  /** The newest release note, for the Resources panel (languages with release notes only). */
  news?: { when: string; title: string };
  /** A page with a sign-in dialog of its own opens it; elsewhere the link goes to the landing page's. */
  signIn: string;
}

/** The informative sticky header with its mega menu, on every page of every version. */
export function headerHtml(o: HeaderOpts): string {
  const n = infoCopy(o.locale).nav;
  const c = infoCopy(o.locale);
  const base = localeBase(o.locale);
  const href = (p: string) => `${base}${p}`;
  const soon = `<span class="hx__soon">${esc(n.soon)}</span>`;
  const item = (url: string, glyph: string, name: string, line: string, isSoon = false) =>
    `<li><a class="hx__link" href="${esc(url)}"${url === href(o.page) ? ' aria-current="page"' : ''}><span class="hx__ic">${glyph}</span><span class="hx__tx"><b>${esc(name)}${isSoon ? soon : ''}</b><small>${esc(line)}</small></span></a></li>`;
  const plain = (url: string, name: string, line: string) =>
    `<li><a class="hx__link hx__link--plain" href="${esc(url)}"><span class="hx__tx"><b>${esc(name)}</b><small>${esc(line)}</small></span></a></li>`;
  const panel = (id: string, label: string, body: string, layout: string) =>
    `<li class="hx__item"><button class="hx__top" type="button" aria-expanded="false" aria-controls="hx-${id}">${esc(label)}${CARET}</button><div class="hx__panel hx__panel--${layout}" id="hx-${id}"><div class="hx__pin">${body}</div></div></li>`;
  const col = (title: string, list: string, cls = '') => `<div class="hx__col${cls}"><p class="hx__h">${esc(title)}</p><ul>${list}</ul></div>`;
  const feat = (title: string, text: string, extra: string) => `<div class="hx__feat"><p class="hx__fh">${esc(title)}</p><p>${esc(text)}</p>${extra}</div>`;

  const product = panel(
    'product',
    n.product,
    col(n.departments, DEPTS.map((k) => item(href(PAGE.dept(k)), GLYPH[k], c.depts[k].name, c.depts[k].short, SOON_DEPTS.has(k))).join('')) +
      col(n.features, FEATURES.map((k) => item(href(PAGE.feature(k)), GLYPH[k], c.features[k].name, c.features[k].short)).join(''), ' hx__col--two') +
      feat(n.featured.title, n.featured.text, `<a class="hx__btn hx__btn--solid" href="${esc(o.urls.demo)}" data-ab="demo">${esc(n.demo)}</a>`),
    'product',
  );
  const group = (title: string, id: string, list: [string, string][]) => col(title, list.map(([h, p], i) => plain(`${href(PAGE.solutions)}#${id}-${i + 1}`, h, p)).join(''));
  const solutions = panel(
    'solutions',
    n.solutions,
    `<div class="hx__stack">${group(n.byRole, 'role', c.solutions.roles)}${group(n.bySize, 'size', c.solutions.sizes)}</div>` +
      `<div class="hx__stack">${group(n.byIndustry, 'industry', c.solutions.industries)}${group(n.byRegion, 'region', c.solutions.regions)}</div>` +
      feat(n.trialCard.title, n.trialCard.text, `<a class="hx__btn hx__btn--solid" href="${esc(o.urls.trial)}" data-ab="go">${esc(n.tryFree)}</a>`),
    'wide',
  );
  const integrations = panel(
    'integrations',
    n.integrations,
    `<div class="hx__col hx__col--grid"><ul>${INTEGRATION_GROUPS.map(({ key, names, soon: s }) => {
      const gr = c.integrations.groups[key];
      return `<li><a class="hx__link hx__link--plain" href="${href(PAGE.integrations)}#${key}"><span class="hx__tx"><b>${esc(gr.name)}${s ? soon : ''}</b><small>${esc(names.length ? names.slice(0, 4).join(', ') + (names.length > 4 ? '…' : '') : gr.text)}</small></span></a></li>`;
    }).join('')}</ul><a class="hx__more" href="${href(PAGE.integrations)}">${esc(n.allIntegrations)}</a></div>` +
      feat(n.apiCard.title, n.apiCard.text, `<a class="hx__more" href="${esc(o.urls.devDocs)}">${esc(n.developers[0])}</a>`),
    'grid',
  );
  const news = o.news ? `<p class="hx__news"><time>${esc(o.news.when)}</time>${esc(o.news.title)}</p>` : '';
  const resources = panel(
    'resources',
    n.resources,
    col(n.learn, [item(o.urls.docs, GLYPH.help, ...n.help), item(o.urls.quickstart, GLYPH.releases, ...n.quickstart), item(o.urls.blog, GLYPH.blog, ...n.blog), item(href(PAGE.faq), GLYPH.faq, ...n.faq)].join('')) +
      `<div class="hx__stack">${col(n.build, [item(o.urls.devDocs, GLYPH.developers, ...n.developers), item(o.urls.selfHost, GLYPH.product, ...n.selfHost)].join(''))}${col(n.trustGroup, [item(href(PAGE.trust), GLYPH.trust, ...n.trust), item(o.urls.legal, GLYPH.about, ...n.legal)].join(''))}</div>` +
      feat(n.news, n.releases[1], `${news}<a class="hx__more" href="${esc(o.urls.releases)}">${esc(n.releases[0])}</a>`),
    'wide',
  );
  const why = panel(
    'why',
    n.why,
    `<div class="hx__col"><ul>${[
      item(href(PAGE.why), GLYPH.why, ...n.whyShort),
      item(`${href(PAGE.why)}#vs`, GLYPH.sync, ...n.differ),
      item(href(PAGE.trust), GLYPH.trust, ...n.trust),
      item(href(PAGE.about), GLYPH.about, n.about, n.aboutShort),
      item(o.urls.contact, GLYPH.faq, ...n.contact),
    ].join('')}</ul></div>` + `<div class="hx__feat"><ul class="hx__facts">${n.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>`,
    'small',
  );
  const direct = (p: string, label: string) => `<li class="hx__item"><a class="hx__top" href="${href(p)}"${o.page === p ? ' aria-current="page"' : ''}>${esc(label)}</a></li>`;

  // The version switch: classic → the chosen animated version; either animated version → classic.
  const toAi = o.version === 'classic';
  const switchHref = toAi ? href(o.aiVersion === 'a' ? PAGE.ai : PAGE.orbit) : base;
  const switchBtn = `<a class="hx__switch" href="${switchHref}" data-ab="switch"${toAi ? '' : ' data-back'}>${toAi ? SPARK : BACK}<span>${esc(toAi ? n.toAi : n.toClassic)}</span></a>`;

  const path = o.langPath ?? (() => o.page);
  const langs = SITE_LOCALES.map((l) => `<a href="${localeBase(l)}${path(l)}" hreflang="${bcp47Of(l)}" lang="${bcp47Of(l)}"${l === o.locale ? ' aria-current="true"' : ''}>${esc(LOCALE_INFO[l].name)}</a>`).join('');
  const lang = `<details class="hx__lang"><summary aria-label="${esc(n.language)}: ${esc(LOCALE_INFO[o.locale].name)}">${GLOBE}<span>${esc(LOCALE_INFO[o.locale].name)}</span>${CARET}</summary><div class="hx__langs">${langs}</div></details>`;
  // On the animated versions the product is the primary action ("Go to the product"); on the classic site it is the free trial.
  const primary = o.version === 'classic' ? n.tryFree : n.go;

  return `<header class="hx${o.version === 'classic' ? '' : ' hx--fixed'}" data-hx>
  <div class="hx__bar">
    <a class="hx__brand" href="${base}">${MARK}<span>Curahold</span></a>
    <div class="hx__menu" id="hx-menu">
      <nav class="hx__nav" aria-label="${esc(n.menu)}">
        <ul class="hx__list">${product}${solutions}${integrations}${resources}${direct(PAGE.pricing, n.pricing)}${why}</ul>
      </nav>
      <div class="hx__end">
        ${switchBtn}
        ${lang}
        <a class="hx__signin" href="${esc(o.signIn)}" data-signin>${esc(n.signIn)}</a>
        <a class="hx__btn hx__btn--ghost" href="${esc(o.urls.demo)}" data-ab="demo">${esc(n.demo)}</a>
        <a class="hx__btn hx__btn--solid" href="${esc(o.urls.trial)}" data-ab="go">${esc(primary)}</a>
      </div>
    </div>
    <div class="hx__quick">
      <a class="hx__btn hx__btn--solid" href="${esc(o.urls.trial)}" data-ab="go">${esc(primary)}</a>
      ${o.version === 'classic' ? '' : `<a class="hx__btn hx__btn--ghost" href="${esc(o.urls.demo)}" data-ab="demo">${esc(n.demo)}</a>`}
      <button class="hx__burger" type="button" aria-expanded="false" aria-controls="hx-menu" aria-label="${esc(n.menu)}" data-close-label="${esc(n.close)}"><i></i><i></i><i></i></button>
    </div>
  </div>
</header>
<script>innerWidth<1240&&document.currentScript.previousElementSibling.classList.add('is-compact')</script>`;
}

/** "Why Curahold?": a strong line, six proof cards that each link to the page that shows it, and who it is for. */
export function whyHtml(locale: SiteLocale, opts: { headingLevel: 1 | 2; urls: { trial: string; demo: string }; compact?: boolean }): string {
  const c = infoCopy(locale);
  const w = c.why;
  const base = localeBase(locale);
  const links = [PAGE.dept('success'), PAGE.feature('meetings'), PAGE.feature('health'), `${PAGE.solutions}#region-1`, PAGE.trust, PAGE.integrations];
  const icons = [GLYPH.product, GLYPH.meetings, GLYPH.health, GLYPH.why, GLYPH.trust, GLYPH.sync];
  const h = opts.headingLevel === 1 ? 'h1' : 'h2';
  const cards = w.proofs
    .map(([t, p, l], i) => `<li class="wy__card"><span class="wy__ic">${icons[i]}</span><h3>${esc(t)}</h3><p>${esc(p)}</p><a href="${base}${links[i]}">${esc(l)}</a></li>`)
    .join('');
  const contrast = `<div class="wy__vs" id="vs"><p class="wy__vsh">${esc(w.contrastTitle)}</p><div class="wy__cols"><ul class="wy__before">${w.before.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><ul class="wy__after">${w.after.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`;
  const forWho = `<ul class="wy__who">${w.forWho.map((x, i) => `<li><a href="${base}${PAGE.dept(DEPTS[i])}">${GLYPH[DEPTS[i]]}<span>${esc(x)}</span></a></li>`).join('')}</ul>`;
  return `<section class="wy${opts.compact ? ' wy--compact' : ''}" id="why" aria-labelledby="why-title">
  <div class="wy__wrap">
    <${h} id="why-title">${esc(w.title)}</${h}>
    <p class="wy__lead">${esc(w.lead)}</p>
    <ul class="wy__grid">${cards}</ul>
    ${contrast}
    ${forWho}
    <div class="wy__ctas"><a class="hx__btn hx__btn--solid hx__btn--big" href="${esc(opts.urls.trial)}" data-ab="go">${esc(c.nav.go)}</a><a class="hx__btn hx__btn--ghost hx__btn--big" href="${esc(opts.urls.demo)}" data-ab="demo">${esc(c.nav.demo)}</a></div>
  </div>
</section>`;
}
