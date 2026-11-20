# Curahold — developer guide

This guide is for someone joining the project: how the code is laid out,
how a request travels, the rules that keep companies apart, and how to add
the usual things (a table, an endpoint, a screen, a setting, a string, a
test). Read it once from top to bottom; afterwards the **feature map**
near the end is the quickest way to the right file.

> The product name "Curahold" (Latin *cura*, care + *hold*: the customers you
> keep by taking care of them) appears in strings (`shared/src/i18n/*.ts`),
> the docs (`docs/site/`), `README.md`, the demo page (`web/demo/index.html`),
> email templates (`api/src/lib/emailHtml.ts`), `package.json` and internal
> names (cookies, headers, database roles). The mark — a "C" holding a dot —
> is `Mark` in `web/src/components/ui.tsx`, with copies as the tab icon in
> `web/index.html`, `web/demo/index.html` and `scripts/build-docs.ts`.
> Brand colours are the `--brand*` tokens in `web/src/styles.css`.

---

## 1. Start in five minutes

Prerequisites: Node 22 (`.nvmrc`; `nvm use`), and Chrome or Chromium for the browser tests. Nothing else:
development runs on an in-memory Postgres with an invented demo company. New here? Read
[HANDOVER.md](HANDOVER.md) first.

```bash
npm ci                 # exact versions from package-lock.json
npm run dev            # API on :8787 (embedded Postgres + demo company) and the web on :5173;
                       # open http://demo.localhost:5173 and sign in as ada@demo.example
                       # (the sign-in link is printed in the terminal)
npm test               # unit and API tests (in-memory Postgres, ~130 files; several minutes — run single files while you work)
npm run typecheck      # TypeScript across API, web, scripts and tests
npm run test:e2e       # builds, then drives the app in Chrome; screenshots in tests/e2e/screens/
npm run test:demo      # builds the in-browser demo and opens it
```

Run the same tests on a real Postgres before a release (it is stricter than
the in-memory one):

```bash
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm test
```

`README.md` covers deploying (Cloudflare Workers + Postgres), chat apps and
CRMs.

---

## 2. Where things are

```
api/src/                 the server (Hono). Runs on Cloudflare Workers (worker.ts), Node for local work (node.ts)
                         and a company's own server (selfhost.ts: one company, Postgres, files on disk, SMTP)
  app.ts                 builds the app: middleware order and which routes are mounted where
  context.ts             what every request carries (org, auth, deps) and run(), requirePerm(), requireWriter()
  routes/                one file per area; each exports a Hono router (see the list below)
  lib/                   logic shared by routes and jobs (reports, playbooks, notifications, money…)
  connectors/messaging/  Slack, Teams, Google Chat, webhooks (Discord, Mattermost…)
  sync/                  CRM and spreadsheet adapters and the two-way sync engine
  db/                    database drivers: postgres.js (production) and PGlite (tests, demo)
shared/src/              types and pure logic used by both server and web — no I/O here
  model.ts               the main types (Task, Account, Org, Me, PlanTemplate, Favorite…)
  i18n/                  every word the user sees: one dictionary per language (en.ts defines the keys), core.ts
                         (LOCALE_INFO, HELP_LANGUAGES), glossary.ts (one term per concept per language)
  records.ts             kinds of records (contacts, opportunities, presets) and their types
  reports.ts             report definitions, chart kinds, the ready-made reports and dashboards
  rhythm.ts              targets and pace, business reviews, renewal settings
  money.ts               currencies and conversion
  playbooks.ts           ready-made playbooks to start from
  pages.ts               home pages and dashboards (cards)
web/src/                 the React app (Vite)
  App.tsx                routing: which path shows which page, panels opened from the address (?task=, ?record=)
  pages/                 whole screens (Accounts, Reports, Dashboards, Settings, Home…)
  components/            parts of screens (TaskPanel, RecordPanel, Thread, Plans, Rhythm, Charts…)
  lib/                   api client, store (who is signed in, people, boards), i18n, router, money
  *.css                  styles.css (tokens and base), surfaces/*.css (one per screen group), motion.css, work.css —
                         all loaded by stylesheets.ts (app and demo); a new one goes there
db/migrations/           the schema, in order (0001, 0002, …). Each file runs once.
scripts/                 dev server, migrations, demo data (seed-demo.ts, seed-showcase.ts), docs build
tests/                   Vitest suites (*.test.ts) and tests/e2e (Chrome)
docs/site/               the user documentation (Markdown, one folder per language)
docs/ADR/                decisions and their reasons (read the index once)
```

Routes by file (all under `/api`):

| File | What it serves |
| --- | --- |
| `auth.ts`, `oauth.ts`, `signup.ts` | sign-in (email link, Google, Microsoft), sign-up of a new company |
| `me.ts` | the signed-in person: profile, preferences (incl. favorites), devices, notifications |
| `boards.ts`, `tasks.ts`, `work.ts` | boards, tasks, comments, files, time, playbooks (`/plans`), intake forms |
| `accounts.ts` | customers ("accounts"), import, the products view (`/accounts/whitespace`) |
| `records.ts` | kinds of record, records, a record's thread and files, `/renewals/links` |
| `reports.ts`, `builder.ts` | the reports overview, targets and rhythm (`/rhythm`), the report builder |
| `pages.ts` | home pages and dashboards, and filling their cards |
| `admin.ts` | company settings, currencies (`/admin/fx`), roles, people |
| `automations.ts`, `connections.ts`, `sync.ts` | rules, chat connections, CRM sync |
| `timeline.ts`, `search.ts`, `portal.ts`, `help.ts`, `developer.ts`, `mcp.ts` | as named |

