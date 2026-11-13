# Security

Curahold holds other companies' customer relationships, contacts and internal notes. We treat a cross-company data
leak as the worst possible bug. This document says how to report a problem, how the isolation model works, and what
the people operating Curahold must do for that model to hold.

## Reporting a vulnerability

- **Please do not open a public issue** for anything that could expose data or let someone act as another person.
- Email **support@curahold.com** with the subject line `SECURITY`. *(Maintainer action: create a dedicated
  `security@` alias, point it at the on-call engineer, and publish it at `/.well-known/security.txt`; until then the
  support address is the only monitored channel.)*
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
4. **`db.system()` is the exception, and the sharp edge.** It runs as the connecting (owner) database user and **bypasses RLS**.
   It is used for migrations, sign-in lookups before a company is known, inbound webhooks, the hourly scheduler, CRM sync
   and error recording. Every such query must itself filter by `org_id`, taken from a trusted source.
5. **Automated gates** (required CI checks): `tests/rls.test.ts` (every company table has RLS and a policy or no privileges,
   definer functions pin `search_path`, static scan of `system()` queries against a baseline that can only shrink),
   `tests/isolation.test.ts`, and `tests/isolation-routes.test.ts` (every id-taking route is called as another company's
   admin and must answer 404 and leave all rows unchanged).
6. **Credentials at rest**: connector tokens and secrets are sealed (AES-256-GCM, HKDF from `SECRETS_KEY`); sign-in and API tokens are stored
   only as SHA-256 hashes; passwords (portal) are hashed; sessions are host-only `HttpOnly`, `SameSite=Lax`, `Secure` cookies.
7. **Browser hardening**: strict CSP (scripts only from this site plus Paddle's checkout; one inline theme script by hash),
   HSTS, no framing, no content sniffing, on API answers and static files (kept in step by `tests/security.test.ts`).
8. **Least privilege for non-browser access**: API keys and OAuth app tokens are read-only unless granted write; the
   AI connector (`/mcp`) uses the same tokens. "See it as them" is read-only. Curahold support gets **time-boxed, consented**
   access (view or edit), logged in the company's audit trail.
9. **Privacy by product**: personal-data export and deletion inside the product (KVKK/GDPR), retention jobs (error log 30 days,
   support session recordings 7 days, notifications 90 days, trash 30 days), data in the EU region.
10. **No real customer data outside production**: tests, demos and docs use invented companies and people; `tests/leak.test.ts`
    fails the build if a forbidden name appears anywhere in the repository.

### What this model does NOT give you

- RLS defends against **application bugs**. Because the API connects as the user that owns the tables (so it can `set role` and
  run `system()` work) and no table uses `FORCE ROW LEVEL SECURITY`, an attacker who achieves **arbitrary SQL execution** as that login (SQL
  injection, a compromised database credential) can `reset role` and read every company. Parameterised queries everywhere are not
  optional, and the hardening in the next section reduces the blast radius.
- Anything done through `db.system()` is only as safe as its `where org_id = ...`.
- A compromised `AUTH_SECRET` allows forging state tokens, sign-up tickets and file-download links; a compromised `SECRETS_KEY`
  exposes stored CRM and chat credentials. See rotation in the runbook.

## Known operational requirements

These are things the **operators** must ensure, because they are deployment facts the code cannot enforce. Status is stated
honestly; items marked OPEN are not done today.

| # | Requirement | Why | Status |
| --- | --- | --- | --- |
| 1 | **Rate limiting at the edge** (Cloudflare rate rules) for `POST /api/*` sign-in, magic-link, sign-up, help and webhook endpoints, and the portal's `/papi/*` | The application deliberately does not rate-limit (see `api/src/lib/headers.ts`). Without edge rules, sign-in link and sign-up endpoints can be abused for email bombing and brute force. | **OPEN**: no rules are defined in this repository. Define and document them (the code comments point to `db/OPS-SECURITY.md`, which does not exist; this file replaces it). |
| 2 | **Role separation**: a separate login role for the API that does not own the tables, with `FORCE ROW LEVEL SECURITY` for the request roles, plus a distinct, tightly guarded owner/migration role used only by `system()` work | Limits the damage of SQL injection or a leaked DB credential (see above). The current model uses one owner login; README "Database roles" describes the minimum. | **OPEN** (deployment, not schema). Design needed because `system()` paths currently share the connection. |
| 3 | `PLATFORM_OWNER` (or `SUPPORT_STAFF`) set in every multi-company install | Owner-only metrics fail closed; the app refuses to start without it. | Enforced at start. |
| 4 | Per-person support keys (`STAFF_KEYS`) in production, shared `STAFF_KEY` disabled in practice | Every support entry must be attributable; one leaver = one key removed. | Supported; operator must configure. |
| 5 | Secrets only as Worker secrets (`wrangler secret put`), never in `[vars]`, git, logs or tickets; `AUTH_SECRET` >= 32 random chars | Basic hygiene; `.env`, `.env.*`, `.dev.vars` are git-ignored. | Operator. |
| 6 | **Set `SECRETS_KEY` explicitly** (distinct from `AUTH_SECRET`) | Otherwise rotating `AUTH_SECRET` makes sealed connector credentials unreadable. | Recommended; there is **no re-seal tool yet** (OPEN, see runbook). |
| 7 | `DEMO_CRM` and any dev switches (`devExposeTokens`, `devOrgHeader`) are **never** enabled in production | They expose sign-in tokens in API answers or accept a company from a header. The Worker entry hard-codes them off; the Node local entry turns them on. Never run `api/src/node.ts` on a publicly reachable host. | Enforced by entry-point design; keep it that way. |
| 8 | `PADDLE_ENV=live` and live keys only in production; webhook secret verified | Wrong environment either charges nobody or charges for test data. | Operator. |
| 9 | Backups: Supabase daily backups confirmed on; weekly encrypted off-site copy; **restore rehearsed** | QUALITY.md targets. | **OPEN**: off-site copy and rehearsal not done. PITR deferred to first paying customer. |
| 10 | Dependency health: `npm audit --omit=dev --audit-level=high` clean | QUALITY.md: zero high/critical. | CI runs it as informational; make it blocking once clean. |
| 11 | Region: Supabase EU, Cloudflare R2 with EU jurisdiction if required by customers' contracts; sub-processor list kept current (README) | KVKK/GDPR commitments and DPA. | Operator; verify R2 location. |
| 12 | Session recordings (support replay) are consented, minimised, and purged after 7 days | Privacy. | Implemented (migration 0030, retention in scheduler); verify the product's consent wording with counsel. |
| 13 | The Salesforce relay (`tools/relay`) runs behind TLS, keeps no logs of content, and its key is rotated like other secrets | It sees OAuth refresh tokens in transit. | Operator (README in `tools/relay`). |
| 14 | Self-host: HTTPS reverse proxy, firewall (only 443 public; `127.0.0.1:8080` for the app), `.env` readable by the service user only, DB not exposed, backups of the DB and `files` volume | The container trusts its network. | Customer / operator. |
| 15 | Branch protection on `main`: require the "CI gate" check, at least one review, no force-push; require signed or reviewed changes to `db/migrations/` and any `db.system()` call | Supply-chain and isolation regressions are caught in review. | **OPEN** until configured in the git host. |

## Dependency and CI security

- CI uses no secrets and has read-only repository permissions. Do not add deploy credentials to CI without a separate review
  of environment protection rules.
- Third-party GitHub Actions are pinned to major versions; consider pinning to commit SHAs.
- Keep `package-lock.json` committed; install with `npm ci`.
