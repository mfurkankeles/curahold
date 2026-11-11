# Tendwell

Work management for customer success and account teams: boards, tasks,
renewals and follow-through, built to live next to Slack and the CRM.
Every company gets its own address, like `acme.tendwell.com`.

This repository is **phase 1 of 6**: the multi-tenant foundation. Slack
(phase 2), CRM connectors (3), add-ons and support (4), billing and
compliance tooling (5) and the sales site (6) build on it.

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
| `npm test` | API, database security, sign-in and device limit, tasks and concurrency, KVKK/GDPR tools, dictionaries, leak check | ~15 s |
| `npm run test:e2e` | Builds the app and drives it in Chrome: sign-in, create, drag, mention, merge, language, viewer seat, device limit, vocabulary, phone layout; saves screenshots | ~40 s |
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