---

## 3. How a request travels

1. **Browser** — `web/src/lib/api.ts` (`get`, `post`, `patch`, `put`, `del`)
   adds the device id (`x-curahold-device`) and the language to every call.
   Failures come back as `ApiFailure` with a translated message.
2. **Which company** — `companyFromHost` in `api/src/app.ts` reads the
   company from the address (`acme.curahold.com` → `acme`) and puts its row
   in `c.get('org')`.
3. **Who** — the session middleware checks the cookie (or an API key) and
   the device, and sets `c.get('auth')`: user id, role, permissions, seat.
4. **The route** validates its input with zod (`body(c, schema)` in
   `lib/validate.ts`), checks what the person may do (`requirePerm`,
   `requireWriter`, field access), and does its work inside
   `run(c, async (q) => …)`.
5. **`run()` opens a transaction as the company's member**: it sets the
   company and the person for the database (`app_org()`, `app_user()`) and
   switches to the `curahold_app` role, so **row-level security applies to
   every query**. A route cannot see another company's rows even if it
   forgets a `where org_id = …`.
   Every write must carry a custom header (`x-curahold-device`, or a Bearer
   key): it is the request-forgery guard in `app.ts`. Trying the API with
   curl in development therefore needs `-H 'x-curahold-device: <16+ letters>'`
   and the `Host: demo.localhost:5173` header; `POST /api/auth/start` answers
   with a `devToken` you pass to `POST /api/auth/verify {token, deviceId}`.
6. **The answer** is mapped from rows to the shared types (`lib/mappers.ts`,
   `toRecord`, `toPlan`…) and returned as JSON. Errors are thrown with
   `fail('code')` (`lib/errors.ts`): each code has an HTTP status and a
   translated message (`errors.<code>` in the dictionaries).

Background work (notifications, sync, renewals, digests) runs from
`lib/scheduler.ts`. It uses `db.system` (no company context) to find the
companies that need something, then does each company's part in its own
transaction.

---

## 4. Rules that are never bent

**Companies never see each other.** Every table has `org_id` and a
row-level security policy. When you add a table, add its policies in the
same migration (pattern below) and a line in `tests/isolation.test.ts` if
it holds anything a company would mind another seeing.

**People see what their role allows.** Permissions are checked in routes
(`requirePerm(c, 'accounts.manage')`), and also in the database where
it matters (`app_has_perm()`, `app_can_write()`). A field can be hidden
from roles (`lib/fieldAccess.ts`): anything that returns field values goes
through `defsFor` / `stripFields` / `hiddenKeys`.

**Every word is in every language.** No text in components or routes:
add a key to `shared/src/i18n/en.ts` **and every other dictionary** in that
folder, and use `t('key')` (web) or `translate(locale, 'key')` (server).
`tests/i18n.test.ts` fails if a key is missing in any language or an error
code / audit action has no words (ADR 0008).

**Nothing real in the repository.** Demo and test data is invented.
`tests/leak.test.ts` fails if a name from the internal tool this product
was rebuilt from appears anywhere (the words are stored as hashes). If it
fails on a word you wrote, choose another word — never weaken the test.

**Worked out when someone looks.** Totals, targets, pace, renewal links
and dashboards are computed on read with SQL, not stored and kept in step
by jobs. This keeps the infrastructure small (one database, no queues or
caches to run). Add a stored copy only when a measured query is too slow
(`scripts/perf.ts` measures).

