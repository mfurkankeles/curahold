# 0017. "Try it free" is a request the operator approves; trials last three months

- Status: Accepted
- Date: built 16–19 Nov 2026, recorded 2026-11-19
- Deciders: product owner

## Context

Instant self-serve sign-up lets anyone create a company, which invites abuse of free model calls and mail, and gives
no chance to qualify or help a serious buyer. The sales motion targets fewer, larger customer teams that need a longer
evaluation than 14 days.

## Decision

- The central address's "Try it free" writes a trial request (`routes/trial.ts`, `lib/trialRequests.ts`), reviewed in
  the operator console. Approving creates the company with the departments asked for, a seat cap and an end date, and
  emails the first administrator; rejecting prepares a polite reply in the person's language.
- The trial is `TRIAL_MONTHS = 3` (`shared/src/billing.ts`); reminders go out 14, 7 and 1 days before the end.
- After approval the administrator accepts the terms and DPA once per version (ADR 0014).
- The earlier instant sign-up stays behind `SIGNUP_MODE=instant`.

## Alternatives considered

- Instant sign-up with a 14-day trial: the earlier behaviour; more abuse, too short for team rollouts.
- Sales-call-only: blocks small teams entirely.

## Consequences

- The operator must review requests promptly; the console shows them with reminders.
- Cost models and any copy that still says "14 days" are wrong and must be updated.
