// The content hub's pages: /resources/ (the index), /templates/<slug>/ and /glossary/<slug>/,
// in every site language. Words: site/hub-content.ts. Each page is an InnerPage, so it gets the
// shared head, header, footer, hreflang, sitemap entry and breadcrumb from scripts/build-site.ts.
// Structured data: the index is a CollectionPage holding a DefinedTermSet; a term is a
// DefinedTerm in that set; a template is an Article.
import { bcp47Of } from '../shared/src/i18n';
import { hubCopy, type HubBlock } from '../site/hub-content';
import type { SiteLocale } from '../site/locales';
import { GLYPH, localeBase } from './site-chrome';
import { closing, hero, type InnerPage, type PageUrls } from './site-pages';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Where the hub and its items live under a language's base. */
export const HUB_PATH = { index: 'resources/', item: (kind: 'template' | 'term', slug: string) => `${kind === 'template' ? 'templates' : 'glossary'}/${slug}/` };

const block = (b: HubBlock) =>
  'h' in b ? `<h2>${esc(b.h)}</h2>` : 'p' in b ? `<p>${esc(b.p)}</p>` : 'ol' in b ? `<ol>${b.ol.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : `<ul>${b.ul.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;

/** Every hub page of one language: the index, then each template and term. */
export function hubPages(locale: SiteLocale, urls: PageUrls, origin: string): InnerPage[] {
  const h = hubCopy(locale);
  const base = localeBase(locale);
  const lang = bcp47Of(locale);
  const setId = `${origin}${base}${HUB_PATH.index}#glossary`;
  const link = (kind: 'template' | 'term') =>
    h.items
      .filter((i) => i.kind === kind)
      .map((i) => `<li><a href="${base}${HUB_PATH.item(i.kind, i.slug)}"><h3>${esc(i.name)}</h3><p>${esc(i.lead)}</p></a></li>`)
      .join('');
  const index: InnerPage = {
    path: HUB_PATH.index,
    title: h.seo[0],
    description: h.seo[1],
    crumb: h.nav[0],
    main: `${hero(locale, { crumb: h.nav[0], title: h.title, lead: h.lead, glyph: GLYPH.blog, urls })}
  <section class="ip__group"><div class="wrap"><h2 class="ip__gh">${esc(h.templates)}</h2><ul class="ip__tiles hub__list">${link('template')}</ul></div></section>
  <section class="ip__group" id="glossary"><div class="wrap"><h2 class="ip__gh">${esc(h.glossary)}</h2><ul class="ip__tiles hub__list">${link('term')}</ul></div></section>
  ${closing(locale, urls)}`,
    ld: (url) => [
      { '@type': 'CollectionPage', name: h.title, url, inLanguage: lang },
      { '@type': 'DefinedTermSet', '@id': setId, name: h.glossary, inLanguage: lang, hasDefinedTerm: h.items.filter((i) => i.kind === 'term').map((i) => ({ '@type': 'DefinedTerm', name: i.name, url: `${origin}${base}${HUB_PATH.item(i.kind, i.slug)}` })) },
    ],
  };
  const items: InnerPage[] = h.items.map((i) => ({
    path: HUB_PATH.item(i.kind, i.slug),
    title: i.seo[0],
    description: i.seo[1],
    crumb: i.name,
    main: `${hero(locale, { crumb: i.name, title: i.name, lead: i.lead, urls, compact: true })}
  <section class="ip__body"><div class="wrap"><div class="hub__doc">${i.body.map(block).join('')}
    <div class="ip__note"><h2>${esc(h.inCurahold)}</h2><p>${esc(i.curahold)}</p></div>
    <p class="ip__who"><a href="${base}${HUB_PATH.index}">${esc(h.nav[0])}</a></p></div></div></section>
  ${closing(locale, urls)}`,
    ld: (url) =>
      i.kind === 'term'
        ? [{ '@type': 'DefinedTerm', name: i.name, description: i.lead, url, inLanguage: lang, inDefinedTermSet: { '@id': setId } }]
        : [{ '@type': 'Article', headline: i.name, description: i.seo[1], url, inLanguage: lang, publisher: { '@id': `${origin}/#org` } }],
  }));
  return [index, ...items];
}
