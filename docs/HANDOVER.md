# First week as CTO

You are taking over Curahold: work management for customer-facing teams (sales, onboarding, support, customer
success, product), multi-tenant SaaS on Cloudflare Workers + Postgres, also shippable as a one-company self-hosted
server. This page is the order to read things in, the map, how to run, test and ship, the risks you inherit and who
decides what. It links to the detailed docs instead of repeating them.

Last checked against the code: 19 November 2026 (main `ede9932` plus the handover-audit commits).

## Your first week, day by day

| Day | Do | Done when |
| --- | --- | --- |
| 1 | Clone, `nvm use`, `npm ci`, `npm run dev`, sign in at http://demo.localhost:5173 as `ada@demo.example` (link in the terminal). Click through boards, a customer page, departments, the onboarding hub (`/onboarding`), setup health, the assistant. Read this page, then [ARCHITECTURE.md](../ARCHITECTURE.md) sections 1–4. | You can explain how a request finds its company and why another company's rows are invisible. |
| 2 | Read [DEVELOPER.md](DEVELOPER.md) top to bottom and [SECURITY.md](../SECURITY.md) "isolation model". Run `npm run typecheck` and the three guards: `npm run test:isolation`, `npm run test:leak`, `npm run test:i18n`. Read `api/src/app.ts` (middleware order) and `api/src/context.ts` (`run()`, `requirePerm()`). | You know the three database modes (`tenant`, `portal`, `system`) and which code uses `system()`. |
| 3 | Decisions: read the [ADR index](ADR/README.md) (19 records) and skim [QUALITY.md](../QUALITY.md) (the product owner's quality brief and dated decision log, in Turkish; its priority order decides arguments). Read [RUNBOOK.md](RUNBOOK.md) deploy, rollback, backups. | You can say which decisions are open (ADR 0019) and which are settled. |
| 4 | Make a small change end to end with the checklist below (a read-only endpoint plus a screen line plus a help sentence), on a branch. Run only the tests it touches, then `npm run check` once. | Your change passes CI locally without touching any guard. |
| 5 | Walk the top 10 risks below with the product owner; agree an order. Read the code health report if you have it (`npm run lint:comments`, the knip and duplication numbers in the "Code health" section). Plan the first month. | A dated plan with owners for each risk. |

## Map of the code

```
api/src/            the server (Hono). Entry points: worker.ts (Cloudflare app), portal-worker.ts (portal),
                    node.ts (local, e2e), selfhost.ts (one company on Node). app.ts mounts everything.
  routes/           ~60 routers, one per area (tasks, accounts, records, departments, onboardingPlans, setupHealth,
                    assist, billing + subscriptions, desk, owner, office, team, portal, mcp …)
  lib/              logic shared by routes and jobs (scheduler, notify, automations, health, onboarding, setupHealth,
                    botGuard, ratelimit, humanCheck, agreementEvidence, smtpRelay, crypto, sessions …)
  assistant/        the one assistant core, its provider, caps and store (ADR 0010)
  team/             the operator's AI team: runtime, gate, monitor, judge, meetings (ADR 0011)
  sync/             CRM, spreadsheet, ticket, accounting, warehouse adapters + the two-way sync engine
  connectors/       chat apps (Slack, Teams, Google Chat, generic webhooks)
  billing/          the table-backed billing path (ADR 0019 — there is a second, older path in lib/ + routes/)
  live/             live updates: Durable Object per company (Cloudflare) or LISTEN/NOTIFY (Node)
  db/               the Db seam and its two drivers (postgres.js, PGlite) + the migration runner
shared/src/         pure TypeScript for both sides: model.ts (types), i18n/ (one dictionary per language, glossary),
                    billing, departments, onboarding, setupHealth, consent/, compliance/, team/ …
web/src/            the React app: App.tsx (routing), pages/, components/, lib/ (api client, store, i18n), office/ (3D)
web/portal/         the customer portal app (own bundle, own domain);  web/demo/ the in-browser demo page
db/migrations/      the schema and row-security policies, append-only (0001 … 0211)
db/rollback/        hand-run undo scripts for big recent migrations (not migrations);  db/ops/ role separation template
docs/site/<lang>/   the help centre — also what the assistant knows;  scripts/docs/ builds pictures and API reference
site/               the sales site and demo hub generators (scripts/build-site.ts)
scripts/            dev server, migrate, seeds, builds, perf and load tests, quality measurements (scripts/quality/)
tests/              ~130 Vitest files (API level, PGlite or real Postgres), tests/e2e (Chrome), tests/assistant-eval
```

The dependency rule: `shared` imports nothing else; `api` and `web` import `shared`, never each other; `lib/` never
imports `routes/`.

## Answers to the questions a new CTO asks

| Question | Short answer | Read |
| --- | --- | --- |
| Architecture | One Hono app behind four entry points; Postgres with row security; R2 for files; hourly cron; one Durable Object per company for live updates. Hosted on Cloudflare + Supabase EU; self-host is the same code on Node + Docker. | ARCHITECTURE 1–2, 10; ADR 0001, 0003 |
| Data model and tenancy | One schema; every company table has `org_id`, a row-security policy on `app_org()`, and paired foreign keys `(org_id, id)` so rows cannot point across companies. Companies are found by host name (`<slug>.curahold.com`). | ARCHITECTURE 3–4; ADR 0004 |
| Auth, roles, RLS | Magic link or Google/Microsoft OIDC (PKCE), SAML/SCIM for SSO, passkeys and TOTP as a second step; host-only session cookie + device id, device limit per seat. Roles carry permission lists, checked in routes (`requirePerm`) and in SQL (`app_has_perm`); field rules in `lib/fieldAccess.ts`; department walls in SQL (ADR 0009). | ARCHITECTURE 4–5; SECURITY |
| How a request flows | `web/src/lib/api.ts` → `app.ts` (security headers, robot guard, company from host, forgery-header check, session) → route validates with zod → `run(c, q => …)` opens a transaction as `curahold_app` with the company and person set → mappers → JSON; errors via `fail('code')`. Side effects go to an outbox in the same transaction. | DEVELOPER 3; ARCHITECTURE 6 |
| Jobs and schedulers | One hourly entry, `runScheduled` in `lib/scheduler.ts` (Cloudflare cron, or `setInterval` on Node): digests, automations, outbox drain, health scores, syncs, onboarding sweep, trial reminders, 03:00 clean-up, 05:00 renewals, seat sync. Each job isolated, idempotent. The AI team's wakes are **not** scheduled yet. | ARCHITECTURE 8 |
| Assistant and AI team | One core for every chat surface; free rules and cache first; read-only tools as the asker; caps $100/month install, $5 per company (up to $50); docs search when no key. The AI team only proposes; the operator's own yes runs anything outside, through server-held runners; a monitor pauses misbehaving seats; team cap $40/month. | ADR 0010, 0011; ARCHITECTURE 11 |
| i18n | Nine complete languages today (Hindi and Malay being added), one dictionary per language, glossary per concept, RTL for Arabic, Hebrew, Persian. Tests fail on any missing key or inline language pair. | ARCHITECTURE 9a; ADR 0008 |
| Billing | Paddle as merchant of record, per-seat Team/Business plans (`shared/src/billing.ts`), three-month trial, off entirely unless configured. **Two code paths exist; pick one before live keys.** | README "Billing"; ADR 0002, 0017, 0019 |
| Deploy and rollback | Manual only, on the owner's go-ahead: checks → `npm run migrate` (additive) → `npx wrangler deploy` (+ portal). Rollback: `npx wrangler rollback`; migrations are forward-only (two-step destructive changes); `db/rollback/` for the large recent ones. | RUNBOOK |
| Monthly running costs | See the table below. Per seat the servers cost cents; the fixed floor is small; model spend is capped by configuration. | `npx tsx scripts/quality/cost.mts`; docs/design/costs.md |
| Add a feature end to end | Checklist below. | DEVELOPER 5 |
| Tests and gates | Vitest at API level on PGlite (and real Postgres in CI), Chrome journeys, demo tours, assistant eval. Required CI gate: typecheck, lint, full suite (PGlite + Postgres), RLS isolation, leak scan, i18n completeness, build, Docker image. Nothing deploys from CI. | CONTRIBUTING "What CI checks"; `.github/workflows/ci.yml` |
| Security model | Isolation in the database first; `system()` reviewed against a shrinking baseline; secrets sealed with AES-GCM; CSP/HSTS; rate limits, robot refusals and human checks on public doors; support access only by time-boxed grant; append-only audit and evidence. | SECURITY; docs/security/threat-model.md; db/OPS-SECURITY.md; ADR 0014, 0015 |
| Where decisions live | `docs/ADR/` (engineering reasons), `QUALITY.md` (the owner's dated decisions and quality targets; Turkish), `CHANGELOG.md`, and `CONTRIBUTING.md` priorities. Owner questions still open are tracked outside the repo by the product owner. | ADR README |

## Run, test, ship

```bash
nvm use && npm ci                 # Node 22, exact dependencies
npm run dev                       # API :8787 (PGlite + demo company) and web :5173
npm run typecheck                 # ~30 s
npx vitest run tests/<file>.test.ts --maxWorkers=1   # what you touched, while you work
npm run test:isolation && npm run test:leak && npm run test:i18n   # the three guards
npm run check                     # typecheck + the whole suite, once before a PR
npm run build && npm run start:local                # the built app on :8787
npm run test:e2e                  # Chrome journeys (needs Chrome)
npm run lint && npm run lint:comments                # warnings allowed; comments baseline must not grow
```

Ship: follow RUNBOOK "Deploy" exactly (database first, then the Worker, then the portal Worker), then its five-minute
verification. Never deploy without the product owner's explicit go-ahead.

### Adding a feature end to end

1. **Data**: a migration `db/migrations/NNNN_name.sql` with `org_id`, row security, policies and grants; a line in
   `tests/isolation.test.ts` if the data is sensitive. Shared types in `shared/src/`.
2. **Route**: in `api/src/routes/<area>.ts` with a doc comment; zod input; `requirePerm` / `requireWriter`; work inside
   `run()`; `audit()` for changes; `fail('code')` errors with words in every dictionary. The isolation sweep
   (`tests/isolation-routes.test.ts`) picks the route up by itself.
3. **API reference**: its sentence in `scripts/docs/catalogue.ts` (or `INTERNAL`), then `npm run docs:reference`.
4. **UI**: page or component with a header comment, route in `App.tsx`, menu in `Shell.tsx`; design tokens only
   (`docs/design/tokens.md`); every string in every dictionary; desktop and phone checked.
5. **Help**: a page or section in `docs/site/<lang>/` for every language, pictures via `scripts/docs/shots.ts`, an entry
   in `shared/src/helpLinks.ts`.
6. **Assistant**: eval cases in `tests/assistant-eval/cases.ts` in every language (`cite:` the page); a read-only tool in
   `shared/src/assistant.ts` if it should answer from live data.
7. **Tests**: an API test with `tests/helpers.ts` (`setup()`, `login()`); an e2e step if it is a new screen; setup check
   or onboarding signal if relevant.
8. **Docs**: `docs/ENVIRONMENT.md` for a setting, an ADR for a decision with trade-offs, `CHANGELOG.md`.

`tests/docs-coverage.test.ts`, `tests/docs-reference.test.ts`, `tests/i18n*.test.ts` and `tests/rls.test.ts` fail if you
skip 1, 3, 4–6.

## Monthly running costs (list prices read 12 Nov 2026; check before deciding)

| Item | Today (no customers) | With customers |
| --- | --- | --- |
| Cloudflare Workers Paid (app, portal, cron, Durable Objects) | $5 | usage beyond the included requests is cents per seat |
| Supabase Pro, EU (smallest machine covered by the plan's credit) | $25 | larger machine as data grows; point-in-time recovery about $100 more, planned from the first paying customer |
| R2 files | free tier | $0.015 per GB-month |
| Product e-mail | Google Workspace relay (within the existing Workspace) | Resend only if the relay limit is reached ($20+ a month) |
| Domains (app + portal) | about $2.50 a month together | same |
| Model API (assistant + AI team) | $0 without a key | capped by configuration: at most $100 (assistant, whole install) + $40 (AI team) a month by default |
| Paddle | none | 5% + $0.50 per charge (merchant of record) |
| Turnstile, Cloudflare free bot settings | free | free |

`scripts/quality/cost.mts` models cost per seat and margin (about $0.07 per seat-month at 1,000 seats). It still assumes
a 14-day trial and leaves out model spend; update it before using it for pricing.

## Top 10 risks you inherit

1. **Two billing paths.** The older webhook (`/api/billing/webhook`) writes the company snapshot directly; the newer one
   (`/api/inbound/billing/paddle`) writes the subscriptions table that is meant to be the record. The setup docs point
   Paddle at the older one. Decide and merge before live keys (ADR 0019).
2. **Row security can be bypassed by the login role.** The API connects as the user that owns the tables and no table
   uses `FORCE ROW LEVEL SECURITY`; a raw query or an injected `reset role` would see every company. The fix is a
   deployment step (`db/ops/role-separation.sql`, `db/OPS-SECURITY.md` P1): do it before the first customer.
3. **`db.system()` code is unguarded by the database.** Scheduler, sync engine, webhooks and the console run with owner
   access; correctness rests on every statement naming `org_id`. `tests/rls.test.ts` checks a baseline that may only
   shrink. Review every new `system()` call.
4. **Backups are not rehearsed.** Daily Supabase backups only; point-in-time recovery is off until the first paying
   customer; R2 has no versioning; the restore procedure has never been run. Rehearse it once before go-live.
5. **AI spend and behaviour depend on configuration.** Caps are environment values with defaults; the AI team's wakes
   are not scheduled and there is no key yet; the gate and monitor are security code. Set the key, caps and the schedule
   deliberately, and keep the red-team tests green.
6. **Customer uploads are not scanned for malware.** Type, first-bytes, size and quota checks exist; files are served
   only as downloads. Choose a free scanner before go-live (RUNBOOK go-live checklist).
7. **Legal texts are drafts.** Consent and contract texts have placeholders (company legal name, storage location);
   languages other than Turkish and English need native legal review; some markets need extra consent (overseas
   transfer). Do not rely on them before review.
8. **Weak types in the data layer.** `Row` is `Record<string, any>`; about 1,700 of 2,000 query calls are untyped and
   there are about 450 explicit `any`. Large screens (`web/src/pages/Onboarding.tsx` 2,200 lines,
   `OwnerConsole.tsx`, `web/portal/Portal.tsx`) are covered only by browser journeys. Refactor behind tests.
9. **Operations visibility is thin.** Errors go to `error_log` and `wrangler tail`; there is no uptime check, alerting
   or status page yet. Add them with go-live (RUNBOOK on-call basics).
10. **The code was written fast by many parallel AI sessions.** Conventions are strong (guards, ADRs, help coverage) but
    54% of exports are documented, some names are build-wave nicknames (tests named `wave5c`, comments naming
    packages), and the remote copy of the repository should be checked. Keep `npm run lint:comments` falling and keep a
    remote backup of the repository current.

## Ownership map

| Area | Decides | Builds and keeps working | Where |
| --- | --- | --- | --- |
| Product scope, pricing, go-live, any new paid service | Product owner (founder) | — | QUALITY.md, ADRs |
| Architecture, security model, data model, CI gates | CTO | Engineering | ARCHITECTURE, SECURITY, ADRs, `tests/` guards |
| Tenant isolation and `system()` reviews | CTO (second reviewer required) | Engineering | `tests/rls.test.ts`, `tests/isolation*.test.ts` |
| Billing and money | Product owner (prices) + CTO (code path) | Engineering | `shared/src/billing.ts`, `api/src/billing/`, ADR 0019 |
| Legal texts, consent, DPA, privacy | Product owner with legal counsel | Engineering wires texts; never rewrites legal meaning | `docs/site/<lang>/legal-*.md` (single source; `docs/legal/README.md`), `shared/src/compliance/` |
| Translations and glossary | Product owner (tone) | Native reviewers per language | `shared/src/i18n/`, glossary |
| Help centre and assistant knowledge | Product owner | Engineering + docs; the coverage test enforces it | `docs/site/`, `shared/src/helpLinks.ts`, `tests/assistant-eval/` |
| Operator console and AI team approvals | Product owner (approves every outside action) | Engineering | `api/src/team/`, `routes/office.ts` |
| Deploys, secrets, DNS, backups | Product owner gives the go-ahead | CTO runs them | RUNBOOK, ENVIRONMENT |
| Support desk access to companies | The customer company's administrator (time-boxed grant) | Support staff | SECURITY, `routes/desk.ts` |

## Rules that are never bent

They are in [CONTRIBUTING.md](../CONTRIBUTING.md) and the root `CLAUDE.md`: isolation in the database, append-only
migrations, every string in every language, no real names or data anywhere (`tests/leak.test.ts`), no deploy without
the owner's go-ahead, no new paid service without his decision, comments to the standard.
