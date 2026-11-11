# Tendwell

Work management for customer success and account teams: boards, tasks,
renewals and follow-through, next to whatever chat app and CRM a company
already uses — or none. Every company gets its own address, like
`acme.tendwell.com`, and sets itself up alone in about 15 minutes.

Phases: 1 foundation ✓ · 2 self-serve setup, messaging, accounts,
automations ✓ · 3 CRM connectors (Salesforce, HubSpot, Dynamics 365,
Pipedrive, Zoho, Google Sheets) · 4 support tools, add-ons, Servis Konsolu ·
5 billing, seat-sharing detection, legal documents, self-hosted package ·
6 sales site.

## What works today

- One codebase, many companies. Every row carries `org_id`, and Postgres
  row-level security decides visibility — a bug in a route still cannot
  return another company's data (`tests/isolation.test.ts`).
- Company addresses: `<slug>.tendwell.com`; reserved names (`app`, `www`, …)
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

- **Self-serve sign-up** at `app.tendwell.com`: confirm a work email, name the
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
  Pipedrive, Zoho CRM, Google Sheets and Excel in OneDrive / SharePoint:
  - set up without help: sign in → choose what comes over (any standard or
    custom object becomes accounts, contacts, opportunities, a new kind of
    record, or tasks on a board) → fields matched by name, change anything,
    "new field" creates it here, "bring all" brings every field → CRM users
    matched to people by email → preview with counts → start;
  - edits here are queued in the same transaction and sent right away;
    changes there are read every hour (by last-modified time), everything is
    read in full once a day; "sync now" any time;
  - items already in Tendwell are linked by name, not duplicated; new choice
    values become new options; our own writes are not mistaken for changes;
  - the same field changed on both sides: the newer change wins (or the CRM,
    or Tendwell — a setting); a CRM that suddenly returns far fewer rows
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
- **See it as them**: from the roles screen an administrator opens Tendwell
  exactly as a chosen person sees it — read only, logged.
- **Choice colours** from Tendwell's own palette, shown in lists and pages.
- Fixed on the way: people who manage customers but not company settings
  could not save account-field changes (the save was silently dropped).

### Developer platform, AI connector and docs

Everything here acts as one person and stays inside their rights: the same
row-level security, customer reach and field access as the app.

- **Personal API keys** (`twk_…`): read only or read and write, 30/90/365
  days or no end date, revoked in one click. Only a SHA-256 digest is
  stored. A key cannot make keys, approve apps or preview someone else.
  People admins see and revoke every key in the company.
- **Webhooks**: `task.*`, `account.*`, `record.*`, `comment.created`.
  Changes are captured by database triggers (only for events some webhook
  wants, collapsed per minute), sent right after the request that caused
  them, signed `Tendwell-Signature: t=…,v1=HMAC-SHA256(secret, t.body)`,
  retried after 1, 5, 30, 120 and 360 minutes, paused after 50 failures in a
  row. Public https addresses only.
- **AI connector (MCP)** at `https://<company>.tendwell.com/mcp`: Claude,
  ChatGPT or any MCP client. OAuth 2.1 with discovery (RFC 8414 / 9728),
  dynamic client registration (RFC 7591), PKCE S256, one-hour access tokens
  and rotating refresh tokens. The person approves on Tendwell's own consent
  screen and can leave changes off. Tools: search, fetch, list_accounts,
  list_tasks, portfolio_summary, create_task, update_task — each one calls
  the app's own API, so nothing is reachable that the app would not show.
  The model runs on the person's own Claude or ChatGPT plan: no AI cost on
  our side.
- **Docs** (`docs/site/<lang>/*.md` → `dist/web/docs`): help centre and
  developer docs in Turkish and English, static pages with search, every
  page also served as Markdown, plus `/llms.txt` and `/docs/llms-full.txt`.

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

`tests/leak.test.ts` fails if any name, customer, channel or record id
from the internal tool this product was rebuilt from appears anywhere in the
repository. The forbidden words are stored only as hashes.

## Layout

```
api/src/          Hono API — runs on Cloudflare Workers (worker.ts) and Node (node.ts)
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
3. R2 bucket `tendwell-files`.
4. Secrets: `wrangler secret put AUTH_SECRET` (32+ random characters),
   `RESEND_API_KEY`, and the Google / Microsoft client id and secret if those
   sign-ins are offered.
5. DNS: `*.tendwell.com` and `app.tendwell.com` on Cloudflare.
6. `npm run build && npx wrangler deploy`.

### Chat apps (each optional)

| Service | Register | Tendwell endpoints |
| --- | --- | --- |
| Slack | One Slack app with OAuth scopes `chat:write im:write users:read users:read.email usergroups:read channels:read groups:read commands`, a message shortcut `tw_create_task` and slash command `/tendwell` | Redirect `https://app.tendwell.com/api/connect/callback`; events, interactivity and commands `https://app.tendwell.com/api/hooks/slack` |
| Microsoft Teams | Azure Bot (single-tenant registration in Tendwell's tenant), published through the Teams Store; until then companies upload the package from Settings → Connections | Messaging endpoint `https://app.tendwell.com/api/hooks/teams`; Microsoft sign-in redirect `/api/connect/callback` |
| Google Chat | A Chat app (HTTP endpoint, "project number" audience) published on the Google Workspace Marketplace, with a service account | `https://app.tendwell.com/api/hooks/gchat`; Google sign-in redirect `/api/connect/callback` |

### CRMs and spreadsheets (each optional)

Each needs Tendwell's own app with the service; the redirect is always
`https://app.tendwell.com/api/connect/callback`. A service without its keys
is simply not offered.

| Service | Register | Secrets |
| --- | --- | --- |
| Salesforce | External Client App (or Connected App) with OAuth scopes `api refresh_token`; listed on AppExchange after the security review | `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET` |
| HubSpot | Public app; required scopes `oauth crm.objects.companies.read/write crm.objects.owners.read`, the rest optional (contacts, deals, tickets, tasks, custom objects) | `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET` |
| Dynamics 365 | Multi-tenant Entra ID app with the Dynamics CRM `user_impersonation` permission (the Microsoft sign-in app can be reused) | `DYNAMICS_CLIENT_ID`, `DYNAMICS_CLIENT_SECRET` (else the Microsoft ones) |
| Pipedrive | Marketplace app with read/write access to organizations, people, deals and activities | `PIPEDRIVE_CLIENT_ID`, `PIPEDRIVE_CLIENT_SECRET` |
| Zoho CRM | Server-based client in the Zoho API console, multi-DC enabled | `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` |
| Google Sheets | The Google sign-in client with the `spreadsheets` scope (needs Google's verification) | the Google ones |
| Excel | The Microsoft sign-in app with `Files.ReadWrite.All` | the Microsoft ones |

### Database roles

The API must not connect as the table owner. Create a login role that can
only become `tendwell_app`:

```sql
create role tendwell_api login password '...' noinherit;
grant tendwell_app to tendwell_api;
```

Every request runs `set local role tendwell_app` inside its transaction, so
row-level security always applies.

## Sub-processors (for the DPA)

Cloudflare (hosting, files), Supabase (database, EU region), Resend (email),
Google and Microsoft (only when a company enables their sign-in or connects
Sheets / Excel). A company's own CRM (Salesforce, HubSpot, Microsoft,
Pipedrive, Zoho) is its processor, not ours: Tendwell reads and writes it on
the company's instruction. Paddle (billing) joins in phase 5.
