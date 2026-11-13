// Builds the demo hub (curahold.com/demo): a page of guided tours, each of
// which opens the live in-browser demo with ?tour=<id>.
//
//   npx tsx scripts/build-demo-hub.ts        (after the demo itself: dist/demo)
//
//   dist/demo-hub/index.html      English
//   dist/demo-hub/tr/index.html   Turkish
//   dist/demo-hub/app/            the live demo (a copy of dist/demo)
//
// Styles, fonts and the script are files of the hub's own (assets/), and
// every link inside the hub is relative, so the same folder works under
// curahold.com/demo/, on a claude.ai page, or on any static host — and under a
// strict content security policy (nothing inline runs).
// Addresses outside the hub: SITE_URL, SITE_APP_URL, SITE_DOCS_URL.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOURS, TOUR_AREAS, TOUR_GOALS, TOUR_ROLES, type TourArea, type TourLang } from '../shared/src/tours';
import { FAVICON, MARK } from '../site/brand';
import { HUB } from '../site/hub';

const ROOT = join(import.meta.dirname, '..');
const DEMO = join(ROOT, 'dist', 'demo');
const OUT = process.argv[2] ?? join(ROOT, 'dist', 'demo-hub');
const SITE = (process.env.SITE_URL ?? 'https://curahold.com').replace(/\/$/, '');
const APP = (process.env.SITE_APP_URL ?? 'https://app.curahold.com').replace(/\/$/, '');
const DOCS = (process.env.SITE_DOCS_URL ?? `${APP}/docs`).replace(/\/$/, '');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The same open fonts as the app and the site (SIL OFL), served by the hub itself. */
const FONTS = [
  ['figtree', 'figtree-latin-wght-normal.woff2'],
  ['figtree', 'figtree-latin-ext-wght-normal.woff2'],
  ['bricolage-grotesque', 'bricolage-grotesque-latin-wght-normal.woff2'],
  ['bricolage-grotesque', 'bricolage-grotesque-latin-ext-wght-normal.woff2'],
] as const;
/** The site's styles (its fonts beside them in assets/), then the hub's own. */
const CSS = readFileSync(join(ROOT, 'site', 'site.css'), 'utf8') + '\n' + readFileSync(join(ROOT, 'site', 'hub.css'), 'utf8');

