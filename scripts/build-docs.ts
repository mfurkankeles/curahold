// Builds the public documentation (docs/site/<lang>/*.md) into static pages
// under dist/web/docs, served at <company>.curahold.com/docs/ and on the
// sales site. Also writes llms.txt and llms-full.txt, so AI assistants can
// read the docs, and a small search index per language. No server, no
// third-party script, nothing to run: it costs nothing to host.
//
//   npx tsx scripts/build-docs.ts [outDir] [--relative]
//
// With --relative every link is written relative to the page, so the
// folder works wherever it is put (inside the try-it demo, in a preview).
// DOCS_APP_HREF says where "Go to the app" leads from the docs folder then.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Marked, type Tokens } from 'marked';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'docs', 'site');
const ARGS = process.argv.slice(2);
const OUT = ARGS.find((a) => !a.startsWith('--')) ?? join(ROOT, 'dist', 'web', 'docs');
const RELATIVE = ARGS.includes('--relative') || process.env.DOCS_RELATIVE === '1';
const APP_HREF = process.env.DOCS_APP_HREF ?? '../index.html';
const LANGS = ['tr', 'en'] as const;
type Lang = (typeof LANGS)[number];
const SECTIONS = ['help', 'developers', 'releases', 'legal'] as const;
type Section = (typeof SECTIONS)[number];

const UI = {
  tr: {
    site: 'Curahold Belgeleri',
    search: 'Belgelerde ara',
    none: 'Sonuç yok.',
    app: 'Uygulamaya git',
    other: 'English',
    onPage: 'Bu sayfada',
    prev: 'Önceki',
    next: 'Sonraki',
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    menu: 'Menü',
    sections: { help: 'Yardım merkezi', developers: 'Geliştiriciler', releases: 'Sürüm notları', legal: 'Yasal' },
    lead: 'Curahold’u kullanmak, ekibine göre ayarlamak ve kendi araçlarına bağlamak için ihtiyacın olan her şey.',
    start: { help: 'Ekibinle Curahold’u kullanmaya başla: müşteriler, görevler, roller, ana sayfa ve bağlantılar.', developers: 'API anahtarları, webhook’lar, Claude ile ChatGPT için bağlayıcı ve Curahold’u kendi sunucunda çalıştırmak.', releases: 'Neler yeni, neler değişti.', legal: 'Kullanım koşulları, gizlilik, KVKK, veri işleme sözleşmesi ve alt işleyenler.' },
    edited: 'Son güncelleme',
  },
  en: {
    site: 'Curahold Docs',
    search: 'Search the docs',
    none: 'No results.',
    app: 'Open the app',
    other: 'Türkçe',
    onPage: 'On this page',
    prev: 'Previous',
    next: 'Next',
    copy: 'Copy',
    copied: 'Copied',
    menu: 'Menu',
    sections: { help: 'Help center', developers: 'Developers', releases: 'Release notes', legal: 'Legal' },
    lead: 'Everything you need to use Curahold, set it up for your team and connect it to your own tools.',
    start: { help: 'Get your team going: customers, tasks, roles, home pages and connections.', developers: 'API keys, webhooks, the connector for Claude and ChatGPT, and running Curahold on your own server.', releases: 'What is new and what changed.', legal: 'Terms of service, privacy, the KVKK notice, the data processing agreement and sub-processors.' },
    edited: 'Last updated',
  },
} as const;

interface Page {
  lang: Lang;
  slug: string;
  title: string;
  summary: string;
  section: Section;
  order: number;
  md: string;
  html: string;
  toc: { id: string; text: string }[];
  text: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', İ: 'i' };
const slugify = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüİ]/g, (c) => FOLD[c] ?? c)
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

function parse(lang: Lang, file: string): Page {
  const raw = readFileSync(join(SRC, lang, file), 'utf8');
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
        const text = this.parser.parseInline(tokens);
        const plain = text.replace(/<[^>]+>/g, '');
        const id = slugify(plain);
        if (depth === 2) toc.push({ id, text: plain });
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${text}</h${depth}>\n`;
      },
      code({ text, lang: l }: Tokens.Code) {
        return `<div class="code"><div class="code__bar"><span>${esc(l ?? '')}</span><button type="button" class="copy">${UI[lang].copy}</button></div><pre><code>${esc(text)}</code></pre></div>\n`;
      },
      table(token: Tokens.Table) {
        const head = token.header.map((c) => `<th>${this.parser.parseInline(c.tokens)}</th>`).join('');
        const body = token.rows.map((r) => `<tr>${r.map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`).join('');
        return `<div class="table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>\n`;
      },
    },
  });
  const html = marked.parse(m[2]) as string;
  const text = m[2].replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`|[\]()-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { lang, slug: file.replace(/\.md$/, ''), title: meta.title, summary: meta.summary ?? '', section, order: Number(meta.order ?? 99), md: m[2], html, toc, text };
}

const MARK = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#eceafe"/><path d="M20.8 10.3A7.5 7.5 0 1 0 20.8 21.7" fill="none" stroke="#191541" stroke-width="3" stroke-linecap="round"/><circle cx="16.5" cy="16" r="2.6" fill="#2f8f78"/></svg>`;

