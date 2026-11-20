# 0008. Every language the product offers is complete; no English fallback in shipped screens

- Status: Accepted (supersedes 0005)
- Date: rule from 15 Nov 2026, recorded 2026-11-19
- Deciders: product owner, engineering

## Context

ADR 0005 shipped English and Turkish complete and let seven other languages fall back to English key by key. In
practice a half-English screen reads as broken to a buyer in Tokyo or Riyadh, and the sales site, help centre and
assistant were already being written in those languages. Translation quality also drifted: one concept got two words
in the same language.

## Decision

- Every user-facing string lives in all dictionaries in `shared/src/i18n/` (`en` defines the keys). `tests/i18n.test.ts`
  fails when any language misses a key or a `{placeholder}`; `tests/i18n-no-pairs.test.ts` fails on an English/Turkish
  pair written in place or an "is it Turkish?" branch.
- Built-in content (templates, stages, reports) is `phrase('key')`, resolved from the dictionaries when read; once a
  company creates something from it, it is stored as data and never re-translated.
- One term per concept per language, recorded in `shared/src/i18n/glossary.ts` with a translate / keep-English / both
  decision and its source; `tests/i18n-quality.test.ts` checks it.
- The help centre is whole in every language that has a folder (`HELP_LANGUAGES`); the assistant's evaluation asks in
  all of them.
- Adding a language = a dictionary file, a `LOCALE_INFO` line, a glossary column, help pages, eval cases. Nothing else
  in the code knows how many languages exist.

## Alternatives considered

- Keep the fallback (0005): cheapest per feature, but every new string silently ships English to seven markets.
- Machine translation at run time: per-request cost, no review, wrong product words.

## Consequences

- Every feature pays for nine (soon eleven) translations up front; a feature is not done until they exist.
- `scripts/add-strings.ts` writes every language in `LOCALES` and refuses a key that lacks one (done 20 Nov 2026;
  it used to write only English and Turkish).
- Legal texts in languages other than Turkish and English need a native legal review before they are relied on.
