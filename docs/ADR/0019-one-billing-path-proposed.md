# 0019. Billing has one system of record: the subscriptions table (Proposed)

- Status: Proposed
- Date: 2026-11-19
- Deciders: engineering (needs the owner's go-ahead before go-live)

## Context

Two billing paths exist side by side:

1. The first one: `routes/billing.ts` + `lib/billing.ts` + `lib/paddle.ts`, webhook `POST /api/billing/webhook`,
   writes the snapshot `orgs.billing` directly; UI `web/src/components/Billing.tsx`.
2. The later, table-backed one: `api/src/billing/` (provider-neutral `provider.ts`, `paddle.ts`, `service.ts`,
   `project.ts`) + `routes/subscriptions.ts`, webhook `POST /api/inbound/billing/paddle`, writes `subscriptions` /
   invoices and re-derives `orgs.billing` from them; UI `web/src/components/BillingManage.tsx` (monthly exit, resume).

`project.ts` says the subscriptions table is the system of record, but README, RUNBOOK, ENVIRONMENT and
db/OPS-SECURITY.md tell the operator to point Paddle at the first path's webhook. If Paddle only calls the first path,
the subscriptions table and invoices never move, and a later action on the second path (monthly exit, resume)
re-projects from those stale rows and can overwrite the snapshot. `tests/billing-converge.test.ts` covers the
projection, not the two webhooks.

## Decision (proposed)

- The subscriptions table is the only system of record. Paddle's notification destination is
  `/api/inbound/billing/paddle`.
- The first path's webhook becomes a thin forwarder into `billing/service.ts` (so an old destination keeps working),
  then is removed one release later; `lib/billing.ts` keeps only `syncSeats`, `lib/paddle.ts` merges into
  `billing/paddle.ts`; `Billing.tsx` and `BillingManage.tsx` become one component.
- A test sends the same Paddle event to both addresses and expects one subscription row and one snapshot.

## Alternatives considered

- Keep both: two sources of truth for money; the next engineer will fix one and break the other.
- Drop the table-backed path: loses invoices, the monthly-exit right and provider neutrality.

## Consequences

- Until this is done, do not configure Paddle live. The docs now say which webhook is which.
