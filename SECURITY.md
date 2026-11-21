# Security

Curahold holds other companies' customer relationships, contacts and internal notes. We treat a cross-company data
leak as the worst possible bug. This document says how to report a problem, how the isolation model works, and what
the people operating Curahold must do for that model to hold.

## Reporting a vulnerability

- **Please do not open a public issue** for anything that could expose data or let someone act as another person.
- Write to the **Contact** in `/.well-known/security.txt` (served on every address; RFC 9116). The policy for researchers
  is the help-centre page "Reporting a security problem" (`docs/site/*/responsible-disclosure.md`). *(Owner action: set
  `SECURITY_CONTACT` to a monitored `security@` address; until then security.txt shows a marked placeholder,
  `mailto:security-contact-not-set@example.invalid`, and email **support@curahold.com** with the subject `SECURITY`.)*
- Include: what you found, the affected URL or endpoint, steps to reproduce, and what an attacker gains. Use test
  companies only; do not read, change or delete other people's real data.
- What to expect: acknowledgement within 2 working days, an initial assessment within 5, and updates until it is
  fixed. We will credit you if you wish. We do not take legal action against good-faith research that stays within
  the rules above.
- Internal engineers: a suspected cross-company leak is a SEV1. Follow [docs/RUNBOOK.md](docs/RUNBOOK.md#on-call-basics),
  preserve evidence (do not "clean up" rows before looking at `audit_log` and `error_log`), and notify the product owner
  immediately, because customer notification duties under KVKK/GDPR may apply (72 hours for GDPR).

Supported versions: only the current hosted release and the latest self-host release receive security fixes.

## The isolation model in one page

Full detail: [ARCHITECTURE.md, section 4](ARCHITECTURE.md#4-tenant-isolation) and
[ADR 0004](docs/ADR/0004-tenant-isolation-with-rls.md).

1. **The company comes from the host name** (`<slug>.curahold.com`), never from a request field in production.
2. **Every request runs in a database transaction scoped to one company and one person**: `app.org_id` / `app.user_id`
   are set and the role switches to `curahold_app`. **Postgres row-level security** then decides what any query can see
   or change, whatever the SQL says.
3. **The customer portal** is a separate deployment on a separate registrable domain, uses its own people and sessions,
   and reaches the database as `curahold_portal`, which has no table privileges and can only call `portal_*` functions.
4. **`db.system()` is the exception, and the sharp edge.** It runs as `curahold_system`, which reaches **every company's rows**
   through its own policy but owns nothing (no schema, policy or trigger changes; migration 0254, ADR 0023). It is used for
   sign-in lookups before a company is known, inbound webhooks, the hourly scheduler, CRM sync and error recording. Every
   such query must itself filter by `org_id`, taken from a trusted source. Migrations alone run as the owner (`db.owner()`).
5. **Automated gates** (required CI checks): `tests/rls.test.ts` (every company table has RLS and a policy or no privileges,
   definer functions pin `search_path`, static scan of `system()` queries against a baseline that can only shrink),
   `tests/isolation.test.ts`, and `tests/isolation-routes.test.ts` (every id-taking route is called as another company's
   admin and must answer 404 and leave all rows unchanged).
6. **Credentials at rest**: connector tokens and secrets are sealed (AES-256-GCM, HKDF from `SECRETS_KEY`); sign-in and API tokens are stored
   only as SHA-256 hashes, and the answer kept for a repeated request never holds a key, secret, code or secret link
   (only its status; kept a day, `lib/repeats.ts`); passwords (portal) are hashed; sessions are host-only `HttpOnly`, `SameSite=Lax`, `Secure` cookies.
7. **Browser hardening**: strict CSP (scripts only from this site plus Paddle's checkout; one inline theme script by hash),
   HSTS, no framing, no content sniffing, on API answers and static files (kept in step by `tests/security.test.ts`).
8. **Least privilege for non-browser access**: API keys and OAuth app tokens are read-only unless granted write, may be
   limited to areas (`work`, `customers`, `reports`, `people`, `webhooks`, each read or write), and never reach administration, SSO and
   SCIM, billing, keys, connections, a person's own security settings or support access (`session_required`,
   ADR 0024); a route that asks for a fresh sign-in refuses them too. The AI connector (`/mcp`) uses the same tokens. "See it as them" is read-only. Curahold support gets **time-boxed, consented**
   access, **read only** (no edit grants; the database refuses one, migration 0054), with the entry and what is read every
   five minutes written to the company's audit trail.
10. **Identity**: passkeys (WebAuthn) and an authenticator-app second step (TOTP, RFC 6238) with ten one-time recovery
   codes; a company can require a second step of administrators or everyone (checked at every sign-in on the server; SSO
   sign-ins pass); a sign-in or confirmation from the last ten minutes is needed for roles, SSO/SCIM, API keys, personal
   exports and erasure, removing a person and exporting the audit trail. Curahold staff need a second step for the desk
   (emailed code + app) and the platform console. Lock-out paths: recovery codes, an administrator's reset, the rule that
   the setting needs the administrator's own second step, and `RESET_SECOND_STEP` on self-hosted installs.
11. **Audit trail**: append-only in the database (trigger on UPDATE/DELETE/TRUNCATE for every role, no privilege for the
   request role); exportable with a running SHA-256 whose final digest is itself logged.
9. **Privacy by product**: personal-data export and deletion inside the product (KVKK/GDPR), retention jobs (error log 30 days,
   support session recordings 7 days, notifications 90 days, trash 30 days), data in the EU region.
10. **No real customer data outside production**: tests, demos and docs use invented companies and people; `tests/leak.test.ts`
    fails the build if a forbidden name appears anywhere in the repository.

### What this model does NOT give you

- RLS defends against **application bugs**. Every table forces row security and the server's own work runs as a role that owns
  nothing (ADR 0023), but the application's login may still become `curahold_system`, so an attacker who achieves **arbitrary SQL
  execution** on that login (SQL injection, a compromised database credential) can read every company — and, until the operator
  splits the login from the owner (row 2 below), change the schema too. Parameterised queries everywhere are not optional.
- Anything done through `db.system()` is only as safe as its `where org_id = ...`.
- A compromised `AUTH_SECRET` allows forging state tokens, sign-up tickets and file-download links; a compromised `SECRETS_KEY`
  exposes stored CRM and chat credentials. See rotation in the runbook.

## Further controls (Tur 2, 15 November 2026)

- **Threat model and ASVS pass**: [docs/security/threat-model.md](docs/security/threat-model.md) (six surfaces) and
  [docs/security/asvs.md](docs/security/asvs.md) (ASVS 4.0.3 Level 2 + OWASP API Top 10, with the open items and what closing them takes).
- **Authorisation matrix**: `tests/isolation-routes.test.ts` calls every API address as five roles (admin, manager, member,
  read-only seat, a role with no permission). A new address without a classification fails the test.
- **Field permissions on every way out**: list, one record, export pages, search, API keys, the AI connector, webhooks
  (read again as the person who set the webhook up: their boards, departments and fields; nothing once they have left), health reasons, timeline, the weekly email and the
  whitespace table (`tests/field-outs.test.ts`).
- **Versions** on tasks, customers and records: a save naming the version it started from is refused (409, with the
  current value) only when the same field changed meanwhile; different fields merge. Writers that send no version
  (public API, AI connector, automations, imports, CRM sync) write as before and still move the version (migration 0051).
- **AI connector**: acts with the person's rights; changes need a write-enabled connection and each is written to the
  audit trail as `ai.changed` with the tool's name; every read result says that stored text is data, not instructions.
- **Uploads**: picture types are believed only when the first bytes match; everything else is `attachment` with `nosniff`.
  Not yet: a separate files domain.
- **Outbound addresses**: webhooks, chat webhooks, keyed CRMs and SSO token/key addresses refuse local, private and
  IPv6-literal hosts and plain http (SSO: on the shared service; a self-hosted install may use its own network). On a
  self-hosted install every outbound call also resolves the name and checks each address, redirects included
  (`api/src/lib/outbound.ts`; `OUTBOUND_ALLOW_HOSTS` for named internal services). DNS rebinding between check and
  connection remains possible there: an egress firewall is the second line.
- **Curahold's own console**: on the hosted service the in-app `/platform` and `/metrics` answer 404 to everyone, the
  platform owner's own company session with a second step included; only a single-company install (self-hosted, where
  the operator is the company) has them (`inAppConsole`, from `SINGLE_TENANT_SLUG`). The console lives at desk.<domain>
  with a session of its own; its live room (`api/src/live/platform.ts`) admits only a desk session (no staff key), with
  a ticket signed apart from a company's, and carries a fingerprint, never a figure (`tests/platform.test.ts`,
  `tests/live-platform.test.ts`).