**Money has a currency.** An amount on a customer or record may be in its
own currency (`currency` column, empty = the company's). Before adding
amounts up, convert: in SQL with `fxRate(alias)` (`api/src/lib/fx.ts`), in
the web with `useMoney().toBase(amount, currency)`. Show an amount with
`useMoney().format(amount, currency)`.

**Dates.** Days are ISO strings (`2026-11-12`). "Today" is the company's
today: `localDate(now, org.timezone)` on the server, `todayIso()` in the web.

---

## 5. How to add…

### a table (migration)

Create `db/migrations/00NN_short_name.sql` (next number). Pattern:

```sql
create table widgets (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  name       text not null check (length(name) <= 200),
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (org_id, created_by) references users (org_id, id) on delete set null (created_by)
);
alter table widgets enable row level security;
-- Who may read and change it, in words first, then in SQL.
create policy widgets_select on widgets for select using (org_id = app_org());
create policy widgets_insert on widgets for insert with check (org_id = app_org() and app_can_write());
grant select, insert on widgets to curahold_app;
```

Foreign keys pair `org_id` with the id so a row can never point into
another company. Run `npm test`: migrations run on every test setup.

### an API endpoint

In the matching `api/src/routes/*.ts`:

```ts
/** One line on what it is for, in plain words. */
widgetRoutes.post('/widgets', async (c) => {
  requireWriter(c);                                   // viewers can't write
  const input = await body(c, z.object({ name: z.string().trim().min(1).max(200) }));
  const auth = c.get('auth');
  const row = await run(c, async (q) => {
    const [w] = await q.query('insert into widgets (org_id, name, created_by) values (app_org(), $1, $2) returning *', [input.name, auth.userId]);
    await audit(q, { orgId: c.get('org').id, actorId: auth.userId, action: 'widget.created', entity: 'widget', entityId: w.id });
    return w;
  });
  return c.json({ widget: toWidget(row) }, 201);
});
```

A new audit action needs `audit.widget.created` in every dictionary. Add a
test in `tests/` (see section 6).

### a screen

1. The page component in `web/src/pages/` (a whole screen) or a component
   in `web/src/components/`. Start the file with a comment saying what it
   shows and where its data comes from.
2. The route in `web/src/App.tsx` (`path === '/widgets'` or
   `match('/widgets/:id', path)`).
3. A menu link in `web/src/components/Shell.tsx` if it needs one.
4. Styles in the CSS file of its area, using the tokens at the top of
   `styles.css` (`--brand`, `--ink-2`, `--line`, `--r-m`…). Respect
   "reduce motion": motion goes in `motion.css` or uses `var(--ease)`.

### a settings section

Add it to the `groups` list and the switch at the bottom of
`web/src/pages/Settings.tsx` (with the permission that may open it), and a
`settings.tab.<name>` key.

### a word on screen

Put `"key": ["English", "Türkçe"]` pairs in a JSON file and run
`npx tsx scripts/add-strings.ts strings.json` (it adds new keys and changes
existing ones in the English and Turkish dictionaries only), then add the
same keys to the other dictionaries in `shared/src/i18n/` by hand — the
i18n test fails until every language has them. Check terms against
`shared/src/i18n/glossary.ts`. Variables are written
`{name}`; `{account}` / `{accounts_l}` are the company's own word for its
customers.

### a report field or source

`api/src/lib/reportEngine.ts` builds the catalog (`loadCatalog`): each
source lists its fields with how to read them in SQL. Account and record
fields come from the company's own field definitions automatically.

### a scheduled job

Add it to `api/src/lib/scheduler.ts` with the hour it runs at. Make it safe
to run twice (remember what was done, as `playbook_runs` does for renewals)
and let one company's failure not stop the others (`try`/`catch` per
company).

### a help page (and what the assistant knows)

CuraAI and the docs' Ask answer from the help pages (the four closest sections of `answers.json`), so a feature
nobody wrote a page for is a feature the assistant does not know. Every menu entry, screen, settings section and
public API area is listed in `shared/src/helpLinks.ts` with the page that explains it and the assistant
evaluation cases that ask about it; `tests/docs-coverage.test.ts` fails for a new one that is missing.

1. Write the page in `docs/site/en/` and `docs/site/tr/` (front matter `section: help`), then in the seven other
   languages (`ar he fa zh-Hans zh-Hant ja ko`): the user guide must be whole in every language that has a folder.
   Use the product's own words for buttons, from the dictionaries. A heading the product links to is written
   `## Heading {#anchor}`, so the anchor is the same in every language.
2. One action per numbered step, each followed by its picture with the click target ringed:
   `   ![What is ringed](img/<name>.webp)`. Add the picture to `scripts/docs/shots.ts` (a `go`, a `ready` and a
   `mark` selector; add a `data-tour` hook to the element when no stable selector exists), build the demo
   (`npm run build:demo`) and run `npx tsx scripts/docs/shots.ts` (`ONLY=<prefix>-` takes only those, the
   languages as arguments). Anything to type or paste goes in a fenced block: the docs give it a Copy button.
3. Add the place to `shared/src/helpLinks.ts`, and at least one case to `tests/assistant-eval/cases.ts` in all
   nine languages with `cite: '<page>'`. Run `EVAL_ONLY=how_to EVAL_LANGS=en,tr npx tsx tests/assistant-eval/run.ts`:
   without a key the docs search must find your page for the English and Turkish questions.
4. Something no customer ever sees (the operator's console, a page a link lands on and leaves) goes in
   `NOT_FOR_HELP` with the reason; an API area that belongs to the browser goes under `INTERNAL` in
   `scripts/docs/catalogue.ts`.

### a setup health check

A check finds one thing an administrator can get wrong or leave missing while
setting up (a broken sign-in, rows an import could not read, a rule that
points at a deleted field). It never fixes anything: it says what, why, and
links to the one screen that fixes it.

1. Add it to `CHECKS` in `shared/src/setupHealth.ts`: `id` (`area.whatIsWrong`),
   `area`, `severity` (`high` breaks something now, `medium` will, `low` is
   tidiness), `fixer` (the permissions that may see and fix it; `'owner'` for
   the install's own settings) and `fix` (the screen; `{ref}` is filled with
   what the query found, such as a connection id).
2. Add its query to `SQL_CHECKS` in `api/src/lib/setupHealth.ts`: one scalar
   sub-query returning `{n, ref}`, built with `count(...)` or `flag(...)`. Name
   `org_id = $1` yourself: the same SQL runs under the person's row security
   (the panel) and with owner access (the daily run). No model, no outside
   call, nothing written. A check that reads the server's configuration goes
   in `CONFIG_CHECKS` instead.
3. Write `sh.<id>.problem`, `.why` and `.fix` in all nine dictionaries (add
   `.problem.one` when `{n}` can be 1). Plain words: what we noticed, why it
   matters, the button's label.
4. Run `npx tsx scripts/docs/setup-health-page.ts`: it writes the check into
   the help page of every language. `tests/setup-health.test.ts` fails until
   steps 1–4 are all there.

A screen shows its own warnings with `<SetupWarnings path="/settings/x" />`
(the failing checks whose `fix` is that screen). A test step of "Test your
setup" is an entry in `TEST_STEPS` (with `required`, `minutes` and, if it is
tried with something, `input`), its words `sh.test.<id>.title / .how /
.expect`, and, when the server can run it, a branch in
`POST /setup-test/:id/run` (`api/src/routes/setupHealth.ts`).

