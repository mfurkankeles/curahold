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
// Addresses outside the hub: SITE_URL, SITE_APP_URL, SITE_DOCS_URL. For a copy that cannot follow
// the docs' own paths (a preview), SITE_DOCS_HOME sends every docs link to that one address; and
// SITE_SIGNUP_URL replaces the sign-up address (a relative one, such as index.html, is from the hub's root).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INTENT_TEAMS, INTENT_TODAY, TOURS, TOUR_AREAS, TOUR_GOALS, TOUR_ROLES, intentTable, tourText } from '../shared/src/tours';
import { FAVICON, MARK } from '../site/brand';
import { ICON_GO } from './site-chrome';
import { LOCALES, LOCALE_INFO, bcp47Of, intlTag, translate, type Locale, type MessageKey } from '../shared/src/i18n';
import { SEED_LOCALES } from './seed-words';
// The hub is the product's try-it door: not for search engines or AI crawlers (shared/src/compliance/crawlers.ts).
import { CLOSED_ROBOTS_META, TDM_META } from '../shared/src/compliance/crawlers';
import { legalNotice } from '../shared/src/compliance/notice';

const ROOT = join(import.meta.dirname, '..');
const DEMO = join(ROOT, 'dist', 'demo');
const OUT = process.argv[2] ?? join(ROOT, 'dist', 'demo-hub');
const SITE = (process.env.SITE_URL ?? 'https://curahold.com').replace(/\/$/, '');
const APP = (process.env.SITE_APP_URL ?? 'https://app.curahold.com').replace(/\/$/, '');
const DOCS = (process.env.SITE_DOCS_URL ?? `${APP}/docs`).replace(/\/$/, '');
const DOCS_HOME = process.env.SITE_DOCS_HOME ?? '';
const SIGNUP = process.env.SITE_SIGNUP_URL ?? `${APP}/signup`;
/** The languages the help centre is written in (its folders); the hub links to English where it has none. */
const DOC_LANGS = readdirSync(join(ROOT, 'docs', 'site')).filter((d) => d !== 'assets');

const GLOBE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The same open fonts as the app and the site (SIL OFL), served by the hub itself. */
const FONTS = [
  ['figtree', 'figtree-latin-wght-normal.woff2'],
  ['figtree', 'figtree-latin-ext-wght-normal.woff2'],
  ['bricolage-grotesque', 'bricolage-grotesque-latin-wght-normal.woff2'],
  ['bricolage-grotesque', 'bricolage-grotesque-latin-ext-wght-normal.woff2'],
] as const;
/**
 * The hub's own styles, never the sales site's: its base (tokens, header, buttons, footer; fonts beside
 * it in assets/), its page (tours, picker, cards), then the language and intent parts.
 */
