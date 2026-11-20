# Security testing calendar

How often Curahold tests its own security, against what, with which command, and what happens to a finding. The
Senior Security Engineer seat of the AI team (`shared/src/team/orgChart.ts`, seat `security-engineer`) runs this
calendar and proposes the fixes; a person approves every action outside the repository (`api/src/team/gate.ts`). Until
the Offensive Security seat wakes (at launch on the company domain), the monthly red-team exercise is that seat's too.

## The one rule: our own code and our own staging copy only

- **Allowed targets:** this repository, a local server started with `npm run dev`, and the staging copy at
  `curahold-staging.com` (its own Supabase project and Worker, go-live guide step 18). Nothing else.
- **Never:** production (`curahold.com`, `app.curahold.com`, `curahold-portal.com`), a customer's workspace, a
  sub-processor's systems, a connected tool's API, or anyone else's system — not even "just a port scan". Load tests run
  on staging only (go-live guide step 20).
- `scripts/security/staging-probe.ts` enforces this in code: it refuses every host but `localhost`/`127.0.0.1` and
  `*.curahold-staging.com` over HTTPS, and there is deliberately no switch to widen the list (`tests/security-scan.test.ts`).
- No social engineering, no phishing tests of people, no denial-of-service against anything shared.
- Until staging exists (before go-live step 18), the monthly probe runs against a local server.

## The cadence

| When | What | How | Who |
| --- | --- | --- | --- |
| **Every change** (CI, already running) | Typecheck, lint, the whole test suite on PGlite and Postgres 16, the tenant-isolation suites on both, the leak scan, i18n, builds, the Docker image, and `npm audit --omit=dev --audit-level=high`; the CI gate fails if any of them fails | `.github/workflows/ci.yml` (`gate` job) | CI; the reviewing seat reads the result |
| **Every branch** | AppSec review of every agent-written branch and new dependency (data access, `db.system()` use, permissions, outbox, secrets) | Review verdict on the branch | Senior Security Engineer seat |
| **Weekly** | Production dependency audit; lockfile sources (every package from the npm registry over HTTPS); secrets committed to the tree; the guard suites (isolation, RLS, leak, security, security probes, MCP security, the AI-team red team) | `npx tsx scripts/security/scan.ts weekly` | Senior Security Engineer seat; result in the weekly scan review |
| **Monthly** | Weekly + known-vulnerable front-end libraries in the built app (`dist/`); the staging probe: security headers, HSTS, `security.txt`, signed-out API refused, no stack traces in errors, no CORS echo of a foreign origin; a red-team exercise on staging (OWASP Top 10, API Top 10, LLM Top 10 for the assistant and the AI team, tenant isolation, the approval gate) | `npm run build`, then `STAGING_URL=https://app.curahold-staging.com npx tsx scripts/security/scan.ts monthly`; the exercise by hand | Senior Security Engineer seat (Offensive Security seat once awake); the monthly security score |
| **Quarterly** | Monthly + the restore drill (back up, wipe, restore, verify row counts and row-level security); the threat model and the ASVS sheet re-walked; an access review of every operator account and its second step; the sub-processor list compared with the real accounts; once a quarter a restore drill against a copy of production through Supabase "restore to a new project" | `DRILL_PG=<throwaway Postgres> npx tsx scripts/security/scan.ts quarterly` prints the manual checklist at the end | Senior Security Engineer seat proposes; the owner does the account review and the production-copy drill |

The outside scanners (`lockfile-lint`, `secretlint` with its recommended rules, `retire`) run through `npx --yes
<package>@<major>`: fetched into npx's cache for the run, never added to `package.json`, free, and they read local files
only. The secret scan's allow-list (`scripts/security/secretlintrc.json`) names the exact placeholder strings it may
skip (the local Postgres default, the example SMTP URLs, test tokens, PEM templates that are filled at run time); a new
finding is never silenced by ignoring a whole file.

## Findings

- Every finding gets a severity (CVSS 3.1), evidence and a fix proposal. Targets from the seat's card: **critical fixed
  within 72 hours, high within 7 days**; medium in the next release; low on the backlog with a date.
- Findings with exploit detail are kept out of this repository until fixed (a private task in the owner's console or a
  private issue); the fix commit says what class of problem it closes, not how to exploit it.
- A fixed finding is re-tested by the next run of the same step; a finding that touched tenant isolation gets a new case
  in the isolation suites so it cannot come back unnoticed.
- A personal-data breach found this way follows the breach runbook (`docs/compliance/breach-runbook.md`): 48 hours to
  tell affected customers (DPA §7).
- Reports from outside come in through the responsible-disclosure page and `security.txt` (SECURITY.md) and are triaged
  the same way.

## Records

Each run's output (PASS / FAIL / SKIP lines and timings) goes into that week's or month's security review. The quarterly
run's manual checklist is ticked off there too. The calendar itself is reviewed once a year, and whenever a new kind of
surface ships (a new connector family, a new public form, a new AI capability).
