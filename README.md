# Curahold

Work management for customer success and account teams: boards, tasks,
renewals and follow-through, next to whatever chat app and CRM a company
already uses — or none. Every company gets its own address, like
`acme.curahold.com`, and sets itself up alone in about 15 minutes.

Phases: 1 foundation ✓ · 2 self-serve setup, messaging, accounts,
automations ✓ · 3 CRM connectors (Salesforce, HubSpot, Dynamics 365,
Pipedrive, Zoho, Google Sheets) ✓ · 4 support tools, add-ons, Servis Konsolu ·
5 billing, seat-sharing detection, legal documents, self-hosted package ✓ ·
6 sales site ✓.

## What works today

- One codebase, many companies. Every row carries `org_id`, and Postgres
  row-level security decides visibility — a bug in a route still cannot
  return another company's data (`tests/isolation.test.ts`).
- Company addresses: `<slug>.curahold.com`; reserved names (`app`, `www`, …)
  are refused. A self-hosted install runs as a single company
  (`SINGLE_TENANT_SLUG`).
- Passwordless sign-in: email link, Google, Microsoft. A provider sign-in
  on a device seen for the first time must also enter a 6-digit emailed code.
- Seat protection ("balanced" policy): a seat works on up to 2 devices at
  once; a third sign-in signs out the least recently used device and that
  person is told why. Sessions are bound to the device, so a copied cookie
  does not work elsewhere.
- Roles with permissions, teams with leads, team / company / private boards,
  free read-only viewer seats.
- Boards with custom columns, drag and drop, list view, My tasks, calendar,
  subtasks, comments with @mentions, files.
- Two people editing the same task never overwrite each other: saves are
  versioned, and a lost race is merged field by field (`shared/src/merge.ts`).
- Company vocabulary: what the company calls its customers ("Account",
  "Partner", "Müşteri" …) is used throughout the interface.
- English and Turkish everywhere, including server messages and emails.
- Personal data tools for KVKK / GDPR requests: download everything held
  about a person, erase a person, activity log.

### Phase 2

- **Self-serve sign-up** at `app.curahold.com`: confirm a work email, name the
  company, pick its address (checked live) and a template (customer success,
  account management, sales, support, empty). The founder lands in the new
  company signed in. A company's email domain is recorded only from a
  verified address, never for public mail services.
- **Setup wizard** (resumable): company → chat app → customers from a
  spreadsheet → people and teams suggested from the chat directory and the
  file's owners → template rules → invitations. Nobody is emailed until the
  last step.
- **Joining**: invitation, a request from someone at the company's domain
  that an administrator approves, or (optional) joining straight away.
  More domains are added with a code sent to an address there.
- **Personal first run**: name, language, where notifications go, morning
  summary hour, a private calendar feed (.ics) for Google / Outlook / Apple.
- **Messaging layer** (`api/src/connectors/messaging`): Slack, Microsoft
  Teams and Google Chat with buttons (done / tomorrow / open) and "create a
  task from a message"; Discord, Mattermost, Rocket.Chat, Webex, Zoom Team
  Chat, Teams Workflows, Google Chat spaces and signed JSON (Zapier, Make,
  n8n) through webhooks; email always. Inbound requests are verified (Slack
  signature, Bot Framework and Google tokens); credentials are sealed with
  AES-GCM and the request role cannot read them.
- **Notifications**: outbox written in the same transaction, delivered after
  it; in-app bell; per-person channel and per-kind switches; chat failure
  falls back to email; boards can post new / finished tasks to a channel.
- **Accounts**: list with the company's own fields, sorting, bulk owner
  change and archive, a page per account with its tasks; CSV / Excel import
  with column guessing, Turkish and English number/date formats, new fields
  from new columns, owners linked when they join, and one-click undo.
- **Automations** built as sentences: when (date approaching, every N days,
  quiet for N days, new account, task overdue, task moved) · only for
  (conditions) · then (open tasks with checklists, or remind people). Live
  preview, on/off switch, run now, history; each occasion fires once.