// Every action link on the hub carries an icon before its label, like the product (owner rule: icon + label on
// every button). The arrow is mirrored in right-to-left pages by the hub's own CSS; these two are symmetric.
const ICON_APP = `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2.5 6h11" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
const ICON_BOOK = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4.2C6.6 3.2 4.6 3 2.5 3.4v9c2.1-.4 4.1-.2 5.5.8 1.4-1 3.4-1.2 5.5-.8v-9C11.4 3 9.4 3.2 8 4.2zM8 4.2v9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
const CSS = ['web/src/demo/hub-base.css', 'web/src/demo/hub-page.css', 'web/src/demo/hub.css'].map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
/** The languages of the hub: those the demo company is written in, English at the root. */
const LANGS = LOCALES.filter((l) => SEED_LOCALES.includes(l)).sort((a, b) => Number(b === 'en') - Number(a === 'en'));
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
    // © with the right years, Curahold™ and the copyright/trade-secret line (shared/src/compliance/notice.ts).
    notice: legalNotice((k, v) => translate(l, k, v)),
    /** The site's page in this language (it has all eleven). */
    words: { one: say('count.one'), many: say('count.many') },
    lang: { title: say('lang.title'), note: say('lang.note'), close: say('lang.close'), button: (name: string) => say('lang.button', { name }) },
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
  /** A docs page in this language, or the one docs address when the docs cannot be linked page by page. */
  const docsAt = (page = '') => DOCS_HOME || `${docs}${page}`;
  /** A docs copy elsewhere opens in its own tab (a preview's frame cannot show it). */
  const away = DOCS_HOME ? ' target="_blank" rel="noopener"' : '';
  const signup = /^[a-z]+:/.test(SIGNUP) ? SIGNUP : `${up}${SIGNUP}`;
  const hrefOf = (l: Locale) => `${up}${dirOf(l)}` || './';
  // The language button opens the chooser (web/src/demo/hub-lang.js); without a script it still
  // opens, as the address's target. The first visit to the English root opens it by itself.
  const langMenu = `<a class="top__lang hub-lang__open" href="#lang-pick" aria-haspopup="dialog" aria-label="${esc(c.lang.button(info.name))}">${GLOBE}<span>${esc(info.name)}</span></a>`;
  // English's link says so (?lang=en): the root page otherwise sends a visitor back to the language they chose before.
  const pickLink = (l: Locale) =>
    `<a href="${hrefOf(l)}${l === 'en' ? '?lang=en' : ''}" data-l="${l}" hreflang="${bcp47Of(l)}" lang="${bcp47Of(l)}" dir="${LOCALE_INFO[l].dir}"${l === locale ? ' aria-current="true"' : ''}>${esc(LOCALE_INFO[l].name)}</a>`;
  const chooser = `<div id="lang-pick" class="hub-lang" role="dialog" aria-modal="true" aria-labelledby="lang-pick-title" data-here="${locale}"${locale === 'en' ? ' data-root="1"' : ''}>
  <div class="hub-lang__card">
    <a class="hub-lang__close" href="#" aria-label="${esc(c.lang.close)}">×</a>
    ${MARK}
    <h2 id="lang-pick-title">${esc(c.lang.title)}</h2>
    <nav class="hub-lang__list" aria-labelledby="lang-pick-title">${LANGS.map(pickLink).join('')}</nav>
    <p class="hub-lang__note">${esc(c.lang.note)}</p>
  </div>
</div>`;
  // A real screen of the demo in this language (no drawing of one): the wide one, and the phone one on a phone.
  const shot = existsSync(shotOf(locale, 'customers')) && existsSync(shotOf(locale, 'customer-phone'));
  const figure = shot
    ? `<figure class="hub-shot"><picture><source media="(max-width: 700px)" srcset="${assets}${locale}-customer-phone.webp" width="375" height="667"><img src="${assets}${locale}-customers.webp" width="1280" height="800" alt="${esc(c.shot)}" fetchpriority="high"></picture></figure>`
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
              <a class="btn btn--primary" href="${tourHref(t.id)}" aria-label="${esc(`${c.card.start}: ${w.title(t)}`)}">${ICON_GO}${esc(c.card.start)}</a>
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

  // Three questions, the right tours (web/src/demo/hub-intent.js): the answer for every combination
  // is worked out here (shared/src/tours.ts, pickTours), so the page only looks it up.
  const say = (k: string) => translate(locale, `demo.intent.${k}` as MessageKey);
  const question = <K extends string>(q: 'team' | 'goal' | 'today', keys: readonly K[], name: (k: K) => string) => `
      <fieldset class="hub-intent__q" data-q="${q}">
        <legend>${esc(say(`q.${q}`))}</legend>
        <div class="hub-ichips">${keys.map((k) => `<button type="button" class="hub-ichip" data-value="${k}" aria-pressed="false">${esc(name(k))}</button>`).join('')}</div>
      </fieldset>`;
  const intentData = JSON.stringify({
    table: intentTable(),
    tours: Object.fromEntries(TOURS.map((t) => [t.id, { title: w.title(t), href: tourHref(t.id), meta: c.card.meta(t.minutes, t.steps.length) }])),
    own: `${app}?start=import${hash}`,
  }).replace(/</g, '\\u003c');
  const intent = `<section class="wrap hub-intent" aria-labelledby="intent-title">
    <h2 id="intent-title">${esc(say('title'))}</h2>
    <p class="hub-intent__lead">${esc(say('lead'))}</p>
    <div class="hub-intent__qs">${question('team', INTENT_TEAMS, w.team)}${question('goal', TOUR_GOALS, w.goal)}${question('today', INTENT_TODAY, w.today)}
    </div>
    <div class="hub-intent__out" aria-live="polite">
      <p class="hub-intent__wait">${esc(say('waiting'))}</p>
      <div class="hub-intent__picks" hidden><h3>${esc(say('result'))}</h3><ol></ol><a class="hub-intent__own" href="${`${app}?start=import${hash}`}" hidden>${esc(say('ownFile'))}</a></div>
    </div>
    <script type="application/json" id="hub-intent">${intentData}</script>
  </section>`;

  return `<!doctype html>
