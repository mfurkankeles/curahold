# Changelog

All notable changes to Curahold are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it is released (`package.json` is `0.1.0`, unreleased).

How to use this file: add a line under **Unreleased** in the same PR as the change, in the right group (Added, Changed,
Deprecated, Removed, Fixed, Security). Write for a customer or an operator, not for the compiler. On release, rename
Unreleased to the version and date and start a new Unreleased section. Use invented examples only.

## [Unreleased]

### Changed

- Charts use a new eight-colour palette that starts from the brand violet and stays readable for colour-blind people in light
  and dark (neighbouring colours were too close before: green and orange-red could not be told apart in dark). A ninth group is
  shown as "Other" instead of repeating a colour. In the owner console every state (paid, overdue, at risk …) shows an icon with
  its words, not only a colour.

### Added

- Billing: plan limits on full seats, connected tools, sync frequency, file space and CuraAI answers a month, shown with your
  use on Settings → Billing; regional prices (INR, SGD; USD for Malaysia and the Gulf with a local guide price) with tax added
  by Paddle; a 30-day grace after a failed payment. The price list is one data file (`shared/src/plans.json`).
- Cost model (`scripts/quality/cost.mts`): unit cost per company and per seat for 1–300 customers, fixed costs and break-even,
  every input with its source in `scripts/quality/cost.inputs.json`.
- Consent before every AI assistant chat (in the app, the customer portal and the public docs): a short notice of what goes to the
  AI provider, why, for how long, with the privacy notice, and equal **Accept** / **Decline**. The server refuses a question without a
  "yes" to the current notice version (`consent_required`); each answer is recorded (who, when, version, language) and in the activity
  log; withdraw any time under CuraAI or in Your settings; a new notice version asks again (migration 0243).
- Deleting the whole company (Settings → Company): typed confirmation, 30-day grace period with cancel, then everything goes, files and
  connection keys included, with a deletion certificate; invoices stay for tax law (migration 0241).
- Nightly retention purges for the stated periods: trial requests 12 months, consent proof 3 years (a "yes" in force is kept), help
  requests 24 months, activity log 12 months; configurable with `RETENTION_*` (docs/ENVIRONMENT.md §6e).
- Download and erase for people at customers (portal people), not only switching them off.

- Engineering foundation for new owners: GitHub Actions CI (`.github/workflows/ci.yml`) with typecheck, lint, the full test suite on
  PGlite and on Postgres 16, build, Docker image build check, and required guards for row-level-security isolation, the repository leak
  scan and i18n completeness; a nightly end-to-end workflow; a pull request template.
- ESLint (flat config) and Prettier configuration, `lint`, `lint:fix`, `format` and `format:check` scripts. Existing `any`, non-null `!` and
  `react-hooks` findings are warnings, so lint passes today.
- `.nvmrc` (Node 22) and `engines.node >= 22`, matching the Dockerfile.
- Documentation: `ARCHITECTURE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/RUNBOOK.md`, `docs/ENVIRONMENT.md` and architecture decision
  records in `docs/ADR/`.
- Test scripts `test:isolation`, `test:leak` and `test:i18n` for the three required guards.

### Changed

- Billing runs on one path (ADR 0019): Paddle's notifications go to `/api/inbound/billing/paddle`; the older
  `/api/billing/webhook` runs the same handler. Settings → Billing is one screen.
- The AI assistant is off for a company until an administrator turns it on, as the privacy texts say; existing companies were switched
  off (migration 0240), the demo stays on.
- Erasing a person also removes their CuraAI questions, notifications, chat links, sign-in factors, recordings and mentions in AI notes.
- Consent records can no longer be changed, only anonymised (migration 0241).
- Dev dependencies: added `eslint`, `@eslint/js`, `@babel/eslint-parser`, `@babel/core`, `eslint-plugin-react-hooks`, `globals` and `prettier`
  (`@babel/*` patch updates came with them). `typescript-eslint` is deliberately not used because it does not support TypeScript 7 yet.

### Fixed

- _Nothing yet._

### Security

- _Nothing yet._

### Known issues

- `tests/i18n.test.ts` fails on a clean checkout: the audit action `billing.refused` (written in `api/src/lib/billing.ts`) has no
  `audit.billing.refused` string in `shared/src/i18n/en.ts` / `tr.ts`. Because the i18n check is a required CI job, this must be fixed
  (add the two strings, e.g. with `npm run strings`) before the gate can go green.
- `db/OPS-SECURITY.md` is referenced from `api/src/lib/headers.ts` and `tests/rls.test.ts` but does not exist; the content it was meant to
  hold is now in `SECURITY.md` ("Known operational requirements"). Update the two comments when convenient.
- Edge rate limiting, database role separation (`FORCE ROW LEVEL SECURITY` with a non-owner login), an off-site backup with a rehearsed
  restore, and a `SECRETS_KEY` re-seal tool are not in place yet; see `SECURITY.md` and `docs/RUNBOOK.md`.
- Prettier has not been applied to the existing code; run it once in a dedicated PR.
