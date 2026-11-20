// Builds the public documentation (docs/site/<lang>/*.md) into static pages
// under dist/web/docs, served at <company>.curahold.com/docs/ and on the
// sales site. Also writes llms.txt and llms-full.txt, so AI assistants can
// read the docs, and a small search index per language. No server, no
// third-party script, nothing to run: it costs nothing to host.
//
//   npx tsx scripts/build-docs.ts [outDir] [--relative] [--preview]
//
// With --relative every link is written relative to the page, so the
// folder works wherever it is put (inside the try-it demo, in a preview).
// DOCS_APP_HREF says where "Go to the app" leads from the docs folder then.
//
// --preview (or DOCS_PREVIEW=1; implies --relative) is the small copy for a
// host that takes a few hundred files (512): every language, but no .md twin
// per page; past English a language keeps its user guide (Turkish its legal
// pages too; past Turkish, not the one-vendor setup guides) and every other page
// links to the English one instead of a copy of it; and the languages other than English show the
// English pictures (DOCS_PREVIEW_PICTURES=en,tr keeps the Turkish ones too). The production build is unchanged.
//
// DOCS_DATA_ONLY=1 keeps only what the try-it demo reads at run time when its
// docs links go elsewhere (DEMO_DOCS_URL): each language's search.json and
// answers.json, and the English pictures the answers show.
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildSync } from 'esbuild';
import { Marked, type Tokens } from 'marked';
import type { DocSection } from '../shared/src/answers';
import { CLARIFY } from '../shared/src/assist';
import { LOCALE_INFO, LOCALES, bcp47Of, intlTag, translate, type Locale, type MessageKey } from '../shared/src/i18n';
// Search engines may index the docs; AI crawlers and text-and-data mining may not (a copy inside the demo: nobody).
import { CLOSED_ROBOTS, TDM_META } from '../shared/src/compliance/crawlers';
import { legalNotice } from '../shared/src/compliance/notice';
import { ASSIST_CONSENT_VERSION } from '../shared/src/assistConsent';

/** The copyright line and the copyright/trade-secret line, in one language (shared/src/compliance/notice.ts). */
const noticeOf = (lang: Locale) => legalNotice((k, v) => translate(lang, k, v));

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'docs', 'site');
const ARGS = process.argv.slice(2);
const OUT = ARGS.find((a) => !a.startsWith('--')) ?? join(ROOT, 'dist', 'web', 'docs');
const PREVIEW = ARGS.includes('--preview') || process.env.DOCS_PREVIEW === '1';
const DATA_ONLY = ARGS.includes('--data-only') || process.env.DOCS_DATA_ONLY === '1';
const RELATIVE = PREVIEW || ARGS.includes('--relative') || process.env.DOCS_RELATIVE === '1';
const APP_HREF = process.env.DOCS_APP_HREF ?? '../index.html';
/**
 * Where the published docs live, for canonical, hreflang, structured data and the sitemap
 * (the production build only; a relative copy is closed to crawlers and carries none of them).
 * The sales site links to the app's address, so that is the default (docs/ENVIRONMENT.md).
 */
const DOCS_ORIGIN = (process.env.DOCS_ORIGIN ?? 'https://app.curahold.com').replace(/\/$/, '');
// The share picture for a link to a help page: the site's own (scripts/build-site.ts), so a shared page looks like Curahold.
const SITE_ORIGIN = (process.env.SITE_ORIGIN ?? `https://${process.env.SITE_BASE_DOMAIN ?? 'curahold.com'}`).replace(/\/$/, '');
const OG_IMAGE = `${SITE_ORIGIN}/assets/${existsSync(join(import.meta.dirname, '..', 'site', 'og.png')) ? 'og.png' : 'og.svg'}`;
/**
 * The languages the docs are written in: a folder per language under docs/site.
 * Adding a language is adding its folder. Its user guide (section help) must be
 * whole; any other page it does not have yet is shown in English, with a note
 * (developer pages, the API reference and release notes are kept in English
 * outside English and Turkish, the two reviewed sources; the legal pages exist
 * in all eleven since 20 Nov 2026, as drafts where the English text prevails).
 */
// (A folder with only pictures, img/, is not a language of the docs yet: the demo hub uses them.)
const LANGS: Locale[] = LOCALES.filter((l) => existsSync(join(SRC, l)) && readdirSync(join(SRC, l)).some((f) => f.endsWith('.md')));
type Lang = Locale;
/** English and Turkish carry every page themselves. */
const WHOLE: Lang[] = ['en', 'tr'];
const SECTIONS = ['help', 'developers', 'reference', 'releases', 'legal'] as const;
/** Each page's slug → the languages that have it in their own words (a search engine is pointed only at those). */
const OWN = new Map<string, Lang[]>();
/** Preview only: `<lang>/<slug>` of every page a language shows in English (it links to the English page). */
const BORROWED = new Set<string>();
/** Preview only: the language whose page or picture a link really goes to. */
const pageLang = (lang: string, slug: string) => (PREVIEW && BORROWED.has(`${lang}/${slug}`) ? 'en' : lang);
/** Preview only: a setup guide for one vendor's tool (Stripe, Odoo CRM, WhatsApp …), as opposed to an overview page. */
const VENDOR_GUIDE = (file: string) =>
  file.startsWith('accounting-') || ['chat-notifications.md', 'odoo-crm.md', 'calendars.md', 'zoho-desk.md', 'whatsapp.md', 'azure-devops.md', 'incoming-webhooks.md'].includes(file);
