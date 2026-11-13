# 0002. Supabase Postgres (EU) for data, Paddle as merchant of record

- Status: Accepted
- Date: 2026-11-12
- Deciders: product owner

## Context

We need a relational database with row-level security, EU data residency (GDPR and the Turkish KVKK are explicit
requirements), automated backups, and a price that fits the margin budget. We also need to take subscription
payments from companies in many countries without running a tax and invoicing operation.

## Decision

- **Data:** Postgres hosted on **Supabase in an EU region**. The Workers reach it through **Cloudflare Hyperdrive**
  (connection pooling and caching), using `postgres.js` with `prepare: false`. Self-host uses plain Postgres 16.
  Postgres is the only system of record; files go to R2 (or disk when self-hosted).
- **Billing:** **Paddle** as merchant of record (it charges, handles sales tax and VAT, sends invoices). Two plans
  (Team and Business), monthly or yearly, priced **per seat** (prices in `shared/src/billing.ts` and mirrored in
  Paddle; they must be kept in step). New companies start a 14-day trial; seats follow people who actually joined,
  synced hourly. Billing is **off** (everything open) when the Paddle settings are absent: self-host, demo and tests.
- **Email:** Resend (hosted), SMTP (self-host). Sub-processors are listed in README for the DPA.
- **Backups:** Supabase's daily backups now; point-in-time recovery is **deliberately deferred** until the first
  paying customer (about $105 per month fixed) per QUALITY.md decision 3.

## Alternatives considered

- **Stripe.** Cheaper per transaction, but we would own sales-tax and VAT compliance in every country.
- **Self-managed Postgres on a VM.** Cheapest on paper; we would own patching, failover and backups with a very small team.
- **A different database (MySQL, document store).** We rely on Postgres row-level security, `SECURITY DEFINER`
  functions, JSONB and the same engine in tests (PGlite) and production.

## Consequences

- Paddle's fee (roughly $0.75-1.00 per seat in the cost model) is part of the gross-margin calculation
  (`scripts/quality/cost.mts`). Under about 200 seats, enabling PITR would push the margin below the 90% target; this
  is the trade-off behind decision 3.
- Hyperdrive pools connections, so the Worker opens one small client per request and closes it after background work
  finishes (`depsFor` in `worker.ts`).
- The database login must be able to `set role curahold_app` / `curahold_portal` and to run migrations
  (see 0004 and SECURITY.md for the role-separation requirement).
- Supabase is a sub-processor; changing region or provider requires a DPA update.
