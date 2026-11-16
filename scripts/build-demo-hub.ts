// Builds the demo hub (curahold.com/demo): a page of guided tours, each of
// which opens the live in-browser demo with ?tour=<id>.
//
//   npx tsx scripts/build-demo-hub.ts        (after the demo itself: dist/demo)
//
//   dist/demo-hub/index.html         English
//   dist/demo-hub/<lang>/index.html  every other language the demo company is written in
//                                    (scripts/seed-words): the hub's words are demo.hub.*
//                                    in the dictionaries, the tours' demo.tour.*
//   dist/demo-hub/app/            the live demo (a copy of dist/demo)
//
// Styles, fonts and the script are files of the hub's own (assets/), and
// every link inside the hub is relative, so the same folder works under
// curahold.com/demo/, on a claude.ai page, or on any static host — and under a
// strict content security policy (nothing inline runs).
// Addresses outside the hub: SITE_URL, SITE_APP_URL, SITE_DOCS_URL.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOURS, TOUR_AREAS, TOUR_GOALS, TOUR_ROLES, tourText } from '../shared/src/tours';
import { FAVICON, MARK } from '../site/brand';
import { LOCALE_INFO, bcp47Of, intlTag, translate, type Locale, type MessageKey } from '../shared/src/i18n';
import { SEED_LOCALES } from './seed-words';

const ROOT = join(import.meta.dirname, '..');
const DEMO = join(ROOT, 'dist', 'demo');
const OUT = process.argv[2] ?? join(ROOT, 'dist', 'demo-hub');
const SITE = (process.env.SITE_URL ?? 'https://curahold.com').replace(/\/$/, '');
const APP = (process.env.SITE_APP_URL ?? 'https://app.curahold.com').replace(/\/$/, '');
const DOCS = (process.env.SITE_DOCS_URL ?? `${APP}/docs`).replace(/\/$/, '');
/** The languages the help centre is written in (its folders); the hub links to English where it has none. */
const DOC_LANGS = readdirSync(join(ROOT, 'docs', 'site')).filter((d) => d !== 'assets');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The same open fonts as the app and the site (SIL OFL), served by the hub itself. */
const FONTS = [
  ['figtree', 'figtree-latin-wght-normal.woff2'],
  ['figtree', 'figtree-latin-ext-wght-normal.woff2'],
  ['bricolage-grotesque', 'bricolage-grotesque-latin-wght-normal.woff2'],
  ['bricolage-grotesque', 'bricolage-grotesque-latin-ext-wght-normal.woff2'],
] as const;
/** The site's styles (its fonts beside them in assets/), the hub's, then this page's own (web/src/demo/hub.css). */
const CSS = ['site/site.css', 'site/hub.css', 'web/src/demo/hub.css'].map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
/** The languages of the hub: those the demo company is written in, English at the root. */
const LANGS = SEED_LOCALES;
/** Where a language's page is, from the root of the hub. */
const dirOf = (l: Locale) => (l === 'en' ? '' : `${l}/`);
/** A real screen of the demo in a language, taken by scripts/docs/shots.ts (the help centre's pictures). */
const shotOf = (l: Locale, name: string) => join(ROOT, 'docs', 'site', l, 'img', `${name}.webp`);

/** The page's words in one language, in the shape the page below reads them. */
function copyOf(l: Locale) {
  const say = (k: string, vars?: Record<string, string | number>) => translate(l, `demo.hub.${k}` as MessageKey, vars);
  const num = (n: number) => new Intl.NumberFormat(intlTag(l)).format(n);
  const count = (n: number) => (n === 1 ? say('count.one') : say('count.many', { n: num(n) }));
  return {
    title: say('title'),
    description: say('description'),
    skip: say('skip'),
    nav: { tours: say('nav.tours'), pricing: say('nav.pricing'), docs: say('nav.docs'), start: say('nav.start') },
    hero: { title: say('hero.title'), lead: say('hero.lead'), primary: say('hero.primary'), secondary: say('hero.secondary'), note: (n: number) => say('hero.note', { n: num(n) }) },
    shot: say('shot'),
    picker: { title: say('picker.title'), count },
    filters: { title: say('filters.title'), clear: say('filters.clear'), role: say('filters.role'), goal: say('filters.goal'), area: say('filters.area'), show: say('filters.show') },
    results: { count, empty: say('results.empty'), clear: say('results.clear') },
    card: { start: say('card.start'), meta: (m: number, st: number) => say('card.meta', { m: num(m), s: num(st) }) },
    band: { title: say('band.title'), text: say('band.text'), primary: say('band.primary'), secondary: say('band.secondary') },
    foot: { home: say('foot.home'), privacy: say('foot.privacy'), terms: say('foot.terms'), made: say('foot.made') },
    /** The site's page in this language (it has all nine). */
    words: { one: say('count.one'), many: say('count.many') },
  };
}

