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

```bash
npm install
npm run dev            # API on :8787 (embedded Postgres + demo company) and the web on :5173;
                       # open http://demo.localhost:5173 and sign in as ada@demo.example
                       # (the sign-in link is printed in the terminal)
npm test               # unit and API tests (in-memory Postgres, ~2 min)
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
  i18n/en.ts, tr.ts      every word the user sees, in English and Turkish
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
  *.css                  styles.css (tokens and base), reports.css, motion.css, work.css —
                         all loaded by stylesheets.ts (app and demo); a new one goes there
db/migrations/           the schema, in order (0001, 0002, …). Each file runs once.
scripts/                 dev server, migrations, demo data (seed-demo.ts, seed-showcase.ts), docs build
tests/                   Vitest suites (*.test.ts) and tests/e2e (Chrome)
docs/site/               the user documentation (Markdown, TR and EN)
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

**Every word is in both languages.** No text in components or routes:
add a key to `shared/src/i18n/en.ts` **and** `tr.ts` and use `t('key')`
(web) or `translate(locale, 'key')` (server). `tests/i18n.test.ts` fails if
a key is missing in one language or an error code / audit action has no
words.

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

A new audit action needs `audit.widget.created` in both dictionaries. Add a
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
existing ones in both dictionaries), or edit `shared/src/i18n/en.ts` and
`tr.ts` by hand. Variables are written
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
| Plans and billing (Paddle; off unless configured) | `routes/billing.ts`, `lib/billing.ts`, `lib/paddle.ts`, `context.ts` (`requireWriter`, `requirePlan`) | `components/Billing.tsx` | `billing.ts` (plans, prices, `accessOf`) | `billing.test.ts` |
| The demo | `web/src/demo/` | same app | — | `npm run test:demo` |
| Your own server (one company, Postgres, files on disk, SMTP) | `selfhost.ts`, `scripts/build-server.ts`, `Dockerfile`, `docker-compose.yml`, `selfhost.env.example` | same app | — | `selfhost.test.ts` |

---

## 8. Writing style in the code

- A file starts with a short comment: what it is for and where its
  parts are. A function gets a one-line comment when its name doesn't say
  everything; a tricky line gets a comment saying **why**.
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