- **Admin area**: grouped sections, seat summary, row menus, hand-over of a
  person's accounts and open tasks, join requests, domains, logo.
- **Company logo** in the menu, on the sign-in page, as the tab icon and in
  invitation and sign-in emails.

### Phase 3

- **Roles and permissions**: a grid of what each role may do, grouped and
  explained in plain words; starting points for new roles (team lead,
  operations, people admin, observer) or a copy of an existing one; "who
  has this permission"; "what can this person do" (company rights, teams,
  every board they can open and why); deleting a role moves its people to
  another. Connecting tools is a permission of its own.
- **Records under accounts**: contacts, opportunities and the company's own
  kinds (risks, renewals, cases…), each with its own fields; a list per kind
  and a section per kind on the account page. **Calculated account fields**
  (open pipeline, next close date, number of contacts…) are kept up to date
  from the records.
- **Two-way sync** (`api/src/sync`) with Salesforce, HubSpot, Dynamics 365,
  Pipedrive, Zoho CRM, Bitrix24, Freshsales, Zendesk Sell, Google Sheets and
  Excel in OneDrive / SharePoint:
  - set up without help: sign in → choose what comes over (any standard or
    custom object becomes accounts, contacts, opportunities, a new kind of
    record, or tasks on a board) → fields matched by name, change anything,
    "new field" creates it here, "bring all" brings every field → CRM users
    matched to people by email → preview with counts → start;
  - edits here are queued in the same transaction and sent right away;
    changes there are read every hour (by last-modified time), everything is
    read in full once a day; "sync now" any time;
  - items already in Curahold are linked by name, not duplicated; new choice
    values become new options; our own writes are not mistaken for changes;
  - the same field changed on both sides: the newer change wins (or the CRM,
    or Curahold — a setting); a CRM that suddenly returns far fewer rows
    archives nothing; deleting here never deletes there;
  - status, history, "not sent yet" list with retry, links to open each
    item in the CRM; long first syncs continue in slices.
- **Stakeholders**: contacts carry first and last name, job title, email,
  phone, LinkedIn, decision role (decision maker, approver, influencer,
  evaluator, user) and stance towards us (champion, supporter, neutral,
  skeptic, blocker) — labels in English and Turkish, renamable. Each
  account has an **org chart**: drag a card onto someone to set who they
  report to (mouse, touch handle, or the card menu from the keyboard);
  loops and people from other accounts are refused. Stance counts and the
  decision makers' stance sit above the chart; "blockers" and "champions"
  can be calculated account fields. "Reports to" syncs both ways with the
  CRM (e.g. Salesforce `ReportsToId`).
- **Demo CRM** (development and the live demo only) with made-up companies,
  contacts, opportunities, risk records and tasks.

### Everyday work

- **Search everything** with Ctrl/⌘ K: customers, tasks, contacts and other
  records, boards and people (only what the person may see), plus places
  and actions.
- **Change many tasks at once** from the list view: column, a person, due
  date, priority, archive — and **Undo** from the confirmation (also for
  bulk changes to customers).
- **The trash**: a deleted customer, record, task, timeline entry, page,
  saved report or automation stays for 30 days and comes back as it was,
  with everything that went with it (comments, files, time, the records
  under a customer) and with the links other things held to it. **Undo**
  right after a delete, or the Trash page in the personal menu. People see
  their own deletions; administrators see all and can delete for good. The
  copy is made by the database from its own foreign keys
  (`db/migrations/0025_trash.sql`), so a table added later is covered too.
- **Repeating tasks**: daily, weekly, every 2 weeks, monthly, quarterly,
  yearly; from the due date or from the day it was done. The next copy (with
  its checklist unticked) appears when one is done.
- **Export** customers, records and board lists to Excel or CSV, made in the
  browser.
- **Quiet hours** and **stop comment notices for a task**; assignments and
  @mentions still come.
- Running-cost rules: [docs/design/costs.md](docs/design/costs.md).

### Who sees what (roles and pages)

See [docs/design/roles-and-views.md](docs/design/roles-and-views.md) for the
research and reasoning.

