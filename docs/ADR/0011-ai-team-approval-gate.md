# 0011. The AI team proposes; only the operator's own yes runs anything outside the company

- Status: Accepted
- Date: built 16–19 Nov 2026, recorded 2026-11-19
- Deciders: product owner, engineering

## Context

Curahold's own operator console has an "AI team": seats (roles) held by model-driven agents that read the business
(sign-ups, support, revenue), meet, and suggest work. An agent that can send mail, spend money or deploy on its own is
a security and reputation risk, and a talkative agent can quietly run up a model bill.

## Decision

- **Gate in code** (`api/src/team/gate.ts`): an agent can only *propose*. A proposal must be a known kind on the seat's
  card; kinds that need a second pair of eyes carry a review by another seat allowed to review that kind; the text
  passes output checks. Running happens only through `executeApproved`, for an approval decided in the operator's own
  console session (never by its proposer), through a runner registered by the server. Runners hold credentials;
  agents never do — no agent tool, key or route reaches a runner.
- **Monitor** (`api/src/team/monitor.ts`, code rules, no model): over-reach, repeated refused attempts, a gate bypass
  attempt or a token spike pauses the seat at once and alerts the operator; only the operator resumes it.
- **Cost**: a cheap SQL pre-check (`precheck.ts`) ends a wake at zero model cost when nothing changed; each seat has a
  weekly budget and the whole team a monthly cap (`TEAM_MONTHLY_USD`, default 40); models per profile are config
  (`TEAM_MODEL_*`).
- **Activation**: a seat becomes active only when all its golden tasks pass (`judge.ts`); one failure switches it off.
- The team's tables are desk-only: company request roles have no privileges on them.

## Alternatives considered

- Agents with scoped credentials: still one prompt injection away from sending or spending.
- A model-based supervisor: costs money on every action and can be talked round; code rules cannot.

## Consequences

- Every new outside action is a new runner registered server-side plus a proposal kind; nothing else may call it.
- Nothing schedules the team's wakes yet (`tick()` is meant to be called by a scheduled task): see HANDOVER risks.
- The gate and the monitor are security code: change them with a second reviewer and their tests (`tests/team*.test.ts`,
  `tests/team-redteam*`).
