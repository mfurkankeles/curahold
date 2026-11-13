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
import { PLANS, PRICE_CURRENCY, TRIAL_DAYS, type PlanKey } from '../shared/src/billing';
import { translate, LOCALE_INFO, bcp47Of, accountWords, type MessageKey } from '../shared/src/i18n';
import { FAVICON, MARK } from '../site/brand';
import { SITE_LOCALES, siteCopy, type SiteLocale } from '../site/content';

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
  { name: 'Ambergate Logistics', band: 'risk', score: 48, chip: 'review', who: 'Zeynep', init: 'ZT' },
  { name: 'Northwind Retail', band: 'watch', score: 66, chip: 'health', who: 'Ada', init: 'AD' },
  { name: 'Keystone Foods', band: 'watch', score: 71, chip: 'step', who: 'Selin', init: 'SA' },
  { name: 'Marisol Mobility', band: 'good', score: 92, chip: null, who: 'Lena', init: 'LB' },
  { name: 'Brightwell Retail', band: 'good', score: 85, chip: null, who: 'Ada', init: 'AD' },
  { name: 'Oreli Cosmetics', band: 'risk', score: 53, chip: 'renewal', who: 'Zeynep', init: 'ZT' },
] as const;

/** What each plan brings (the app's own words): Team's list, then what Business adds. */
const TEAM_POINTS: MessageKey[] = ['billing.point.boards', 'billing.point.customers', 'billing.point.meetings', 'billing.point.reports', 'billing.point.chat'];
const BUSINESS_POINTS: MessageKey[] = ['billing.point.crm', 'billing.point.portal', 'billing.point.playbooks'];

function page(locale: SiteLocale): string {
  const c = siteCopy(locale);
  const info = LOCALE_INFO[locale];
  const rel = locale === 'en' ? '' : '../';
  const signup = `${APP}/signup`;
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
  const footLang = others.length === 1 ? langLink(others[0]) : others.map((l) => langLink(l)).join(' · ');
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
        <div class="app__bar"><span class="app__dots"><i></i><i></i><i></i></span><span class="app__addr">${accts}</span></div>
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
  return `<!doctype html>
<html lang="${c.lang}" dir="${info.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.description)}">
<meta name="theme-color" content="#17133a">
<link rel="icon" href="${FAVICON}">
${alternates}
<link rel="preload" href="${rel}assets/bricolage-grotesque-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${rel}assets/site.css">
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
      <div class="mcard" data-reveal="card" aria-hidden="true">
        <div class="mcard__date"><span class="mcard__day">${esc(m.day)}</span><span class="mcard__month">${esc(m.month)}</span></div>
        <div class="mcard__main">
          <div class="mcard__head"><span class="mcard__kind">${esc(m.kind)}</span><span class="mcard__name">${esc(m.name)}</span></div>
          <p class="mcard__who"><span>${esc(m.ours)}</span><span>${esc(m.theirs)}</span></p>
          <p class="mcard__notes">${esc(m.notes)}</p>
          <div class="mcard__steps">
            <strong>${esc(m.steps)}</strong>
            <div class="mcard__step" data-done>${DONE}<span>${esc(m.done)}</span></div>
            <div class="mcard__step">${OPEN}<span>${esc(m.open)}</span><em>${esc(m.openWho)}</em></div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="tools">
    <div class="wrap">
      <h2 data-reveal>${esc(c.tools.title)}</h2>
      <p class="lead" data-reveal>${esc(c.tools.lead)}</p>
      <dl class="tools__list">${tools}</dl>
      <p class="tools__none">${esc(c.tools.none)}</p>
    </div>
  </section>

  <section class="pricing" id="pricing">
    <div class="wrap">
      <h2 data-reveal>${esc(c.pricing.title)}</h2>
      <p class="lead" data-reveal>${esc(c.pricing.lead.replace('14', String(TRIAL_DAYS)))}</p>
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
<footer class="foot">
  <div class="wrap">
    <div class="foot__in">
      <div>
        <a class="brand" href="./">${MARK}Curahold</a>
        <p class="foot__story">${esc(c.footer.story)}</p>
      </div>
      <div>
        <h4>${esc(c.nav.product)}</h4>
        <ul>
          <li><a href="#pricing">${esc(c.nav.pricing)}</a></li>
          <li><a href="${demo}">${esc(c.nav.demo)}</a></li>
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
</footer>
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
// The demo hub and the live demo under /demo/ (built by npm run build:demo), when they are there.
const HUB = join(ROOT, 'dist', 'demo-hub');
if (existsSync(join(HUB, 'index.html'))) cpSync(HUB, join(OUT, 'demo'), { recursive: true });
console.log(`site: ${SITE_LOCALES.length} language${SITE_LOCALES.length === 1 ? '' : 's'} (${SITE_LOCALES.join(', ')}) → ${OUT} (${readFileSync(join(OUT, 'index.html'), 'utf8').length} bytes for English)${existsSync(join(HUB, 'index.html')) ? ', with the demo hub at /demo/' : ''}`);
