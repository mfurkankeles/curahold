# Environment and configuration reference

Every setting Curahold reads, taken from the code (`api/src/worker.ts` `Env`, `api/src/selfhost.ts`,
`api/src/node.ts`, `scripts/`, `tests/`, `tools/relay`). Nothing in this file is a real secret; values shown are
placeholders. **Never commit real values.** `.env`, `.env.*` and `.dev.vars` are git-ignored.

> A scan of `process.env.*`, the Worker `Env` interface, the self-host entry and the dynamically built CRM keys
> (`<NAME>_CLIENT_ID` / `_SECRET`) finds **about 89 distinct keys**, including the three Worker bindings and the
> developer-tooling switches in section 8. Keys marked **(S)** are secrets: store them with `wrangler secret put NAME`
> (hosted) or in `.env` / your secret manager (self-host), and rotate per [docs/RUNBOOK.md](RUNBOOK.md#rotating-secrets).

## How settings reach the app

| Shape | Source of settings | Entry |
| --- | --- | --- |
| Hosted (Cloudflare) | `[vars]` in `wrangler.toml` / `wrangler.portal.toml` (non-secret) + `wrangler secret put` (secret) + bindings (`HYPERDRIVE`, `FILES`, `ASSETS`) | `configFromEnv(env)` in `api/src/worker.ts` |
| Self-host | `.env` read by Docker Compose (`selfhost.env.example`) | `selfHostConfig(env)` in `api/src/selfhost.ts`, which calls the same `configFromEnv` with `BASE_DOMAIN` / `CENTRAL_HOST` derived from `PUBLIC_URL` and `SINGLE_TENANT_SLUG` pinned |
| Local development | hard-coded in `api/src/node.ts` (`startLocal`), a few env switches | `npm run dev` |
| Tests | `tests/helpers.ts` `testConfig()` | `npx vitest run` |

"Required" below means *the service refuses to start or the feature is unusable without it*. "Optional" features are
simply not offered when their keys are missing ("a service without its secrets is simply not offered; webhooks always work").

## 1. Core (hosted)

| Key | Purpose | Required | Default / notes |
| --- | --- | --- | --- |
| `BASE_DOMAIN` | Registrable domain; companies live at `<slug>.BASE_DOMAIN` | Yes (hosted) | `curahold.com` in `wrangler.toml`. Self-host: derived from `PUBLIC_URL`. |
| `CENTRAL_HOST` | Host that receives OAuth callbacks and sign-up (`app.<domain>`) | Yes (hosted) | `app.curahold.com`. Self-host: same as the `PUBLIC_URL` host. |
| `AUTH_SECRET` **(S)** | Signs session and sign-in tokens; fallback key for sealing connector credentials | Yes | Min 32 chars or the app throws at start. `openssl rand -base64 48`. |
| `SECRETS_KEY` **(S)** | Key (derived, AES-256-GCM) that seals connector credentials in `connections` | Recommended | Falls back to `AUTH_SECRET`. Changing it makes stored credentials unreadable until re-connected; see RUNBOOK. |
| `RESEND_API_KEY` **(S)** | Sends email via Resend | Yes (hosted) | Self-host uses SMTP instead. |
| `EMAIL_FROM` | From address, e.g. `Curahold <no-reply@example.com>` | Yes (hosted) | Self-host default `Curahold <curahold@<PUBLIC_URL host>>`. |
| `MAX_DEVICES` | Devices one seat may use at once | No | `2`. |
| `SIGNUP_ENABLED` | `0` turns company sign-up off | No | On, except when `SINGLE_TENANT_SLUG` is set. |
| `SINGLE_TENANT_SLUG` | Pins every request to one company (self-host mode) | No | Unset (multi-tenant). Set by `selfhost.ts`. |
| `DESK_HOST` | Host of Curahold's own support desk | No | `desk.<BASE_DOMAIN>`. |
| `PORTAL_DOMAIN` | Customer portal's own registrable domain | No | Unset: no portal. Must be set on **both** Workers. Self-host: the portal is this address. |
| `DEMO_CRM` | `1` offers the pretend CRM | No | Live demo only. Never set in production. |
| `HYPERDRIVE` (binding) | Hyperdrive config, exposes `connectionString` | Yes (hosted) | Config id in `wrangler.toml` `[[hyperdrive]]`. |
| `FILES` (binding) | R2 bucket for attachments and logos | Yes (hosted) | Bucket `curahold-files`. |
| `ASSETS` (binding) | Static assets (the built web app) | Yes (hosted) | Provided by the `[assets]` block. |

## 2. Platform owner and support desk (hosted)

| Key | Purpose | Required | Default / notes |
| --- | --- | --- | --- |
| `PLATFORM_OWNER` | Email of the one person allowed to see whole-business metrics | **Yes in a multi-company install** | Defaults to the first `SUPPORT_STAFF` address. If neither is set the app **refuses to start** (`assertOwnerConfigured`). |
| `SUPPORT_STAFF` | Comma-separated addresses allowed into the support desk; also "Curahold's own people" for mail | Yes for support | Empty. |
| `SUPPORT_EMAIL` | Where help requests are sent | Recommended | `support@curahold.com` in `wrangler.toml`. |
| `SUPPORT_WEBHOOK_URL` | Signed webhook that also receives help requests | No | Unset. |
| `SUPPORT_REPLY_DOMAIN` | Domain whose inbound mail is routed to the Worker (`reply+<token>@...`) so answers by email work | No | Unset: answers are written in the product only. |
| `SUPPORT_MAIL_KEY` **(S)** | What a mail server's webhook must present to `POST /api/desk/mail` | If self-hosted mail handoff is used | Unset. |
| `STAFF_KEYS` **(S)** | Per-person support keys: `ada@example.com:<key>,bob@example.com:<key>` (each key 24+ chars) so every support entry is attributable and one person leaving revokes one key | Recommended in production | Unset. In production the shared `STAFF_KEY` opens nothing once person keys exist (`tests/security.test.ts`). |
| `STAFF_KEY` **(S)** | Support tooling's entry-link key into a company that granted access | No | Ignored unless 24+ chars. |

## 3. Billing (Paddle; all four of the first set, or billing stays off)

| Key | Purpose | Required | Default / notes |
| --- | --- | --- | --- |
| `PADDLE_API_KEY` **(S)** | Server-side API key | For billing | Unset: billing off, everything open. |
| `PADDLE_WEBHOOK_SECRET` **(S)** | Verifies `/api/billing/webhook` signatures | For billing | |
| `PADDLE_CLIENT_TOKEN` | Client-side token for Paddle.js (safe in browsers) | For billing | |
| `PADDLE_PRICES` | JSON `{"team":{"month":"pri_...","year":"pri_..."},"business":{...}}` | For billing | Must contain all four ids or the app throws. |
| `PADDLE_ENV` | `sandbox` or `live` | No | `sandbox`. **Check this before going live.** |

## 4. Sign-in providers (each optional)

| Key | Purpose | Required | Default / notes |
| --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` **(S)** | "Sign in with Google"; also Google Sheets connector | Both or neither | Provider hidden when unset. |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` **(S)** | "Sign in with Microsoft"; Excel connector; fallback for Dynamics | Both or neither | |

## 5. Chat apps (each optional; all keys of a group, or the app is not offered)

| Key | Purpose | Required | Default / notes |
| --- | --- | --- | --- |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` **(S)**, `SLACK_SIGNING_SECRET` **(S)** | Slack app (OAuth + request signature check) | All three | |
| `TEAMS_BOT_APP_ID`, `TEAMS_BOT_APP_PASSWORD` **(S)**, `TEAMS_BOT_TENANT_ID` | Microsoft Teams bot (single-tenant Azure Bot registration) | All three | |
| `GCHAT_PROJECT_NUMBER`, `GCHAT_SA_EMAIL`, `GCHAT_SA_KEY` **(S)** | Google Chat app: project number (token audience) and service account | All three | `GCHAT_SA_KEY` may contain `\n` escapes; they are expanded. |

## 6. CRMs and spreadsheets (each optional)

| Key | Purpose | Required | Default / notes |
| --- | --- | --- | --- |
| `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET` **(S)** | Salesforce external client app (PKCE) | Both | |
| `SALESFORCE_RELAY_URL` | https address of the fixed-IP relay for Salesforce token requests | No | Must start with `https://`; else direct. |
| `SALESFORCE_RELAY_KEY` **(S)** | Shared key the relay expects (24+ chars) | With the relay URL | Relay itself reads `RELAY_KEY`. |
| `SALESFORCE_INSTALL_URL` | Install link of the Salesforce package, shown before first sign-in | No | Must match the `login.salesforce.com/packaging/installPackage.apexp?p0=04t...` shape or it is ignored. |
| `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET` **(S)** | HubSpot public app | Both | |
| `DYNAMICS_CLIENT_ID`, `DYNAMICS_CLIENT_SECRET` **(S)** | Microsoft Dynamics 365 app | Both | README says the Microsoft sign-in app can be reused. |
| `PIPEDRIVE_CLIENT_ID`, `PIPEDRIVE_CLIENT_SECRET` **(S)** | Pipedrive marketplace app | Both | |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` **(S)** | Zoho CRM client | Both | |

Google Sheets and Excel reuse the Google and Microsoft sign-in keys.

## 7. Self-host only (`api/src/selfhost.ts`, `docker-compose.yml`, `selfhost.env.example`)

All hosted settings above that make sense (support, connectors, `PORTAL_DOMAIN`, `AUTH_SECRET`, ...) also apply.

| Key | Purpose | Required | Default / notes |
| --- | --- | --- | --- |
| `PUBLIC_URL` | The address people open, exactly as in the browser (HTTPS in front) | **Yes** | App throws without it. Sets base domain, scheme and port. |
| `DATABASE_URL` | Postgres connection string (16+; user must be able to create roles on first start) | **Yes** | Compose builds it from `DB_PASSWORD`. Also used by `npm run migrate`. |
| `DB_PASSWORD` | Postgres password for `docker-compose.yml` | Yes (Compose) | Letters and digits only. |
| `ADMIN_EMAIL` | First administrator (first start only) | **Yes on first start** | Signs in with an emailed link. |
| `ADMIN_NAME` | Display name of the first administrator | No | Local part of `ADMIN_EMAIL`. |
| `COMPANY_NAME` | Company name (first start only) | No | `Our company`. |
| `COMPANY_SLUG` | Internal company slug | No | `company`. |
| `LOCALE` | `en` or `tr` for the new company | No | `en`. |
| `TIMEZONE` | IANA time zone for the new company | No | `UTC` (the example file uses `Europe/Istanbul`). |
| `CURRENCY` | ISO currency for the new company | No | `USD`. |
| `SMTP_URL` **(S)** | `smtp://user:pass@host:587` for sign-in links, reminders, summaries | Recommended | Unset: mail is written to the app log (fine only for the very first sign-in). |
| `EMAIL_FROM` | From address | No | `Curahold <curahold@<host>>`. |
| `FILES_DIR` | Where attachments are stored | No | `/data/files` in the image; `./data/files` otherwise. Back it up. |
| `APP_ROOT` | Root folder with `dist/` and `db/migrations/` | No | `/app` in the image, else the working directory. |
| `DB_POOL` | Max Postgres connections | No | `10`. |
| `PORT` | HTTP port | No | `8080` (self-host), `8787` (local API). |
| `NODE_ENV` | Set to `production` in the image | No | |

## 8. Local development and tooling

| Key | Purpose | Default / notes |
| --- | --- | --- |
| `SERVE_STATIC` | `1` makes `api/src/node.ts` also serve `dist/web` (`npm run start:local`) | Off. |
| `DEMO_LOCALE` | `tr` seeds the demo company in Turkish | `en`. |
| `TEST_DATABASE_URL` | Run the tests on a real Postgres (a fresh database per test file; user must be able to create databases). **Empty/unset = in-memory PGlite.** | Unset. CI sets it for the Postgres jobs. |
| `APP_TEST_TEMPLATE` | Set by `tests/global-setup.ts` to the migrated template database. Internal; do not set by hand. | |
| `CHROME_PATH` | Chrome binary for e2e and quality scripts | Common Linux/macOS paths are tried. |
| `ONLY` | Regex: run only matching e2e scenarios | All. |
| `QUICK` | Shortens the browser quality script | Off. |
| `W`, `H` | Viewport width/height for browser quality script screenshots | `1440`, `900`. |
| `PERF_DATABASE_URL` | Throwaway Postgres for `scripts/perf.ts` | Required for that script. **Never point at real data.** |
| `PERF_SCALE`, `PERF_SLOW_MS`, `PERF_KEEP` | Size of the generated company, slow-request threshold, keep the database | Script defaults (slow = 400 ms). |
| `SITE_URL`, `SITE_APP_URL`, `SITE_DOCS_URL`, `SITE_DEMO_URL`, `SITE_BASE_DOMAIN` | Addresses baked into the marketing site build (`npm run build:site`) | `https://curahold.com`, `https://app.curahold.com`, `<app>/docs`, `/demo/`, `curahold.com`. |
| `DOCS_APP_HREF`, `DOCS_RELATIVE` | Link target of the help pages and whether links are relative (used by the demo build) | `../index.html`, off. |
| `RELAY_KEY` **(S)**, `PORT` | `tools/relay/relay.mjs`: the shared key (24+ chars) and listen port | Port `8787`. |
| `APP_DEMO` (Vite define) | Build-time flag set by `vite.demo.config.ts` for the in-browser demo | Not an environment variable you set. |

## 9. Keys that could not be classified with certainty

| Key | Why |
| --- | --- |
| `NODE_ENV` | Only the Dockerfile sets it; the application code does not read it. Listed for completeness. |
| `PORT` for the relay vs the app | Same name, three programs (self-host `8080`, local API `8787`, relay `8787`). |
| `QUICK`, `W`, `H` | Read only by developer scripts under `scripts/quality`; purpose inferred from usage, not documented in code. |
| `PERF_KEEP`, `PERF_SCALE`, `PERF_SLOW_MS` | Meaning read from `scripts/perf.ts` and README; exact accepted values not documented. |

## Adding a new setting

1. Add it to the `Env` interface and `configFromEnv` in `api/src/worker.ts` (the self-host path reuses it).
2. Treat empty string as unset (`env.X || undefined`); validate shape and **fail at start** for a mis-set required key.
3. Secrets: never log them, never put them in `[vars]`, document `wrangler secret put NAME`.
4. Add a row here, and to `selfhost.env.example` if self-hosters need it.
