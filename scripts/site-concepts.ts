// The two animated "AI versions" of the sales site, built into real pages per
// language by scripts/build-site.ts:
//   A — one customer, start to finish (site/concepts/a.html, words in a-copy.ts)
//   C — four teams in orbit around one customer record (c.html, c-copy.ts)
// The pages keep their own look and motion; the shared header, the "Why Curahold"
// scene, the footer, SEO tags and the consent banner are handed in by the builder,
// so all three versions carry the same menu, links and cookie rules.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { translate, bcp47Of, LOCALE_INFO, type MessageKey } from '../shared/src/i18n';
import { siteCopy, siteStory, type SiteLocale } from '../site/content';
import { A_COPY, ALIAS_A, FALLBACK_A } from '../site/concepts/a-copy';
import { C_COPY } from '../site/concepts/c-copy';
import { infoCopy } from '../site/info';
import { ICON_GO, ICON_PLAY } from './site-chrome';

const ROOT = join(import.meta.dirname, '..');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

/**
 * How much longer each scene holds on the scroll than in the first dummies. The owner
 * found them too fast (17 Nov); 1.6 gives every text block well over half a screen of
 * scrolling at rest. One number, so it is a setting, not a rewrite.
 */
export const CONCEPT_SLOW = Number(process.env.SITE_CONCEPT_SLOW ?? 1.6);

export interface ConceptParts {
  locale: SiteLocale;
  /** '../' repeated up to the site root, for assets. */
  rel: string;
  /** Extra <head> tags: canonical, hreflang, Open Graph, favicon, shared styles. */
  head: string;
  header: string;
  why: string;
  footer: string;
  /** Scripts at the end of <body>: the header's and the consent banner's. */
  tail: string;
  trial: string;
  demo: string;
  /** The two call-to-action labels, the same as the header's. */
  tryFree: string;
  demoLabel: string;
}