Other features read the checks through a small interface, never their
internals: `listSetupChecks()`, `setupHealthFor(q, deps, …)` (one person's
panel) and `setupSummary(q, orgId)` (the last daily failures, each step's
state and issue, the approvals, `doneAt`), all in `api/src/lib/setupHealth.ts`.
By contract in the database, `setup_progress` holds kind `daily` / item `last`
(`detail.failing`) and kind `done` once both go-live approvals are in. A failed
step is an issue at once: `openStepIssue` writes the step's own record
(`setup_progress` kind `issue`) and the ONE row the company's own `self` plan
lists (`onboarding_issues`, `source = 'setup_test'`, `source_ref` = the step);
`closeStepIssue` resolves both when the step passes or is left out.

### a sales-site language

The site (curahold.com) publishes a language only when all of its copy exists: no half-English
pages, no hreflang to a page that is not there (ADR 0020). Hindi and Malay are next; they are in
`SITE_PENDING` today. To add one:

1. `site/locales.ts`: add it to `SITE_LANGS` with its Open Graph locale (`hi_IN`, `ms_MY`), to
   `SITE_FONTS` (`ms: ['latin']`; `hi: []`, it reads the system's Devanagari face), and take it
   out of `SITE_PENDING`. From here TypeScript names every copy file still missing it.
2. Write the copy, natively and with the glossary (`shared/src/i18n/glossary.ts` has `hi` and `ms`
   columns): `site/content.ts` (`COPY`, and `STORY_COPY` if the scroll story ships), `site/info/<lang>.ts`
   plus `site/info/index.ts`, `site/concepts/a-copy.ts` and `c-copy.ts`, `site/hub-content.ts`
   (the same items as every other language). Every page needs a `seo` title and description in range.
3. Non-Latin script (Hindi): give `site/chrome.css` a `:root:lang(hi)` text stack and body size
   from the review's script table ('Nirmala UI', 'Kohinoor Devanagari', 'Noto Sans Devanagari';
   18 px, line height 1.75, headings 1.4). No web font.
4. Add it to `STORY_NOW` in `tests/site-copy.test.ts` if the story ships in it.
5. Nothing else: hreflang, the language menu, sitemaps (one file per language) and Open Graph
   alternates all loop over `SITE_LOCALES`. Run `npm run build:site` and `tests/site-*.test.ts`.

---

## 6. Tests

Unit and API tests use `tests/helpers.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { login, setup, type Env, type Client } from './helpers';

let env: Env;
let ada: Client;                     // an administrator in the demo company "acme"
beforeAll(async () => {
  env = await setup();               // fresh database, migrations, two demo companies
  ada = await login(env, 'acme', 'ada@demo.example');
});

describe('widgets', () => {
  it('are made by people who can write', async () => {
    const r = await ada.post('/api/widgets', { name: 'First' });
    expect(r.status).toBe(201);
  });
});
```

