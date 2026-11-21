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
| [0005](0005-i18n-fallback-and-two-complete-languages.md) | Two complete languages, other languages fall back to English | Superseded by 0008 |
| [0006](0006-data-integrity-discipline.md) | Data-integrity discipline: versions, idempotency, outbox, trash | Accepted (partly built) |
| [0007](0007-live-updates-websocket-per-company.md) | Live updates: one Durable Object per company, with polling fallback | Accepted (built) |
| [0008](0008-nine-complete-languages.md) | Every offered language is complete; no English fallback in shipped screens | Accepted |
| [0009](0009-departments-walls-in-row-security.md) | Departments are walls in row security; work crosses only through links and hand-overs | Accepted |
| [0010](0010-one-assistant-core-with-cost-caps.md) | One assistant core behind every chatbot, free rules first, hard monthly caps | Accepted |
| [0011](0011-ai-team-approval-gate.md) | The AI team proposes; only the operator's own yes runs anything outside | Accepted |
| [0012](0012-onboarding-hub-one-mutual-plan.md) | One mutual onboarding plan model for the company itself and its customers | Accepted |
| [0013](0013-setup-health-read-only-checks.md) | Setup health: zero-cost, read-only checks that link to the fix | Accepted |
| [0014](0014-consent-and-evidence-append-only.md) | One consent library; consent and contract evidence append-only and hash-chained | Accepted |
| [0015](0015-bot-protection-free-layers.md) | Bot and scraper protection from free layers | Accepted |
| [0016](0016-preview-build-limits.md) | Static previews of docs and demo fit the preview host's file limits | Accepted |
| [0017](0017-trial-by-request-three-months.md) | "Try it free" is a request the operator approves; trials last three months | Accepted |
| [0018](0018-product-mail-through-workspace-relay.md) | Product e-mail through the Google Workspace SMTP relay | Accepted |
| [0019](0019-one-billing-path.md) | Billing has one system of record: the subscriptions table, one code path | Accepted |
| [0020](0020-site-seo-and-crawlers.md) | Sales site and docs indexed on purpose: per-language titles, honest markup, AI answer crawlers off by default | Accepted (AI answer crawlers: owner question open) |
| [0021](0021-desk-first-reply-needs-requester-consent.md) | The desk's draft first reply asks the model only with the requester's own consent; the company switch as basis is an operator setting | Accepted (legal basis: owner question open) |
| [0022](0022-cost-bounds-by-construction.md) | Cost bounds by construction: AI ceiling = seats × plan rate (fixed in the trial), public chat's own cap, minimum billed seats, 1 GB a trial seat | Accepted (numbers: owner decisions open) |
| [0023](0023-server-work-not-as-table-owner.md) | The server's own work runs as `curahold_system` (owns nothing); every table forces row security; the owner only migrates | Accepted |

0008-0019 were recorded on 19 November 2026 from the code and the dated decisions of 15-19 November, during the
handover audit. They give product and engineering reasons only.

## Writing a new ADR

1. Copy [TEMPLATE.md](TEMPLATE.md) to `NNNN-short-title.md` with the next number.
2. Keep it to one page. Write the *context* and the *alternatives you rejected*; that is the part nobody can
   reconstruct later.
3. Add a row above. Link it from the PR.
4. Never rewrite history: to change a decision, add a new ADR that **supersedes** the old one and set the old one's
   status to `Superseded by NNNN`.
5. Use invented examples only (Acme, Ada). No real company or person names.