/**
 * Preview only: the languages that keep their own pictures (the others show the English ones).
 * English alone by default, so every language fits a 512-file host with the guides' pictures;
 * DOCS_PREVIEW_PICTURES=en,tr keeps the Turkish pictures too (about 60 files more).
 */
const PREVIEW_PICTURES = (process.env.DOCS_PREVIEW_PICTURES ?? 'en').split(',').map((x) => x.trim()).filter(Boolean);
const imgLang = (lang: string) => (DATA_ONLY || (PREVIEW && !PREVIEW_PICTURES.includes(lang)) ? 'en' : lang);
/** Preview only: absolute docs addresses inside a piece of HTML or JSON, sent where the preview has them. */
const previewed = (text: string) =>
  PREVIEW || DATA_ONLY
    ? text
        .replace(/\/docs\/([A-Za-z-]+)\/img\//g, (_m, l: string) => `/docs/${imgLang(l)}/img/`)
        .replace(/\/docs\/([a-z]{2}(?:-[A-Z][a-z]{3})?)\/([a-z0-9-]+)\//g, (_m, l: string, slug: string) => `/docs/${pageLang(l, slug)}/${slug}/`)
    : text;
type Section = (typeof SECTIONS)[number];

/** The docs' own words in a language (docs.* in the dictionaries). */
function uiOf(lang: Lang) {
  const say = (k: string, vars?: Record<string, string | number>) => translate(lang, `docs.${k}` as MessageKey, vars);
  return {
    site: say('site'),
    search: say('search'),
    none: say('none'),
    app: say('app'),
    language: say('language'),
    onPage: say('onPage'),
    prev: say('prev'),
    next: say('next'),
    copy: say('copy'),
    copied: say('copied'),
    menu: say('menu'),
    skip: say('skip'),
    sections: { help: say('section.help'), developers: say('section.developers'), reference: say('section.reference'), releases: say('section.releases'), legal: say('section.legal') } as Record<Section, string>,
    lead: say('lead'),
    start: { help: say('start.help'), developers: say('start.developers'), reference: say('start.reference') },
    connections: { title: say('connections.title'), text: say('connections.text') },
    hero: say('hero'),
    askPlaceholder: say('ask.placeholder'),
    askLabel: say('askLabel'),
    ask: say('ask.open'),
    paths: say('paths'),
    asked: say('asked'),
    questions: [1, 2, 3, 4, 5, 6].map((n) => say(`q.${n}`)),
    recent: say('recent'),
    whatsNew: say('whatsNew'),
    allNotes: say('allNotes'),
    minutes: (n: number) => say('minutes', { n: new Intl.NumberFormat(intlTag(lang)).format(n) }),
    foot: 'Curahold',
    edited: say('edited'),
    inEnglish: say('inEnglish'),
    /** What the Ask panel says (docs/site/assets/ask.ts reads it from the page). */
    askWords: Object.fromEntries(
      ['open', 'title', 'close', 'hello', 'hi', 'thanks', 'empty', 'placeholder', 'from', 'more', 'also', 'unsure', 'none', 'support', 'helped', 'yes', 'no', 'sorry', 'loading', 'failed', 'you', 'ai'].map((k) => [k, say(`ask.${k}`)]),
    ),
    /** The AI assistant's consent notice, shown before a question goes to the server (assistConsent.*, shared/src/assistConsent.ts). */
    askConsent: {
      version: ASSIST_CONSENT_VERSION,
      ...Object.fromEntries(
        ['title', 'what', 'why', 'keep', 'withdraw', 'privacy', 'accept', 'decline', 'close', 'withdrawAction', 'withdrawn', 'declined'].map((k) => [k, translate(lang, `assistConsent.${k}` as MessageKey)]),
      ),
    },
    /** The question back and its choices for a question that means several things: the app's own words (assist.*). */
    askClarify: Object.fromEntries(CLARIFY.map((c) => [c.id, translate(lang, c.question as MessageKey)])),
    askOptions: Object.fromEntries(CLARIFY.flatMap((c) => c.options.map((o) => [o.id, translate(lang, o.label as MessageKey)]))),
  };
}

interface Page {
  lang: Lang;
  slug: string;
  title: string;
  summary: string;
  /** The search-result and share description: the summary, grown from the page's opening when it is short. */
  description: string;
  section: Section;
  order: number;
  md: string;
  /** The day the page last changed (YYYY-MM-DD), from the repository's history. */
  updated: string;
  /** Minutes to read. */
  minutes: number;
  html: string;
  toc: { id: string; text: string }[];
  text: string;
  /** Shown in English inside another language's docs (that language has no page of its own yet). */
  borrowed?: boolean;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', İ: 'i' };
// Headings become anchors in every script: Turkish letters fold to ASCII as they always did,
// letters of other scripts (Arabic, Hebrew, Han, kana, Hangul) stay as they are.
const slugify = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüİ]/g, (c) => FOLD[c] ?? c)
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

/** The day a file last changed, from git; today where there is no history (a fresh copy, a container build). */
function lastChange(file: string): string {
  try {
    const day = execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  } catch {
    /* no git here */
  }
  return new Date().toISOString().slice(0, 10);
}
// Gregorian in every language (Persian included, as the product writes its dates).
const longDate = (lang: Lang, day: string) => new Intl.DateTimeFormat(`${intlTag(lang)}-u-ca-gregory`.replace(/-u-(.*)-u-/, '-u-$1-'), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));

