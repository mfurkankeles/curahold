# 0022. Cost bounds by construction: AI ceiling per seat, minimum billed seats, a narrower trial

- Status: Accepted (safe defaults; prices and the numbers are open owner decisions)
- Date: 2026-11-21
- Deciders: product owner (pending), engineering

## Context

The pricing rule is "the cheapest possible, never at a loss per customer". An independent audit of the pricing
workshop (20 Nov) found the bound was not real in four places. The question quota limits questions, not tokens, so a
heavy question can cost 8–18 times the costed one, and a company administrator could raise the company's AI limit to
50 $ a month (trials too). The public docs chat shared the installation's 100 $ cap with paying customers. Checkout
accepted one seat, below which a small company's fixed cost (its trial, support, the payment fee) outweighs what it
pays. And every trial was auto-approvable up to 25 seats on Business limits (10 GB a seat).

## Decision

- The assistant's money ceiling is set by the plan: full seats × a per-plan rate (`ASSISTANT_USD_PER_SEAT`, default
  0.55 $ Team, 1.10 $ Business), one fixed amount in the trial (`ASSISTANT_TRIAL_USD`, 5 $). An administrator can set a
  lower limit, never a higher one (`plan_limit_ai`); the model stops at the ceiling whatever is stored (`overCap`).
  Only the operator lifts it. With billing off (self-hosted, demo) the old installation maximum applies.
- The public chat has its own cap (`ASSISTANT_PUBLIC_MONTHLY_USD`, 10 $), counted apart from customers (migration
  0253), inside the installation cap.
- Every quantity sent to the payment provider goes through `billedSeats`: at least the minimum for the plan, interval
  and price region (`BILLING_MIN_SEATS`; default 3, India 5 / 6 a year, Malaysia 4 a year). The company still uses only
  the seats it has; the Billing screen says it is billed for at least that many.
- The trial keeps the owner's approved 25 seats (plans.json `trial.autoApproveSeats`, the owner console's `trial.seatCap`)
  and gets 1 GB a seat (`trial.caps.storageGbPerSeat`). The audit's 10-seat default was reverted on 21 Nov because the
  owner had approved 25 on 17 Nov; narrowing it is his open question, and the console setting changes it without a release.

## Alternatives considered

- Keep a fixed 5 $ per company, raised only by a paid add-on: simpler, but 5 $ is a loss on a 3-seat company at the
  lower regional prices; the per-seat rate is exactly what each price was costed with.
- Refuse checkout below the minimum instead of billing the minimum: the buyer would have to invite people before
  paying; billing "at least N" is the common, clearer form.
- Higher minimums that hold under stress (support × 2, FX 3 %, TL −20 %: 4 / 5 / 7): safer, but loses the smallest
  customers; left for the owner to choose.

## Consequences

The worst case per company is bounded by settings, not by usage patterns. Heavy askers in small companies reach the
docs-search answer sooner. One-seat companies pay for three. Everything is a setting: the owner's decisions (rates,
minimums, trial width, public chat) change values, not code. The provider console's own spend limit must equal the sum
of the in-product caps (go-live checklist). Revisit when the first paying companies' real `assistant_usage` is known.
