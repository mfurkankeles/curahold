// Where the documentation lives.
//
// On a real address the server serves it at /docs/, and a link opens it in a
// new tab. The try-it demo is one page with its files beside it and no server:
// there the docs are a folder next to the page (docs/…/index.html), and a link
// opens in the same frame, because a new tab cannot be opened from it.
const DEMO = !!import.meta.env.APP_DEMO;

/** The address of a docs page: `docsHref('en/webhooks')`, or the start page with no argument. */
export function docsHref(path = ''): string {
  const clean = path.replace(/^\/docs\//, '').replace(/^\/|\/$/g, '');
  if (!DEMO) return `/docs/${clean ? `${clean}/` : ''}`;
  return `docs/${clean ? `${clean}/` : ''}index.html`;
}

/** A data file of the docs, such as the search index. */
export const docsFile = (path: string): string => (DEMO ? `docs/${path}` : `/docs/${path}`);

/** Spread on a docs link: a new tab where that works. */
export const docsLink = DEMO ? {} : ({ target: '_blank', rel: 'noreferrer' } as const);
