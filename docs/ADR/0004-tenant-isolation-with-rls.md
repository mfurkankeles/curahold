# 0004. Tenant isolation enforced by Postgres row-level security

- Status: Accepted
- Date: 2026-11-12
- Deciders: product owner

## Context

QUALITY.md ranks "no data loss, no wrong data, no leakage between companies" as the first priority. Application-level
`where org_id = ?` filters alone are one forgotten clause away from a breach. We need the database to refuse a
cross-company read or write even when application code is wrong.

## Decision

1. Every table holding company data has an `org_id` column and **row-level security enabled** with policies written
   against `app_org()` / `app_user()` / `app_has_perm()`.
2. Requests never get a raw connection. `db.tenant(ctx, fn)` opens a transaction, sets `app.org_id` / `app.user_id`
   with transaction-local `set_config`, and runs `set local role curahold_app`.
3. The customer portal uses `db.portal(...)`: `set local role curahold_portal`, a role with **no table privileges** that
   can only call `portal_*` `SECURITY DEFINER` functions.
4. Work that belongs to no company (migrations, sign-in lookups, inbound webhooks, the scheduler, sync, error recording)
   uses `db.system(...)`, the **owner connection, which bypasses RLS**. Each such query must filter on `org_id` itself.
5. Three automated gates in CI are required checks: `tests/rls.test.ts` (every company table has RLS plus a policy or no
   privileges; every definer function pins `search_path`; static scan of `system()` queries), `tests/isolation.test.ts`
   (raw queries in company A see only A) and `tests/isolation-routes.test.ts` (every id-taking route, called as another
   company's admin, answers 404 and changes nothing).

## Alternatives considered

- **Application filters only.** Rejected: a single missed clause leaks data.
- **Schema or database per company.** Rejected for the hosted service on cost and migration complexity (see 0001).
- **`FORCE ROW LEVEL SECURITY` from day one with a separate non-owner login.** Right end state, but the
  `system()` paths and Supabase's role model made it a deployment step, not a schema one; see Consequences.

## Consequences

- The owner connection is the sharp edge. Reviewers must scrutinise every new `db.system()` call; the static test
  keeps a baseline list that may only shrink.
- Because no table uses `FORCE ROW LEVEL SECURITY` and the API connects as the role that owns the tables (so it can
  `set role`), RLS protects against application bugs but **not** against an attacker who can execute arbitrary SQL as
  that login. Hardening to a separate minimal login role, and `FORCE` for request roles, is tracked in SECURITY.md.
- New tables must ship with RLS and a policy in the same migration, or the gate fails.
- Policies are SQL: performance-sensitive; keep them simple (`org_id = app_org()` first) and indexed on `org_id`.