- **Which customers a role sees**: all, their team's, or only their own —
  one setting per role on the roles screen, enforced by the database for
  every list, page and API call. Contacts and other records follow their
  customer.
- **Field access**: for each field, *who sees it* and *who changes it* are
  separate choices (by role). Hidden fields are left out of every answer;
  read-only ones are shown locked and refused on change.
- **Home pages**: every role lands on its own page of cards (my tasks,
  coming renewals, needs attention, gone quiet, stakeholder risks, numbers,
  breakdowns, team load, connections, notes). One page serves a whole role:
  each person sees it filled with their own part. Administrators edit pages
  in place, choose whose home a page is and who can open it.
- **See it as them**: from the roles screen an administrator opens Curahold
  exactly as a chosen person sees it — read only, logged.
- **Choice colours** from Curahold's own palette, shown in lists and pages.
- Fixed on the way: people who manage customers but not company settings
  could not save account-field changes (the save was silently dropped).

### Developer platform, AI connector and docs

Everything here acts as one person and stays inside their rights: the same
row-level security, customer reach and field access as the app.

- **Personal API keys** (`chk_…`): read only or read and write, 30/90/365
  days or no end date, revoked in one click. Only a SHA-256 digest is
  stored. A key cannot make keys, approve apps or preview someone else.
  People admins see and revoke every key in the company.
- **Webhooks**: `task.*`, `account.*`, `record.*`, `comment.created`.
  Changes are captured by database triggers (only for events some webhook
  wants, collapsed per minute), sent right after the request that caused
  them, signed `Curahold-Signature: t=…,v1=HMAC-SHA256(secret, t.body)`,
  retried after 1, 5, 30, 120 and 360 minutes, paused after 50 failures in a
  row. Public https addresses only.
- **AI connector (MCP)** at `https://<company>.curahold.com/mcp`: Claude,
  ChatGPT or any MCP client. OAuth 2.1 with discovery (RFC 8414 / 9728),
  dynamic client registration (RFC 7591), PKCE S256, one-hour access tokens
  and rotating refresh tokens. The person approves on Curahold's own consent
  screen and can leave changes off. Tools: search, fetch, list_accounts,
  list_tasks, portfolio_summary, create_task, update_task — each one calls
  the app's own API, so nothing is reachable that the app would not show.
  The model runs on the person's own Claude or ChatGPT plan: no AI cost on
  our side.
- **Docs** (`docs/site/<lang>/*.md` → `dist/web/docs`): help centre and
  developer docs in Turkish and English, static pages with search, every
  page also served as Markdown, plus `/llms.txt` and `/docs/llms-full.txt`.

### Timeline, health score and weekly summary

- **Customer timeline**: notes, calls, meetings and emails people log
  (dated, with the contacts involved, pinnable), merged with tasks opened
  and finished, comments, contacts added and score jumps — all read under
  the viewer's own rights. Tasks now keep when they were finished
  (`done_at`, set by the database however the task was finished).
- **Explainable health score** (Settings → Health score): 0–100 per
  customer from recent touch, overdue work, champion, decision maker,
  blockers, the owner's judgement and any number field (usage, NPS…), with
  weights, days and bands chosen by the company and a live preview. Every
  point is explained on the customer page ("Why?"), with a 90-day trend.
  The score is a calculated customer field (`health_score`), so lists,
  filters, cards, exports, the API, webhooks and CRM syncs all see it.
  Triggers mark only customers whose inputs changed; they are worked out
  right after the request, and everyone once a day (one snapshot per
  customer per day, kept 400 days).
- **Weekly summary** on Monday at the person's morning hour: renewals in
  30 days, scores that fell with the main reason, customers quiet for 30+
  days, the week's work. Chat first, email as the fallback, skipped when
  there is nothing to say.
- The AI connector reads the timeline and the score and can log a note.

### Help and support access with consent

