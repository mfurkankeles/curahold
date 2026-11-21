# Runbook

Operational procedures for the hosted service (Cloudflare Workers + Supabase EU + R2) and, where it differs, for a
self-hosted install. Written for the engineer on call. Values like `<project-ref>` are placeholders.

**Honesty box.** Items marked **[not yet in place]** are targets from QUALITY.md that are not implemented or have not
been rehearsed. Do not assume they protect you; see [SECURITY.md](../SECURITY.md#known-operational-requirements).

Contents: [Ground rules](#ground-rules) · [Deploy](#deploy) · [Rollback](#rollback) · [Migrations](#migrations) ·
[Rotating secrets](#rotating-secrets) · [Backups and restore](#backups-and-restore) · [On-call basics](#on-call-basics) ·
[Common incidents](#common-incidents) · [Go-live: bots and scrapers](#go-live-bots-and-scrapers-cloudflare-free-plan) · [Self-host notes](#self-host-notes)

## Ground rules

1. **No automatic deploys.** CI never deploys. Production changes happen only on the product owner's explicit go-ahead
   (QUALITY.md: "Canlıya alma yalnızca ben 'yayına al' deyince"), from a machine with the owner's Cloudflare/Supabase access.
2. **One change at a time**, and tell people before a migration that locks a big table.
3. **Never run ad-hoc SQL as the owner against production** for convenience. If you must, wrap it in a transaction, `select`
   first, and write down what you ran. Remember the owner connection bypasses row-level security: filter by `org_id`.
4. **Everything in logs is data about people.** Do not paste logs with customer content into public places.
5. Use invented names in tickets and docs; no real customer names in the repo.

## Deploy

Prerequisites: Node from `.nvmrc`, `npm ci`, `wrangler` logged in (`npx wrangler login`), `main` green in CI.

Hosted release checklist:

```bash
git checkout main && git pull
npm ci
npm run check                      # tsc + the full suite on PGlite
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm test   # real Postgres, before every release
npm run lint                       # warnings are fine, errors are not
npm run build                      # app + portal + help pages

# 1. Database first (additive migrations are safe while the old code still runs; see "Migrations").
MIGRATION_DATABASE_URL='<owner connection string>' npm run migrate   # the owner; the Worker's own login is not (ADR 0023)

# 2. The Worker (app, API, cron) and then the portal Worker.
npx wrangler deploy
npx wrangler deploy --config wrangler.portal.toml     # only if shared code the portal uses changed (it usually did)
```

Verify after deploy (5 minutes):

1. `curl -fsS https://app.<domain>/api/health` returns `{"ok":true}`.
2. Sign in to a staff company with a magic link; open a board; create and complete a task; check that the toast and the
   notification appear.
3. `npx wrangler tail` for a minute: no `[curahold] unhandled` lines.
4. Open the portal for a test company.
5. Look at `GET /api/admin/errors` (an admin session; there is no screen for it yet) or the `error_log` table for a new error spike.

Not deployed by this repo: DNS (`*.curahold.com`, `app.`, `desk.`, portal domain), Cloudflare Email Routing for the support
reply domain, Paddle notification destination (`https://app.<domain>/api/inbound/billing/paddle`, `subscription.*` and `transaction.*` events),
Supabase project settings. They are one-time setup; see README "Deploying".

First-time setup order (new environment): Supabase EU project -> `npm run migrate` -> minimal login role (README "Database
roles") -> Hyperdrive config (put its id in `wrangler.toml`) -> R2 bucket `curahold-files` -> secrets (`wrangler secret put`,
list in `docs/ENVIRONMENT.md`) -> DNS -> `npm run build && npx wrangler deploy`.

## Go-live checklist (once)

1. **Wildcard DNS, right after the domain is bought.** One proxied record, once, and never again per
   company: `Type: CNAME  Name: *  Target: curahold.com  Proxy: on`. Every company's address
   (`<slug>.curahold.com`) and its onboarding hub (`/onboarding`) answer from then on; the portal domain
   gets the same single record. Nothing is added when a company signs up.
2. **Files from customers are looked into before they are kept** (`api/src/lib/uploadScan.ts`, free, on every
   hosting). The portal takes files only on requests or tickets shared with the customer and on steps of their
   onboarding plan; each is checked by ending and first bytes, at most 25 MB, within the company's allowance
   (Settings → Customer portal), then by its contents without unpacking: ZIP directories (at most 2,000 entries,
   250 MB unpacked, ratio 120:1; no encrypted, nested-archive, program or climbing-path entries), Office macros
   (`vbaProject.bin`), PDFs with `/JavaScript`, `/JS`, `/Launch` or `/EmbeddedFile`. Stored privately, served only
   as a download (`content-disposition: attachment`, `sandbox` CSP, `nosniff`). **A signature virus scan is
   optional:** self-host sets `CLAMAV_HOST` (the commented `clamav` service in `docker-compose.yml`); every upload
   (portal, tasks, records, onboarding steps) is then held (`file_scans`, answer 423 `file_quarantined`) until
   clamd finds it clean, deleted if infected (alert in the owner console), retried hourly if clamd is down. The
   hosted Workers have no free signature scanner; the content checks above are the hosted line (decision in
   `/home/claude/orch/out/owner-questions.md`).
2. **Files from customers have no malware scan yet.** The portal takes files only on requests or tickets
   shared with the customer and on steps of their onboarding plan; each is checked by ending and first
   bytes, at most 25 MB, within the company's allowance (Settings → Customer portal), stored privately and
   only ever served as a download (`content-disposition: attachment`, `sandbox` CSP, `nosniff`). Decide on a
   scan before go-live (no paid service has been added); until then this is the standing risk.
3. **İYS before any marketing e-mail to Türkiye.** Curahold must be registered in İYS (İleti Yönetim Sistemi) as a service
   provider before it collects or uses commercial-message approvals (Law 6563, Regulation art. 7). Until then the switch
   `trIysRegistered` in `shared/src/compliance/consentTexts.ts` (`DEFAULT_FLAGS`) is `false`: the trial form shows Türkiye no
   marketing boxes and the KVKK notice says so. After registration (and the upload of approvals within 3 business days set
   up), set it to `true`, change the sentence in `docs/site/{en,tr}/legal-kvkk.md` and `legal-privacy.md` ("Until Curahold is
   registered in İYS…"), and run `npx tsx scripts/compliance/legal-pack.ts`.
4. **Breach readiness.** Read [docs/compliance/breach-runbook.md](compliance/breach-runbook.md): roles named, counsel appointed per
   market, the deadlines marked "lawyer to confirm" confirmed, and `incident_log` (migration 0244) reachable by the operator.

## Rollback

- **Code:** Cloudflare keeps previous Worker versions. `npx wrangler rollback` (or the dashboard: Workers > curahold >
  Deployments > Rollback) restores the previous bundle in seconds. Roll back the portal Worker separately.
- **Database:** migrations are **forward-only**. Rolling back code across a migration is safe only if the migration was
  additive (new nullable column, new table, new index). Therefore: ship destructive changes (drop/rename/type change) in two
  releases: first stop using the thing, deploy; then drop it in a later migration.
- If a bad migration already ran: restore from backup is the last resort (see below); first try a **new** corrective migration.
- **Hand-run undo scripts** exist for the larger recent migrations in `db/rollback/` (0120 departments, 0170 flow, 0195 setup health,
  0200/0210/0211 onboarding). They are not migrations (the runner never reads that folder) and they delete the feature's data: run one only
  on the owner's decision, as the owner, in one transaction (`psql "$DATABASE_URL" -1 -f db/rollback/<file>.sql`), after a backup, and
  roll the code back first. `tests/departments-migration.test.ts` exercises the 0120 one.

## Migrations

- Files `db/migrations/NNNN_name.sql`, applied in name order, once each, recorded in `schema_migrations`.
  `api/src/db/migrate.ts` runs each file's statements in one transaction.
- **Never edit an applied migration.** Add a new number. Both hosted (`npm run migrate`) and self-host (on start) use the same files.
- Every new company table: `org_id`, `select app_secure_table('<table>');` (row security on and forced, plus the
  server role's own policy, migration 0254), a policy on `app_org()`, grants for `curahold_app`.
  `tests/rls.test.ts` fails the build otherwise.
- Big tables: use `create index concurrently` outside a transaction only if you split the file; otherwise expect a brief lock.
  Check on a copy of production size with `scripts/perf.ts` (`PERF_DATABASE_URL`) before indexing the large tables.
- The migrating user needs to be able to create roles on the first run (`curahold_app`, `curahold_portal`,
  `curahold_system`) and must be a superuser or have BYPASSRLS (migration 0254 stops with a message otherwise).

### Database roles

| Role | Login | What it is for |
| --- | --- | --- |
| owner (Supabase: `postgres`) | yes, `MIGRATION_DATABASE_URL` | Owns the schema; runs migrations only. Superuser or BYPASSRLS. |
| `curahold_login` | yes, `DATABASE_URL` / Hyperdrive | The application. NOINHERIT, owns nothing; member of the three roles below (`db/ops/role-separation.sql`). |
| `curahold_app` | no | Every person's request (`db.tenant`); row security by company, person and department. |
| `curahold_portal` | no | Customer portal requests; only the `portal_*` functions. |
| `curahold_system` | no | `db.system()`: rows of every company through its own policy, no schema, policy or trigger rights. |

Check after any restore or role change: `select relname from pg_class where relowner = (select oid from pg_roles where
rolname = 'curahold_login')` returns nothing, and `select relname from pg_class c join pg_namespace n on n.oid =
c.relnamespace where n.nspname = 'public' and c.relrowsecurity and not c.relforcerowsecurity` returns nothing.

## Rotating secrets

All secrets are Worker secrets (`npx wrangler secret put NAME`; add `--config wrangler.portal.toml` for the portal; **the
portal and the app must carry identical `AUTH_SECRET`/`SECRETS_KEY`/`RESEND_API_KEY`/OAuth values**). A secret change takes
effect on the next request after `secret put` (no redeploy needed). Rotate on a schedule (at least yearly), on staff change,
and immediately on any suspected exposure.

| Secret | Rotation effect and procedure |
| --- | --- |
| `AUTH_SECRET` | Signs short-lived state: OAuth `state`, sign-up tickets, help-file download links, desk codes. **It does not sign sessions** (sessions are random tokens stored hashed), so users stay signed in; people mid sign-in or holding an old file link must retry. **Trap:** if `SECRETS_KEY` is unset, `AUTH_SECRET` is also the key that seals connector credentials; rotating it would make every stored CRM and chat credential unreadable. **Before rotating, set `SECRETS_KEY` to the *current* `AUTH_SECRET` value, deploy/verify, then rotate `AUTH_SECRET`.** Do the same for the portal Worker. |
| `SECRETS_KEY` | Seals connector credentials in `connections` (AES-256-GCM, HKDF from this value). **There is no dual-key support and no re-seal command yet [not yet in place].** Changing it makes existing sealed credentials unreadable; every company must reconnect its CRMs and chat apps. If you must rotate: write a one-off script that, per row, `unseal(old)` then `seal(new)` using `api/src/lib/crypto.ts` and updates `connections` (owner connection, filtered by `org_id`), run it in a transaction against a restored copy first, then switch the secret. Treat as a project, not a routine. |
| `RESEND_API_KEY` | Create a new key in Resend, `secret put`, send a test sign-in, delete the old key. No user impact. |
| `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_CLIENT_TOKEN` | Create the new credential in Paddle, put it, verify a sandbox/test event or a plan view, then revoke the old one. For the webhook secret, update the notification destination and the Worker together; webhooks arriving in between are retried by Paddle. |
| `GOOGLE_*`, `MICROSOFT_*`, `SLACK_*`, `TEAMS_*`, `GCHAT_*`, CRM `*_CLIENT_SECRET` | Create the new client secret at the provider (most allow two active secrets), `secret put`, test a sign-in or connection, then delete the old one. Existing company connections keep working: their *refresh tokens* are per company; only the app's own client secret changes. |
| `STAFF_KEY`, `STAFF_KEYS`, `SUPPORT_MAIL_KEY` | Generate 24+ random characters (`openssl rand -base64 32`), put, give the new key to the person or mail service. `STAFF_KEYS` is per person: removing a leaver's entry revokes only theirs. |
| `SALESFORCE_RELAY_KEY` / `RELAY_KEY` | Change on the relay host and on the Worker at nearly the same time; Salesforce token renewals fail in between and retry. |
| Database password | In Supabase rotate the login role password, update the Hyperdrive config (`wrangler hyperdrive update <id> --connection-string ...`). Brief connection errors until pooled connections recycle. Update the `DATABASE_URL` you use for `npm run migrate`. |
| Cloudflare API token / `wrangler login` | Revoke tokens of people who left; use a scoped token for any automation. |

After any rotation: run the deploy verification checklist, and record the date and who did it (outside the repo).

## Backups and restore

**What exists today**

- Supabase's automatic **daily** database backups (retention depends on the Supabase plan; confirm in the project settings).
- R2 objects (attachments, logos): no versioning or cross-region copy configured **[not yet in place]**; enable R2 object
  versioning / replication or a periodic `rclone` copy to a second provider.

**Scripted backup and the restore drill (free; `scripts/backup/`)**

- `scripts/backup/backup.ts`: `pg_dump` (custom format, `public` schema) of `BACKUP_DATABASE_URL`, encrypted with
  `BACKUP_PASSPHRASE` (openssl AES-256, PBKDF2), plus a manifest (exact row count per table, extensions, last
  migration, SHA-256). Weekly off-site copy: put the two files in a second place, e.g. an R2 bucket
  `curahold-backups` (`npx wrangler r2 object put curahold-backups/<file> --file <file> --remote`; R2's free tier is
  10 GB) and a copy on the owner's computer. Keep the passphrase in the password manager, never beside the file.
- `scripts/backup/restore.ts <file>`: into an **empty** database only (refuses one with tables): checks the
  checksum, creates the request roles and extensions, `pg_restore`, then verifies every table's row count against
  the manifest and the row-level security gates (RLS on, no privileges without a policy, SECURITY DEFINER search
  paths, row security forced, and a cross-company read as `curahold_app` that must see nothing). Exit 1 if anything
  differs. It creates the three working roles (`curahold_app`, `curahold_portal`, `curahold_system`) before
  `pg_restore`, because roles belong to the server and the dump's policies and grants name them.
- `scripts/backup/restore-drill.ts` (`DRILL_PG=<throwaway server>`): build → back up → **wipe** → restore → verify,
  timed. **Rehearsed 19 Nov 2026 on local Postgres 16:** sample install (144 tables) passed in 4.1 s (backup 0.4 s,
  restore 1.4 s, verify 0.1 s); the large test company (473 MB, 90 tables, 1.29 million rows) backed up in 15 s
  (72 MB encrypted) and restored + verified in 161 s; `tests/rls.test.ts` passed on the same server. Repeat it
  quarterly and after big schema changes, and once against a copy of production (Supabase "restore to a new project").
  `DRILL_TARGET_PG=<a second server>` restores onto a server that has never seen the roles, as a new project is.
  **Rehearsed 21 Nov 2026** that way on two fresh local Postgres 16 servers after migration 0254: 157 tables, every
  count equal, row security on and forced, cross-company read refused, 4.1 s.
- Point-in-time recovery: decided to switch on with the first paying customer (about $105 per month fixed). Until
  then the recovery point is the last daily backup (up to 24 hours of data loss in the worst case).

**Restore procedure (rehearsed with the drill above; repeat on a scratch project before you need it)**

1. Declare an incident; stop writes if corruption is ongoing (put a maintenance route in front, or `wrangler rollback` is not enough
   to stop writes: use a Cloudflare WAF/maintenance rule on `/api/*`).
2. In Supabase: Database > Backups > pick the backup (or PITR time) > **restore to a new project** (never over the live one first).
3. In the restored project check: `select count(*) from orgs;`, latest `audit_log.at`, latest `tasks.updated_at`,
   `select name from schema_migrations order by name desc limit 3;`. Re-run `npm run migrate` against it if the backup predates a migration.
4. Run the role checks: `select rolname from pg_roles where rolname like 'curahold_%';` (`curahold_app`, `curahold_portal`,
   `curahold_system` exist) and that your application login is a member of all three (see "Database roles").
5. Point **a staging Worker** (or a preview Hyperdrive config) at it and run the deploy verification checklist.
6. Cut over: update the Hyperdrive config's connection string to the restored database, verify, announce.
7. Single-company recovery (someone deleted data inside one company): prefer the **in-product trash** (30 days) or import undo first. Otherwise
   restore to a scratch database and copy that company's rows back with explicit `org_id` filters inside a transaction.
8. Write the post-mortem: what was lost (time window), what was recovered, what to change.

**Self-host:** `docker compose exec -T db pg_dump -U curahold curahold > backup.sql` plus a copy of the `files` volume
(`docker compose cp app:/data/files ./files-backup`); restore into an empty database with `psql`, then start the app (it
migrates on start). Keep copies on another machine and try a restore now and then.

## On-call basics

**Where to look**

| Signal | How |
| --- | --- |
| Is it up? | `GET /api/health` on the app domain (returns `{"ok":true}`); the same path is the Docker `HEALTHCHECK`. |
| Is the database reached? | `GET /api/health/ready` (app) and `GET /papi/health` (portal): `{"ok":true,"db":{"ok":true,"ms":4},"at":"…"}`, 503 when the database is not reached. Both allow any origin, so the status page can read them. |
| Outside view | `npx tsx scripts/synthetic.ts` (addresses from `SYN_APP`, `SYN_SITE`, `SYN_PORTAL`) times every public address and exits 1 on a failure; `--json status.json` writes the status page's file. The public page is `tools/status-page/index.html` (Cloudflare Pages, free, project `curahold-status`, apart from the app's Worker; `status.` on curahold.com would be caught by the Worker's wildcard route). |
| Error rate and latency | `lib/ops.ts`: more than 5% 5xx answers or a 95th percentile over 2 s in 5 minutes (at least 50 answers, per Worker copy), and 20+ server errors in `error_log` within an hour or 200+ deliveries stuck for an hour (hourly job, every copy together) → an alert in the owner console (`company_log`, refs `ops:*`) and one e-mail to `PLATFORM_OWNER`. `OPS_ALERTS=off` stops them; `OPS_ALERT_EMAIL=off` keeps them in the console only. |
| Live errors | `npx wrangler tail curahold` (and `--config wrangler.portal.toml`); log prefix `[curahold]`. |
| Recorded errors | `error_log` table: unhandled server errors and browser errors (source, company, user, path, message, stack; no bodies or secrets; kept 30 days). Admins see their own company's at `GET /api/admin/errors`; company-less errors stay with Curahold. |
| Background jobs | Worker crons `0 * * * *` (hourly jobs) and `*/10 * * * *` (the AI team's clock; returns at once without a model key or with `TEAM_SCHEDULER=off`) (Cloudflare dashboard > Workers > Triggers > Cron events). `[curahold] ... failed` lines name the job. CRM sync status: `sync_runs` (per connection; also visible in the product). |
| Billing | `billing_events` table and Paddle's notification log. |
| Abuse | Cloudflare analytics / WAF events (rate rules live here, **not** in the app). |

**First 15 minutes of an incident**

1. Acknowledge, open an incident note (time, symptom, who).
2. Scope: all companies or one? hosted app, portal, a connector? Check `/api/health`, Cloudflare status, Supabase status.
3. Last deploy within the hour? If yes and symptoms match, `wrangler rollback` first, investigate second.
4. If a single company: look at its `sync_runs`, `webhook_events`, `notifications` backlog (rows stuck unsent), and `error_log` by `org_id`.
5. Communicate: status message to affected admins (email), no promises about causes until known.
6. **Personal data involved?** Follow [docs/compliance/breach-runbook.md](compliance/breach-runbook.md) from here: the deadlines (48 hours
   to customers under our DPA; 72 hours to most authorities) run from the moment we are aware, and every breach goes into `incident_log`.
7. After: post-mortem within 3 working days, added to a `docs/postmortems/` folder (invented names only), with action items.

**Severity guide.** SEV1: data leak between companies (also a security incident, see SECURITY.md), data loss, full outage, or billing taking wrong
payments. SEV2: a core flow broken for many (sign-in, tasks), one connector down, scheduler not running for more than 3 hours. SEV3: degraded or
cosmetic. QUALITY.md targets uptime >= 99.9% with the app still opening and showing last data if the database or an integration is down.

## Common incidents

| Symptom | Likely cause | Action |
| --- | --- | --- |
| API 500s after deploy | Bad code or a migration not applied | `wrangler rollback`; run `npm run migrate`; check `error_log`. |
| `PLATFORM_OWNER (or SUPPORT_STAFF) must be set` at start | Multi-company install without an owner (deliberately fail-closed) | Set `PLATFORM_OWNER` secret/var. |
| `AUTH_SECRET must be at least 32 characters` | Secret missing or shortened | `wrangler secret put AUTH_SECRET`. |
| `PADDLE_PRICES needs team.month ...` | Malformed JSON | Fix the four price ids. |
| No digests / reminders | Cron not firing or the job failing | Check cron events and `wrangler tail` around the top of the hour; run `runScheduled` locally against a copy if needed. |
| Stuck notifications | Chat provider failing or token revoked | Rows in `notifications` with attempts and last error; the hourly job retries; fix the connection. |
| One CRM not syncing | Expired refresh token, revoked app, remote rate limit | `sync_runs` error, the product's connection status; the company reconnects. Backoff schedule: 1, 5, 30, 120, 720, 1440 min. |
| Everyone "device limit" signed out | `MAX_DEVICES` lowered or shared seats | Check the variable; explain policy. |
| Self-host cannot sign in | No `SMTP_URL`: mail goes to the app log | `docker compose logs app` for the link. |
| Salesforce token errors from a fixed-IP-only org | Relay down or key mismatch | Check the relay host and `SALESFORCE_RELAY_URL/KEY`. |

## Go-live: bots and scrapers (Cloudflare free plan)

Switch these on once the domains exist (`curahold.com` for the site and the app, `curahold-portal.com` for the portal).
Everything here is on Cloudflare's free plan; nothing is bought. What the code already does without them is in
[SECURITY.md → Robots, scrapers and bots](../SECURITY.md#robots-scrapers-and-bots). Menu names are the 2026 dashboard's.

**1. Turnstile (free) for the public forms.** Dashboard → **Turnstile** → **Add widget**: name `Curahold forms`,
hostnames `app.curahold.com` and `curahold-portal.com`, **Widget Mode: Managed**, pre-clearance: No. Then:

```
wrangler secret put TURNSTILE_SECRET_KEY
wrangler secret put TURNSTILE_SECRET_KEY -c wrangler.portal.toml
```

and under `[vars]` in both `wrangler.toml` and `wrangler.portal.toml`:

```
TURNSTILE_SITE_KEY = "<the widget's site key>"
```

Deploy. The trial form, the instant sign-up and the portal's sign-in, password and reset forms then show the check.
`TURNSTILE = "off"` switches it off again without removing the keys; with no keys the forms keep the honeypot and
fill-time checks.

**2. AI crawlers.** Security → **Settings** → filter **Bot traffic** → **AI Crawler and Agent access policies**:

| Behaviour | Action | Why |
| --- | --- | --- |
| Training | **Block** | The owner's rule: no training on Curahold's pages. |
| Search | **Allow (do not block)** for now | This category may hold search crawlers; robots.txt already asks AI search robots to stay out. Change only after Security Analytics shows Googlebot/Bingbot are untouched. |
| Agent | **Allow (do not block)** | The AI connector (`/mcp`, `/oauth`) is used by AI agents on a customer's behalf; the Worker refuses agents everywhere else unless they carry the customer's own key. |

Leave Cloudflare's managed robots.txt **off**: the site and the Worker serve the policy themselves
(`shared/src/compliance/crawlers.ts`).

**3. Bot Fight Mode.** Security → **Settings** → filter **Bot traffic** → **Bot fight mode** → On, on
`curahold-portal.com` (browsers only). On `curahold.com` turn it on, then watch Security → **Analytics** for 48 hours:
it cannot be skipped per path, and it may challenge API calls with keys, inbound webhooks (`/api/hooks/*`,
`/api/inbound/*`, including the Paddle webhook, and the older `/api/billing/webhook`) and the AI connector. If any of those are challenged, turn it **off** on
`curahold.com` and rely on steps 2, 4 and 5 (the code's limits and robot rules do the same work per path).

**4. WAF custom rules (free plan: 5).** Security → **Security rules** → **Create rule** → **Custom rules**.

Rule `AI and scraper robots on the site` — action **Block**:

```
(http.host in {"curahold.com" "www.curahold.com"} and http.request.uri.path ne "/robots.txt" and (lower(http.user_agent) contains "gptbot" or lower(http.user_agent) contains "claudebot" or lower(http.user_agent) contains "anthropic-ai" or lower(http.user_agent) contains "ccbot" or lower(http.user_agent) contains "bytespider" or lower(http.user_agent) contains "perplexitybot" or lower(http.user_agent) contains "amazonbot" or lower(http.user_agent) contains "meta-externalagent" or lower(http.user_agent) contains "applebot-extended" or lower(http.user_agent) contains "ahrefsbot" or lower(http.user_agent) contains "semrushbot" or lower(http.user_agent) contains "mj12bot" or lower(http.user_agent) contains "dataforseobot"))
```

Rule `No name on the public doors` — action **Block**:

```
(http.user_agent eq "" and (starts_with(http.request.uri.path, "/api/trial/") or starts_with(http.request.uri.path, "/api/signup/") or http.request.uri.path eq "/api/assist/public" or starts_with(http.request.uri.path, "/papi/auth/")))
```

(The app host itself needs no user-agent rule: the Worker refuses the same robots by name, with exceptions for the AI
connector and API keys that an edge rule cannot see.)

**5. Rate limiting rule (free plan: 1 rule, IP only, 10 s period, 10 s block).** Security → **Security rules** →
**Create rule** → **Rate limiting rules**, on `curahold.com`, name `Public doors`:

```
(starts_with(http.request.uri.path, "/api/trial/") or starts_with(http.request.uri.path, "/api/signup/") or starts_with(http.request.uri.path, "/api/auth/") or http.request.uri.path eq "/api/assist/public")
```

When rate exceeds: **20 requests** per **10 seconds**, counted per **IP**; then **Block** for **10 seconds**.
On `curahold-portal.com` the same with `starts_with(http.request.uri.path, "/papi/auth/")`. The Worker's own
budgets (`api/src/lib/ratelimit.ts`) stay the exact, per-person and per-company line behind it.

**What to watch, first week and then weekly.**
- The owner console's alerts: rows `traffic:burst`, `traffic:ip-burst`, `traffic:robots` (company log, kind alert).
  One alert per rule per 15 minutes per Worker isolate; the log line `[curahold] traffic alert` has the same.
- Security → **Analytics** / **Events**: blocks by the two custom rules, the rate limiting rule and the AI policy; any
  challenge or block on `/api/`, `/mcp`, `/oauth/` or a webhook path is a false positive to fix at once.
- Workers logs (`wrangler tail`): 429 and 403 `robot_refused` answers by path.
- Turnstile → the widget's analytics: a solve rate far under 90% means people are being stopped, not robots.
- Search Console / Bing Webmaster: the site and `/docs/` still indexed; `app` and company hosts not.

## Self-host notes

- Start: `docker compose up -d` (Postgres 16 + app); migrations run at every start; the first start creates the company and first admin.
- Update: pull the new code, **back up first**, `docker compose up -d --build`.
- Health: `GET /api/health`. Logs: `docker compose logs -f app`.
- Hourly jobs run in-process (`setInterval`, first tick 60 s after start); if the container restarts often they still run on the next tick.
- HTTPS and rate limiting are the operator's reverse proxy's job (Caddy, nginx, Traefik).
