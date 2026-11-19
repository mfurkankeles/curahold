# 0010. One assistant core behind every chatbot, with free rules first and hard monthly caps

- Status: Accepted
- Date: built 16–19 Nov 2026, recorded 2026-11-19
- Deciders: product owner, engineering

## Context

The product has several chat surfaces: the in-app assistant, the help centre's Ask box, the sales site and the
customer portal. Model calls cost money on every question, gross margin is a budget every change must fit, and a
wrong answer about a customer's data, or one that shows data the asker may not see, is worse than no answer.

## Decision

- One server-side core (`api/src/assistant/core.ts`) answers every surface. Order: free rules (language, other
  products declined, ambiguous questions get one question with choices) → the company's answer cache → switches and
  caps → the model, given only the few matching help sections and **read-only** tools that call the API as the asking
  person (same permissions, field rules and department walls) → output checks (sources must be sections it was given,
  no amounts it did not read, nothing of its instructions).
- Without a key, switched off, over a cap or on any error, the docs search answers at zero cost — never worse than
  before the assistant existed.
- Caps (env, `api/src/assistant/cost.ts`): installation-wide `ASSISTANT_GLOBAL_MONTHLY_USD` (default 100), per company
  `ASSISTANT_COMPANY_MONTHLY_USD` (default 5, a company may raise it up to `ASSISTANT_COMPANY_MAX_USD`, default 50).
  Usage is metered in `assistant_usage` / `assistant_global` (migration 0096).
- What it knows is the help centre: a feature without a help page is unknown to the assistant, so
  `tests/docs-coverage.test.ts` requires a page and eval cases for every screen (`shared/src/helpLinks.ts`).

## Alternatives considered

- A separate bot per surface: duplicated prompts, inconsistent safety checks, several bills.
- Letting the model query the database directly: bypasses permissions and field rules.
- Only the customer's own AI through the MCP connector: kept as well (`docs/design/costs.md` rule 8), but not enough
  for people without such a plan.

## Consequences

- One key (`ANTHROPIC_API_KEY`) serves the assistant and the AI team (ADR 0011).
- Changing the prompt or tools needs the evaluation (`tests/assistant-eval/`) in all languages; CI runs its fixed
  checks without a key, a judged run with a key happens before a release.
- Retention of questions follows each company's setting; privacy notes in `docs/legal/ai-assistant-privacy-notes.md`.
