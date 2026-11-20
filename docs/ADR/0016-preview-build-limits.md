# 0016. Static previews of the docs and demo fit the preview host's file limits by design

- Status: Accepted
- Date: 2026-11-19
- Deciders: engineering

## Context

Before a domain and hosting exist, the help centre and the in-browser demo are shared as static previews. The preview
host takes a limited number of files per upload (about 512 for the docs, about 256 for the demo in practice). The full
docs build (every page in nine languages, a `.md` twin per page, screenshots per language) is several times that.

## Decision

- `scripts/build-docs.ts --preview` (or `DOCS_PREVIEW=1`) makes a small copy: all languages, no `.md` twins, a page a
  language lacks links to the English page instead of copying it, and languages other than English show the English
  screenshots (`DOCS_PREVIEW_PICTURES=en,tr` keeps more). `DOCS_DATA_ONLY=1` keeps only what the demo reads at run
  time when its docs links go elsewhere.
- The demo build (`npm run build:demo`) keeps its output under the demo cap; the demo hub has its own stylesheet so it
  does not depend on the sales site's markup.
- The production builds are unchanged by any of this.

## Alternatives considered

- Drop languages from the preview: hides most of the product's reach from reviewers.
- Bundle everything into a few large files: breaks direct links and search.

## Consequences

- Preview screenshots are English outside English (and Turkish when asked); that is a preview limitation, not a bug.
- Publishing a new demo: publish to a private test copy first, check it loads, then replace the shared one.
- When real hosting exists, these flags matter only for previews.