function layout(lang: Lang, pages: Page[], page: Page | null, body: string, otherHref: string) {
  const ui = UI[lang];
  const nav = SECTIONS.map((s) => {
    const items = pages.filter((p) => p.section === s);
    if (!items.length) return '';
    return `<div class="nav__group"><div class="nav__label">${ui.sections[s]}</div>${items
      .map((p) => `<a href="/docs/${lang}/${p.slug}/"${page?.slug === p.slug ? ' aria-current="page"' : ''}>${esc(p.title)}</a>`)
      .join('')}</div>`;
  }).join('');
  const title = page ? `${page.title} · ${ui.site}` : ui.site;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(page?.summary ?? ui.lead)}">
<link rel="alternate" hreflang="${lang === 'tr' ? 'en' : 'tr'}" href="${otherHref}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23191541'/%3E%3Cpath d='M20.8 10.3A7.5 7.5 0 1 0 20.8 21.7' fill='none' stroke='%23eceafe' stroke-width='3' stroke-linecap='round'/%3E%3Ccircle cx='16.5' cy='16' r='2.6' fill='%2367c2a8'/%3E%3C/svg%3E">
<link rel="stylesheet" href="/docs/assets/docs.css">
</head>
<body data-lang="${lang}">
<a class="skip" href="#main">${lang === 'tr' ? 'İçeriğe geç' : 'Skip to content'}</a>
<header class="top">
  <button class="top__menu" type="button" aria-expanded="false" aria-controls="nav">${ui.menu}</button>
  <a class="brand" href="/docs/${lang}/">${MARK}<span>${ui.site}</span></a>
  <div class="search" role="search">
    <input id="q" type="search" placeholder="${ui.search}" aria-label="${ui.search}" autocomplete="off">
    <div id="results" class="results" hidden></div>
  </div>
  <a class="top__link" href="${otherHref}" hreflang="${lang === 'tr' ? 'en' : 'tr'}">${ui.other}</a>
  <a class="top__link top__app" href="/">${ui.app}</a>
</header>
<div class="frame">
  <nav id="nav" class="nav" aria-label="${ui.site}">${nav}</nav>
  <main id="main" class="main">${body}</main>
  ${page && page.toc.length > 1 ? `<aside class="toc" aria-label="${ui.onPage}"><div class="toc__label">${ui.onPage}</div>${page.toc.map((h) => `<a href="#${h.id}">${esc(h.text)}</a>`).join('')}</aside>` : '<aside class="toc"></aside>'}
