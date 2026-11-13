# Contributing to Curahold

Welcome. This file is the short path from "I cloned it" to "my change is merged". For the long tour of the code read
[docs/DEVELOPER.md](docs/DEVELOPER.md); for *why* things are the way they are read
[ARCHITECTURE.md](ARCHITECTURE.md) and [docs/ADR/](docs/ADR/README.md).

## Priorities (they decide arguments)

From QUALITY.md, in order: **1. data safety and correctness (no loss, no wrong data, no leak between companies)**,
2. speed, 3. simplicity and personalization, 4. real-time, 5. design, 6. feature count. Gross margin is a budget every
change must fit, not a priority. If two goals conflict, the lower number wins.

## Set up

```bash
nvm use                 # Node version from .nvmrc (22)
npm ci
npm run dev             # API :8787 (in-memory Postgres + demo company) and web :5173
# open http://demo.localhost:5173  and sign in as ada@demo.example (the link is printed in the terminal)
```

All demo people and companies are invented. Keep it that way.

## The loop

| You want to | Run |
| --- | --- |
| Check types | `npm run typecheck` |
| Lint (warnings are OK, errors are not) | `npm run lint` |
| Format a file you touched | `npx prettier --write path/to/file` |
| Run the whole suite on the in-memory database | `npm test` |
| Run the whole suite on real Postgres (before a release, or when touching SQL) | `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm test` |
| Run only the three required guards | `npm run test:isolation`, `npm run test:leak`, `npm run test:i18n` |
| One file | `npx vitest run tests/tasks.test.ts` |
| Typecheck + tests together | `npm run check` |
| Browser journeys | `npm run test:e2e` (builds; needs Chrome) |

Per QUALITY.md the test loop is lean: run the relevant tests while you work, the full suite once before opening the PR, and do
not re-run the same test repeatedly. The full suite should stay under five minutes.

## What CI checks

Pull requests run `.github/workflows/ci.yml`: typecheck, lint, the full suite on PGlite and on a Postgres 16 service, the build
and the Docker image build. **Required** (branch protection): "CI gate", which includes **RLS isolation (postgres)**,
**Leak scan** and **i18n completeness**. A nightly workflow runs the browser end-to-end tests. CI never deploys.

## Lint and existing debt

The codebase predates the linter, so lint is set up to be **green with warnings today** and to never block a build or a commit:

- ESLint reports `any` (explicit), the non-null assertion `!`, and `react-hooks/*` problems (including `exhaustive-deps`) as
  **warnings**. The existing ones are tolerated; **do not add new ones** in code you write or touch. Reviewers will ask.
- Real errors (syntax, unreachable code, duplicate keys, etc.) fail `npm run lint`.
- There is **no pre-commit hook** that blocks you. If you like one, make it non-blocking (`npx eslint --quiet $(git diff --name-only --cached)` and ignore its exit code).
- Prettier is configured (`.prettierrc.json`, width 160, single quotes) but most existing files are not formatted yet. **Do not reformat
  files you are not otherwise changing** and never run `npm run format` inside a feature PR: it creates unreviewable diffs. A single
  dedicated "format everything" PR will be done by the maintainer. In the meantime format only the lines you touch.
- Why no `typescript-eslint`? It does not support TypeScript 7 yet (upstream issue 10940). ESLint parses TypeScript through
  `@babel/eslint-parser`; type safety is `tsc --noEmit`'s job. See the header of `eslint.config.js` for the swap-in plan.
- To pay debt down: pick a file you are already changing, fix the warnings in it, mention it in the PR.

## Rules of the road

1. **Tenant isolation is not negotiable.**
   - Routes use `run(c, ...)` / `db.tenant(...)`. Never take a connection that is not scoped to the company.
   - `db.system(...)` runs as the owner and **bypasses row-level security**. Use it only where no company is in scope
     (migrations, sign-in lookups, webhooks, scheduler, sync) and **always filter by `org_id`**. A new `system()` query that touches
     company tables must satisfy `tests/rls.test.ts`; do not grow its baseline casually.
   - New table with company data: migration with `org_id`, `enable row level security`, a policy on `app_org()`, grants. The gate fails without them.
