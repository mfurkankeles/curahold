# 0009. Departments are walls enforced in row security; work crosses only through links and hand-overs

- Status: Accepted
- Date: built 16–19 Nov 2026, recorded 2026-11-19
- Deciders: product owner, engineering

## Context

Customer teams sell, onboard, support and grow the same customer. Each team wants its own boards and its own
language, but the customer's history must be one story, and a support agent must not browse the sales pipeline.
Checking "may this person see this board" in every route would be forgotten in one of hundreds of queries.

## Decision

- A board belongs to one department (`boards.department_id`, migration 0120). Who may see it is decided in the
  database (`app_visible_boards()` used by the row-security policies), so every query, report, export, search and the
  assistant's tools obey it automatically. A trigger stops anyone but an administrator or the department's lead from
  moving a board.
- Work never crosses by opening another department's board. It crosses through: a request to that department's intake
  board (linked to the asking task), `request_links` (a customer request ↔ a product story), `handovers` cards (won
  deal → onboarding → customer success; `shared/src/departments.ts` `DEPARTMENT_FLOW` / `handoverAfter`), and
  `account_team` (the owner per department). The customer page shows counts per department behind each `band_view`.
- A switched-off department is hidden and keeps its boards.

## Alternatives considered

- Permission checks in routes only: one forgotten `where` leaks a board.
- Separate workspaces per team: duplicates the customer and breaks the shared timeline.

## Consequences

- New queries over boards or tasks get the walls for free; a query run with `db.system()` does not, and must filter
  itself (ADR 0004).
- Cross-department features must go through the link tables, never by widening visibility.
- Rollback for 0120 exists as a hand-run script (`db/rollback/0120_departments.sql`, tested).
