# 0013. Setup health: zero-cost, read-only checks that point to the screen that fixes them

- Status: Accepted
- Date: 2026-11-19
- Deciders: product owner, engineering

## Context

Self-serve setup fails quietly: a CRM sign-in expires, an import leaves rows behind, a rule points at a deleted
field. Administrators need to be told, in plain words, before their team notices. Any check that costs a model call
or writes data on its own would be a cost and a trust problem.

## Decision

- A shared registry (`shared/src/setupHealth.ts` `CHECKS`) and one scalar sub-query per check
  (`api/src/lib/setupHealth.ts`), all sent as ONE statement inside the asker's own transaction, so row security decides
  what each person's count covers and the panel costs one round trip. Every query names `org_id`, so the same SQL is
  safe for the daily owner-access run.
- A check never fixes anything: it says what, why, and links to the one screen that fixes it, visible to the roles
  that can fix it. No model, no outside call, nothing written by a check.
- "Test your setup" steps are what a person does to see it work; a failed step is ONE issue row shared with the
  company's own onboarding plan (`openStepIssue` / `closeStepIssue`). Go-live needs two approvals.
- Other features use only `listSetupChecks()`, `setupHealthFor()` and `setupSummary()`.

## Alternatives considered

- Auto-repair: hides problems and can make them worse.
- An AI "setup doctor": per-question cost and non-deterministic answers.

## Consequences

- Adding a check = registry entry + query + words in every dictionary + regenerated help page;
  `tests/setup-health.test.ts` fails until all exist.
