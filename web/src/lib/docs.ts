// Where the documentation lives.
//
// On a real address the server serves it at /docs/, and a link opens it in a
// new tab. The try-it demo is one page with its files beside it and no server:
// there the docs are a folder next to the page (docs/…/index.html), and a link
// opens in the same frame, because a new tab cannot be opened from it.
//
// A demo built with DEMO_DOCS_URL (vite.demo.config.ts) keeps only the docs'
// data files beside it (search, answers, pictures) and sends every docs link to
// that address instead — the start page of a docs copy published elsewhere —
// in a new tab.
import { addressOf, withLinks, type DocSection } from '../../../shared/src/answers';

const DEMO = !!import.meta.env.APP_DEMO;
const AWAY: string = (import.meta.env.APP_DOCS_URL as string | undefined) ?? '';

/** The address of a docs page: `docsHref('en/webhooks')`, or the start page with no argument. */
export function docsHref(path = ''): string {
  if (AWAY) return AWAY;
  const clean = path.replace(/^\/docs\//, '').replace(/^\/|\/$/g, '');
  if (!DEMO) return `/docs/${clean ? `${clean}/` : ''}`;
  return `docs/${clean ? `${clean}/` : ''}index.html`;
}

/** A data file of the docs, such as the search index. */
export const docsFile = (path: string): string => (DEMO ? `docs/${path}` : `/docs/${path}`);

/** Spread on a docs link: a new tab where that works. */
export const docsLink = DEMO && !AWAY ? {} : ({ target: '_blank', rel: 'noreferrer' } as const);

// Where the docs live for this reader, in the form the answers' links need.
const base = AWAY ? '/docs/' : docsHref().replace(/index\.html$/, '');
const tail = !AWAY && docsHref().endsWith('index.html') ? 'index.html' : '';

/** A section of a docs page (an answer's source), for this reader. */
export const docsSectionHref = (s: DocSection): string => AWAY || addressOf(s, base, tail);

/** A docs address as the docs write it (/docs/en/webhooks/), for this reader. */
export const docsUrlHref = (url: string): string => AWAY || `${base}${url.replace(/^\/docs\//, '')}`;

/** A piece of a docs page (an answer), with its links and pictures working here. */
export function docsHtml(html: string): string {
  let out = withLinks(html, base, tail);
  if (AWAY) out = out.replace(/href="\/docs\/[^"]*"/g, `href="${AWAY}" target="_blank" rel="noreferrer"`);
  // The pictures are files beside the page in the demo (docs/<lang>/img/).
  return DEMO ? out.replace(/src="\/docs\//g, `src="${docsFile('')}`) : out;
}
