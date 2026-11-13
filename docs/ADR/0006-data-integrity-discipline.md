# 0006. Data-integrity discipline: versions, idempotency, outbox, trash

- Status: Accepted (versions on tasks, idempotency, outbox, trash and DST-safe dates are built; offline queue and wider version checks are not)
- Date: 2026-11-12
- Deciders: product owner

## Context

For a work-management tool, silently losing an edit, duplicating a message or deleting something for good is worse than
being slow or lacking a feature. QUALITY.md's priority order is explicit: integrity and safety first, speed second,
simplicity third, real-time fourth, design fifth, feature count last.

## Decision

These rules apply to every write path:

1. **Concurrent edits never vanish.** Rows carry a `version`; the client sends the version it saw. Edits to different
   fields merge; the same field changed twice yields a clear "changed just now" conflict with undo (`shared/src/merge.ts`).
2. **A retry does the work once.** Every write may carry an `Idempotency-Key`. The key is claimed in the request's
   *first* transaction (so a rolled-back change also rolls back the key), the answer is stored, and a repeat returns it
   (`lib/repeats.ts`). Reusing a key for a different request is refused.
3. **Side effects go through an outbox in the same transaction** as the change that caused them (notifications, chat
   messages, emails, webhooks, CRM writes). Delivery runs after the response and is retried by the scheduler, with
   a `dedupe_key` so it is not sent twice.
4. **Deletion is reversible for 30 days**: `trash` tables keep the rows; imports can be undone for 30 days; the hourly job
   purges what has expired.
5. **Background work waits rather than guesses.** Automations and sync do not act on missing or late data; a partial
   sync deletes nothing; the last successful run is visible and two consecutive failures alert an admin.
6. **Time is explicit.** Due dates are calendar dates in the company's time zone; "today" is computed once per transaction
   (`app_today()`); DST transitions are tested.
7. **Every error is recorded** (no bodies or secrets) and the user sees what happened and what to do, not a stack trace.
8. **Audit everything that matters** (`audit_log`), and keep personal-data export and deletion inside the product (KVKK/GDPR).

## Alternatives considered

- **Last write wins.** Simplest and silently loses data under concurrent editing.
- **Two-phase external calls inside the request.** Slow and fragile; an outbox gives the same safety with background retries.
- **Hard deletes with backups as the safety net.** A restore takes hours and affects everyone; trash takes a click.

## Consequences

- Every new write endpoint needs: a permission check, `db.tenant`, idempotency support, an audit entry where relevant, and a test.
- Outbox rows and idempotency keys are retained briefly and purged (2 days, 7 days, 90 days depending on table; see `cleanUp` in `lib/scheduler.ts`).
- **Gaps to close** (tracked in QUALITY.md): version checks for customers and records, the offline queue in the web app,
  seat-sharing detection with an admin alert, and a written, rehearsed restore procedure (RUNBOOK has the first draft).