const app = (l: SiteLocale, k: string) => translate(l, k as MessageKey);
const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/** Concept A's words for one language: what the app and the main site already say, then its own. */
export function conceptAWords(locale: SiteLocale): Record<string, string> {
  const tag = bcp47Of(locale);
  const dateTag = locale === 'fa' ? 'fa-u-ca-gregory' : tag;
  const ui = siteCopy(locale).tour.ui;
  const story = siteStory(locale);
  const day = (m: number, d: number) => new Date(Date.UTC(2026, m - 1, d, 12));
  const short = new Intl.DateTimeFormat(dateTag, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const num = (n: number) => new Intl.NumberFormat(tag).format(n);
  const derived: Record<string, string> = {
    b_watch: app(locale, 'health.band.watch'),
    b_risk: app(locale, 'health.band.risk'),
    b_good: app(locale, 'health.band.good'),
    p_why: app(locale, 'health.why'),
    p_next: app(locale, 'meetings.nextSteps'),
    p_save: app(locale, 'common.save'),
    p_done: app(locale, 'board.defaultColumns.done'),
    p_doing: app(locale, 'board.defaultColumns.doing'),
    p_qbr: ui.meeting.name,
    p_ours: ui.meeting.ours,
    p_theirs: ui.meeting.theirs,
    p_n1: ui.meeting.steps[0],
    p_n2: ui.meeting.steps[1],
    p_opened: ui.tasksOpened,
    p_reply: story?.ui.reply ?? '',
    p_active: ui.active,
    p_ptsA: fill(ui.points, { done: num(21), total: num(34) }),
    p_ptsB: fill(ui.points, { done: num(26), total: num(34) }),
    p_oct: new Intl.DateTimeFormat(dateTag, { month: 'short', timeZone: 'UTC' }).format(day(10, 14)),
    p_due: short.format(day(10, 28)),
    p_dates: short.formatRange(day(10, 20), day(10, 31)),
    d_pct: new Intl.NumberFormat(tag, { style: 'percent' }).format(0.72),
    // The closing call to action says what every other page says.
    cta: infoCopy(locale).nav.tryFree,
    note: siteCopy(locale).hero.note,
  };
  const words = { ...derived, ...A_COPY[locale] };
  for (const [k, to] of Object.entries(FALLBACK_A)) if (words[k] === undefined) words[k] = words[to];
  for (const [k, to] of Object.entries(ALIAS_A)) if (words[k] === undefined) words[k] = words[to];
  return words;
}

const replaceAll = (html: string, slots: Record<string, string>) =>
  html.replace(/\{\{(\w+)\}\}/g, (m, k: string) => {
    if (!(k in slots)) throw new Error(`concept page: no value for {{${k}}}`);
    return slots[k];
  });

let aTemplate = '';
let cTemplate = '';

/** Concept A, complete in one language. */
export function conceptAPage(p: ConceptParts): string {
  aTemplate ||= readFileSync(join(ROOT, 'site', 'concepts', 'a.html'), 'utf8');
  const w = conceptAWords(p.locale);
  const missing = new Set<string>();
  // Every element that names its words gets them now; the page's script then leaves them be.
  const html = aTemplate.replace(/(data-t="([A-Za-z0-9_]+)"[^>]*>)([^<]*)(<)/g, (_m, open: string, key: string, _old: string, close: string) => {
    const v = w[key];
    if (v === undefined) missing.add(key);
    return `${open}${esc(v ?? '')}${close}`;
  });
  if (missing.size) throw new Error(`concept A: ${p.locale} has no words for ${[...missing].join(', ')}`);
  const tabs = (['t_today', 't_cust', 't_tasks', 't_sprint'] as const).map((k) => [k, w[k]]);
  return replaceAll(html, {
    LANG: bcp47Of(p.locale),
    DIR: LOCALE_INFO[p.locale].dir,
    TITLE: esc(w.title),
    DESC: esc(w.desc),
    HEAD: p.head,
    REL: p.rel,
    HEADER: p.header,
    ICON_GO,
    TRIAL: esc(p.trial),
    WHY: p.why,
    FOOTER: p.footer,
    TABS: json(tabs),
    SLOW: String(CONCEPT_SLOW),
    TAIL: p.tail,
  });
}

/** Concept C, complete in one language. */
export function conceptCPage(p: ConceptParts): string {
  cTemplate ||= readFileSync(join(ROOT, 'site', 'concepts', 'c.html'), 'utf8');
  const c = C_COPY[p.locale];
  const a = conceptAWords(p.locale);
  const tag = bcp47Of(p.locale);
  const dateTag = p.locale === 'fa' ? 'fa-u-ca-gregory' : tag;
  const num = (n: number) => new Intl.NumberFormat(tag).format(n);
  // Invented demo amounts, in the same currency as the price list (US dollars).
  const usd = (n: number) => new Intl.NumberFormat(tag, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', notation: 'compact', maximumFractionDigits: 0 }).format(n);
  const due = new Intl.DateTimeFormat(dateTag, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 9, 28, 12)));
  const ui = siteCopy(p.locale).tour.ui;
  const dot = ' · ';
  const hl = (s: string) => `<span class="hl">${esc(s)}</span>`;
  const [promise, task, portal, renewal] = c.words;
  const row1 = [esc(promise), hl(task), esc(ui.sprint.replace(/\s*[\d۰-۹]+$/, '')), esc(portal), hl(renewal), esc(promise), esc(task)].join(dot) + dot;
  const giant = a.giant.replace(/[.。．!]$/, '');
  const row2 = [giant, giant, giant].map(esc).join(dot) + dot;
  const row3 = [esc(a.d2h), hl(a.d1h), esc(a.d3h), esc(a.d4h), esc(a.d2h)].join(dot) + dot;
  return replaceAll(cTemplate, {
    LANG: tag,
    DIR: LOCALE_INFO[p.locale].dir,
    TITLE: esc(c.title),
    DESC: esc(c.desc),
    HEAD: p.head,
    REL: p.rel,
    HEADER: p.header,
    h1a: esc(c.h1a),
    h1b: esc(c.h1b),
    sub: esc(c.sub),
    health48: esc(fill(c.health, { n: num(48) })),
    d_sales: esc(a.d2h),
    d_cs: esc(a.d1h),
    d_prod: esc(a.d3h),
    d_fin: esc(a.d4h),
    sat0: esc(c.sat[0]),
    sat1: esc(c.sat[1]),
    sat2: esc(c.sat[2]),
    // Only what finance has today (contract value for the roles allowed); no "coming soon" claim (claims list B #20).
    sat3: esc(c.sat[3]),
    k0: esc(usd(240000)),
    k1: esc(`${num(48)} → ${num(85)}`),
    k2: esc(ui.sprint),
    k3: esc(usd(264000)),
    lineH: esc(c.lineH),
    ROW1: row1,
    ROW2: row2,
    ROW3: row3,
    endA: esc(c.endA),
    endB: esc(c.endB),
    TRIAL: esc(p.trial),
    DEMO: esc(p.demo),
    go: `${ICON_GO}<span>${esc(p.tryFree)}</span>`,
    demo: `${ICON_PLAY}<span>${esc(p.demoLabel)}</span>`,
    CAPS: json(c.cap),
    STOPS: json(c.stops.map(([t, s]) => [esc(t), esc(fill(s, { date: due }))])),
    HEALTH: json(c.health),
    WHY: p.why,
    FOOTER: p.footer,
    SLOW: String(CONCEPT_SLOW),
    TAIL: p.tail,
  });
}
