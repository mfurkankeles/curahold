# 0005. Two complete languages; other languages fall back to English

- Status: Accepted
- Date: 2026-11-12
- Deciders: product owner

## Context

The first market is Turkey, the product is sold worldwide. Every visible word must be right in at least Turkish and
English, and adding a language must be cheap and safe. Turkish also has real correctness traps (dotted and dotless
`i`, case mapping, sorting).

## Decision

- Dictionaries live in `shared/src/i18n/`: `en.ts` (the source of keys) and `tr.ts` are **complete and kept in
  lockstep**; `ar`, `he`, `fa`, `ja`, `ko`, `zh-Hans`, `zh-Hant` are enabled with the correct name, reading direction
  (RTL for Arabic, Hebrew, Persian) and BCP-47 tag, and **fall back to English for any key not yet translated**
  (`translate()`), so a language can ship before its dictionary is finished.
- `tests/i18n.test.ts` is a **required CI check**: `en` and `tr` have exactly the same keys and placeholders; every
  error code, permission, priority, status and audit action used by the API has a string; the interface contains no
  user-visible text that bypasses the dictionaries.
- Adding a language means adding **one dictionary file** and one `LOCALE_INFO` entry; no other code changes.
- Company terminology (customer / account / client / brand ...) is data, substituted into strings at runtime
  (`Terms`), so the same dictionary serves every company's vocabulary.
- Locale is per person (falls back to the company's); server-side sorting uses a per-locale `sort_text` so Turkish
  search and ordering are correct ("isik" finds "Işık", "istanbul" finds "İstanbul").
- New strings are added with `npm run strings` (`scripts/add-strings.ts`).

## Alternatives considered

- **Machine-translate everything at build time.** Rejected: product language must be reviewed by a human; a wrong
  translation of a permission or billing message is worse than English.
- **Block releases until every language is complete.** Rejected: it would make adding a language a project instead of a file.
- **ICU/third-party i18n framework.** Not needed at this size; the typed key set gives compile-time safety.

## Consequences

- A PR that adds UI text without both `en` and `tr` entries fails CI. This is deliberate friction.
- Partially translated languages are visible to users as English fragments; do not market a language as supported until it is complete.
- The failing key at the time of writing (`audit.billing.refused`, see CHANGELOG "Known issues") shows the gate works.
