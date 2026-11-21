# 0023. The server's own work runs as a role that owns nothing; row security is forced

- Status: Accepted
- Date: 2026-11-21
- Deciders: engineering (security audit H2)

## Context

Row security (ADR 0004) bound every request, but the work that belongs to no single company — sign-in look-ups before
a company is known, inbound hooks, the hourly scheduler, CRM sync — ran through `db.system()` as the login that owns
every table. The owner is not bound by row security unless a table forces it, and no table did. So the same
connection that served requests could also alter tables, drop policies and switch off the append-only triggers, and a
mistake or an injected statement in that path had nothing behind it. `SECURITY.md` listed this as OPEN since Tur 1.

Forcing row security alone was not possible: the SECURITY DEFINER functions the policies call run as the owner and
read the tables they guard, so a forced owner would see nothing or recurse. The in-memory database (PGlite) has a
single superuser, which is why earlier rounds left it as a deployment step.

## Decision

- Migration 0254 creates `curahold_system`: no login, no ownership, no BYPASSRLS. It holds row privileges (select,
  insert, update, delete) on every table and one policy per table, `curahold_system_all`, that names only it.
  `db.system()` now does `set local role curahold_system` in both drivers, so the tests and the demo run every
  system path exactly the way production does.
- `db.owner()` is new and used only by `db/migrate.ts` (a test fails the build if `api/src` calls it elsewhere).
- Every table with row security is `FORCE ROW LEVEL SECURITY`, through `app_secure_table()`, which new migrations call.
  The migration role must be a superuser or have BYPASSRLS; 0254 stops with a message otherwise instead of
  breaking the definer functions.
- The production login (`DATABASE_URL`, Hyperdrive) should be a separate NOINHERIT login that owns nothing and may only
  become the three working roles (`db/ops/role-separation.sql`); migrations use `MIGRATION_DATABASE_URL`.

## Alternatives considered

- BYPASSRLS on the system role: one attribute and no policy per table, but creating such a role needs a superuser on
  Postgres 15 (managed Postgres usually has none), and it would make the guard test unable to tell it apart from the
  owner. A named policy works on every Postgres and is checked per table.
- A second connection pool for `system()` with its own credentials: the strongest split against an injected `set role`,
  but every request that needs a sign-in look-up would open two connections (Hyperdrive, Worker limits). Kept as the
  next step if the login ever has to be split further.
- Forcing row security without a separate role: breaks the definer functions (see context).

## Consequences

- `db.system()` can no longer change the schema, a policy or a trigger; `truncate` is refused to it.
- A new table with row security must call `select app_secure_table('name');` (tests/rls.test.ts checks FORCE and the
  policy on every table).
- What still holds only by discipline: inside `system()` every statement names `org_id` (static scan, baseline may only
  shrink), and a login that is a member of `curahold_system` can switch to it — the separate login removes the owner's
  rights from that reach, not the system role's.
- Revisit if a managed Postgres offers per-role `SET` restrictions that let the request login lose `curahold_system`.
