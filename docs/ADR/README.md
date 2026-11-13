# Architecture Decision Records

An ADR is a short note that captures **one decision, why it was made, and what it costs us**, so a future owner
can tell whether the reasons still hold before changing it.

The first batch (0001-0007) was distilled from [QUALITY.md](../../QUALITY.md), the product owner's founding
quality brief and decision log (written in Turkish, 12-13 November 2026), plus the code as it stands. When an ADR
and QUALITY.md disagree, QUALITY.md's dated decision is the source and the ADR needs fixing.

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-multi-tenant-and-self-host.md) | One codebase: multi-tenant SaaS and single-company self-host | Accepted |
| [0002](0002-supabase-postgres-and-paddle.md) | Supabase Postgres (EU) for data, Paddle as merchant of record | Accepted |
| [0003](0003-cloudflare-workers-and-hono.md) | Cloudflare Workers + Hono as the runtime (not Netlify, not a long-running server) | Accepted |
| [0004](0004-tenant-isolation-with-rls.md) | Tenant isolation enforced by Postgres row-level security | Accepted |
| [0005](0005-i18n-fallback-and-two-complete-languages.md) | Two complete languages, other languages fall back to English | Accepted |
| [0006](0006-data-integrity-discipline.md) | Data-integrity discipline: versions, idempotency, outbox, trash | Accepted (partly built) |
| [0007](0007-live-updates-websocket-per-company.md) | Live updates: one Durable Object per company, with polling fallback | Accepted (not built) |

## Writing a new ADR

1. Copy [TEMPLATE.md](TEMPLATE.md) to `NNNN-short-title.md` with the next number.
2. Keep it to one page. Write the *context* and the *alternatives you rejected*; that is the part nobody can
   reconstruct later.
3. Add a row above. Link it from the PR.
4. Never rewrite history: to change a decision, add a new ADR that **supersedes** the old one and set the old one's
   status to `Superseded by NNNN`.
5. Use invented examples only (Acme, Ada). No real company or person names.