function page(locale: TourLang): string {
  const c = HUB[locale];
  const tr = locale === 'tr';
  const assets = tr ? '../assets/' : 'assets/';
  const app = tr ? '../app/' : 'app/';
  const hash = tr ? '#tr' : '';
  const other = tr ? '../' : 'tr/';
  const site = tr ? `${SITE}/tr/` : `${SITE}/`;
  const tourHref = (id: string) => `${app}?tour=${id}${hash}`;
  const counts = (pick: (t: (typeof TOURS)[number]) => string[]) => {
    const n: Record<string, number> = {};
    for (const t of TOURS) for (const k of pick(t)) n[k] = (n[k] ?? 0) + 1;
    return n;
  };
  const byRole = counts((t) => t.roles);
  const byGoal = counts((t) => t.goals);
  const byArea = counts((t) => [t.area]);
  const chips = (group: 'role' | 'goal' | 'area', defs: Record<string, Record<TourLang, string>>, n: Record<string, number>) =>
    Object.entries(defs)
      .filter(([k]) => n[k])
      .map(([k, d]) => `<button type="button" class="hub-chip" data-group="${group}" data-value="${k}" aria-pressed="false">${esc(d[locale])} <span>${n[k]}</span></button>`)
      .join('');

  const card = (t: (typeof TOURS)[number]) => `
          <article class="hub-card" data-roles="${t.roles.join(' ')}" data-goals="${t.goals.join(' ')}" data-area="${t.area}" id="tour-${t.id}">
            <div class="hub-card__goals">${t.goals.map((g) => `<span class="hub-goal">${esc(TOUR_GOALS[g][locale])}</span>`).join('')}</div>
            <h3>${esc(t.title[locale])}</h3>
            <p>${esc(t.blurb[locale])}</p>
            <div class="hub-card__foot">
              <span class="hub-card__meta">${esc(c.card.meta(t.minutes, t.steps.length))}</span>
              <span class="hub-trail" aria-hidden="true">${'<i></i>'.repeat(t.steps.length)}</span>
              <a class="btn btn--primary" href="${tourHref(t.id)}" aria-label="${esc(`${c.card.start}: ${t.title[locale]}`)}">${esc(c.card.start)}</a>
            </div>
          </article>`;

  const areaSections = (Object.keys(TOUR_AREAS) as TourArea[])
    .filter((a) => TOURS.some((t) => t.area === a))
    .map((a) => {
      const def = TOUR_AREAS[a];
      return `
        <section class="hub-area" data-area="${a}" aria-labelledby="area-${a}">
          <header class="hub-area__head">
            <h2 id="area-${a}">${esc(def[locale])}</h2>
            <p>${esc(def.blurb[locale])}</p>
          </header>
          <div class="hub-cards">${TOURS.filter((t) => t.area === a).map(card).join('')}
          </div>
        </section>`;
    })
    .join('');

  const words = JSON.stringify({ one: c.results.count(1), many: c.results.count(999).replace('999', '{n}') });

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.description)}">
<link rel="icon" href="${FAVICON}">
<link rel="alternate" hreflang="${tr ? 'en' : 'tr'}" href="${other}">
<link rel="preload" href="${assets}bricolage-grotesque-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${assets}hub.css">
</head>
<body>
<a class="skip" href="#tours">${tr ? 'Turlara geç' : 'Skip to the tours'}</a>
<header class="top hub-top">
  <div class="wrap top__in">
    <a class="brand" href="${site}">${MARK}Curahold</a>
    <nav class="top__nav" aria-label="${esc(c.nav.tours)}">
      <a href="#tours" aria-current="page">${esc(c.nav.tours)}</a>
      <a href="${site}#pricing">${esc(c.nav.pricing)}</a>
      <a href="${DOCS}/${locale}/">${esc(c.nav.docs)}</a>
    </nav>
    <div class="top__end">
      <a class="top__lang" href="${other}" hreflang="${tr ? 'en' : 'tr'}" lang="${tr ? 'en' : 'tr'}">${esc(c.nav.other)}</a>
      <a class="btn btn--primary" href="${APP}/signup">${esc(c.nav.start)}</a>
    </div>
  </div>
