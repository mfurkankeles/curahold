# 0014. One consent library for every surface; consent and contract evidence are append-only and hash-chained

- Status: Accepted
- Date: built 16–19 Nov 2026, recorded 2026-11-19
- Deciders: product owner, engineering (legal review pending for non-Turkish/English texts)

## Context

The product, the portal, the sales site, the demo and the trial form all set browser storage or collect consent.
Rules differ by country (KVKK, GDPR/ePrivacy, Gulf PDPL; India and Singapore next), and in a dispute the company must
prove what a person saw and accepted. Five surfaces with five banners would drift apart.

## Decision

- One pure library (`shared/src/consent/`) used everywhere; it applies the strictest rule served: nothing optional
  before an explicit choice, analytics and marketing as separate switches, advertising pixels off by configuration
  even with consent (`CURAHOLD_MARKETING_PIXELS`), re-ask after a year or a new policy version.
- `scripts/compliance/inventory.ts` scans the code for anything stored in a browser and fails when a key is not in
  the inventory (`docs/compliance/storage-inventory.json`), which also writes the cookie policy in every language.
- Consent records and click-accept evidence (`consent_events`, `agreement_evidence`; migrations 0100, 0160, 0180) are
  append-only rows with the document version, language, a SHA-256 of the exact words shown, and a hash chain
  (`row_hash = sha256(prev_hash + fields)`, advisory lock against forks); `verifyAgreementChain` detects edits.
- Trial consent texts are versioned rule sets per country (`shared/src/compliance/consentTexts.ts`).

## Alternatives considered

- A third-party consent platform: a paid service, another processor, and less control over the evidence.
- Storing only "accepted = true": no proof of what was shown.

## Consequences

- Any new cookie or localStorage key fails CI until it is in the inventory with a purpose.
- Placeholders (company legal name, storage location) must be filled before go-live; texts other than Turkish and
  English need native legal review.
