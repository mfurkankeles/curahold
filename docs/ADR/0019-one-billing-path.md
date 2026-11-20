# 0019. Billing has one system of record and one code path: the subscriptions table (Accepted)

- Status: Accepted (proposed 2026-11-19, accepted 2026-11-20)
- Date: 2026-11-20
- Deciders: engineering; the prices themselves stay the product owner's (`shared/src/plans.json`, `status: "draft"`)

## Context

Two billing paths existed side by side:

1. `routes/billing.ts` + `lib/billing.ts` + `lib/paddle.ts`, webhook `POST /api/billing/webhook`, writing the snapshot
   `orgs.billing` directly; UI `Billing.tsx`. It had the event ledger (`billing_events`, each event once), the refusal of a
   changed customer, interval and seats, prorated plan changes, the portal link and the hourly seat sync.
2. `api/src/billing/` (provider-neutral `provider.ts`, `paddle.ts`, `service.ts`, `project.ts`) + `routes/subscriptions.ts`,
   webhook `POST /api/inbound/billing/paddle`, writing `subscriptions` / `invoices` and re-deriving `orgs.billing`; UI
   `BillingManage.tsx`. It had invoices, the trial row, the monthly exit (leave at period end, resume) and the billing details.

The setup docs pointed Paddle at the first; a later action on the second re-projected from rows the first never moved, so
the two could overwrite each other. Prices, the trial length and the limits were constants in code.

## Decision

- **Keep path 2 as the only path and move path 1's behaviour into it.** It is the safer base for Paddle as merchant of
  record: money lives in real columns (reporting, audits, invoices), the provider is behind an interface (a second provider
  or a sandbox mock needs no route changes), and every write runs through one module (`api/src/billing/service.ts`).
- What moved, so no behaviour is lost: the `billing_events` ledger (now written in the same transaction as the change);
  refusing a changed customer or a second live subscription; interval, seats and currency as columns; prorated plan changes
  (`POST /billing/change`); the portal; the seat sync. Signature checking (HMAC, 5-minute window, rotating secrets), the signed
  company id in `custom_data` and the "never an older event over a newer one" rule are unchanged.
- **One handler, two addresses.** `/api/inbound/billing/paddle` is documented; the older `/api/billing/webhook` mounts the
  same function, so a destination set up either way works. A test sends the same event to both and expects one row, one ledger
  entry and one snapshot (`tests/billing-one-path.test.ts`). The old files and `BillingManage.tsx` are deleted; Settings →
  Billing is one screen on `GET /billing`.
- **Migration 0230** copies subscriptions that lived only on `orgs.billing` into the table (the snapshot wins over a bare trial
  row, since it is what Paddle reported), and adds `billing_interval`, `seats`, `currency`, `past_due_since`, `event_at`.
- **The price list is data.** `shared/src/plans.json` holds the plans (price, features, caps), the trial (3 months, approval,
  25 seats auto-approvable, lower AI cap), dunning grace (30 days), proration modes and regions (currency shown and charged,
  regional price, tax as a pass-through). `parseCatalogue()` rejects a wrong file with the reason. The owner's final pricing
  replaces the file; no code changes. Unknown plan keys never break gating: they fall back to the trial plan.
- **Caps on every cost driver, per plan, on the server:** CuraAI answers per seat a month (then the free docs search
  answers), file storage per seat (pooled), sync frequency, connected tools, full seats. These bound the worst case that
  `scripts/quality/cost.mts` prices, so no customer can cost more than they pay.
- **Dunning:** Paddle retries and e-mails the buyer; we stay open while it does, for at most `dunning.graceDays` from the
  first failed payment, then read-only (never deleted) until a payment goes through.
- **Currencies:** Paddle charges INR, SGD, TRY and USD; it cannot collect AED (the Gulf pays USD, AED shown as a guide);
  MYR is unconfirmed, so Malaysia pays a USD regional price with MYR shown. One switch in the file changes either.

## Alternatives considered

- Keep both: two sources of truth for money; the next engineer fixes one and breaks the other.
- Keep path 1 and drop the table: loses invoices, the monthly exit, provider neutrality and queryable money columns.
- Prices in Paddle only (read them at runtime): one fewer copy, but the site, caps and cost model would depend on a live API
  call and a network failure would hide prices; the file is mirrored in Paddle instead.

## Consequences

- Paddle can be configured once the owner sets final prices; run a sandbox purchase, renewal, failed payment and cancellation
  end to end first (RUNBOOK).
- Each price in `plans.json` must be mirrored in Paddle (one price per plan and interval, country overrides for regional prices).
- The older webhook address can be removed in a later release once no Paddle destination uses it.
