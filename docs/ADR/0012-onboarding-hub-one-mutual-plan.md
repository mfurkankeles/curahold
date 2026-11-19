# 0012. Onboarding is one mutual plan model, used for the company itself and for each of its customers

- Status: Accepted
- Date: 2026-11-19
- Deciders: product owner, engineering

## Context

Two onboarding problems look alike: a new company setting up Curahold, and that company onboarding its own customer
after a won deal. Both need steps with owners and due days, "whose turn is it", issues, files and a shareable report.
Building two systems doubles the code and the help pages; ticking boxes by hand makes progress a guess.

## Decision

- One model (`onboarding_plans` and its child tables, migrations 0200/0210, `shared/src/onboarding.ts`) with
  `kind = self` (one per company, at `/onboarding`) and `kind = client` (one per customer, opened as a draft by a won
  deal's hand-over card, seen by the customer in the portal).
- Steps complete themselves from product signals (`SIGNALS`; `advancePlan` runs on read and in the hourly sweep);
  only a step without a signal may be ticked by a person.
- Progress is weighted (required 1, optional 0.5), counts who is waited on and for how long, and flags stalls.
- Nothing is copied: issues link tickets, product work is a `request_links` row, a finished plan is a `handovers`
  card, forms write the customer's own fields, files are `files` rows.
- Auto-plans on won deals are off until an administrator turns them on; every plan can be personalised (phases,
  order) and saved as a template. Email reminders are each person's choice, off by default; never to customers.
- The hub reads setup health only through one adapter (`lib/onboardingSetup.ts`, ADR 0013).

## Alternatives considered

- A checklist per company: no customer side, no evidence, progress by hand.
- A separate customer-onboarding product: two models, two help sets, and the hand-over loses context.

## Consequences

- A new signal needs its fact query, dictionary words and a test (`tests/onboarding-hub.test.ts`).
- Portal uploads have a type allow-list, size and quota limits but no malware scan yet (RUNBOOK go-live checklist).