function page(locale: Locale): string {
  const c = copyOf(locale);
  const w = tourText(locale);
  const up = locale === 'en' ? '' : '../';
  const assets = `${up}assets/`;
  const app = `${up}app/`;
  const hash = locale === 'en' ? '' : `#${locale}`;
  const site = `${SITE}/${dirOf(locale)}`;
  const info = LOCALE_INFO[locale];
  const docs = `${DOCS}/${DOC_LANGS.includes(locale) ? locale : 'en'}/`;
  const others = LANGS.filter((l) => l !== locale);
  const hrefOf = (l: Locale) => `${up}${dirOf(l)}` || './';
  const langLink = (l: Locale) => `<a href="${hrefOf(l)}" hreflang="${bcp47Of(l)}" lang="${bcp47Of(l)}">${esc(LOCALE_INFO[l].name)}</a>`;
  const langMenu = others.length === 1 ? langLink(others[0]).replace('<a ', '<a class="top__lang" ') : others.length ? `<details class="lang"><summary class="top__lang">${esc(info.name)}</summary><div class="lang__menu">${others.map(langLink).join('')}</div></details>` : '';
  // A real screen of the demo in this language (no drawing of one): the wide one, and the phone one on a phone.
  const shot = existsSync(shotOf(locale, 'customers')) && existsSync(shotOf(locale, 'customers-phone'));
  const figure = shot
    ? `<figure class="hub-shot"><picture><source media="(max-width: 700px)" srcset="${assets}${locale}-customers-phone.webp" width="375" height="667"><img src="${assets}${locale}-customers.webp" width="1280" height="800" alt="${esc(c.shot)}" fetchpriority="high"></picture></figure>`
    : '';
  const tourHref = (id: string) => `${app}?tour=${id}${hash}`;
  const counts = (pick: (t: (typeof TOURS)[number]) => string[]) => {
    const n: Record<string, number> = {};
    for (const t of TOURS) for (const k of pick(t)) n[k] = (n[k] ?? 0) + 1;
    return n;
  };
  const byRole = counts((t) => t.roles);
  const byGoal = counts((t) => t.goals);
  const byArea = counts((t) => [t.area]);
  const chips = <K extends string>(group: 'role' | 'goal' | 'area', keys: readonly K[], name: (k: K) => string, n: Record<string, number>) =>
    keys
      .filter((k) => n[k])
      .map((k) => `<button type="button" class="hub-chip" data-group="${group}" data-value="${k}" aria-pressed="false">${esc(name(k))} <span>${n[k]}</span></button>`)
      .join('');

  const card = (t: (typeof TOURS)[number]) => `
          <article class="hub-card" data-roles="${t.roles.join(' ')}" data-goals="${t.goals.join(' ')}" data-area="${t.area}" id="tour-${t.id}">
            <div class="hub-card__goals">${t.goals.map((g) => `<span class="hub-goal">${esc(w.goal(g))}</span>`).join('')}</div>
            <h3>${esc(w.title(t))}</h3>
            <p>${esc(w.blurb(t))}</p>
            <div class="hub-card__foot">
              <span class="hub-card__meta">${esc(c.card.meta(t.minutes, t.steps.length))}</span>
              <span class="hub-trail" aria-hidden="true">${'<i></i>'.repeat(t.steps.length)}</span>
              <a class="btn btn--primary" href="${tourHref(t.id)}" aria-label="${esc(`${c.card.start}: ${w.title(t)}`)}">${esc(c.card.start)}</a>
            </div>
          </article>`;

  const areaSections = TOUR_AREAS.filter((a) => TOURS.some((t) => t.area === a))
    .map((a) => {
      return `
        <section class="hub-area" data-area="${a}" aria-labelledby="area-${a}">
          <header class="hub-area__head">
            <h2 id="area-${a}">${esc(w.area(a))}</h2>
            <p>${esc(w.areaBlurb(a))}</p>
          </header>
          <div class="hub-cards">${TOURS.filter((t) => t.area === a).map(card).join('')}
          </div>
        </section>`;
    })
    .join('');

  const words = JSON.stringify(c.words);

  return `<!doctype html>
<html lang="${bcp47Of(locale)}" dir="${info.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.description)}">
<link rel="icon" href="${FAVICON}">
${LANGS.map((l) => `<link rel="alternate" hreflang="${bcp47Of(l)}" href="${hrefOf(l)}">`).join('\n')}
<link rel="preload" href="${assets}bricolage-grotesque-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${assets}hub.css">
</head>
<body>
<a class="skip" href="#tours">${esc(c.skip)}</a>
<header class="top hub-top">
  <div class="wrap top__in">
    <a class="brand" href="${site}">${MARK}Curahold</a>
    <nav class="top__nav" aria-label="${esc(c.nav.tours)}">
      <a href="#tours" aria-current="page">${esc(c.nav.tours)}</a>
      <a href="${site}#pricing">${esc(c.nav.pricing)}</a>
      <a href="${docs}">${esc(c.nav.docs)}</a>
    </nav>
    <div class="top__end">
      ${langMenu}
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
    ${figure}
  </section>

  <section class="wrap hub-roles" aria-labelledby="roles-title">
    <h2 id="roles-title">${esc(c.picker.title)}</h2>
    <div class="hub-roles__list">${TOUR_ROLES
      .map((k) => `<button type="button" class="hub-role" data-value="${k}" aria-pressed="false">${esc(w.role(k))} <span>${esc(c.picker.count(byRole[k] ?? 0))}</span></button>`)
      .join('')}</div>
  </section>

  <section class="wrap hub-cat" id="tours">
    <aside class="hub-filters" aria-label="${esc(c.filters.title)}">
      <button type="button" class="hub-filters__toggle" aria-expanded="false">${esc(c.filters.show)} <span></span></button>
      <div class="hub-filters__body">
        <div class="hub-filters__head"><h2>${esc(c.filters.title)}</h2><button type="button" class="hub-filters__clear" hidden>${esc(c.filters.clear)}</button></div>
        <fieldset><legend>${esc(c.filters.role)}</legend><div class="hub-chips">${chips('role', TOUR_ROLES, w.role, byRole)}</div></fieldset>
        <fieldset><legend>${esc(c.filters.goal)}</legend><div class="hub-chips">${chips('goal', TOUR_GOALS, w.goal, byGoal)}</div></fieldset>
        <fieldset><legend>${esc(c.filters.area)}</legend><div class="hub-chips">${chips('area', TOUR_AREAS, w.area, byArea)}</div></fieldset>
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
        <a class="btn btn--line btn--big" href="${docs}">${esc(c.band.secondary)}</a>
      </div>
    </div>
  </section>
</main>
<footer class="foot hub-foot">
  <div class="wrap foot__base">
    <span>${esc(c.foot.made)}</span>
    <span><a href="${site}">${esc(c.foot.home)}</a> · <a href="${docs}legal-privacy/">${esc(c.foot.privacy)}</a> · <a href="${docs}legal-terms/">${esc(c.foot.terms)}</a></span>
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
mkdirSync(join(OUT, 'assets'), { recursive: true });
for (const l of LANGS) {
  mkdirSync(join(OUT, dirOf(l)), { recursive: true });
  writeFileSync(join(OUT, dirOf(l), 'index.html'), page(l));
  for (const name of ['customers', 'customers-phone']) if (existsSync(shotOf(l, name))) cpSync(shotOf(l, name), join(OUT, 'assets', `${l}-${name}.webp`));
}
writeFileSync(join(OUT, 'assets', 'hub.css'), CSS);
cpSync(join(ROOT, 'site', 'hub.js'), join(OUT, 'assets', 'hub.js'));
for (const [pkg, name] of FONTS) {
  const from = join(ROOT, 'node_modules', '@fontsource-variable', pkg, 'files', name);
  if (existsSync(from)) cpSync(from, join(OUT, 'assets', name));
}
cpSync(DEMO, join(OUT, 'app'), { recursive: true });
console.log(`demo hub: ${TOURS.length} tours × ${LANGS.length} languages → ${OUT} (${Math.round(readFileSync(join(OUT, 'index.html')).length / 1024)} KB for English)`);
