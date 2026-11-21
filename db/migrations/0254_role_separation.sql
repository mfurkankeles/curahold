-- Curahold — the server's own work no longer runs as the table owner, and every
-- table with row security forces it (security audit H2, ADR 0023).
--
-- Before: db.system() (sign-in look-ups, inbound hooks, the scheduler, CRM sync)
-- ran as the login that owns every table, so row security was out of the
-- picture and the same connection could alter tables, drop policies or switch
-- off triggers. Now:
--
--   curahold_system  what db.system() runs as (`set local role`). It owns
--                    nothing and may only read and write rows: one policy per
--                    table (curahold_system_all) lets it across companies, the
--                    way the server's work needs, but it cannot change the
--                    schema, a policy or a trigger (the append-only audit trail
--                    stays append-only for it too).
--   the owner        whoever runs this migration. Migrations only (db.owner()).
--                    It must be a superuser or have BYPASSRLS: the SECURITY
--                    DEFINER functions the policies call run as the owner and
--                    read the very tables they guard, so once FORCE binds the
--                    owner they would see nothing (or recurse) without it. This
--                    migration stops with a clear message instead of breaking.
--
-- FORCE ROW LEVEL SECURITY then binds any role that owns a table but does not
-- bypass row security — for example a login that was handed ownership by
-- mistake. The request roles (curahold_app, curahold_portal) are unchanged.
--
-- A new table with row security calls app_secure_table() in its migration;
-- tests/rls.test.ts fails the build when one does not.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls)) then
    raise exception 'Curahold migration 0254: the migration role % must be a superuser or have BYPASSRLS before row security can be forced (docs/RUNBOOK.md, "Database roles").', current_user;
  end if;
end $$;

-- Roles are cluster-global: parallel test databases race here (see 0001).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'curahold_system') then
    create role curahold_system nologin;
  end if;
exception when duplicate_object or unique_violation then null;
end $$;

-- The login that migrates may switch to it, as it may to the request roles (0001, 0011).
-- A separate application login gets the same grant from the operator (docs/RUNBOOK.md).
grant curahold_system to current_user;

grant usage on schema public to curahold_system;
grant select, insert, update, delete on all tables in schema public to curahold_system;
grant usage, select, update on all sequences in schema public to curahold_system;
grant execute on all functions in schema public to curahold_system;
-- Tables, sequences and functions the owner creates later get the same rights.
alter default privileges in schema public grant select, insert, update, delete on tables to curahold_system;
alter default privileges in schema public grant usage, select, update on sequences to curahold_system;
alter default privileges in schema public grant execute on functions to curahold_system;

-- Row security on, forced, and the system role's own way in: one call per table.
-- Runs as its caller (the owner, inside a migration): no other role owns a table,
-- so nobody else could use it even if it were granted.
create function app_secure_table(t regclass) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  execute format('alter table %s enable row level security', t);
  execute format('alter table %s force row level security', t);
  if not exists (select 1 from pg_policy p where p.polrelid = t and p.polname = 'curahold_system_all') then
    execute format('create policy curahold_system_all on %s for all to curahold_system using (true) with check (true)', t);
  end if;
end
$$;
revoke execute on function app_secure_table(regclass) from public, curahold_app, curahold_portal, curahold_system;

do $$
declare r record;
begin
  for r in
    select c.oid::regclass as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
  loop
    perform app_secure_table(r.t);
  end loop;
end $$;
