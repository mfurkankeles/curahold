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
| `npm test` | API, database security, sign-in and device limit, tasks and concurrency, KVKK/GDPR tools, sign-up, joining, Slack / Teams / Google Chat / webhooks against stand-ins, notifications and digest, calendar feed, accounts and import, automations, setup, logo, dictionaries, leak check | ~40 s |
| `npm run test:e2e` | Builds the app and drives it in Chrome: phase 1 journeys plus sign-up → wizard → import → people → rules → first board, accounts, rule editor, join request → approval → personal setup, phone layouts; saves screenshots | ~70 s |
| `npm run typecheck` | TypeScript across API, web and tests | ~5 s |

`tests/leak.test.ts` fails if any name, customer, channel or record id
from the internal tool this product was rebuilt from appears anywhere in the
repository. The forbidden words are stored only as hashes.

## Layout

```
api/src/          Hono API — runs on Cloudflare Workers (worker.ts) and Node (node.ts)
  routes/         auth, me, boards, tasks (+comments, files), admin (+privacy)
  db/             Postgres drivers (postgres.js for production, PGlite for tests)
shared/src/       types, EN/TR dictionaries, edit-merge logic — used by API and web
web/src/          React app (Vite)
db/migrations/    SQL schema and row-level security policies
scripts/          dev server, migrations, demo data
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
Google and Microsoft (only when a company enables their sign-in). Paddle
(billing) joins in phase 5.
