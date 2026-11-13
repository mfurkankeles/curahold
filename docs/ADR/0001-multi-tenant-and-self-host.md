# 0001. One codebase: multi-tenant SaaS and single-company self-host

- Status: Accepted
- Date: 2026-11-12
- Deciders: product owner

## Context

Curahold is an independent B2B product for customer-success and account teams in any industry; it belongs to no
single customer. Two kinds of buyer exist. Most want a hosted service where every company lives at its own address
(`<company>.curahold.com`). Some, for compliance or procurement reasons, want the product inside their own walls:
one company, their own Postgres, their own mail server, no subscription.

A small team cannot maintain two products.

## Decision

We ship **one codebase with two deployment shapes**:

- **Multi-tenant hosted**: many companies in one database, separated by `org_id` and row-level security (see 0004).
  The company is resolved from the host name.
- **Single-company self-host**: the same Hono app started by `api/src/selfhost.ts` with `SINGLE_TENANT_SLUG` pinned,
  sign-up and billing switched off ("everything open"), attachments on disk, mail through SMTP, packaged by
  `Dockerfile` and `docker-compose.yml` (Postgres 16). Migrations run on every start; the first start creates the
  company and its first administrator.

Everything company-specific is **configuration, not code**: terminology, fields, record types, stages, roles,
automations, health-score rules, languages, currency, time zone, working days and branding. No company's terms or data
are defaults. Industry templates (customer success, account management, sales, support, services firms, ...) only
pre-fill that configuration.

Both shapes use the same three service seams (`Db`, `Storage`, `EmailSender`), so the application code does not know
which one it runs on.

## Alternatives considered

- **Hosted only.** Simpler, but loses every customer whose policy forbids third-party data processing.
- **A separate single-tenant fork.** Doubles maintenance and guarantees the two drift apart.
- **Database-per-tenant in the hosted service.** Stronger isolation, but cost per company and operational burden
  (migrations across thousands of databases) conflict with the gross-margin budget (QUALITY.md: infrastructure
  <= $0.25 per seat per month).

## Consequences

- Every new feature must work with and without billing, with and without the Cloudflare-only features, and for one
  or many companies. Tests run the app on PGlite and on real Postgres to catch drift.
- Self-hosters need an upgrade path, so migrations are append-only and run automatically at start.
- The customer portal for self-host runs under `PORTAL_DOMAIN` on the same process.
- Anything that assumes more than one company in the table (platform-owner metrics, support desk, sign-up) must be
  disabled or hidden when `SINGLE_TENANT_SLUG` is set.
