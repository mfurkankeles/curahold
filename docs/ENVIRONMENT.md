# Environment and configuration reference

Every setting Curahold reads, taken from the code (`api/src/worker.ts` `Env`, `api/src/selfhost.ts`,
`api/src/node.ts`, `scripts/`, `tests/`, `tools/relay`). Nothing in this file is a real secret; values shown are
placeholders. **Never commit real values.** `.env`, `.env.*` and `.dev.vars` are git-ignored.

> A scan of `process.env.*`, the Worker `Env` interface, the self-host entry and the dynamically built CRM keys
> (`<NAME>_CLIENT_ID` / `_SECRET`) finds **about 135 distinct keys** (19 Nov 2026), including the four Worker bindings and the
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
| `SINGLE_TENANT_SLUG` | Pins every request to one company (self-host mode). Also turns on the in-app console pages (`/platform`, `/metrics`), where the operator is the company | No | Unset (multi-tenant): the in-app console pages answer 404 to everyone, and Curahold's team uses the console at `DESK_HOST`. Set by `selfhost.ts`. |
| `DESK_HOST` | Host of Curahold's own support desk | No | `desk.<BASE_DOMAIN>`. |
| `PORTAL_DOMAIN` | Customer portal's own registrable domain | No | Unset: no portal. Must be set on **both** Workers. Self-host: the portal is this address. |
| `DEMO_CRM` | `1` offers the pretend CRM | No | Live demo only. Never set in production. |
| `HYPERDRIVE` (binding) | Hyperdrive config, exposes `connectionString` | Yes (hosted) | Config id in `wrangler.toml` `[[hyperdrive]]`. |
| `FILES` (binding) | R2 bucket for attachments and logos | Yes (hosted) | Bucket `curahold-files`. |
| `ASSETS` (binding) | Static assets (the built web app) | Yes (hosted) | Provided by the `[assets]` block. |
| `LIVE` (binding) | Durable Object class `LiveRoomDO`: the live channel (one room per company, plus the console's `platform` room) | Yes (hosted) | `[[durable_objects.bindings]]` in `wrangler.toml`. Without it the app polls. |
| `SIGNUP_MODE` | What "Try it free" on the central host does: `request` (a trial request the operator approves) or `instant` (the earlier self-serve sign-up) | No | `request` (ADR 0017). |
| `SECURITY_CONTACT` | Address or https link published in `/.well-known/security.txt` | Before go-live | Unset: a clearly marked placeholder is served. |

## 1a. Hosting region (data residency) {#hosting-region}

**The region is a deployment setting, not an environment variable.** Nothing in the code reads a region: it is fixed by
where the stores are created, and one deployment (one `HYPERDRIVE` binding, one `FILES` bucket) serves one region. The
default, and the only region set up today, is the **European Union**.

| Where data rests | What is in it | Region is chosen | EU default (go-live guide steps 11–12) |
| --- | --- | --- | --- |
| Postgres (Supabase project, reached through `HYPERDRIVE`) | Every company's records, the audit trail, consent and agreement records | When the Supabase project is created; cannot be moved, only restored into a new project | **Central EU (Frankfurt)**; the staging project in the same region |
| R2 bucket `curahold-files` (`FILES`) | Attachments, logos | When the bucket is created (location hint or jurisdiction); a new bucket to change it | Location **Europe (EEUR)** [confirm the EU jurisdiction option when creating] |
| R2 bucket `curahold-backups` and the owner's computer | Encrypted weekly database dumps (`scripts/backup/`) | As above | Same as the files bucket |
| Durable Object `LiveRoomDO` (`LIVE`) | Open WebSocket connections only; it stores nothing (no storage calls in `api/src/live/do.ts`) | Cloudflare places it near the first visitor | — |
| Workers (the app, the portal) | Nothing at rest; requests are handled at Cloudflare's edge near the reader | Not chosen | — |

Providers outside this table keep their own regions (mail with Google Workspace, payments with Paddle, the AI model
provider when AI is on); their countries are on the Sub-processors page, generated from
`shared/src/compliance/dataInventory.ts` — which still shows `[EU region]` and `[R2 location]` until the projects exist.

**When the region is set or changed, update in the same change:** the `countries` of `supabase` and `cloudflare` in
`dataInventory.ts` (then `npx tsx scripts/compliance/legal-pack.ts` regenerates the sub-processor pages and the trial
form's `{storage_countries}`), the "Data region" field of the order form, the DPA Annex 4 rider for the customer's
country, and the `[region]` line of the sales site's trust page if it names one.

**Gulf deployments (Saudi Arabia, United Arab Emirates, Qatar).** Today their data is stored in the EU and the trial
form asks for consent to that (UAE PDPL art. 23; Saudi PDPL). If storage inside a country is required — the Saudi draft
amendments of 6 Oct 2026 would add it for some data, not law yet — a separate deployment is needed: a Postgres in the
country or the nearest allowed region [check the provider's current region list], file storage in the same place (R2 has
no location in the Gulf [confirm]; the self-host image with its `files` volume on an in-country cloud is the fallback),
the AI features off or the provider's transfer covered by consent and a transfer assessment, and mail through an
in-region relay if the contract asks (section 6b). Costs and the contracting entity are the owner's decision.

**Asia deployments (Japan, Korea, Singapore, India, Malaysia, Hong Kong, Taiwan).** None of these laws makes us store
this kind of business data in the country; each asks for notice, safeguards or consent for the transfer, which the
trial form and the DPA already give. A customer who wants its data in Asia gets a separate deployment: a Supabase
project in an Asian region [check the list], an R2 bucket with the Asia-Pacific location hint, its own Hyperdrive
config and Workers, and the documents above updated. Mainland China is not offered.

**Self-host** puts every store where the customer runs it (section 7); the region is then the customer's choice and the
customer is the controller of where it is.

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
| `PADDLE_WEBHOOK_SECRET` **(S)** | Verifies Paddle webhook signatures (`/api/inbound/billing/paddle`, also the older `/api/billing/webhook`) | For billing | |
| `PADDLE_CLIENT_TOKEN` | Client-side token for Paddle.js (safe in browsers) | For billing | |
| `PADDLE_PRICES` | JSON `{"team":{"month":"pri_...","year":"pri_..."},"business":{...}}` | For billing | Must contain all four ids or the app throws. |
| `PADDLE_ENV` | `sandbox` or `live` | No | `sandbox`. **Check this before going live.** |

## 3b. The assistant and the AI team (all optional; without a key nothing calls a model)

| Key | Purpose | Required | Default / notes |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` **(S)** | The one model key for the assistant and the AI team | No | Unset: the docs search answers; the AI team's clock does not run. |
| `ASSISTANT_PROVIDER` | `off` switches every model call off without removing the key | No | `anthropic`. |
| `ASSISTANT_GLOBAL_MONTHLY_USD`, `ASSISTANT_COMPANY_MONTHLY_USD`, `ASSISTANT_COMPANY_MAX_USD` | The assistant's monthly caps (api/src/assistant/cost.ts) | No | See the code's defaults. |
| `TEAM_MONTHLY_USD` | The AI team's monthly model cap, every seat together | No | `40`. Reaching it stops every run until the month turns. |
| `TEAM_SCHEDULER` | `off` stops the team's 10-minute clock (cron `*/10 * * * *`, api/src/team/schedule.ts); chats and "Şimdi başlat" keep working | No | `auto`: runs only when a key is set; idle (no wake, no model call) when no cadence is due and nothing is queued. |
| `OPS_ALERTS` | `off` stops the error-rate and latency alerts (lib/ops.ts) | No | On. |
| `OPS_ALERT_EMAIL` | `off` keeps ops alerts in the owner console only (no e-mail to `PLATFORM_OWNER`) | No | On. |
| `TEAM_MODEL_DEEP`, `TEAM_MODEL_STANDARD`, `TEAM_MODEL_LIGHT`, `TEAM_JUDGE_MODEL` | Model per profile | No | api/src/team/config.ts. |

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

## 6a. More connectors (each optional)

| Key | Purpose | Required | Default / notes |
| --- | --- | --- | --- |
| `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET` **(S)** | Atlassian OAuth 2.0 (3LO) app for Jira Cloud | Both | Without them Jira connects with an API token only (`sync/adapters/jira.ts`). |
| `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` **(S)** | Xero (accounting, read only) | Both | |
| `FREEE_CLIENT_ID`, `FREEE_CLIENT_SECRET` **(S)** | freee (accounting, read only) | Both | |
| `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET` **(S)** | QuickBooks Online (accounting, read only) | Both | Zoho Books reuses the Zoho keys. |

## 6b. Product e-mail (`api/src/lib/smtpRelay.ts`, ADR 0018)

| Key | Purpose | Required | Default / notes |
| --- | --- | --- | --- |
| `EMAIL_PROVIDER` | `google_relay`, `resend` or `console` | No | `google_relay` when `SMTP_RELAY_USER` is set, else Resend when its key is set, else the log. |
| `SMTP_RELAY_HOST` | The relay host | No | `smtp-relay.gmail.com`. |
| `SMTP_RELAY_PORT` | Relay port (STARTTLS) | No | `587` (port 25 is blocked on Workers). |
| `SMTP_RELAY_USER` | The sending Workspace user, e.g. `no-reply@<domain>` | For the relay | |
| `SMTP_RELAY_PASSWORD` **(S)** | That user's app password | For the relay | |

## 6c. The assistant and the AI team (`api/src/assistant/cost.ts`, `api/src/team/config.ts`; ADR 0010, 0011)

| Key | Purpose | Required | Default / notes |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` **(S)** | The model key for every model call the server makes (assistant and AI team) | No | Unset: the docs search answers (no cost) and the AI team runs its code-only pre-checks. |
| `ASSISTANT_PROVIDER` | `off` switches the model off for the whole install | No | `anthropic`. |
| `ASSISTANT_MODEL` | Model for the assistant | No | `claude-sonnet-5-5` (`DEFAULT_MODEL`). |
| `ASSISTANT_GLOBAL_MONTHLY_USD` | Cap for the whole install, USD a month | No | `100`. |
| `ASSISTANT_COMPANY_MONTHLY_USD` | Default cap per company, USD a month | No | `5`. |
| `ASSISTANT_COMPANY_MAX_USD` | Highest cap a company may choose | No | `50`. |
| `ASSISTANT_BLOCKED_NAMES` | Other products' names the assistant declines to discuss, comma-separated (kept out of the code) | No | Empty. |
| `ASSISTANT_PUBLIC_CHAT` | `0` closes the public chat on the docs and sales site | No | Open (rate-limited, inside the global cap). |
| `TEAM_MONTHLY_USD` | Cap for all AI-team model spend, USD a month | No | `40`. |
| `TEAM_MODEL_DEEP`, `TEAM_MODEL_STANDARD`, `TEAM_MODEL_LIGHT`, `TEAM_JUDGE_MODEL` | Model per seat profile, and the golden-task judge | No | `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-opus-5-5`. |

## 6d. Robots and public forms (`lib/botGuard.ts`, `lib/humanCheck.ts`; ADR 0015)

| Key | Purpose | Required | Default / notes |
| --- | --- | --- | --- |
| `ROBOT_GUARD` | `strict` (production), `crawlers` (refuse named crawlers only) or `off` | No | `strict` when unset. Local development and tests run `crawlers`. |
| `CRAWLERS_DOCS_AI` | `allow` lets AI answer/search robots read the documentation | No | Blocked. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` **(S)** | Cloudflare Turnstile (free) on the public forms | Both | Without them the honeypot, fill-time check and rate limits stand alone. |
| `TURNSTILE` | `off` switches Turnstile off even with keys | No | On when both keys are set. |
| `TURNSTILE_SEND_IP` | `1` also sends the visitor's IP address to Cloudflare's check | No | Off (data minimisation, L1 audit); the check works without it. |

## 6e. Retention and company deletion (`api/src/lib/retention.ts`, `api/src/lib/companyDeletion.ts`)

Days; a value that is not a whole number, or is under the floor in brackets, falls back to the default. The defaults are the
periods the privacy notice and the records of processing state (docs/compliance/data-inventory.md) — change a text when you change one.

| Key | Purpose | Required | Default / notes |
| --- | --- | --- | --- |
| `RETENTION_TRIAL_REQUEST_DAYS` | Trial requests from the sales site | No | `365` (floor 30). |
| `RETENTION_CONSENT_DAYS` | Consent and withdrawal records, cookie choices; a "yes" still in force is kept as long as it is relied on | No | `1095` (floor 365). |
| `RETENTION_SUPPORT_DAYS` | Help requests, their messages and files, the support desk's log (from the last change) | No | `730` (floor 90). |
| `RETENTION_AUDIT_DAYS` | The activity log (`audit_log`) | No | `365` (floor 90; the database refuses to delete newer rows, migration 0242). |
| `COMPANY_DELETE_GRACE_DAYS` | Days between an administrator's request to delete the company and the purge | No | `30` (floor 7). |

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
| `OUTBOUND_ALLOW_PRIVATE` | `1` turns off the check that refuses outbound calls to private network addresses | No | Off (calls to private addresses refused). |
| `OUTBOUND_ALLOW_HOSTS` | Internal hosts allowed through that check, comma-separated (e.g. an internal identity provider or CRM) | No | Empty. |
| `RESET_SECOND_STEP` | Break-glass: e-mails whose second sign-in step is removed at start (`a@x.com,b@x.com`) | No | Remove it again right after use; the log says so. |

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
| `SITE_ORIGIN`, `SITE_TRIAL_URL`, `SITE_SIGNUP_URL`, `SITE_DOCS_HOME`, `SITE_CONSENT_LOG_URL` | More addresses baked into the sales site and demo hub builds | Derived from `BASE_DOMAIN`. |
| `SITE_GA4_ID`, `SITE_META_PIXEL_ID`, `SITE_TIKTOK_PIXEL_ID` | Analytics / advertising ids for the sales site (loaded only after consent) | Empty. |
| `CURAHOLD_MARKETING_PIXELS` | `1` allows the advertising pixels at all (they stay off by configuration otherwise, ADR 0014) | Off. |
| `SITE_AI_CRAWLERS` | Sales-site `robots.txt`: `allow` lets AI **answer** engines (OAI-SearchBot, Claude-SearchBot, PerplexityBot …) read the marketing pages so they can cite them; AI **training** crawlers stay refused either way. The docs host has its own setting (`CRAWLERS_DOCS_AI`, §above). Owner decision, ADR 0020 | Blocked. |
| `SITE_PRICES` | Sales site (`site/gates.ts`): `show` publishes the price figures — plan cards, the monthly/yearly switch, the comparison table's price row, the home "from …" line, the pricing description and the schema.org `Offer`/`AggregateOffer`. Until then every place says prices are announced at launch, in all 11 languages, and no Offer is emitted. Switch on after the owner's pricing workshop (MASTER-RULES 10) | Hidden. |
| `SITE_EU_DATA` | Sales site (`site/gates.ts`): `confirmed` lets the site say the database is in the European Union (home facts, FAQ, Solutions › Europe, Trust). Set it only once the go-live checklist item `database-hosting` is proven (`shared/src/checklist-golive.ts`); until then those lines are left out | Not said. |
| `SITE_SEO_ROBOTS` | Sales-site `robots.txt`: `allow` lets site-analysis robots in | Blocked. |
| `SITE_LASTMOD` | Sales-site sitemaps: the `<lastmod>` day (YYYY-MM-DD) for every page that is not a blog post | The last git commit touching the site's sources; left out without git. |
| `DOCS_ORIGIN` | Help centre production build: the address the docs are published at, for canonical, hreflang, structured data and `docs/sitemap.xml` (ADR 0020) | `https://app.curahold.com`. |
| `SITE_AI_VERSION`, `SITE_CONCEPT_SLOW` | Sales-site build variants (which AI page version; concept page animation speed) | `a`, `1.6`. |
| `DOCS_PREVIEW`, `DOCS_PREVIEW_PICTURES`, `DOCS_DATA_ONLY` | Small docs builds for previews (ADR 0016) | Off; pictures `en`. |
| `EVAL_ONLY`, `EVAL_LANGS`, `EVAL_OUT`, `EVAL_CONCURRENCY`, `ASSISTANT_JUDGE_MODEL` | `tests/assistant-eval/run.ts`: which cases and languages, results file, parallel calls, judge model | All, all, none, `4`, `claude-opus-5-5`. |
| `LOAD_PEOPLE`, `LOAD_WRITERS`, `LOAD_SECONDS`, `LOAD_PORT`, `LOAD_KEEP` | `scripts/load.ts` (the load test) | `200`, `50`, `120`. |
| `PERF_CROWD`, `PERF_ONLY`, `PERF_WRITES` | `scripts/perf.ts` concurrency and what to time | `50`, all, `40`. |
| `E2E_PORT`, `DEMO_PORT`, `SHOTS_PORT`, `CHROME` | Ports of the browser runs and the help screenshots, and Chrome's path for `scripts/docs/shots.ts` | `8899`, `8931`, `10045`, `/usr/bin/google-chrome`. |
| `SCREENS`, `LIVE_DEBUG`, `SHOW_LEFT` | Narrow or explain quality/e2e runs | Off. |
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
