# First week as CTO

You are taking over Curahold: work management for customer-facing teams (sales, onboarding, support, customer
success, product), multi-tenant SaaS on Cloudflare Workers + Postgres, also shippable as a one-company self-hosted
server. This page is the order to read things in, the map, how to run, test and ship, the risks you inherit and who
decides what. It links to the detailed docs instead of repeating them.

Last checked against the code: 20 November 2026 (main `bf23b32` plus the handover phase-2 commits on `tur3/cto2`).

## Your first week, day by day

| Day | Do | Done when |
| --- | --- | --- |
| 1 | Clone, `nvm use`, `npm ci`, `npm run dev`, sign in at http://demo.localhost:5173 as `ada@demo.example` (link in the terminal). Click through boards, a customer page, departments, the onboarding hub (`/onboarding`), setup health, the assistant. Read this page, then [ARCHITECTURE.md](../ARCHITECTURE.md) sections 1–4. | You can explain how a request finds its company and why another company's rows are invisible. |
| 2 | Read [DEVELOPER.md](DEVELOPER.md) top to bottom and [SECURITY.md](../SECURITY.md) "isolation model". Run `npm run typecheck` and the three guards: `npm run test:isolation`, `npm run test:leak`, `npm run test:i18n`. Read `api/src/app.ts` (middleware order) and `api/src/context.ts` (`run()`, `requirePerm()`). | You know the three database modes (`tenant`, `portal`, `system`) and which code uses `system()`. |
| 3 | Decisions: read the [ADR index](ADR/README.md) (20 records) and skim [QUALITY.md](../QUALITY.md) (the product owner's quality brief and dated decision log, in Turkish; its priority order decides arguments). Read [RUNBOOK.md](RUNBOOK.md) deploy, rollback, backups. | You can say which decisions are settled (ADR 0019 billing is now Accepted) and which questions are still the owner's. |
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
  sync/             29 integrations: CRM, spreadsheet, ticket, accounting, warehouse, calendar and mailbox adapters,
                    the two-way sync engine; each has a vendor mock and a customer-style run (scripts/integrations/)
  connectors/       chat apps (Slack, Teams, Google Chat, generic webhooks)
  billing/          the one billing path: provider, subscriptions table, entitlements and caps (ADR 0019)
  live/             live updates: Durable Object per company (Cloudflare) or LISTEN/NOTIFY (Node)
  db/               the Db seam and its two drivers (postgres.js, PGlite), the migration runner, and rows.gen.ts
                    (one generated interface per table: `npx tsx scripts/db/row-types.ts` after a migration)
shared/src/         pure TypeScript for both sides: model.ts (types), i18n/ (one dictionary per language, glossary),
                    billing, departments, onboarding, setupHealth, consent/, compliance/, team/ …
web/src/            the React app: App.tsx (routing), pages/, components/, lib/ (api client, store, i18n), office/ (3D)
web/portal/         the customer portal app (own bundle, own domain);  web/demo/ the in-browser demo page
db/migrations/      the schema and row-security policies, append-only (0001 … 0252)
db/rollback/        hand-run undo scripts for big recent migrations (not migrations);  db/ops/ role separation template
docs/site/<lang>/   the help centre — also what the assistant knows;  scripts/docs/ builds pictures and API reference
site/               the sales site and demo hub generators (scripts/build-site.ts)
scripts/            dev server, migrate, seeds, builds, perf and load tests, quality measurements (scripts/quality/)
tests/              ~150 Vitest files (API level, PGlite or real Postgres), tests/e2e (Chrome, tours, the a11y gate),
                    tests/assistant-eval
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
| Jobs and schedulers | One hourly entry, `runScheduled` in `lib/scheduler.ts` (Cloudflare cron, or `setInterval` on Node): digests, automations, outbox drain, health scores, syncs, onboarding sweep, trial reminders, 03:00 clean-up, 05:00 renewals, seat sync. Each job isolated, idempotent. The AI team has its own 10-minute cron (`team/schedule.ts`): off without a model key or with `TEAM_SCHEDULER=off`, and stops at the monthly cap. | ARCHITECTURE 8 |
| Assistant and AI team | One core for every chat surface; free rules and cache first; read-only tools as the asker; caps $100/month install, $5 per company (up to $50); docs search when no key. The AI team only proposes; the operator's own yes runs anything outside, through server-held runners; a monitor pauses misbehaving seats; team cap $40/month. | ADR 0010, 0011; ARCHITECTURE 11 |
| i18n | Eleven complete languages (Hindi and Malay added 20 Nov); one dictionary per language, glossary per concept, RTL for Arabic, Hebrew, Persian. Tests fail on any missing key or inline language pair. `npm run strings` writes a key to every dictionary at once. | ARCHITECTURE 9a; ADR 0008 |
| Billing | Paddle as merchant of record, per-seat plans with caps from `shared/src/plans.json` (the price list as data), three-month trial on approval, dunning grace, regional prices; off entirely unless configured. One code path (`api/src/billing`); both webhook addresses reach one handler. | README "Billing"; ADR 0002, 0017, 0019 |
| Integrations | 29 vendor integrations (CRMs, sheets, support desks, accounting, warehouses, calendars, mailboxes and more) plus an incoming-webhook receiver with recipes. Each has a vendor mock and passes a full customer-style run; real sandboxes where a vendor offers one. | INTEGRATIONS.md; DEVELOPER "add an integration" |
| Privacy and accessibility | AI is off until a company turns it on, and every AI chat asks for consent first; retention periods are enforced nightly (`lib/retention.ts`); erasure and company deletion with a certificate. WCAG 2.2 AA: 0 findings across 527 states, kept by `npm run test:a11y`. | ADR 0014; docs/compliance/; docs/design/tokens.md |
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

`scripts/quality/cost.mts` is the cost model for pricing: unit cost per company and per seat for 1–300 customers, fixed
monthly costs, AI at the plan caps, Paddle fees, tax as a pass-through, support time and the break-even point. Every input
is in `scripts/quality/cost.inputs.json` with its source or "assumption".

## Top 10 risks you inherit

1. **Billing is one path now, but untested against live Paddle.** ADR 0019 (Accepted): `api/src/billing` + the subscriptions
   table, both webhook addresses on one handler. Before live keys run one sandbox purchase, renewal, failed payment and
   cancellation end to end, and mirror `shared/src/plans.json` prices in Paddle.
2. **The production login still needs splitting.** Since migration 0254 (ADR 0023) every table forces row security and
   `db.system()` runs as `curahold_system`, which owns nothing. What is left is deployment: the Worker's login should be
   a separate login that owns nothing (`db/ops/role-separation.sql`, `MIGRATION_DATABASE_URL` for the owner). Until
   then an injected `reset role` on the one login would reach the owner. Do it before the first customer.
3. **`db.system()` code is guarded by discipline, not by company.** Scheduler, sync engine, webhooks and the console run
   as `curahold_system` (rows of every company, no schema rights); correctness rests on every statement naming `org_id`. `tests/rls.test.ts` checks a baseline that may only
   shrink. Review every new `system()` call.
4. **Backups are scripted but not yet rehearsed against production.** `scripts/backup/` makes an encrypted dump with a
   manifest and restores it with checks (a timed drill exists); point-in-time recovery is off until the first paying
   customer; R2 has no versioning. Run the drill once against the real database before go-live (RUNBOOK).
5. **AI spend and behaviour depend on configuration.** Caps are environment values with defaults (an unknown model is
   priced as the dearest, so mistakes tighten them); the AI team's 10-minute cron does nothing without a model key; the
   gate (`team/gate.ts`) and monitor are security code. Set the key and caps deliberately; keep team-redteam green.
6. **Virus scanning needs a scanner host.** Always, on every hosting: type, first bytes, size and quota, and content
   checks (archive bombs, Office macros, PDFs that run code; `lib/uploadScan.ts`). ClamAV with quarantine is built for
   self-host (`CLAMAV_HOST`); the hosted service has none, so nothing is virus-scanned there. Decide with the go-live list.
7. **Legal texts are drafts.** Consent and contract texts have placeholders (company legal name, storage location);
   languages other than Turkish and English need native legal review; some markets need extra consent (overseas
   transfer). Do not rely on them before review.
8. **Types are better but not finished; big screens are not split.** Every table has a generated row type
   (`api/src/db/rows.gen.ts`) and 907 of 2,131 query calls use one (338 before); most of the rest are writes whose result
   is unused, or rows the code reshapes (see "Type follow-ups" below). About 455 explicit `any` remain. Large screens
   (`Onboarding.tsx` 2,360 lines, `OwnerConsole.tsx` 2,290, `web/portal/Portal.tsx`, `Sources.tsx`) are covered only by
   browser journeys; split them by the plan below, behind tours, e2e and the a11y gate.
9. **Operations watch is free-tier only.** Readiness, error-rate and latency alerts land in the owner console and the
   owner's mailbox (`lib/ops.ts`), a synthetic check (`scripts/synthetic.ts`, run from a free scheduled CI job or any machine) and a status page exist;
   nobody is on call. Agree who answers an alert, and schedule the synthetic check, before the first customer.
10. **The code was written fast by many parallel AI sessions.** Conventions are strong (guards, ADRs, help coverage) and
    since 20 November every export and route has a doc comment (0 of 2,264 missing), but comment quality was written in
    one pass: correct what you find wrong. Build-wave nicknames remain only in old dictionary section comments and one
    applied migration. Check that the remote copy of the repository is current, and turn on `lint:comments --max=0` in CI.

## What changed on 20 November 2026

- **Billing is one path** (ADR 0019 Accepted): `api/src/billing` and the subscriptions table only; the price list is data
  (`shared/src/plans.json`) with per-plan caps; `scripts/quality/cost.mts` models cost per seat including AI at the caps.
- **Privacy**: AI is off until a company turns it on, and every AI chat asks for consent first (KVKK/GDPR); erasure covers
  assistant questions, notifications, AI memory and portal people; company deletion ends with a certificate; retention
  periods are purged nightly with floors (`lib/retention.ts`, `RETENTION_*` in ENVIRONMENT); DPIA draft, breach runbook.
- **Accessibility**: WCAG 2.2 A/AA, 0 findings across 527 states; `npm run test:a11y` is the gate; statement in EN and TR.
- **Design system**: a colour-blind-safe chart palette with status icons, motion tokens (`--dur-1` … `--dur-4`, easing)
  and exit animations, one Close and one Back everywhere, a loading system (route bar, skeletons, busy buttons).
- **Languages**: eleven complete: Hindi and Malay joined as full product, help, site and demo languages. Turkish says
  "siz" everywhere.
- **Integrations**: nine more native connectors and an incoming-webhook receiver; all 29 vendor integrations pass a
  customer-style run against vendor mocks (`scripts/integrations/`).
- **Go-live readiness**: free-tier monitoring and alerts, upload content checks and optional ClamAV, scripted encrypted
  backup with verified restore, a thirteen-item go-live checklist (Turkish guide in `docs/go-live/`).
- **Handover phase 2** (this branch): every export and route documented; generated row types; typed vendor answers in the
  Jira, support and keyed-CRM adapters; `npm run strings` writes every language; tests named for what they test.

## Code health (20 November 2026, after phase 2)

| Measure | 19 Nov (phase 1) | 20 Nov morning | Now |
| --- | --- | --- | --- |
| Exports and routes without a doc comment (`npm run lint:comments`) | 966 of 2,123 | 981 of 2,264 | **0 of 2,264** |
| Files without a header | 36 | 36 | 17 (all dictionaries and `site/info` copy, left to the language work in progress) |
| Query calls with a row type | 307 of 2,021 | 338 of 2,130 | **907 of 2,131** |
| Explicit `any` (same count method) | ~450 | 511 | 455 (the three worst adapters: 68 → 11) |
| `wave*` test names | 3 | 3 | 0 |

Next steps: run `lint:comments --max=0` and `scripts/db/row-types.ts --check` in CI; type the remaining selects as each
file is touched.

## Split plans for the oversized files

Not done today on purpose: these screens were being changed by other work the same day, and a split must be a pure
move with tours, `npm run test:e2e` and `npm run test:a11y` green before and after. Do one file per change.

- `web/src/pages/Onboarding.tsx` (2,360 lines, ~30 components, none over 150 lines). A file split, not a rewrite: make
  `web/src/pages/onboarding/` with `Hub.tsx` (Hub, Timeline), `PlanEditor.tsx` (PlanEditor, StepRow, NewPlanDialog),
  `PlanParts.tsx` (People, Issues, Mapping), `Templates.tsx` (TemplateEditor, OnboardingSettings),
  `Portfolio.tsx` (OnboardingPortfolioPage) and `Report.tsx` (Report, also used by the share link). Keep
  `Onboarding.tsx` as the page that re-exports them, so `App.tsx` routes do not change.
- `web/src/pages/OwnerConsole.tsx` (2,290 lines, one component per console section). Move each section to
  `web/src/pages/owner/<Section>.tsx` (Overview, Requests + RequestDetail + DecideBand, Approvals + ApprovalCard, Plan,
  Checklist, System, Trials, Revenue, Activity); shared hooks (`useOwnerWords`, `useData`, `usePlanFormat`, `useOwnerBar`) to
  `owner/shared.ts`. OwnerTeam.tsx already follows this shape.
- `web/src/components/QuickAdd.tsx` (one 697-line component). Extract, in this order: `useQuickParse` (title → parsed
  tokens, the "title wins over fields" rule, `takeOver`), `useCustomerLookup` (the "#" search and the customers already
  on the line), `useLookAlike` (the open task that looks like this one), the record picker for the chosen customer,
  and `submit` as a plain function taking the parsed lines. The JSX stays in QuickAdd.
- `web/src/pages/OwnerOffice.tsx` (one 748-line component around the 3D scene). Extract the scene lifecycle
  (`useOfficeScene`: create, resize, dispose, picking) and the live seat state (`useOfficeSeats`); the panels
  (PersonPanel, Search, PlanView, SeatChat, OrgTree) are already separate functions and can move to `web/src/office/ui/`.
- `api/src/app.ts` `createApp` (~420 lines). Group the middleware into named functions in `api/src/middleware/`
  (headers and ops watch, robots and rate limits, company and session, support/preview limits) and the mounts into
  `mountRoutes(app)`. The order is the security model: keep it identical and let `tests/security*.test.ts` and
  `tests/isolation-routes.test.ts` prove it.
- `api/src/sync/engine.ts` (1,580 lines): split pull, push, conflicts and mail attachment into `sync/engine/*.ts`
  behind the same `syncConnection` entry; `tests/sync*.test.ts` and the 29 integration runs are the safety net.

## Type follow-ups the row types found

Typing every simple query showed places where the code's own types and the database disagree. None is a bug today
(JSON serialisation hides most of them), but each is a trap for the next change:

- `team/gate.ts executeApproved` copies `approvals` timestamps (Date) into `Approval` fields typed `string`, and text
  columns into literal unions (`risk`, `priority`, `status`). Map them explicitly (as `listApprovals` does) and type the row.
- Text columns handed on as `Locale` without `normalizeLocale()`: `users.locale` in `routes/auth.ts` (device sign-in
  mail), `orgs.locale` in `sync/engine.ts loadDefs`.
- `lib/onboarding.ts` progress: step, issue and plan rows go into `progressOf()` as literal unions without a check.
- `routes/pm.ts` flow figures and `routes/imports.ts` (`import_batches`) pass nullable columns where `undefined` is expected.
- `routes/accounts.ts` import keeps half-built account rows in the same map as full ones.
These calls are left untyped (marked by the absence of a type argument); type them when you fix each.

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