</header>
<main id="main">
  <section class="wrap hub-hero">
    <div>
      <h1>${esc(c.hero.title)}</h1>
      <p class="hub-hero__lead">${esc(c.hero.lead)}</p>
      <div class="hub-hero__ctas">
        <a class="btn btn--primary btn--big" href="${tourHref('overview')}">${esc(c.hero.primary)}</a>
        <a class="btn btn--ghost btn--big" href="${app}${hash}">${esc(c.hero.secondary)}</a>
      </div>
      <p class="hub-hero__note">${esc(c.hero.note(TOURS.length))}</p>
    </div>
    <figure class="peek" aria-hidden="true">
      <div class="peek__app">
        <div class="peek__card">
          <div class="peek__name">${esc(c.peek.customer)}</div>
          <div class="peek__row"><span class="peek__score">25</span><span class="peek__tag">${esc(c.peek.risk)}</span><span class="peek__why">${esc(c.peek.why)}</span></div>
          <div class="peek__row">${esc(c.peek.renews)} · ${esc(c.peek.overdue)}</div>
        </div>
        <div class="peek__card peek__card--dim">
          <div class="peek__name">${esc(c.peek.other)}</div>
          <div class="peek__row"><span class="peek__score peek__score--watch">66</span>${esc(c.peek.watch)}</div>
        </div>
      </div>
      <div class="peek__tip">
        <div class="peek__count">${esc(c.peek.step)}</div>
        <div class="peek__bar"><span></span></div>
        <div class="peek__tipTitle">${esc(c.peek.tipTitle)}</div>
        <p class="peek__tipBody">${esc(c.peek.tipBody)}</p>
        <span class="peek__next">${esc(c.peek.next)}</span>
      </div>
    </figure>
  </section>

  <section class="wrap hub-roles" aria-labelledby="roles-title">
    <h2 id="roles-title">${esc(c.picker.title)}</h2>
    <div class="hub-roles__list">${Object.entries(TOUR_ROLES)
      .map(([k, d]) => `<button type="button" class="hub-role" data-value="${k}" aria-pressed="false">${esc(d[locale])} <span>${esc(c.picker.count(byRole[k] ?? 0))}</span></button>`)
      .join('')}</div>
  </section>

  <section class="wrap hub-cat" id="tours">
    <aside class="hub-filters" aria-label="${esc(c.filters.title)}">
      <button type="button" class="hub-filters__toggle" aria-expanded="false">${esc(c.filters.show)} <span></span></button>
      <div class="hub-filters__body">
        <div class="hub-filters__head"><h2>${esc(c.filters.title)}</h2><button type="button" class="hub-filters__clear" hidden>${esc(c.filters.clear)}</button></div>
        <fieldset><legend>${esc(c.filters.role)}</legend><div class="hub-chips">${chips('role', TOUR_ROLES, byRole)}</div></fieldset>
        <fieldset><legend>${esc(c.filters.goal)}</legend><div class="hub-chips">${chips('goal', TOUR_GOALS, byGoal)}</div></fieldset>
        <fieldset><legend>${esc(c.filters.area)}</legend><div class="hub-chips">${chips('area', TOUR_AREAS, byArea)}</div></fieldset>
      </div>
    </aside>
    <div class="hub-results">
      <p class="hub-results__count" aria-live="polite">${esc(c.results.count(TOURS.length))}</p>${areaSections}
      <div class="hub-empty" hidden><p>${esc(c.results.empty)}</p><button type="button">${esc(c.results.clear)}</button></div>
    </div>
  </section>

  <section class="band hub-band">
    <div class="wrap band__in">
      <div class="band__text">
        <h2>${esc(c.band.title)}</h2>
        <p>${esc(c.band.text)}</p>
      </div>
      <div class="hub-band__ctas">
        <a class="btn btn--light btn--big" href="${APP}/signup">${esc(c.band.primary)}</a>
        <a class="btn btn--line btn--big" href="${DOCS}/${locale}/">${esc(c.band.secondary)}</a>
      </div>
    </div>
  </section>
</main>
<footer class="foot hub-foot">
  <div class="wrap foot__base">
    <span>${esc(c.foot.made)}</span>
    <span><a href="${site}">${esc(c.foot.home)}</a> · <a href="${DOCS}/${locale}/legal-privacy/">${esc(c.foot.privacy)}</a> · <a href="${DOCS}/${locale}/legal-terms/">${esc(c.foot.terms)}</a></span>
  </div>
</footer>
<script type="application/json" id="hub-words">${words}</script>
<script src="${assets}hub.js" defer></script>
</body>
</html>
`;
}

if (!existsSync(join(DEMO, 'index.html'))) {
  console.error('demo hub: build the demo first (dist/demo) — npm run build:demo');
  process.exit(1);
}
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'tr'), { recursive: true });
mkdirSync(join(OUT, 'assets'), { recursive: true });
writeFileSync(join(OUT, 'index.html'), page('en'));
writeFileSync(join(OUT, 'tr', 'index.html'), page('tr'));
writeFileSync(join(OUT, 'assets', 'hub.css'), CSS);
cpSync(join(ROOT, 'site', 'hub.js'), join(OUT, 'assets', 'hub.js'));
for (const [pkg, name] of FONTS) {
  const from = join(ROOT, 'node_modules', '@fontsource-variable', pkg, 'files', name);
  if (existsSync(from)) cpSync(from, join(OUT, 'assets', name));
}
cpSync(DEMO, join(OUT, 'app'), { recursive: true });
console.log(`demo hub: ${TOURS.length} tours × 2 languages → ${OUT} (${Math.round(readFileSync(join(OUT, 'index.html')).length / 1024)} KB for English)`);
