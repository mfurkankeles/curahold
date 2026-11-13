# Runbook

Operational procedures for the hosted service (Cloudflare Workers + Supabase EU + R2) and, where it differs, for a
self-hosted install. Written for the engineer on call. Values like `<project-ref>` are placeholders.

**Honesty box.** Items marked **[not yet in place]** are targets from QUALITY.md that are not implemented or have not
been rehearsed. Do not assume they protect you; see [SECURITY.md](../SECURITY.md#known-operational-requirements).

Contents: [Ground rules](#ground-rules) · [Deploy](#deploy) · [Rollback](#rollback) · [Migrations](#migrations) ·
[Rotating secrets](#rotating-secrets) · [Backups and restore](#backups-and-restore) · [On-call basics](#on-call-basics) ·
[Common incidents](#common-incidents) · [Self-host notes](#self-host-notes)

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
DATABASE_URL='<owner connection string>' npm run migrate

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
reply domain, Paddle notification destination (`https://app.<domain>/api/billing/webhook`, `subscription.*` events),
Supabase project settings. They are one-time setup; see README "Deploying".

First-time setup order (new environment): Supabase EU project -> `npm run migrate` -> minimal login role (README "Database
roles") -> Hyperdrive config (put its id in `wrangler.toml`) -> R2 bucket `curahold-files` -> secrets (`wrangler secret put`,
list in `docs/ENVIRONMENT.md`) -> DNS -> `npm run build && npx wrangler deploy`.

## Rollback

- **Code:** Cloudflare keeps previous Worker versions. `npx wrangler rollback` (or the dashboard: Workers > curahold >
  Deployments > Rollback) restores the previous bundle in seconds. Roll back the portal Worker separately.
- **Database:** migrations are **forward-only**. Rolling back code across a migration is safe only if the migration was
  additive (new nullable column, new table, new index). Therefore: ship destructive changes (drop/rename/type change) in two
  releases: first stop using the thing, deploy; then drop it in a later migration.
- If a bad migration already ran: restore from backup is the last resort (see below); first try a **new** corrective migration.

## Migrations

- Files `db/migrations/NNNN_name.sql`, applied in name order, once each, recorded in `schema_migrations`.
  `api/src/db/migrate.ts` runs each file's statements in one transaction.
- **Never edit an applied migration.** Add a new number. Both hosted (`npm run migrate`) and self-host (on start) use the same files.
- Every new company table: `org_id`, `enable row level security`, a policy on `app_org()`, grants for `curahold_app`.
  `tests/rls.test.ts` fails the build otherwise.
- Big tables: use `create index concurrently` outside a transaction only if you split the file; otherwise expect a brief lock.
  Check on a copy of production size with `scripts/perf.ts` (`PERF_DATABASE_URL`) before indexing the large tables.
- The migrating user needs to be able to create roles on the first run (`curahold_app`, `curahold_portal`).

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

**Targets from QUALITY.md that are not in place yet [not yet in place]**

- A weekly **encrypted off-site copy** of the database.
- A written, **rehearsed** restore, repeated at least quarterly. This section is the written part; the rehearsal is still to do.
- **Point-in-time recovery**: decided to switch on with the first paying customer (about $105 per month fixed). Until then the
  recovery point is the last daily backup (up to 24 hours of data loss in the worst case).

**Restore procedure (draft; rehearse it on a scratch project before you need it)**

1. Declare an incident; stop writes if corruption is ongoing (put a maintenance route in front, or `wrangler rollback` is not enough
   to stop writes: use a Cloudflare WAF/maintenance rule on `/api/*`).
2. In Supabase: Database > Backups > pick the backup (or PITR time) > **restore to a new project** (never over the live one first).
3. In the restored project check: `select count(*) from orgs;`, latest `audit_log.at`, latest `tasks.updated_at`,
   `select name from schema_migrations order by name desc limit 3;`. Re-run `npm run migrate` against it if the backup predates a migration.
4. Run `curahold_app` / `curahold_portal` role checks: `select rolname from pg_roles where rolname like 'curahold_%';` (both exist) and that
   your login role is a member of both.
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
| Live errors | `npx wrangler tail curahold` (and `--config wrangler.portal.toml`); log prefix `[curahold]`. |
| Recorded errors | `error_log` table: unhandled server errors and browser errors (source, company, user, path, message, stack; no bodies or secrets; kept 30 days). Admins see their own company's at `GET /api/admin/errors`; company-less errors stay with Curahold. |
| Background jobs | Worker cron `0 * * * *` (Cloudflare dashboard > Workers > Triggers > Cron events). `[curahold] ... failed` lines name the job. CRM sync status: `sync_runs` (per connection; also visible in the product). |
| Billing | `billing_events` table and Paddle's notification log. |
| Abuse | Cloudflare analytics / WAF events (rate rules live here, **not** in the app). |

**First 15 minutes of an incident**

1. Acknowledge, open an incident note (time, symptom, who).
2. Scope: all companies or one? hosted app, portal, a connector? Check `/api/health`, Cloudflare status, Supabase status.
3. Last deploy within the hour? If yes and symptoms match, `wrangler rollback` first, investigate second.
4. If a single company: look at its `sync_runs`, `webhook_events`, `notifications` backlog (rows stuck unsent), and `error_log` by `org_id`.
5. Communicate: status message to affected admins (email), no promises about causes until known.
6. After: post-mortem within 3 working days, added to a `docs/postmortems/` folder (invented names only), with action items.

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

## Self-host notes

- Start: `docker compose up -d` (Postgres 16 + app); migrations run at every start; the first start creates the company and first admin.
- Update: pull the new code, **back up first**, `docker compose up -d --build`.
- Health: `GET /api/health`. Logs: `docker compose logs -f app`.
- Hourly jobs run in-process (`setInterval`, first tick 60 s after start); if the container restarts often they still run on the next tick.
- HTTPS and rate limiting are the operator's reverse proxy's job (Caddy, nginx, Traefik).