/** The width and height of a WebP picture, read from its header (for a page that does not shift as it loads). */
function webpSize(file: string): [number, number] | null {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') {
    const n = b.readUInt32LE(21);
    return [1 + (n & 0x3fff), 1 + ((n >> 14) & 0x3fff)];
  }
  return null;
}

/**
 * A page cut into the pieces "Ask" answers with: its opening, then one piece
 * per heading. Each keeps its HTML as the page shows it.
 */
function sectionsOf(lang: Lang, p: Page): DocSection[] {
  const out: DocSection[] = [];
  const html = p.html.replace(/<h1[\s\S]*?<\/h1>\n?/, '');
  const plain = (h: string) => h.replace(/<a class="anchor"[\s\S]*?<\/a>/, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  const heading = /<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>\n?/g;
  let from = 0;
  let at = { a: '', h: '' };
  const push = (to: number) => {
    const body = html.slice(from, to).trim();
    // A reference page's table of every address is for browsing; each address is its own piece below it.
    const index = p.section === 'reference' && /<table/.test(body) && (body.match(/<tr>/g)?.length ?? 0) > 12 && !at.a.includes('-');
    if (body && !index) out.push({ u: `/docs/${lang}/${p.slug}/`, a: at.a, t: p.title, h: at.h, m: body, s: p.section });
  };
  for (let m = heading.exec(html); m; m = heading.exec(html)) {
    push(m.index);
    at = { a: m[2], h: plain(m[3]) };
    from = heading.lastIndex;
  }
  push(html.length);
  return out;
}

/**
 * Search engines show about 155 characters of a description and many summaries are one short line
 * ("Every error code, its HTTP status and what it means."), which reads as thin (site review #11). A summary
 * under ~110 is grown with whole sentences from the page's own opening, never past ~160, so every word is
 * still the writers' own. Chinese, Japanese and Korean characters count double (a result line fits about half
 * as many); their summaries are mostly long enough already.
 */
function describe(summary: string, body: string): string {
  const width = (t: string) => t.length + (t.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? []).length;
  if (width(summary) >= 110) return summary;
  const opening = body
    .replace(/^#\s.*$/m, '') // the page title
    .split(/^#{2,}\s/m)[0] // up to the first section heading
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*\|.*$/gm, ' ') // tables are data, not sentences
    .replace(/^\s*<.*$/gm, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links keep their words
    .replace(/\{#[^}]*\}/g, ' ')
    .replace(/^\s*(?:>|[-*]|\d+\.)\s?/gm, '')
    .replace(/[*_`|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Whole sentences only: Latin, Arabic and Persian question marks, the Devanagari danda and CJK full stops.
  const sentences = opening.match(/[^.!?؟।。！？]+[.!?؟।。！？]+(?=\s|$)/gu) ?? [];
  let out = summary.trim();
  for (const raw of sentences) {
    const next = raw.trim();
    if (!next || out.includes(next) || next.includes(out)) continue;
    const joined = out ? `${out}${/[。！？]$/u.test(out) ? '' : ' '}${next}` : next;
    if (width(joined) > 160) continue; // too long to add whole: a later, shorter sentence may still fit
    out = joined;
    if (width(out) >= 110) break;
  }
  return out;
}

function parse(lang: Lang, file: string, from: Lang = lang): Page {
  const raw = readFileSync(join(SRC, from, file), 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!m) throw new Error(`${lang}/${file}: front matter missing`);
  const meta = Object.fromEntries(m[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]));
  const section = meta.section as Section;
  if (!SECTIONS.includes(section)) throw new Error(`${lang}/${file}: unknown section ${meta.section}`);
  const toc: Page['toc'] = [];
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        // "## Heading {#id}" keeps the same anchor in every language (the product links to it).
        const fixed = /\s*\{#([a-z0-9-]+)\}\s*$/;
        const text = this.parser.parseInline(tokens).replace(fixed, '');
        const plain = text.replace(/<[^>]+>/g, '');
        const id = fixed.exec(this.parser.parseInline(tokens))?.[1] ?? slugify(plain);
        if (depth === 2) toc.push({ id, text: plain });
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${text}</h${depth}>\n`;
      },
      code({ text, lang: l }: Tokens.Code) {
        return `<div class="code"><div class="code__bar"><span>${esc(l ?? '')}</span><button type="button" class="copy">${uiOf(lang).copy}</button></div><pre><code>${esc(text)}</code></pre></div>\n`;
      },
      // A picture of the product: img/<name>.webp next to the page's language folder, a real screen.
      image({ href, text }: Tokens.Image) {
        const m = /^img\/([\w-]+\.webp)$/.exec(href);
        if (!m) throw new Error(`${from}/${file}: pictures are img/<name>.webp (got ${href})`);
        // A language whose screens are not taken yet shows the English picture.
        const pic = existsSync(join(SRC, from, 'img', m[1])) ? from : 'en';
        const size = webpSize(join(SRC, pic, 'img', m[1]));
        if (!size) throw new Error(`${from}/${file}: ${href} is missing; take it with scripts/docs/shots.ts`);
        return `<img class="shot" src="/docs/${pic}/img/${m[1]}" width="${size[0]}" height="${size[1]}" alt="${esc(text)}" loading="lazy" decoding="async">`;
      },
      table(token: Tokens.Table) {
        const head = token.header.map((c) => `<th>${this.parser.parseInline(c.tokens)}</th>`).join('');
        const body = token.rows.map((r) => `<tr>${r.map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`).join('');
        // A wide table scrolls sideways inside its frame: the frame takes focus so the arrow keys can scroll it (WCAG 2.1.1).
        return `<div class="table" tabindex="0"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>\n`;
      },
    },
  });
  const html = marked.parse(m[2]) as string;
  const text = m[2].replace(/```[\s\S]*?```/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/[#>*_`|[\]()-]+/g, ' ').replace(/\s+/g, ' ').trim();
  // About 220 words a minute; Chinese, Japanese and Korean are counted by character instead (about 450).
  const wide = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? []).length;
  const minutes = Math.max(1, Math.round(text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, '').split(' ').filter(Boolean).length / 220 + wide / 450));
  return { lang, slug: file.replace(/\.md$/, ''), title: meta.title, summary: meta.summary ?? '', description: describe(meta.summary ?? '', m[2]), section, order: Number(meta.order ?? 99), md: m[2], updated: lastChange(join(SRC, from, file)), minutes, html, toc, text, borrowed: from !== lang };
}

/** The language menu's sign: a plain globe. */
const GLOBE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
const ASK_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.6 3.7a.6.6 0 0 1-1-.5V16A2.5 2.5 0 0 1 4 13.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
const ICONS = {
  help: '<path d="M5 4.5h9a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h9"/>',
  developers: '<path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/>',
  reference: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  connections: '<path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5"/>',
} as const;
const icon = (k: keyof typeof ICONS) => `<svg class="entry__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;

const MARK = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#eceafe"/><path d="M20.8 10.3A7.5 7.5 0 1 0 20.8 21.7" fill="none" stroke="#191541" stroke-width="3" stroke-linecap="round"/><circle cx="16.5" cy="16" r="2.6" fill="#2f8f78"/></svg>`;

/**
 * The production build's search tags for one page: an absolute canonical, hreflang to the
 * languages that have the page in their own words (and x-default English), and schema.org
 * TechArticle + BreadcrumbList. A page shown in English inside another language is a copy:
 * its canonical is the English page and it lists no alternates.
 */
function searchTags(lang: Lang, page: Page | null, path: string, site: string, sections: Record<Section, string>): string {
  const abs = (l: Lang) => `${DOCS_ORIGIN}/docs/${l}/${path}`;
  const canonical = abs(page?.borrowed ? 'en' : lang);
  const langs = page ? (page.borrowed ? [] : (OWN.get(page.slug) ?? [lang])) : LANGS;
  const alternates = langs.length > 1 ? [...langs.map((l) => `<link rel="alternate" hreflang="${bcp47Of(l)}" href="${abs(l)}">`), `<link rel="alternate" hreflang="x-default" href="${abs('en')}">`] : [];
  const home = `${DOCS_ORIGIN}/docs/${lang}/`;
  const org = { '@type': 'Organization', name: 'Curahold', url: 'https://curahold.com/' };
  const graph = page
    ? [
        { '@type': 'TechArticle', headline: page.title, description: page.description, inLanguage: bcp47Of(page.borrowed ? 'en' : lang), dateModified: page.updated, url: canonical, publisher: org },
        { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: site, item: home }, { '@type': 'ListItem', position: 2, name: sections[page.section] }, { '@type': 'ListItem', position: 3, name: page.title, item: canonical }] },
      ]
    : [{ '@type': 'WebSite', name: site, url: home, inLanguage: bcp47Of(lang), publisher: org }];
  const ld = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
  // A link to a help page shared in a chat or a post shows its title, summary and picture (site review #11).
  const og = [
    `<meta property="og:type" content="${page ? 'article' : 'website'}">`,
    `<meta property="og:site_name" content="${esc(site)}">`,
    `<meta property="og:title" content="${esc(page ? page.title : site)}">`,
    ...(page?.description ? [`<meta property="og:description" content="${esc(page.description)}">`] : []),
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:image" content="${OG_IMAGE}">`,
    `<meta property="og:locale" content="${bcp47Of(page?.borrowed ? 'en' : lang).replace('-', '_')}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ];
  return [`<link rel="canonical" href="${canonical}">`, ...alternates, ...og, `<script type="application/ld+json">${ld}</script>`].join('\n');
}

/** A page of the docs. `path` is where it sits inside a language ('' for the start page, '<slug>/'), so the language menu lands on the same page. */
function layout(lang: Lang, pages: Page[], page: Page | null, body: string, path: string) {
  const ui = uiOf(lang);
  const info = LOCALE_INFO[lang];
  const others = LANGS.filter((l) => l !== lang);
  const langLink = (l: Lang) => `<a href="/docs/${l}/${path}" hreflang="${bcp47Of(l)}" lang="${bcp47Of(l)}">${esc(LOCALE_INFO[l].name)}</a>`;
  const langMenu = others.length === 1 ? langLink(others[0]).replace('<a ', '<a class="top__link" ') : `<details class="langs"><summary class="top__link langs__now" aria-label="${esc(ui.language)}: ${esc(info.name)}">${GLOBE}<span>${esc(info.name)}</span></summary><div class="langs__menu">${others.map(langLink).join('')}</div></details>`;
  const nav = SECTIONS.map((s) => {
    const items = pages.filter((p) => p.section === s);
    if (!items.length) return '';
    const here = page && items.some((p) => p.slug === page.slug);
    return `<div class="nav__group${here ? ' nav__group--current' : ''}"><div class="nav__label">${ui.sections[s]}</div>${items
      .map((p) => `<a href="/docs/${lang}/${p.slug}/"${page?.slug === p.slug ? ' aria-current="page"' : ''}>${esc(p.title)}</a>`)
      .join('')}</div>`;
  }).join('');
  const title = page ? `${page.title} · ${ui.site}` : ui.site;
  return `<!doctype html>
<html lang="${bcp47Of(lang)}" dir="${info.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(page?.description || ui.lead)}">
<meta name="robots" content="${RELATIVE ? CLOSED_ROBOTS : 'index, follow, noai, noimageai'}">
${TDM_META}
${RELATIVE ? '' : searchTags(lang, page, path, ui.site, ui.sections)}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23191541'/%3E%3Cpath d='M20.8 10.3A7.5 7.5 0 1 0 20.8 21.7' fill='none' stroke='%23eceafe' stroke-width='3' stroke-linecap='round'/%3E%3Ccircle cx='16.5' cy='16' r='2.6' fill='%2367c2a8'/%3E%3C/svg%3E">
<link rel="stylesheet" href="/docs/assets/docs.css">
</head>
<body data-lang="${lang}">
<a class="skip" href="#main">${esc(ui.skip)}</a>
<header class="top">
  <button class="top__menu" type="button" aria-expanded="false" aria-controls="nav">${ui.menu}</button>
  <a class="brand" href="/docs/${lang}/">${MARK}<span>${ui.site}</span></a>
  <div class="search" role="search">
    <input id="q" type="search" placeholder="${ui.search}" aria-label="${ui.search}" autocomplete="off">
    <div id="results" class="results" hidden></div>
  </div>
  ${langMenu}
  <button class="top__ask" type="button" data-ask="">${ASK_ICON}<span>${ui.ask}</span></button>
  <a class="top__link top__app" href="/">${ui.app}</a>
</header>
<div class="frame${page ? '' : ' frame--home'}">
  <nav id="nav" class="nav" aria-label="${ui.site}">${nav}</nav>
  <main id="main" class="main">${body}</main>
  ${page && page.toc.length > 1 ? `<aside class="toc" aria-label="${ui.onPage}"><div class="toc__label">${ui.onPage}</div>${page.toc.map((h) => `<a href="#${h.id}">${esc(h.text)}</a>`).join('')}</aside>` : '<aside class="toc"></aside>'}
</div>
<script type="application/json" id="docs-cfg">${JSON.stringify({ lang, none: ui.none, copied: ui.copied, copy: ui.copy, base: '/docs/', index: '', words: { ...ui.askWords, examples: [ui.questions[1], ui.questions[3], ui.questions[2]], clarify: ui.askClarify, options: ui.askOptions, consent: ui.askConsent } }).replace(/</g, '\\u003c')}</script>
<script src="/docs/assets/docs.js" defer></script>
<script src="/docs/assets/ask.js" defer></script>
</body>
</html>
`;
}

function build() {
  mkdirSync(join(OUT, 'assets'), { recursive: true });
  const all = {} as Record<Lang, Page[]>;
  const filesOf = (l: Lang) => readdirSync(join(SRC, l)).filter((f) => f.endsWith('.md'));
  const english = filesOf('en');
  for (const lang of LANGS) {
    const own = new Set(filesOf(lang));
    const extra = [...own].filter((f) => !english.includes(f));
    if (extra.length) throw new Error(`${lang}: pages English does not have: ${extra.join(', ')}`);
    // English and Turkish carry every page; the other languages at least the whole user guide.
    const needed = english.filter((f) => WHOLE.includes(lang) || parse('en', f).section === 'help');
    const missing = needed.filter((f) => !own.has(f));
    if (missing.length) throw new Error(`${lang}: pages missing: ${missing.join(', ')}`);
    // The preview keeps to a small host's file budget (ADR 0016): past English, a language carries its user guide
    // (Turkish its legal pages too) and links to the English page for the rest. The nine other languages' legal
    // pages (90 files) stay out of the preview: with them it would pass 512; the production build has them all. Past Turkish, the one-vendor
    // setup guides link to English too: with eleven languages they alone were 150 files over the cap, and the
    // overview pages they hang off (Connections, Accounting) stay in the language. The production build keeps every page.
    const kept = (f: string) =>
      !PREVIEW || lang === 'en' || (['help', ...(lang === 'tr' ? ['legal'] : [])].includes(parse('en', f).section) && (lang === 'tr' || !VENDOR_GUIDE(f)));
    all[lang] = english.map((f) => parse(lang, f, own.has(f) && kept(f) ? lang : 'en')).sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.order - b.order);
    for (const p of all[lang]) if (p.borrowed) BORROWED.add(`${lang}/${p.slug}`);
    for (const p of all[lang]) if (!p.borrowed) OWN.set(p.slug, [...(OWN.get(p.slug) ?? []), lang]);
  }

  for (const lang of LANGS) {
    const pages = all[lang];
    const ui = uiOf(lang);
    pages.forEach((p, i) => {
      const prev = pages[i - 1];
      const next = pages[i + 1];
      const pager = `<nav class="pager">${prev ? `<a href="/docs/${lang}/${prev.slug}/"><small>${ui.prev}</small>${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="pager__next" href="/docs/${lang}/${next.slug}/"><small>${ui.next}</small>${esc(next.title)}</a>` : ''}</nav>`;
      const meta = `<p class="doc__meta">${ui.edited} <time datetime="${p.updated}">${longDate(lang, p.updated)}</time> · ${ui.minutes(p.minutes)}</p>`;
      // A page this language does not have yet is English, said so in the reader's language.
      const note = p.borrowed ? `<p class="doc__lang">${esc(ui.inEnglish)}</p>` : '';
      const body = `<div class="crumb"><a href="/docs/${lang}/">${ui.site}</a> › ${ui.sections[p.section]}</div>${note}<article class="doc"${p.borrowed ? ' lang="en" dir="ltr"' : ''}>${p.html.replace('</h1>', `</h1>${meta}`)}</article>${pager}<p class="legal-notice">${esc(noticeOf(lang).rights)} ${esc(noticeOf(lang).protected)}</p>`;
      // The preview links to the English page instead of keeping a copy of it, and has no .md twins.
      if (PREVIEW && p.borrowed) return;
      const dir = join(OUT, lang, p.slug);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'index.html'), layout(lang, pages, p, body, `${p.slug}/`));
      if (!PREVIEW) writeFileSync(join(OUT, lang, `${p.slug}.md`), `# ${p.title}\n\n${p.md.trim()}\n`);
    });
    const by = (slug: string) => pages.find((p) => p.slug === slug);
    const link = (slug: string) => (by(slug) ? `<a href="/docs/${lang}/${slug}/">${esc(by(slug)!.title)}</a>` : '');
    // Four ways in, by what the reader came to do.
    const entries: { key: keyof typeof ICONS; title: string; text: string; to: string; links: string[] }[] = [
      { key: 'help', title: ui.sections.help, text: ui.start.help, to: 'getting-started', links: ['getting-started', 'customers', 'tasks'] },
      { key: 'developers', title: ui.sections.developers, text: ui.start.developers, to: 'developers', links: ['quickstart', 'api-reference', 'webhooks'] },
      { key: 'reference', title: ui.sections.reference, text: ui.start.reference, to: 'ref-customers', links: ['ref-customers', 'ref-tasks', 'ref-errors'] },
      { key: 'connections', title: ui.connections.title, text: ui.connections.text, to: 'connections', links: ['connections', 'connect-your-own-tool', 'ai-assistants'] },
    ];
    const entryCards = entries
      .map((e) => `<section class="entry" data-entry="${e.key}">${icon(e.key)}<h2><a href="/docs/${lang}/${e.to}/">${esc(e.title)}</a></h2><p>${esc(e.text)}</p><ul>${e.links.map((l) => `<li>${link(l)}</li>`).join('')}</ul></section>`)
      .join('');
    // The first three things a new company does, in order.
    const steps = ['getting-started', 'customers', 'roles-and-access']
      .map(by)
      .filter((x): x is Page => !!x)
      .map((x) => `<li><a href="/docs/${lang}/${x.slug}/">${esc(x.title)}</a><span>${esc(x.summary)}</span></li>`)
      .join('');
    const asked = ui.questions.map((q) => `<li><button type="button" data-ask="${esc(q)}">${esc(q)}</button></li>`).join('');
    const recent = [...pages]
      .filter((x) => x.section !== 'legal')
      .sort((a, b) => b.updated.localeCompare(a.updated) || a.order - b.order)
      .slice(0, 5)
      .map((x) => `<li><a href="/docs/${lang}/${x.slug}/">${esc(x.title)}</a><time datetime="${x.updated}">${longDate(lang, x.updated)}</time></li>`)
      .join('');
    const notes = by('release-notes');
    const latest = notes?.toc[0];
    const news = notes && latest ? `<p class="news"><strong>${ui.whatsNew}:</strong> <a href="/docs/${lang}/release-notes/#${latest.id}">${esc(latest.text)}</a> · <a href="/docs/${lang}/release-notes/">${ui.allNotes}</a></p>` : '';
    const footLinks = ['security-and-privacy', 'legal-privacy', 'legal-terms', 'legal-kvkk', 'legal-accessibility'].map(link).filter(Boolean).join(' · ');
    const home = `<div class="home">
<section class="hero">
  <h1>${ui.hero}</h1>
  <p>${ui.lead}</p>
  <form class="hero__ask" data-ask-form>
    <input type="text" maxlength="300" autocomplete="off" placeholder="${esc(ui.askPlaceholder)}" aria-label="${esc(ui.askLabel)}">
    <button type="submit">${ui.ask}</button>
  </form>
</section>
<div class="entries">${entryCards}</div>
<div class="home__cols">
  <section><h2>${ui.paths}</h2><ol class="steps">${steps}</ol></section>
  <section><h2>${ui.asked}</h2><ul class="asked">${asked}</ul></section>
  <section><h2>${ui.recent}</h2><ul class="recent">${recent}</ul></section>
</div>
${news}
<footer class="foot"><span>${esc(noticeOf(lang).rights)}</span><span>${footLinks}</span><small class="legal-notice">${esc(noticeOf(lang).protected)}</small></footer>
</div>`;
    mkdirSync(join(OUT, lang), { recursive: true });
    writeFileSync(join(OUT, lang, 'index.html'), layout(lang, pages, null, home, ''));
    // The pictures of the product in this language (scripts/docs/shots.ts).
    if (existsSync(join(SRC, lang, 'img')) && imgLang(lang) === lang) cpSync(join(SRC, lang, 'img'), join(OUT, lang, 'img'), { recursive: true });
    writeFileSync(join(OUT, lang, 'answers.json'), previewed(JSON.stringify(pages.flatMap((p) => sectionsOf(lang, p)))));
    writeFileSync(
      join(OUT, lang, 'search.json'),
      previewed(JSON.stringify(pages.map((p) => ({ u: `/docs/${lang}/${p.slug}/`, t: p.title, s: ui.sections[p.section], h: p.toc.map((h) => [h.id, h.text]), x: p.text.slice(0, 6000) })))),
    );
  }
  // /docs/ opens in English; the Turkish docs are one click away on every page.
  writeFileSync(
    join(OUT, 'index.html'),
    `<!DOCTYPE html><html lang="en"><meta charset="utf-8"><title>Curahold Docs</title><meta http-equiv="refresh" content="0; url=/docs/en/"><script>location.replace('/docs/en/')</script><a href="/docs/en/">Curahold Docs</a> · <a href="/docs/tr/">Curahold Belgeleri</a></html>`,
  );
  copyFileSync(join(ROOT, 'docs', 'site', 'assets', 'docs.css'), join(OUT, 'assets', 'docs.css'));
  copyFileSync(join(ROOT, 'docs', 'site', 'assets', 'docs.js'), join(OUT, 'assets', 'docs.js'));
  buildSync({ entryPoints: [join(ROOT, 'docs', 'site', 'assets', 'ask.ts')], outfile: join(OUT, 'assets', 'ask.js'), bundle: true, minify: true, format: 'iife', target: 'es2020', logLevel: 'silent' });
  // The same open fonts as the app (SIL OFL), served from here.
  for (const [pkg, files] of [
    ['figtree', ['figtree-latin-wght-normal.woff2', 'figtree-latin-ext-wght-normal.woff2']],
    ['bricolage-grotesque', ['bricolage-grotesque-latin-wght-normal.woff2', 'bricolage-grotesque-latin-ext-wght-normal.woff2']],
  ] as const) {
    for (const name of files) {
      const from = join(ROOT, 'node_modules', '@fontsource-variable', pkg, 'files', name);
      if (existsSync(from)) copyFileSync(from, join(OUT, 'assets', name));
    }
  }

  if (RELATIVE) {
    // A preview may only use fonts kept inside its stylesheet, so they move in there.
    const cssFile = join(OUT, 'assets', 'docs.css');
    const css = readFileSync(cssFile, 'utf8').replace(/url\(([\w-]+\.woff2)\)/g, (m, name: string) => {
      const font = join(OUT, 'assets', name);
      if (!existsSync(font)) return m;
      const data = readFileSync(font).toString('base64');
      rmSync(font);
      return `url(data:font/woff2;base64,${data})`;
    });
    writeFileSync(cssFile, css);
  }

  // For AI assistants: a map of the docs, and everything in one file.
  const en = all.en;
  const llms = [
    '# Curahold',
    '',
    '> Work management for customer success and account teams: customers and their stakeholders, tasks and boards, renewals, and the chat apps and CRMs a team already uses. Every company has its own address, <company>.curahold.com.',
    '',
    'An MCP server for AI assistants runs at https://<company>.curahold.com/mcp (OAuth 2.1 with dynamic client registration). The REST API is at https://<company>.curahold.com/api with personal API keys (Bearer chk_…).',
    '',
    ...SECTIONS.flatMap((s) => {
      const items = en.filter((p) => p.section === s);
      return items.length ? [`## ${uiOf('en').sections[s]}`, '', ...items.map((p) => `- [${p.title}](/docs/en/${p.slug}.md): ${p.summary}`), ''] : [];
    }),
    // Every other language, by its own name, with the pages it has itself.
    ...LANGS.filter((l) => l !== 'en').flatMap((l) => [`## ${LOCALE_INFO[l].name}`, '', ...all[l].filter((p) => !p.borrowed).map((p) => `- [${p.title}](/docs/${l}/${p.slug}.md): ${p.summary}`), '']),
  ].join('\n');
  if (!RELATIVE) writeFileSync(join(OUT, '..', 'llms.txt'), llms);
  // The docs' own sitemap: every page in each language that has it, with the day it last changed.
  if (!RELATIVE) {
    const url = (l: Lang, path: string) => `${DOCS_ORIGIN}/docs/${l}/${path}`;
    const entry = (l: Lang, path: string, langs: Lang[], mod?: string) =>
      `  <url>\n    <loc>${url(l, path)}</loc>\n${mod ? `    <lastmod>${mod}</lastmod>\n` : ''}${[...langs.map((x) => `    <xhtml:link rel="alternate" hreflang="${bcp47Of(x)}" href="${url(x, path)}"/>`), `    <xhtml:link rel="alternate" hreflang="x-default" href="${url('en', path)}"/>`].join('\n')}\n  </url>`;
    const rows = LANGS.flatMap((l) => [entry(l, '', LANGS), ...all[l].filter((p) => !p.borrowed).map((p) => entry(l, `${p.slug}/`, OWN.get(p.slug) ?? [l], p.updated))]);
    writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${rows.join('\n')}\n</urlset>\n`);
  }
  writeFileSync(join(OUT, 'llms-full.txt'), en.map((p) => `# ${p.title}\n\nSource: /docs/en/${p.slug}/\n\n${p.md.trim()}\n`).join('\n\n'));
  if (RELATIVE) {
    makeRelative(OUT);
    // No server to send the reader on from the folder's own address: it opens on the English start page itself.
    writeFileSync(join(OUT, 'index.html'), readFileSync(join(OUT, 'en', 'index.html'), 'utf8').replaceAll('"../', '"./'));
  }
  if (DATA_ONLY) keepData(OUT);
  console.log(`docs: ${english.length} pages × ${LANGS.length} languages (${LANGS.map((l) => `${l} ${all[l].filter((p) => !p.borrowed).length}`).join(', ')} of their own) → ${OUT}`);
}

