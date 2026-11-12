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
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLANS, PRICE_CURRENCY, TRIAL_DAYS, type PlanKey } from '../shared/src/billing';
import { translate, type MessageKey } from '../shared/src/i18n';
import { COPY, type SiteLocale } from '../site/content';

const ROOT = join(import.meta.dirname, '..');
const OUT = process.argv[2] ?? join(ROOT, 'dist', 'site');
const APP = (process.env.SITE_APP_URL ?? 'https://app.curahold.com').replace(/\/$/, '');
const DEMO = process.env.SITE_DEMO_URL ?? '/demo/';
const DOCS = (process.env.SITE_DOCS_URL ?? `${APP}/docs`).replace(/\/$/, '');
const BASE_DOMAIN = process.env.SITE_BASE_DOMAIN ?? 'curahold.com';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The mark: a "C" (cura, care) whose open arc holds a dot (hold). */
const MARK = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#17133a"/><path d="M20.8 10.3A7.5 7.5 0 1 0 20.8 21.7" fill="none" stroke="#eceafe" stroke-width="3" stroke-linecap="round"/><circle cx="16.5" cy="16" r="2.6" fill="#3fb596"/></svg>`;
const FAVICON = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%2317133a'/%3E%3Cpath d='M20.8 10.3A7.5 7.5 0 1 0 20.8 21.7' fill='none' stroke='%23eceafe' stroke-width='3' stroke-linecap='round'/%3E%3Ccircle cx='16.5' cy='16' r='2.6' fill='%233fb596'/%3E%3C/svg%3E`;
const CHECK = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const DONE = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#2f8f78"/><path d="M4.8 8.2l2.1 2.1L11.3 6" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const OPEN = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="#75719a" stroke-width="1.6"/></svg>`;

/** What each plan brings (the app's own words): Team's list, then what Business adds. */
const TEAM_POINTS: MessageKey[] = ['billing.point.boards', 'billing.point.customers', 'billing.point.meetings', 'billing.point.reports', 'billing.point.chat'];
const BUSINESS_POINTS: MessageKey[] = ['billing.point.crm', 'billing.point.portal', 'billing.point.playbooks'];

function page(locale: SiteLocale): string {
  const c = COPY[locale];
  const rel = locale === 'en' ? '' : '../';
  const other = locale === 'en' ? 'tr/' : '../';
  const signup = `${APP}/signup`;
  const docs = `${DOCS}/${locale}/`;
  const legal = (slug: string) => `${DOCS}/${locale}/legal-${slug}/`;
  const money = (n: number) => new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { style: 'currency', currency: PRICE_CURRENCY, maximumFractionDigits: 0 }).format(n);
  const t = (k: MessageKey) => translate(locale, k);
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
  const steps = c.year.steps.map((s) => `<li><h3>${esc(s.name)}</h3><p>${esc(s.text)}</p></li>`).join('');
  const tools = c.tools.rows.map((r) => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.names)}</dd></div>`).join('');
  const faq = c.faq.items.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('');
  const m = c.meeting.card;
  return `<!doctype html>
<html lang="${c.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.description)}">
<meta name="theme-color" content="#17133a">
<link rel="icon" href="${FAVICON}">
<link rel="alternate" hreflang="${locale === 'en' ? 'tr' : 'en'}" href="${other}">
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
      <a href="${DEMO}">${esc(c.nav.demo)}</a>
      <a href="${docs}">${esc(c.nav.help)}</a>
    </nav>
    <div class="top__end">
      <a class="top__lang" href="${other}" hreflang="${locale === 'en' ? 'tr' : 'en'}" lang="${locale === 'en' ? 'tr' : 'en'}">${esc(c.nav.other)}</a>
      <a class="top__signin" href="#signin" data-signin>${esc(c.nav.signIn)}</a>
      <a class="btn btn--primary" href="${signup}">${esc(c.nav.tryFree)}</a>
    </div>
  </div>
</header>
<main id="main">
  <section class="wrap hero">
    <div class="hero__text">
      <h1>${esc(c.hero.title)}</h1>
      <p class="hero__lead">${esc(c.hero.lead)}</p>
      <div class="hero__ctas">
        <a class="btn btn--primary btn--big" href="${signup}">${esc(c.hero.primary)}</a>
        <a class="btn btn--ghost btn--big" href="${DEMO}">${esc(c.hero.secondary)}</a>
      </div>
      <p class="hero__note">${esc(c.hero.note)}</p>
    </div>
    <figure class="hold" aria-label="${esc(`${c.hero.customer}: ${Object.values(c.hero.chips).join('; ')}`)}">
      <svg class="hold__arc" viewBox="0 0 420 420" aria-hidden="true"><path d="M319.3 79.8A170 170 0 1 0 319.3 340.2"/></svg>
      <div class="hold__customer" aria-hidden="true"><span class="hold__dot"></span><span class="hold__name">${esc(c.hero.customer)}</span></div>
      <ul class="hold__chips" aria-hidden="true">${chips}</ul>
    </figure>
  </section>

  <section class="year" id="product">
    <div class="wrap">
      <h2>${esc(c.year.title)}</h2>
      <p class="lead">${esc(c.year.lead)}</p>
      <ol class="year__steps">${steps}</ol>
    </div>
  </section>

  <section class="band">
    <div class="wrap band__in">
      <div class="band__text">
        <h2>${esc(c.meeting.title)}</h2>
        <p>${esc(c.meeting.text)}</p>
      </div>
      <div class="mcard" aria-hidden="true">
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
      <h2>${esc(c.tools.title)}</h2>
      <p class="lead">${esc(c.tools.lead)}</p>
      <dl class="tools__list">${tools}</dl>
      <p class="tools__none">${esc(c.tools.none)}</p>
    </div>
  </section>

  <section class="pricing" id="pricing">
    <div class="wrap">
      <h2>${esc(c.pricing.title)}</h2>
      <p class="lead">${esc(c.pricing.lead.replace('14', String(TRIAL_DAYS)))}</p>
      <div class="pricing__switch" role="group" aria-label="${esc(c.nav.pricing)}">
        <button type="button" data-interval="month" aria-pressed="false">${esc(c.pricing.monthly)}</button>
        <button type="button" data-interval="year" aria-pressed="true">${esc(c.pricing.yearly)}<small>${esc(c.pricing.save)}</small></button>
      </div>
      <div class="plans">${plan('team')}${plan('business')}</div>
      <p class="pricing__fine">${esc(c.pricing.fine)}</p>
    </div>
  </section>

  <section class="faq">
    <div class="wrap">
      <h2>${esc(c.faq.title)}</h2>
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
          <li><a href="${DEMO}">${esc(c.nav.demo)}</a></li>
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
      <a href="${other}" hreflang="${locale === 'en' ? 'tr' : 'en'}" lang="${locale === 'en' ? 'tr' : 'en'}">${esc(c.nav.other)}</a>
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
mkdirSync(join(OUT, 'tr'), { recursive: true });
writeFileSync(join(OUT, 'index.html'), page('en'));
writeFileSync(join(OUT, 'tr', 'index.html'), page('tr'));
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
console.log(`site: 2 languages → ${OUT} (${readFileSync(join(OUT, 'index.html'), 'utf8').length} bytes for English)`);