</div>
<script>window.APP_DOCS=${JSON.stringify({ lang, none: ui.none, copied: ui.copied, copy: ui.copy, base: '/docs/', index: '' })}</script>
<script src="/docs/assets/docs.js" defer></script>
</body>
</html>
`;
}

function build() {
  mkdirSync(join(OUT, 'assets'), { recursive: true });
  const all: Record<Lang, Page[]> = { tr: [], en: [] };
  for (const lang of LANGS) {
    const files = readdirSync(join(SRC, lang)).filter((f) => f.endsWith('.md'));
    all[lang] = files.map((f) => parse(lang, f)).sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.order - b.order);
  }
  // Both languages must have the same pages, so the language switch always lands.
  const missing = all.tr.map((p) => p.slug).filter((s) => !all.en.some((p) => p.slug === s)).concat(all.en.map((p) => p.slug).filter((s) => !all.tr.some((p) => p.slug === s)));
  if (missing.length) throw new Error(`pages missing in one language: ${missing.join(', ')}`);

  for (const lang of LANGS) {
    const other: Lang = lang === 'tr' ? 'en' : 'tr';
    const pages = all[lang];
    const ui = UI[lang];
    pages.forEach((p, i) => {
      const prev = pages[i - 1];
      const next = pages[i + 1];
      const pager = `<nav class="pager">${prev ? `<a href="/docs/${lang}/${prev.slug}/"><small>${ui.prev}</small>${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="pager__next" href="/docs/${lang}/${next.slug}/"><small>${ui.next}</small>${esc(next.title)}</a>` : ''}</nav>`;
      const body = `<div class="crumb">${ui.sections[p.section]}</div><article class="doc">${p.html}</article>${pager}`;
      const dir = join(OUT, lang, p.slug);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'index.html'), layout(lang, pages, p, body, `/docs/${other}/${p.slug}/`));
      writeFileSync(join(OUT, lang, `${p.slug}.md`), `# ${p.title}\n\n${p.md.trim()}\n`);
    });
    const cards = SECTIONS.map((s) => {
      const first = pages.find((p) => p.section === s);
      if (!first) return '';
      const list = pages.filter((p) => p.section === s).map((p) => `<li><a href="/docs/${lang}/${p.slug}/">${esc(p.title)}</a><span>${esc(p.summary)}</span></li>`).join('');
      return `<section class="home__card" data-section="${s}"><h2>${ui.sections[s]}</h2><p>${ui.start[s]}</p><ul>${list}</ul></section>`;
    }).join('');
    const home = `<div class="home"><h1>${ui.site}</h1><p class="home__lead">${ui.lead}</p>${cards}</div>`;
    mkdirSync(join(OUT, lang), { recursive: true });
    writeFileSync(join(OUT, lang, 'index.html'), layout(lang, pages, null, home, `/docs/${other}/`));
    writeFileSync(
      join(OUT, lang, 'search.json'),
      JSON.stringify(pages.map((p) => ({ u: `/docs/${lang}/${p.slug}/`, t: p.title, s: ui.sections[p.section], h: p.toc.map((h) => [h.id, h.text]), x: p.text.slice(0, 6000) }))),
    );
  }
  // /docs/ picks the reader's language.
  writeFileSync(
    join(OUT, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Curahold Docs</title><meta http-equiv="refresh" content="0; url=/docs/en/"><script>location.replace(/^tr\\b/i.test(navigator.language||'')?'/docs/tr/':'/docs/en/')</script><a href="/docs/en/">Curahold Docs</a> · <a href="/docs/tr/">Curahold Belgeleri</a>`,
  );
  copyFileSync(join(ROOT, 'docs', 'site', 'assets', 'docs.css'), join(OUT, 'assets', 'docs.css'));
  copyFileSync(join(ROOT, 'docs', 'site', 'assets', 'docs.js'), join(OUT, 'assets', 'docs.js'));
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
      return items.length ? [`## ${UI.en.sections[s]}`, '', ...items.map((p) => `- [${p.title}](/docs/en/${p.slug}.md): ${p.summary}`), ''] : [];
    }),
    '## Türkçe',
    '',
    ...all.tr.map((p) => `- [${p.title}](/docs/tr/${p.slug}.md): ${p.summary}`),
    '',
  ].join('\n');
  if (!RELATIVE) writeFileSync(join(OUT, '..', 'llms.txt'), llms);
  writeFileSync(join(OUT, 'llms-full.txt'), en.map((p) => `# ${p.title}\n\nSource: /docs/en/${p.slug}/\n\n${p.md.trim()}\n`).join('\n\n'));
  if (RELATIVE) makeRelative(OUT);
  console.log(`docs: ${all.tr.length} pages × ${LANGS.length} languages → ${OUT}`);
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
    const html = readFileSync(file, 'utf8')
      .replace(/(href|src)="\/docs\/assets\//g, `$1="${up}assets/`)
      .replace(/href="\/docs\/(en|tr)\/((?:[a-z0-9-]+\/)?)(#[^"]*)?"/g, (_m, lang, slug, hash) => `href="${up}${lang}/${slug}index.html${hash ?? ''}"`)
      .replace('class="top__link top__app" href="/"', `class="top__link top__app" href="${up}${APP_HREF}"`)
      .replace('"base":"/docs/","index":""', `"base":"${up}","index":"index.html"`)
      // The language chooser at the top of the folder.
      .replace('content="0; url=/docs/en/"', 'content="0; url=en/index.html"')
      .replace("?'/docs/tr/':'/docs/en/'", "?'tr/index.html':'en/index.html'");
    writeFileSync(file, html);
  }
}

build();