/** DOCS_DATA_ONLY: only the search and answer files, and the pictures the answers show. */
function keepData(out: string) {
  const answers = readdirSync(out).filter((l) => existsSync(join(out, l, 'answers.json')));
  const pictures = new Set(answers.flatMap((l) => [...readFileSync(join(out, l, 'answers.json'), 'utf8').matchAll(/\/docs\/([A-Za-z-]+\/img\/[\w.-]+)/g)].map((m) => m[1])));
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      const rel = relative(out, file).split(/[\\/]/).join('/');
      if (statSync(file).isDirectory()) {
        walk(file);
        if (!readdirSync(file).length) rmSync(file, { recursive: true });
      } else if (!/^[A-Za-z-]+\/(search|answers)\.json$/.test(rel) && !pictures.has(rel)) rmSync(file);
    }
  };
  walk(out);
}

/**
 * Rewrites every page so its links are relative to itself: the folder can then
 * be opened from any address, with no server deciding what `/docs/` means.
 */
function makeRelative(dir: string, root = dir) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) {
      makeRelative(file, root);
      continue;
    }
    if (!name.endsWith('.html')) continue;
    const depth = relative(root, dir).split(/[\\/]/).filter(Boolean).length;
    const up = depth ? '../'.repeat(depth) : './';
    const html = previewed(readFileSync(file, 'utf8'))
      .replace(/(href|src)="\/docs\/assets\//g, `$1="${up}assets/`)
      .replace(/src="\/docs\/([A-Za-z-]+)\/img\//g, (_m, lang) => `src="${up}${lang}/img/`)
      .replace(/href="\/docs\/([a-z]{2}(?:-[A-Z][a-z]{3})?)\/((?:[a-z0-9-]+\/)?)(#[^"]*)?"/g, (_m, lang, slug, hash) => `href="${up}${lang}/${slug}index.html${hash ?? ''}"`)
      .replace('class="top__link top__app" href="/"', `class="top__link top__app" href="${/^[a-z]+:/.test(APP_HREF) ? APP_HREF : `${up}${APP_HREF}`}"`)
      .replace('"base":"/docs/","index":""', `"base":"${up}","index":"index.html"`)
      // The language chooser at the top of the folder.
      .replace('content="0; url=/docs/en/"', 'content="0; url=en/index.html"')
      .replace("location.replace('/docs/en/')", "location.replace('en/index.html')");
    writeFileSync(file, html);
  }
}

build();