<html lang="${bcp47Of(locale)}" dir="${info.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.description)}">
${CLOSED_ROBOTS_META}
${TDM_META}
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
      <a href="${docsAt()}"${away}>${esc(c.nav.docs)}</a>
    </nav>
    <div class="top__end">
      ${langMenu}
      <a class="btn btn--primary" href="${signup}">${ICON_GO}${esc(c.nav.start)}</a>
    </div>
  </div>
</header>
<main id="main">
  <section class="wrap hub-hero">
    <div>
      <h1>${esc(c.hero.title)}</h1>
      <p class="hub-hero__lead">${esc(c.hero.lead)}</p>
      <div class="hub-hero__ctas">
        <a class="btn btn--primary btn--big" href="${tourHref('overview')}">${ICON_GO}${esc(c.hero.primary)}</a>
        <a class="btn btn--ghost btn--big" href="${app}${hash}">${ICON_APP}${esc(c.hero.secondary)}</a>
      </div>
      <p class="hub-hero__note">${esc(c.hero.note(TOURS.length))}</p>
    </div>
    ${figure}
  </section>

  ${intent}

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
        <a class="btn btn--light btn--big" href="${signup}">${ICON_GO}${esc(c.band.primary)}</a>
        <a class="btn btn--line btn--big" href="${docsAt()}"${away}>${ICON_BOOK}${esc(c.band.secondary)}</a>
      </div>
    </div>
  </section>
</main>
<footer class="foot hub-foot">
  <div class="wrap foot__base">
    <span>${esc(c.foot.made)}<br><small>${esc(c.notice.rights)} ${esc(c.notice.protected)}</small></span>
    <span><a href="${site}">${esc(c.foot.home)}</a> · <a href="${docsAt('legal-privacy/')}"${away}>${esc(c.foot.privacy)}</a> · <a href="${docsAt('legal-terms/')}"${away}>${esc(c.foot.terms)}</a></span>
  </div>
</footer>
<script type="application/json" id="hub-words">${words}</script>
${chooser}
<script src="${assets}hub.js" defer></script>
<script src="${assets}hub-lang.js" defer></script>
<script src="${assets}hub-intent.js" defer></script>
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
  for (const name of ['customers', 'customer-phone']) if (existsSync(shotOf(l, name))) cpSync(shotOf(l, name), join(OUT, 'assets', `${l}-${name}.webp`));
}
writeFileSync(join(OUT, 'assets', 'hub.css'), CSS);
cpSync(join(ROOT, 'site', 'hub.js'), join(OUT, 'assets', 'hub.js'));
cpSync(join(ROOT, 'web', 'src', 'demo', 'hub-lang.js'), join(OUT, 'assets', 'hub-lang.js'));
cpSync(join(ROOT, 'web', 'src', 'demo', 'hub-intent.js'), join(OUT, 'assets', 'hub-intent.js'));
for (const [pkg, name] of FONTS) {
  const from = join(ROOT, 'node_modules', '@fontsource-variable', pkg, 'files', name);
  if (existsSync(from)) cpSync(from, join(OUT, 'assets', name));
}
cpSync(DEMO, join(OUT, 'app'), { recursive: true });
console.log(`demo hub: ${TOURS.length} tours × ${LANGS.length} languages → ${OUT} (${Math.round(readFileSync(join(OUT, 'index.html')).length / 1024)} KB for English)`);