- **Logs**: the error table and the platform log mask bearer tokens, keys, secret links, `token=`-style values and email
  addresses (`redact()` in `api/src/lib/errlog.ts`, `tests/redact.test.ts`).

Still open (details in asvs.md): a separate files domain (needs the owner's domain), `'unsafe-inline'` styles in the CSP
(the design package removes them), and the operator's half of role separation (row 2 below).

## Robots, scrapers and bots

The owner's rule: no one may scan the product with an automation and copy its features, and robot traffic must not
raise costs. What is in place (free mechanisms only), and what it cannot do:

- **Crawler policy, one list** (`shared/src/compliance/crawlers.ts`): the sales site lets search engines index the
  marketing pages and blocks AI training/answer crawlers and site-analysis robots; the app host shows `/docs/` to
  search engines only; company hosts, the portal, the demo, the hubs and the API say `Disallow: /`, send
  `X-Robots-Tag: noindex, nofollow` and carry a `noindex, nofollow, noai, noimageai` meta. Owner switches:
  `SITE_AI_CRAWLERS=allow` (site build), `CRAWLERS_DOCS_AI=allow` (Worker) let AI answer robots read pages again.
- **Text-and-data-mining rights reserved** (EU DSM Directive Art. 4(3)): `/.well-known/tdmrep.json`, the
  `tdm-reservation: 1` header and meta, and the terms (section 9) and AUP.
- **Robots refused by name** (`api/src/lib/botGuard.ts`): known AI crawlers and analysis robots get 403 on the app,
  API and portal — never on `/mcp`, `/oauth`, `/.well-known` or a request with its own API key. The key must be a live
  key or app token of that company: a crawler with a made-up bearer, or with one outside the company's own API, is
  refused like any other crawler. In production
  (`ROBOT_GUARD=strict`) scripted HTTP tools and an empty user agent are also refused at the public doors (trial,
  sign-up, public Ask, portal sign-in).
- **Limits** (`api/src/lib/ratelimit.ts`): per address, person and company as before, plus the public Ask door per
  address (`assistDoor`), uploads per person and company, and unknown addresses per address (`probe`: a scanner
  mapping the API waits; "sign in first" answers to a caller with no credential count too, webhook receivers do not). The assistant's money caps are unchanged (`api/src/assistant/cost.ts`).
- **Public forms** (`api/src/lib/humanCheck.ts`): honeypot, fill time, and Cloudflare Turnstile when its keys are set
  (`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`; `TURNSTILE=off`). A robot caught by the honeypot or the clock gets the
  usual answer and nothing is sent; a refused Turnstile token is told plainly. If Cloudflare is unreachable the form is
  let through (logged) so an outage cannot lock people out.
- **Alerts**: bursts of 429s, one address limited again and again, or many refused robots write one alert per rule
  per 15 minutes to the console's alerts (`company_log`, kind `alert`, ref `traffic:*`), with a salted fingerprint
  instead of the address.
- **Edge settings for go-live** (Bot Fight Mode, AI crawler policy, WAF and rate-limiting rules, Turnstile widget):
  [docs/RUNBOOK.md → Go-live: bots and scrapers](docs/RUNBOOK.md#go-live-bots-and-scrapers-cloudflare-free-plan).

**Honest limits.** robots.txt, the TDM reservation and the meta tags are requests that well-behaved robots follow.
A robot that drives a real browser and sends a browser's name is not recognised by name, and Turnstile only guards
forms. What stands then is that the product itself is behind sign-in, every person and company has limits, the
counts raise alerts, and the terms forbid it (which gives a legal remedy, not a technical wall). The marketing pages
and the docs are public by design; anything public can be read by a determined person.

## Known operational requirements

These are things the **operators** must ensure, because they are deployment facts the code cannot enforce. Status is stated
honestly; items marked OPEN are not done today.

| # | Requirement | Why | Status |
| --- | --- | --- | --- |
| 1 | **Request limits** | Flooding, brute force, email bombing. | **Done in the application** (`api/src/lib/ratelimit.ts`): token buckets per network address, per person, per company, with tighter budgets for sign-in steps, invitations, search, exports and the AI connector; 429 with `Retry-After`. On Workers the buckets live per isolate (approximate under a spread-out attack); self-hosted, one process sees all and the limit is exact. Invitations per company per hour are counted in the database (exact everywhere). Optional extra: one free Cloudflare rate rule on `POST /api/auth/*` and `/papi/auth/*`. |
| 2 | **Role separation**: the API's login does not own the tables; `FORCE ROW LEVEL SECURITY` on every table; `system()` work as a role that owns nothing; the owner only migrates | Limits the damage of SQL injection or a leaked DB credential (see above). | **Schema and code: DONE** (migration 0254, ADR 0023; `tests/rls.test.ts` asserts FORCE, the system role and that only `db/migrate.ts` uses the owner). **Operator: OPEN** until the Worker connects as `curahold_login` and only `MIGRATION_DATABASE_URL` holds the owner (`db/ops/role-separation.sql`, RUNBOOK "Database roles"). |
| 3 | `PLATFORM_OWNER` (or `SUPPORT_STAFF`) set in every multi-company install | Owner-only metrics fail closed; the app refuses to start without it. | Enforced at start. |
| 4 | Per-person support keys (`STAFF_KEYS`) in production, shared `STAFF_KEY` disabled in practice | Every support entry must be attributable; one leaver = one key removed. | Supported; operator must configure. |
| 5 | Secrets only as Worker secrets (`wrangler secret put`), never in `[vars]`, git, logs or tickets; `AUTH_SECRET` >= 32 random chars | Basic hygiene; `.env`, `.env.*`, `.dev.vars` are git-ignored. | Operator. |
| 6 | **Set `SECRETS_KEY` explicitly** (distinct from `AUTH_SECRET`) | Otherwise rotating `AUTH_SECRET` makes sealed connector credentials unreadable. | Recommended; there is **no re-seal tool yet** (OPEN, see runbook). |
| 7 | `DEMO_CRM` and any dev switches (`devExposeTokens`, `devOrgHeader`) are **never** enabled in production | They expose sign-in tokens in API answers or accept a company from a header. The Worker entry hard-codes them off; the Node local entry turns them on. Never run `api/src/node.ts` on a publicly reachable host. | Enforced by entry-point design; keep it that way. |
| 8 | `PADDLE_ENV=live` and live keys only in production; webhook secret verified | Wrong environment either charges nobody or charges for test data. | Operator. |
| 9 | Backups: Supabase daily backups confirmed on; weekly encrypted off-site copy; **restore rehearsed** | QUALITY.md targets. | **OPEN**: off-site copy and rehearsal not done. PITR deferred to first paying customer. |
| 10 | Dependency health: `npm audit --omit=dev --audit-level=high` clean | QUALITY.md: zero high/critical. | Done: the CI `audit` job runs it and the CI gate requires it; the weekly scan repeats it ([testing calendar](docs/security/testing-calendar.md)). |
| 11 | Region: Supabase EU, Cloudflare R2 with EU jurisdiction if required by customers' contracts; sub-processor list kept current (README) | KVKK/GDPR commitments and DPA. | Operator; verify R2 location. |
| 12 | Session recordings (support replay) are consented, minimised, and purged after 7 days | Privacy. | Implemented (migration 0030, retention in scheduler); verify the product's consent wording with counsel. |
| 13 | The Salesforce relay (`tools/relay`) runs behind TLS, keeps no logs of content, and its key is rotated like other secrets | It sees OAuth refresh tokens in transit. | Operator (README in `tools/relay`). |
| 14 | Self-host: HTTPS reverse proxy, firewall (only 443 public; `127.0.0.1:8080` for the app), `.env` readable by the service user only, DB not exposed, backups of the DB and `files` volume | The container trusts its network. | Customer / operator. |
| 15 | Branch protection on `main`: require the "CI gate" check, at least one review, no force-push; require signed or reviewed changes to `db/migrations/` and any `db.system()` call | Supply-chain and isolation regressions are caught in review. | **OPEN** until configured in the git host. |

## Dependency and CI security

- CI uses no secrets and has read-only repository permissions. Do not add deploy credentials to CI without a separate review
  of environment protection rules.
- Third-party GitHub Actions are pinned to full commit SHAs (tag in a comment); the production `npm audit` (high/critical) is a
  required CI job.
- Keep `package-lock.json` committed; install with `npm ci`.

## Routine security testing and the trust pack

- [docs/security/testing-calendar.md](docs/security/testing-calendar.md): what is tested weekly, monthly and quarterly,
  against our own code and staging copy only, with `npx tsx scripts/security/scan.ts weekly|monthly|quarterly`.
- [docs/security/README.md](docs/security/README.md): the trust pack — standard questionnaire answers, the SOC 2 /
  ISO 27001 gap list, the policy drafts, the threat model and the ASVS sheet. Hosting region: docs/ENVIRONMENT.md
  ("Hosting region").
