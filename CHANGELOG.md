# Changelog

All notable changes to Curahold are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it is released (`package.json` is `0.1.0`, unreleased).

How to use this file: add a line under **Unreleased** in the same PR as the change, in the right group (Added, Changed,
Deprecated, Removed, Fixed, Security). Write for a customer or an operator, not for the compiler. On release, rename
Unreleased to the version and date and start a new Unreleased section. Use invented examples only.

## [Unreleased]

### Added

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