People in the demo: `ada` (admin), `mert` (manager), `zeynep`, `lena`,
`omar` (members), `sofia` (viewer). `env.a` holds the first company's ids
(accounts by name, boards, people), `env.b` the second's. `env.db.system(q
=> …)` reads the database directly when a test needs to look underneath.

Browser checks live in `tests/e2e/run.ts`: each `step()` drives a page and
saves a screenshot. Run them after any change to a screen.

---

## 7. Feature map

| Feature | Server | Web | Shared | Tests |
| --- | --- | --- | --- | --- |
| Boards and tasks | `routes/boards.ts`, `routes/tasks.ts` | `pages/BoardPage.tsx`, `components/TaskPanel.tsx`, `QuickAdd.tsx` | `model.ts`, `merge.ts` | `tasks*.test.ts` |
| Customers (accounts) | `routes/accounts.ts` | `pages/Accounts.tsx`, `components/AccountViews.tsx` | `model.ts`, `fields.ts` | `accounts.test.ts` |
| Records (contacts, opportunities, presets) | `routes/records.ts`, `lib/records.ts` | `components/Records.tsx`, `Pipeline.tsx` | `records.ts` | `deals.test.ts`, `sync.test.ts` |
| A record on its own, its thread and files | `routes/records.ts` (`/records/:id?full=1`, comments, files) | `components/RecordPanel.tsx`, `Thread.tsx` | `records.ts` | `deals.test.ts` |
| Playbooks | `routes/work.ts` (`/plans`), `lib/playbooks.ts` | `components/Plans.tsx` | `model.ts` (PlanTemplate), `playbooks.ts` | `deals.test.ts`, `tasks-plus.test.ts` |
| Setup health, "Test your setup", go-live gate | `lib/setupHealth.ts`, `routes/setupHealth.ts`, `lib/scheduler.ts` (daily) | `pages/SetupHealth.tsx`, `pages/SetupTest.tsx`, `components/SetupWarnings.tsx` | `setupHealth.ts` | `setup-health.test.ts` |
| Renewals that start by themselves | `lib/playbooks.ts` (`startRenewals`), `lib/scheduler.ts` | `components/Rhythm.tsx` (Renewals section) | `rhythm.ts` | `deals.test.ts` |
| Renewals view (deal and agreement per customer) | `routes/records.ts` (`/renewals/links`) | `components/AccountViews.tsx` (RenewalsView) | `records.ts` (RenewalLinks) | `deals.test.ts` |
| Targets, business reviews, nudges | `routes/reports.ts` (`/rhythm`), `lib/nudges.ts` | `components/Rhythm.tsx` | `rhythm.ts` | `rhythm.test.ts` |
| Currencies | `routes/admin.ts` (`/admin/fx`), `lib/fx.ts` | `components/Currencies.tsx`, `lib/money.ts` | `money.ts` | `deals.test.ts` |
| Reports (data: list, grouped, grid) | `routes/builder.ts`, `lib/reportEngine.ts` | `pages/ReportBuilder.tsx`, `components/ReportView.tsx`, `Charts.tsx` | `reports.ts` | `report-builder.test.ts` |
| Dashboards (charts from reports) | `routes/pages.ts` (kind `dashboard`) | `pages/Dashboards.tsx` | `pages.ts` | `report-builder.test.ts`, e2e |
| Home pages | `routes/pages.ts` (kind `home`) | `pages/Home.tsx` | `pages.ts` | e2e |
| Favorites | `routes/me.ts` (preferences) | `components/Favorites.tsx`, `Shell.tsx` | `model.ts` (Favorite) | `deals.test.ts` |
| Automations | `routes/automations.ts`, `lib/automations.ts` | `components/Automations.tsx` | `automation.ts` | `automations.test.ts` |
| Notifications (bell, chat, email) | `lib/notify.ts`, `connectors/messaging/` | `components/Bell.tsx` | `model.ts` | `notifications.test.ts` |
| CRM sync | `sync/`, `routes/sync.ts` | `components/Sources.tsx` | `sync.ts` | `sync.test.ts`, `adapters.test.ts` |
| Customer portal | `portal.ts`, `routes/portal.ts` | `web/portal/` | `portal.ts` | `portal*.test.ts` |
| Meetings (meetings, reviews, calls; next steps as tasks) | `routes/meetings.ts`, `routes/timeline.ts` (`PATCH /activities`) | `components/Meetings.tsx` (LogDialog, AccountMeetings) | `timeline.ts` (Meeting, NextStep) | `meetings.test.ts` |
| Timeline (cards, quiet task traffic, filter) | `routes/timeline.ts` | `components/Timeline.tsx` | `timeline.ts` | `timeline.test.ts` |
| New task dialog (every "add task") | `routes/tasks.ts` | `components/QuickAdd.tsx`, `lib/quickparse.ts` | `model.ts` | e2e |
| Plans and billing (Paddle; off unless configured). One path, ADR 0019 | `api/src/billing/` (`service.ts` the one writer, `paddle.ts`, `entitlements.ts` caps, `project.ts`), `routes/billing.ts`; gating: `context.ts` (`requireWriter`, `requirePlan`) | `components/Billing.tsx` | `billing.ts` + `plans.json` (the price list: plans, prices, caps, trial, dunning, regions) | `billing*.test.ts`, `subscriptions.test.ts` |
| Onboarding plans (own hub, customers' plans, portal view, report) | `routes/onboardingPlans.ts`, `lib/onboarding.ts`, `lib/onboardingSetup.ts`, `portal.ts` (`/papi/onboarding`) | `pages/Onboarding.tsx`, `web/portal/Onboarding.tsx` | `onboarding.ts` | `onboarding-hub.test.ts` |
| The demo | `web/src/demo/` | same app | — | `npm run test:demo` |
| Departments (walls, leads, requests across, the customer page's band) | `routes/departments.ts`, `lib/departments.ts`, migration 0120 (`app_visible_boards`) | `components/Departments.tsx`, `AccountDepartments.tsx`, `TaskExtras.tsx` (Ask another department), `Shell.tsx` (menu by department) | `departments.ts` (`DEPARTMENT_FLOW`, `handoverAfter`) | `departments*.test.ts` |
| Hand-over, request links, the loop back, flow rules | `routes/handoff.ts`, `lib/handoff.ts`, `lib/automations.ts` (new triggers and actions) | `components/CustomerFlow.tsx`, `Backlog.tsx` (demand), `Automations.tsx` (`FlowSettingsCard`) | `handoff.ts`, `automation.ts` | `flow.test.ts` |
| Import 2.0 (tasks from any export, dry run, 30-day undo) | `routes/imports.ts` (`/task-imports`) | `pages/ImportPage.tsx`, `components/TaskImporter.tsx` | `taskImport.ts`, `importPlan.ts` | `import-plan.test.ts`, `import-archive.test.ts` |
| Team weeks, customer portfolio, cost to serve | `routes/load.ts` (`/reports/workload`, `/reports/portfolio`), `lib/reportEngine.ts` (`cost_to_serve`) | `pages/Team.tsx`, `pages/TeamViews.tsx` | `reports.ts` | `workload.test.ts` |
| Accounting programs (read only) and the finance band | `routes/finance.ts`, `sync/` (accounting adapters), migrations 0130, 0190 | `components/Accounting.tsx`, `FinanceBand.tsx` | `sync.ts` | `accounting.test.ts` |
| Analytics feed for BI tools (OData, JSON/CSV, analytics keys) | `routes/analytics.ts`, `lib/analytics.ts`, migration 0140 | `components/Analytics.tsx` | `analytics.ts` | `analytics.test.ts` |
| The assistant (CuraAI, docs Ask, portal box) | `api/src/assistant/` (core, provider, cost), `routes/assist.ts`, migration 0096 | `components/CuraAI.tsx`, `Ask.tsx`, `AssistantSettings.tsx` | `assist.ts`, `assistant.ts`, `answers.ts` (docs search) | `assistant*.test.ts`, `tests/assistant-eval/` |
| Trial requests, terms and DPA acceptance | `routes/trial.ts`, `lib/trialRequests.ts`, `lib/trial.ts`, `routes/agreements.ts`, `lib/agreementEvidence.ts` | `pages/TrialRequest.tsx`, `pages/Agreements.tsx` | `trialRequest.ts`, `trialForm.ts`, `compliance/consentTexts.ts` | `trial.test.ts`, `compliance.test.ts` |
| Consent (one library for every surface) and the storage inventory | `routes/consent.ts`, `scripts/compliance/inventory.ts` (writes `docs/compliance/storage-inventory.json`) | `lib/consent.ts`, `components/ConsentBanner.tsx`, `site/consent.js` (built) | `consent/` | `consent.test.ts`, `compliance.test.ts` |
| Robots, crawlers and bot limits; the legal notice | `lib/botGuard.ts`, `lib/humanCheck.ts`, `lib/ratelimit.ts` | `components/LegalNotice.tsx`, `lib/humanCheck.tsx` | `compliance/crawlers.ts`, `compliance/notice.ts` | `crawlers.test.ts`, `botguard.test.ts` |
| Operator console, AI team, 3D office (Curahold's own, not a company's) | `routes/owner.ts`, `routes/office.ts`, `routes/team.ts`, `lib/office.ts` (`APPROVED_ACTIONS`), `api/src/team/` | `pages/Owner*.tsx`, `web/src/office/` | `office.ts`, `team/` | `owner-console*.test.ts`, `team*.test.ts`, `office.test.ts` |
| Help pages, their pictures and what the assistant knows | `scripts/build-docs.ts`, `scripts/docs/shots.ts` | `pages/Settings.tsx` ("How this works" link), `lib/docs.ts` | `helpLinks.ts` | `docs-coverage.test.ts`, `docs-reference.test.ts` |
| Your own server (one company, Postgres, files on disk, SMTP) | `selfhost.ts`, `scripts/build-server.ts`, `Dockerfile`, `docker-compose.yml`, `selfhost.env.example` | same app | — | `selfhost.test.ts` |

---

## 8. Writing style in the code

- Comments follow the standard in [CONTRIBUTING.md](../CONTRIBUTING.md#comments)
  (file header, doc comment on every export and route, WHY-comments for
  security, money, legal and the AI gate). `npm run lint:comments` measures it.
- Names say what things are for (`renewalField`, `startRenewals`,
  `usePlaybooks`) — no abbreviations a newcomer has to guess.
- Small, plain functions over clever ones. When a rule matters (security,
  money, dates), keep it in one place and call it from everywhere.
- User-facing words: plain, active, sentence case, no jargon; the
  interface's own vocabulary (customers, tasks, playbooks).

## 9. Words used in the code

| In code | Means |
| --- | --- |
| account | a customer company (each company names them its own way: customer, partner…) |
| record, record type | something kept under a customer: a contact, an opportunity, an agreement… and its kind |
| deal / opportunity | a record of kind `opportunity` |
| plan, plan template | a playbook (`plan_templates` table, `/plans` routes) |
| anchor | what a playbook's days count from: `start`, `renewal`, `close` |
| rhythm | targets, the business-review rhythm, renewal and nudge settings (one company setting) |
| page | a home page or a dashboard, made of cards |
| fx | exchange rates (`orgs.settings.fx`) |
| tenant / system / portal | the three ways to reach the database: as a company member, as the system, as a portal customer |

## The developer reference is built from the code

The pages `docs/site/<lang>/ref-*.md` are not written by hand. `npm run docs:reference` reads every
route in `api/src/routes` (its address, what it needs, the fields of its body, its query
parameters), adds the sentence for it from `scripts/docs/catalogue.ts` (English and Turkish) and
writes the pages; the object shapes come from the shared types and the error list from
`api/src/lib/errors.ts`.

When you add or change an address:

1. Add or change its sentence in `scripts/docs/catalogue.ts`, in both languages. An address that
   belongs to the browser only goes under `INTERNAL` instead.
2. Run `npm run docs:reference` and commit the pages with your change.

`tests/docs-reference.test.ts` fails until both are done, so the reference cannot fall behind.

## Onboarding plans

One mutual plan, used two ways (migration `0200_onboarding.sql`, `shared/src/onboarding.ts`):

- **kind `self`**: the company getting started with Curahold. One per company, opened on an
  administrator's first visit to `/onboarding`. Its steps complete themselves from product events.
- **kind `client`**: the company onboarding one of its customers. Opened as a draft by the hand-over
  card of a won deal (`lib/handoff.ts` → `openPlanForHandover`), started when the card is confirmed
  (`startPlanForHandover`), seen by the customer in the portal (`portal_onboarding()`), handed to
  Customer Success with a health baseline by `finishPlan`.

**Where it lives.** Every company already has its own host, `<slug>.<BASE_DOMAIN>`; the hub is the app
route `/onboarding` there, served by the existing wildcard route in `wrangler.toml`
(`*.curahold.com/*`). Go-live needs one proxied wildcard DNS record, set once right after the domain is bought (RUNBOOK, "Go-live checklist") — nothing new to deploy:

```text
Type: CNAME   Name: *   Target: curahold.com   Proxy: on
```

Where every company shares one host (local development, the in-browser demo) the same page also
answers at `/o/<slug>`. The customer's view is `/onboarding` on the portal's own domain
(`<slug>.<PORTAL_DOMAIN>`, `wrangler.portal.toml`), in the company's colours.

**Steps that complete themselves.** A step names a `signal` (`SIGNALS` in the shared file: team invited,
departments set, import ok, sync authorised and last run ok, first ticket, portal branded, setup checks
green, setup tests passed, and the customer-side ones). `advancePlan` reads them with one cheap query
per scope (company, customer, plan) and marks those steps `done_how = 'auto'`; it runs on every read
of a plan and in the hourly sweep. A step without a signal is the only kind a person may tick
(`PATCH /onboarding-steps/:id` refuses the others with `400`, and a step still waiting with `409`).

**Progress.** `progressOf` weights required steps 1 and optional ones 0.5, leaves skipped ones out,
works out what was expected by today from the due days, and counts who is waited on and for how long
(`turnOf`). A step is stalled `STALL_DAYS` past its due day or without movement; an issue is stuck
`STUCK_DAYS` after it opened or past its due day.

**The setup checks (contract).** The hub never imports the setup feature's code. It reads its state
through one adapter, `lib/onboardingSetup.ts` (`SetupState`: failing check ids, test states, all
tests done), from that feature's `setupSummary(q, orgId)`, and asks it to run a test through
`POST /setup-test/:id/run` (`web/src/lib/setupContract.ts`; a step that needs a person's verdict opens
`/setup-test#<id>` instead). A failed test is ONE shared issue row (`source = 'setup_test'`,
`source_ref` = the test id, unique per plan): the test list opens it when the step fails and resolves it
when it passes (`openStepIssue` / `closeStepIssue`); the plan only catches up, through the same two
functions, with failures from before it existed. Tests swap the
source with `setSetupSource`.

**Nothing is copied.** An issue links a support ticket (`record_id`; the ticket's status resolves it);
a step that needs product work is one more `request_links` row (`source = 'onboarding'`), counted by
Product's backlog; a finished plan is one more `handovers` card (`source_kind = 'onboarding'`); a
step's form writes to the customer's own `accounts.fields`; a step's file is a `files` row
(`onboarding_step_id`).

**Reminders** always appear in the app (`notify` kind `onboarding_mail`). Whether one also goes by e-mail
or chat is each person's own choice (`prefs.events.onboarding`, off by default); quiet hours hold it and,
when the person batches, it waits for the morning summary. Never to customers.

**Won deals.** `orgs.settings.onboarding` (`OnboardingSettings` in the shared file): `fromHandover` (off
until an administrator turns it on), `templateId` (a template, a built-in key, or `ask`) and `rules`
(customer field + value → template, first match wins; `templateFor`). `ask` opens an empty draft;
`POST /onboarding-plans/:id/template` makes it again from the template chosen.

**A plan made its own.** `onboarding_plans.phases` (migration 0210) keeps a plan's phases in order with
their own names; empty means the built-in phases its steps use. Step phases are any short key (`ph1`…).
`phaseOrder` resolves the order, `phaseLabel` the name, and the server sets `phaseAt` on each step so
`ordered`/`milestones` follow it. `PUT …/phases` and `PUT …/steps/order` change this plan only;
"save as template" (`fromPlan`) carries the phases into the template's blueprint.

**Files from the portal.** `POST /papi/onboarding-steps/:id/files` (`portal_onboarding_add_file`, a step
on the customer's side or one that asks for a file) and the request/reply files of 0082 share one check:
the endings in `PORTAL_FILE_ENDINGS`, first bytes, `PORTAL_FILE_MB` per file and the company's
`settings.portal.uploadQuotaMb` (default `PORTAL_QUOTA_MB`). They show on the customer's timeline
(`portal_file`). No malware scan yet (RUNBOOK, go-live checklist).

**Adding a signal:** an entry in `SIGNALS`, its fact in `lib/onboarding.ts` (`companyFacts`,
`customerFacts` or `planFacts`), `ob.signal.<id>` in the nine dictionaries, and a test in
`tests/onboarding-hub.test.ts`.

## Departments and the flow between them

**Walls.** A board belongs to one department (`boards.department_id`); who sees it is decided in row security
(`app_visible_boards`), not in the routes. Only administrators and the department's leads open boards; a DB trigger
stops anyone else from moving a board. A department switched off (`departments.enabled = false`) is hidden and keeps
its boards. `shared/src/departments.ts` holds the order of the customer's path (`DEPARTMENT_FLOW`) and
`handoverAfter()`: with Onboarding off, Sales hands over straight to Customer Success.

**Crossing.** Work never crosses by opening another department's board. A request goes to another department's
intake board through its form (`GET /departments/desks`, `POST /boards/:id/requests {fromTaskId}`) and is linked to
the asking task; the asker sees a link card (title, status, department). A customer request links to a product story
through `request_links`; a won deal makes one `handovers` card (`lib/handoff.ts`); `account_team` holds the owner in
each department. The customer page's band counts open work per department behind each department's `band_view`.

**Extending.** A new trigger or action for rules goes in `shared/src/automation.ts` and `lib/automations.ts` (the
trigger must also fire for records synced from a CRM, through `sweepRecordEvents`); a new hand-over source in
`lib/handoff.ts`. Tests: `tests/flow.test.ts`, `tests/departments.test.ts`.

## Import 2.0

`shared/src/taskImport.ts` turns any sheet into rows (grouped exports, indented sub-items, a kanban board's JSON)
and `shared/src/importPlan.ts` plans where each list goes (department boards by list name, or a board per list). The
same plan is the dry run: `POST /task-imports {dryRun: true}` saves nothing and reports, with row numbers, what will
not come in. A real run writes one `import_batches` row so `POST /task-imports/:id/undo` can take it back for 30
days (untouched tasks to the trash as one item; worked-on ones kept, archived). No notifications, no rules. A new
source format is a reader in `taskImport.ts` plus a case in `tests/import-plan.test.ts`.

## Accounting programs and the analytics feed

Accounting adapters live with the CRM adapters in `api/src/sync/` and use the same engine (pacing, daily allowance,
partial runs that resume), but every write throws: they only read. Matching to customers is tax id, then domain,
then name, never guessing between two (`routes/finance.ts`, the Matching tab). Figures need `finance.view` or the
Finance band. Adding a program: an adapter, its entry in `ACCOUNTING_ALL`, `fin.what.<id>` in the nine
dictionaries, a help page `docs/site/<lang>/accounting-<id>.md`, recorded fixtures in `tests/accounting.test.ts`.
More in `INTEGRATIONS.md`.

The analytics feed (`routes/analytics.ts`, `lib/analytics.ts`) serves OData 4 and a JSON/CSV twin, read with an
analytics key (`api_tokens` of kind analytics) as the key's owner: the same row security and field rules as the
app, so a hidden field is missing even from `$metadata`. A new dataset is one more entry in `catalog()` in `lib/analytics.ts`, with its
columns; add it to `tests/analytics.test.ts` and the table on `bi-tools.md`. The warehouse
export is a design note: `docs/design/warehouse-export.md`.

## The assistant

One server-side core (`api/src/assistant/core.ts`) answers every chatbot: free rules first (language, other
products declined, unclear questions get one question with choices), then the company's cache, then the model with
the four closest docs sections and read-only tools that call the API as the asking person. No key, switched off,
over the company's or the global monthly cap, or an error: the docs search answers, at no cost. A new read-only tool
goes in `shared/src/assistant.ts` with a case in `tests/assistant-eval/cases.ts` (`live: true`). The evaluation
runs without a key in CI (`npx tsx tests/assistant-eval/run.ts`, fixed checks) and with a key and a judge before a
release. Privacy notes: `docs/compliance/ai-assistant-privacy-notes.md`. Caps and why: ADR 0010.

## The AI team (Curahold's own console)

Seats from `shared/src/team/orgChart.ts` are put into the database by `api/src/team/seed.ts`. A seat thinks through the
assistant's provider (`team/runtime.ts`, same key), wakes only when a cheap SQL pre-check finds something new
(`team/precheck.ts`; `tick()` is what a scheduled task must call — nothing schedules it yet), and can only **propose**
outside actions. `team/gate.ts` lets an approval run only when the operator decided it in his own console session, through
a runner the server registered; `team/monitor.ts` pauses a seat that over-reaches, retries refusals, tries to bypass the
gate or spikes in tokens. Budgets: weekly per seat, `TEAM_MONTHLY_USD` for the team (default 40). A new outside action =
a runner + a proposal kind + tests in `tests/team*.test.ts` (incl. `team-redteam.test.ts`). Why: ADR 0011.

## Trials, terms and consent

"Try it free" is a request (`routes/trial.ts`, `lib/trialRequests.ts`), approved in the operator console; the old
instant sign-up is `SIGNUP_MODE=instant`. After approval the company's administrator accepts the terms and the DPA
once per version (`routes/agreements.ts`, append-only `agreement_evidence`). Consent texts are versioned rule sets in
`shared/src/compliance/consentTexts.ts`; every surface uses one consent library (`shared/src/consent/`), and
`scripts/compliance/inventory.ts` scans the code for anything stored in a browser and fails when a key is not in the
inventory, which also writes the cookie policy in nine languages. Crawlers: one list in
`shared/src/compliance/crawlers.ts` drives every robots.txt and the Worker's refusals (`lib/botGuard.ts`).
