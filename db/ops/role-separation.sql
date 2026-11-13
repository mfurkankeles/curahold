-- NOT a migration (the runner never reads db/ops). A reviewed template for the
-- production database, to be run once by a DBA — see db/OPS-SECURITY.md.
--
-- Goal: the connection the application logs in with must not OWN the tables, so
-- row-level security binds it unless a role is explicitly allowed to bypass it.
--
--   curahold_owner   owns every table and function; used ONLY to run migrations.
--   curahold_login   what the Worker / Hyperdrive connects as. NOINHERIT, no
--                    ownership. May `set role curahold_app` / `curahold_portal`
--                    (the request roles, which RLS binds) and is what db.system()
--                    runs as — that is the one path that must skip RLS, and it
--                    is the one the static test in tests/rls.test.ts watches.
--
-- Replace the passwords and run as a superuser (Supabase: the postgres role).

-- 1. A migration/owner role, and hand it everything.
create role curahold_owner nologin;
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I owner to curahold_owner', r.tablename);
  end loop;
  for r in select sequencename from pg_sequences where schemaname = 'public' loop
    execute format('alter sequence public.%I owner to curahold_owner', r.sequencename);
  end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
    execute format('alter function %s owner to curahold_owner', r.sig);
  end loop;
end $$;

-- 2. The application's login: not the owner, may switch to the request roles.
create role curahold_login login noinherit password 'CHANGE-ME' bypassrls;
grant curahold_app, curahold_portal to curahold_login;
grant usage on schema public to curahold_login;
grant select, insert, update, delete on all tables in schema public to curahold_login;
grant usage, select on all sequences in schema public to curahold_login;
grant execute on all functions in schema public to curahold_login;

-- 3. Only now is it safe to force the policies on the owner's own sessions too
--    (the SECURITY DEFINER functions are owned by curahold_owner, which must still
--    see across rows, so give it BYPASSRLS rather than forcing in front of it):
alter role curahold_owner bypassrls;
-- Optional second belt, once the above has run for a while in production:
--   alter table <each tenant table> force row level security;
-- FORCE is only correct when every owner-run path (db.system(), the definer
-- functions) runs as a role that has BYPASSRLS, as above. Do NOT run it before.
