# 0020. The sales site and docs are indexed on purpose: one page per intent, honest markup, AI answer crawlers off by default

- Status: Accepted (the AI answer crawler default is the product owner's open question)
- Date: 2026-11-20
- Deciders: product owner, engineering

## Context

A review of the sales site (curahold.com) and the help centre found working basics (canonical, hreflang, a sitemap)
but weak signals: 148 titles under 25 characters, descriptions too short in Chinese, Japanese and Korean, two animated
versions of the landing page open to indexing in nine languages, a structured-data price ($19) that differed from the
price on the page ($15, yearly), footer column titles as headings, an SVG share image that social networks do not show,
and docs hreflang that pointed languages at English pages with relative addresses. The site must stay free to run (no
paid SEO service, no runtime dependency) and make only true claims.

## Decision

- **Titles and descriptions are written per page and per language** (`site/info/<lang>.ts` `seo`), for that market's
  searches and glossary terms. Lengths are held by `tests/site-seo.test.ts`: 45–60 / 100–160 characters, and 25–40 /
  70–100 in Chinese, Japanese and Korean, which carry about twice the meaning per character.
- **The animated versions (`/ai/`, `/orbit/`) are `noindex, follow`, with no hreflang and no sitemap entry.** They
  retell the landing page. A canonical pointing at the landing page would be a hint that search engines drop when two
  pages differ this much; noindex is a rule they keep, and mixing the two sends opposite signals.
- **Structured data quotes the page.** /pricing/ lists one `Offer` per plan and billing interval with a per-seat-a-month
  `UnitPriceSpecification`, read from `shared/src/billing.ts`; the landing page gives the `AggregateOffer` range its
  summary names. `FAQPage` sits only where questions are shown in full and only once (/faq/ and /pricing/; the landing
  page's questions repeat /faq/'s). No ratings or reviews are marked up because none exist.
- **Sitemaps:** an index (`sitemap.xml`) and one file per language; no `<priority>`; `<lastmod>` is the last git change
  of the site's sources or a post's date, and is left out rather than guessed (`SITE_LASTMOD` overrides).
- **The share image is a brand-only PNG** (`site/og.png`, drawn by `scripts/site-og.mts`): no words, so one picture
  serves every language.
- **The site's languages are one list** (`site/locales.ts`). An app language without site copy is listed as pending and
  gets no page and no hreflang.
- **Docs (production build only):** absolute canonical; hreflang only to languages that have the page in their own
  words; a page shown in English inside another language is a copy whose canonical is the English page; `TechArticle` +
  `BreadcrumbList`; a docs sitemap. The docs origin is `DOCS_ORIGIN` (default: the app address the site links to). The
  relative and preview builds stay closed to crawlers and add no files (ADR 0016's file limit holds).
- **Speed:** the four hand-written sheets stay as they are for editing; the build minifies them (esbuild, already a dev
  tool), cuts each kind of page's styles to the classes it uses (`scripts/site-css.ts`), inlines what the first screen
  needs and loads the rest at low priority without blocking. Latin pages preload their two fonts; body text uses
  `font-display: optional` so a late font never repaints the page; other scripts use their system faces and download
  no font. The first screen is never hidden for an animation. Trade-off: every page carries its first-screen styles
  inline (about 10 KB compressed on the landing page) instead of a cached file.
- **AI crawlers:** training crawlers are always refused. Answer engines (the robots that fetch for an AI search answer)
  stay refused by default on both the site and the docs, as before; one build-time setting opens the site to them
  (`SITE_AI_CRAWLERS=allow`) and one runtime setting opens the docs host (`CRAWLERS_DOCS_AI=allow`). Changing the
  default is the product owner's decision.

## Alternatives considered

- Templates that compose titles from page names: tested, and most failed the length rules or read unnaturally in
  six of nine languages.
- Canonical from the animated versions to the landing page: see above.
- One sitemap file: fine at today's size, but per-language files let each market's search console be read on its own.
- A share image per language with a tagline: needs a font per script inside the renderer and nine files to keep in
  step; a brand-only image says the same thing everywhere.
- Allowing answer engines now: likely good for being cited in AI answers, but it is a policy change on content use
  that belongs to the owner.

## Consequences

- A new page needs a `seo` entry in every language; the test fails until it has one in range.
- Adding Hindi or Malay to the site is a data change: `site/locales.ts`, the copy files, and removing them from
  `SITE_PENDING`; hreflang and sitemaps follow.
- If the docs move to `curahold.com/docs/` (the review's recommendation), set `DOCS_ORIGIN` and redirect the old
  addresses.
- Search-console verification needs the owner's accounts; it is a checklist, not code.