- **Help form** (left menu → Help): topic, impact, title, description and
  steps to repeat, with docs pages suggested while the title is typed (the
  docs' own static search index; no AI call). Screenshots by capturing the
  tab (the help window steps aside), pasting or dropping; a mark-up tool
  highlights, and covers what should not be sent (removed from the picture
  itself). Up to 6 files of 10 MB, of an allowed type.
- **Technical details** collected in the tab's memory only — browser,
  screen, app version, last pages (paths, no query values), errors on the
  page and failed requests (emails and key-like text masked) — shown in the
  form before sending, each group removable. Secrets in the page address
  are dropped on both sides.
- The desk gets one message (email and/or a signed webhook) with everything,
  plus file links signed per file for 14 days; the person gets a receipt
  with a `CH-000123` reference and sees status under Help → My requests.
- **Support access only with consent**: an unticked box on the form (or
  "Let support look" later). 24 hours, 3 or 7 days; read only unless an
  administrator allows changes; revocable at once, open sessions included.
  Support asks for a one-time entry link (10 minutes) with its staff key and
  then acts as the person who granted it — same role, same customers, same
  database checks — in a separate httpOnly, SameSite=Strict session of at
  most 8 hours. Never within reach: devices, sign-in, API keys, apps and
  webhooks, people and roles, company settings, export and erasure, and
  support access itself. Every visit and every change is in the activity
  log with the staff member's name; a strip shows the person that access is
  open, and shows support whose eyes it is looking through.
- **Company policy** (Settings → Security → Support access): anyone /
  administrators only / nobody; narrowing it ends the access it no longer
  allows.
- **Session recording for support** (disclosed, on by default, switchable off
  by the company at Settings → Security): the page records itself with rrweb so
  the desk can see what led to an error. Every input is masked (nothing typed
  is recorded), events are gzipped and sent in batches, and a recording is kept
  7 days. A company never reads its own recordings — the replay tables carry no
  grant to the app's database role; the ingest endpoint writes them through the
  owner connection, scoped to the signed-in person, and only the desk reads
  them, through the owner connection, logging each playback. rrweb loads lazily
  after boot, so the app's own bundle is unchanged; a preview or support visit
  is never recorded.
- **The support desk** (its own host, `desk.<domain>`, for Curahold's own
  team): queues by whose turn it is (waiting on us, nobody's yet, mine,
  waiting on the customer, solved), the conversation with the company and
  the person beside it, an answer or a note for the team only, taking and
  releasing a request, and "see it as they do" where the person has let
  support in. Sign-in is a six-digit code sent to an address on the staff
  list (`SUPPORT_STAFF`): five tries per code, five codes an hour, a session
  of 8 hours in a cookie only the desk's own address gets. What each staff
  member opened, answered, took or solved is kept in the desk's own log.
  Locally: `http://desk.localhost:5173`, `desk@curahold.localhost`; the
  code is shown on the screen.

### Customer portal

- A company opens chosen boards (team or company boards, never private
  ones) to its customers' people, per board: the intake column (new
  requests are assigned to the customer's owner), the names customers read
  for columns, and which details they see (due date, priority, who works on
  it). A company-wide switch closes it for everyone at once.
- People at a customer are invited by an administrator or the customer's
  owner. How they sign in afterwards is the company's choice: an email with
  a six-digit code and a link; Google; Microsoft (the first sign-in
  confirmed once by email, then matched on the account's `sub`); passkeys
  (WebAuthn via `@simplewebauthn`, bound to the portal's own host); and
  passwords (PBKDF2-SHA256, 100k rounds, lock after five wrong tries).
  Google/Microsoft reuse the app's single registered callback, and only the
  browser that started a sign-in can finish it. Session length (1–90 days)
  and a new sign-in email are settings; switching a way off ends its
  sessions. The sign-in form never reveals who has access.
- They see only their own customer's tasks that are shared with them, and
  only the comments written for them; they open requests and reply. Inside,
  a task is shared with a tick; comments are **Internal note** by default or
  **Reply to customer** (emailed to them). Changing a task's customer
  switches sharing off, so a conversation never moves to another customer.
- **Walls**: the portal is a separate Worker on a separate registrable
  domain (`*.curahold-portal.com`, `wrangler.portal.toml`) with its own
  small bundle (`dist/portal`), cookie (host-only, httpOnly,
  SameSite=Strict), sessions and CSP headers; the app's API, cookies and
  code are not served there and vice versa. Portal requests run as the
  `curahold_portal` database role, which has no table privileges at all and
  can only call the `portal_*` security-definer functions; those take the
  company and customer from the signed-in person, never from the request.
  Rate limits per person (30 requests, 200 replies a day; 5 links an hour).

### Try-it-now demo

`npm run build:demo` builds the whole product — API, Postgres (PGlite, with
the same migrations and row-level security) and the app — into one static
folder, `dist/demo`, that runs entirely in the visitor's browser with an
invented portfolio. No server, nothing sent anywhere, so it costs nothing to
host. A strip on top switches between an admin, a team lead, a member and a
viewer. `npm run test:demo` checks it under a strict content security
policy inside a sandboxed frame.

## Run it locally

```bash
npm install
npm run dev
```

Open **http://demo.localhost:5173** (Chrome, Edge and Firefox resolve
`*.localhost` to your machine). Sign in as `ada@demo.example`
(administrator), `mert@demo.example` (team lead), `zeynep@demo.example`
(member) or `sofia@demo.example` (viewer seat). In development the sign-in
link is shown on screen and printed in the terminal. All demo people and
accounts are invented.

`npm run start:local` serves the built app and API together on :8787.

## Tests

| Command | What it checks | Time |
| --- | --- | --- |
| `npm test` | API, database security, sign-in and device limit, tasks and concurrency, KVKK/GDPR tools, sign-up, joining, Slack / Teams / Google Chat / webhooks against stand-ins, notifications and digest, calendar feed, accounts and import, automations, setup, logo, roles, customer reach per role, field access, pages and card data, "see it as them", search, bulk changes and undo, repeating tasks, quiet hours, records and calculated fields, two-way sync against the demo CRM (first run, both directions, conflicts, deletions, schedule), each CRM adapter against a stub of its API, dictionaries, leak check | ~45 s |
| `npm run test:e2e` | Builds the app and the docs and drives them in Chrome: phase 1 and 2 journeys plus the roles grid, connecting the demo CRM → choosing objects → fields → preview → first sync → records on lists and account pages → an edit sent back, home pages and adding a card, hiding a field and checking it as a member, phone layouts; saves screenshots | ~80 s |
| `npm run test:demo` | Builds the in-browser demo and opens it under a strict content security policy in a sandboxed frame; switches person | ~20 s |
| `npm run typecheck` | TypeScript across API, web and tests | ~5 s |
| `TEST_DATABASE_URL=postgres://… npm test` | The same suite on a real Postgres, through the production driver (a fresh database per test file; the user must be able to create databases). Run it before a release: the in-memory database forgives things a real server does not | ~45 s |
| `PERF_DATABASE_URL=postgres://… npx tsx scripts/perf.ts` | The speed test: builds a large company (300 people, 6,000 customers, 120,000 tasks, 300,000 comments) on a throwaway Postgres and times the requests behind every page as a member, a team lead and an admin, plus the jobs that run by themselves. Exits non-zero if any request is over 400 ms | ~1 min |

`tests/leak.test.ts` fails if any name, customer, channel or record id
from the internal tool this product was rebuilt from appears anywhere in the
repository. The forbidden words are stored only as hashes.

## Layout

New to the code? Start with **[docs/DEVELOPER.md](docs/DEVELOPER.md)**: how a
request travels, the rules that keep companies apart, how to add a table,
an endpoint, a screen or a word, and a map from each feature to its files.

```
api/src/          Hono API — runs on Cloudflare Workers (worker.ts), Node (node.ts) and your own server (selfhost.ts)
  routes/         auth, me, boards, tasks (+comments, files), admin (+privacy), accounts, records, sync,
                  developer (keys, webhooks), oauth, mcp
  connectors/     messaging (Slack, Teams, Google Chat, webhooks)
  sync/           CRM and spreadsheet adapters and the two-way sync engine
  db/             Postgres drivers (postgres.js for production, PGlite for tests)
shared/src/       types, EN/TR dictionaries, edit-merge logic — used by API and web
web/src/          React app (Vite)
db/migrations/    SQL schema and row-level security policies
scripts/          dev server, migrations, demo data, docs build
docs/site/        public docs (Markdown, TR/EN) and their stylesheet
web/demo/         the in-browser demo's page (vite.demo.config.ts)
tests/            Vitest suites; tests/e2e drives Chrome
```

## Deploying (Cloudflare + Supabase EU)

1. Supabase project in an EU region. Run `DATABASE_URL=... npm run migrate`.
2. Create a minimal login role for the API (below) and a Hyperdrive config
   pointing at it; put its id in `wrangler.toml`.
3. R2 bucket `curahold-files`.
4. Secrets: `wrangler secret put AUTH_SECRET` (32+ random characters),
   `RESEND_API_KEY`, and the Google / Microsoft client id and secret if those
   sign-ins are offered. `STAFF_KEY` (24+ characters) lets Curahold support's
   tooling read the queue and answer; help requests go to `SUPPORT_EMAIL`
   and/or `SUPPORT_WEBHOOK_URL`; `SUPPORT_STAFF` (addresses, comma-separated)
   names who may sign in to the support desk at `desk.<domain>` (`DESK_HOST`
   to use another host name).
5. DNS: `*.curahold.com` and `app.curahold.com` on Cloudflare.
6. `npm run build && npx wrangler deploy`.
7. Customer portal (optional): a second domain (e.g. `curahold-portal.com`)
   on Cloudflare, `PORTAL_DOMAIN` set for both Workers, the same secrets put
   with `--config wrangler.portal.toml`, then
   `npx wrangler deploy --config wrangler.portal.toml`.
8. Billing (optional; without it everything is open): see *Billing with Paddle* below.

### Billing with Paddle

Paddle sells Curahold as the merchant of record (it charges, handles sales
tax and VAT, and sends invoices). Start in Paddle's sandbox, then repeat with
live keys.

1. In Paddle, make two products, **Team** and **Business**, each with a
   monthly and a yearly price **per seat** (quantity-based). The amounts are
   in `shared/src/billing.ts` (`PLANS`); keep the two in step.
2. Approve the website domain (`curahold.com`); checkout opens on company
   addresses such as `acme.curahold.com`.
3. A notification destination for `https://app.curahold.com/api/billing/webhook`
   with the `subscription.*` events; its secret key is `PADDLE_WEBHOOK_SECRET`.
4. An API key with read and write access to subscriptions and customer portal
   sessions (`PADDLE_API_KEY`), and a client-side token (`PADDLE_CLIENT_TOKEN`).
5. `PADDLE_ENV` (`sandbox` or `live`) and `PADDLE_PRICES`, for example
   `{"team":{"month":"pri_…","year":"pri_…"},"business":{"month":"pri_…","year":"pri_…"}}`.
6. Put the secrets with `wrangler secret put` and deploy. New companies get a
   14-day trial; seats follow the people who joined (checked every hour).

### Chat apps (each optional)

| Service | Register | Curahold endpoints |
| --- | --- | --- |
| Slack | One Slack app with OAuth scopes `chat:write im:write users:read users:read.email usergroups:read channels:read groups:read commands`, a message shortcut `app_create_task` and slash command `/curahold` | Redirect `https://app.curahold.com/api/connect/callback`; events, interactivity and commands `https://app.curahold.com/api/hooks/slack` |
| Microsoft Teams | Azure Bot (single-tenant registration in Curahold's tenant), published through the Teams Store; until then companies upload the package from Settings → Connections | Messaging endpoint `https://app.curahold.com/api/hooks/teams`; Microsoft sign-in redirect `/api/connect/callback` |
| Google Chat | A Chat app (HTTP endpoint, "project number" audience) published on the Google Workspace Marketplace, with a service account | `https://app.curahold.com/api/hooks/gchat`; Google sign-in redirect `/api/connect/callback` |

### CRMs and spreadsheets (each optional)

Each needs Curahold's own app with the service; the redirect is always
`https://app.curahold.com/api/connect/callback`. A service without its keys
is simply not offered.

| Service | Register | Secrets |
| --- | --- | --- |
| Salesforce | External Client App with OAuth scopes `api refresh_token`, shipped to customers as the package in `integrations/salesforce`; sign-in uses PKCE. Optional: token requests through the fixed-address relay in `tools/relay` | `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET`; optional `SALESFORCE_RELAY_URL`, `SALESFORCE_RELAY_KEY` |
| HubSpot | Public app; required scopes `oauth crm.objects.companies.read/write crm.objects.owners.read`, the rest optional (contacts, deals, tickets, tasks, custom objects) | `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET` |
| Dynamics 365 | Multi-tenant Entra ID app with the Dynamics CRM `user_impersonation` permission (the Microsoft sign-in app can be reused) | `DYNAMICS_CLIENT_ID`, `DYNAMICS_CLIENT_SECRET` (else the Microsoft ones) |
| Pipedrive | Marketplace app with read/write access to organizations, people, deals and activities | `PIPEDRIVE_CLIENT_ID`, `PIPEDRIVE_CLIENT_SECRET` |
| Zoho CRM | Server-based client in the Zoho API console, multi-DC enabled | `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` |
| Bitrix24, Freshsales, Zendesk Sell | Nothing: the company's administrator pastes a webhook address, API key or access token made in the CRM (`api/src/sync/adapters/keyed.ts`) | none |
| Google Sheets | The Google sign-in client with the `spreadsheets` scope (needs Google's verification) | the Google ones |
| Excel | The Microsoft sign-in app with `Files.ReadWrite.All` | the Microsoft ones |

### Database roles

The migrations create two roles without a login, `curahold_app` and
`curahold_portal`, and give both to the user that ran them. The API connects
as that same user. Every request a person makes runs
`set local role curahold_app` inside its transaction, so row-level security
always applies; customer-portal requests run as `curahold_portal`, which has
no table privileges at all and can only call the `portal_*` functions. Work
that belongs to no single company — a sign-in link before anyone is signed
in, an incoming webhook, the hourly jobs — runs as the connecting user on
purpose (`db.system` in the code); it is the only code that sees more than
one company. So a login that can do nothing but become `curahold_app` (no
table rights of its own) is not enough: that work would be refused.

## Running it on your own server

For a company that wants Curahold inside its own walls: one company, its own
Postgres, files on its own disk, mail through its own SMTP server, and no
subscription (everything is open). The server is `api/src/selfhost.ts`,
built into one file (libraries inside) by `npm run build:server`;
`Dockerfile` and `docker-compose.yml` package it with Postgres 16.

```bash
cp selfhost.env.example .env    # PUBLIC_URL, AUTH_SECRET, DB_PASSWORD, ADMIN_EMAIL, SMTP_URL…
docker compose up -d
```

On every start the server brings the database up to date; on the first one
it creates the company and its first administrator (`ADMIN_EMAIL`), who signs
in with an emailed link (without `SMTP_URL` the link is in
`docker compose logs app`). A web server with HTTPS in front sends
`PUBLIC_URL` to `127.0.0.1:8080`. Attachments are in the `files` volume and
the database in `db`: back up both. Without Docker: Node 22,
`npm ci && npm run build && npm run build:server`, then
`node dist/server/selfhost.mjs` from the repository folder with the same
settings in the environment and `DATABASE_URL` pointing at Postgres 16 or
newer (its user must be allowed to create roles on the first start). The
help page *Running Curahold on your own server* says the same for customers.

## Sub-processors (for the DPA)

Cloudflare (hosting, files), Supabase (database, EU region), Resend (email),
Google and Microsoft (only when a company enables their sign-in or connects
Sheets / Excel). A company's own CRM (Salesforce, HubSpot, Microsoft,
Pipedrive, Zoho) is its processor, not ours: Curahold reads and writes it on
the company's instruction. Paddle sells subscriptions as the merchant of record
(billing details of the paying company only).