2. **Migrations are append-only.** New file `db/migrations/NNNN_name.sql`, next number. Never edit an applied migration. Prefer additive changes so
   a code rollback stays possible. Both PGlite and Postgres must run it.
3. **Every write is safe to repeat.** Mutations support `Idempotency-Key`; side effects (notifications, chat messages, emails, webhooks, CRM writes) go through
   the outbox in the same transaction. Deleted things go to the trash.
4. **Every user-visible string exists in English and Turkish** (`shared/src/i18n/en.ts` and `tr.ts`; add with `npm run strings`). Other languages fall back
   to English. No hard-coded text in components. Company terminology is substituted at runtime; never write "customer" literally where a company can rename it.
5. **No hard-coded company assumptions.** Terms, stages, fields, roles and health rules are configuration.
6. **Speed budget.** Respect the targets in QUALITY.md (first screen JS <= 170 KB gzip, API read p95 <= 150 ms, write p95 <= 250 ms). Avoid N+1 queries, index
   what you filter on. Big changes: run `scripts/perf.ts` on a throwaway Postgres.
7. **Errors are for people.** Throw `fail('code')` with a translated message; do not leak internals. Unexpected errors are recorded automatically.
8. **Secrets and data.** Never commit secrets, `.env`, real customer data or real company/person names. Use invented examples (Acme, Ada, `ada@demo.example`).
   `tests/leak.test.ts` will fail the build, and it scans Markdown too. It matches words by hash, so a perfectly ordinary word can trip it
   (for example, one generic word for the global network); if it flags your doc, find the word by bisecting the file and rephrase.
9. **Docs travel with code.** New env var: `docs/ENVIRONMENT.md` (+ `selfhost.env.example`). New decision with trade-offs: an ADR. User-visible change: `CHANGELOG.md`
   under Unreleased. Help pages for customers live in `docs/site/en` and `docs/site/tr`.

## Branches, commits, PRs

- Branch from `main`: `feat/short-name`, `fix/short-name`, `docs/short-name`.
- Small, focused commits. Imperative subject under ~72 characters ("Fix idempotency key claim on retry"); body explains *why*.
- Open a PR against `main`; fill in the template (what/why, how verified, tenant-isolation impact, risk). One reviewer minimum. Squash-merge.
- Keep PRs reviewable (a few hundred lines). Pure refactors and formatting go in their own PRs.
- Anything touching `db/migrations/`, auth/sessions, `db.system()` calls, billing or `lib/headers.ts` needs a second look from the maintainer.
- **Releases and deploys are manual** and happen only on the product owner's go-ahead; see [docs/RUNBOOK.md](docs/RUNBOOK.md).

## Adding things (pointers)

| Task | Start here |
| --- | --- |
| A table or column | new migration; `docs/DEVELOPER.md` "adding a table"; run `tests/rls.test.ts` |
| An endpoint | a router in `api/src/routes/`, mount in `app.ts`; permission check; test (isolation sweep picks it up automatically) |
| A screen | `web/src/pages/`; strings in both dictionaries |
| A string | `npm run strings` |
| A language | one dictionary file + `LOCALE_INFO` entry in `shared/src/i18n` (ADR 0005) |
| A CRM adapter | `api/src/sync/adapters/` implementing `CrmAdapter`; register in `adapters/index.ts`; stub-based test (see `tests/adapters.test.ts`) |
| A chat connector | `api/src/connectors/messaging/` |
| An env setting | `Env` + `configFromEnv` in `api/src/worker.ts`; `docs/ENVIRONMENT.md` |

## Getting help

Read `docs/DEVELOPER.md` first, then ask the maintainer. If something in these docs is wrong or stale, fix it in the same PR.
