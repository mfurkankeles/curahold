-- NOT a migration (the runner never reads db/ops). A reviewed template for the
-- production database, to be run once by a DBA — see db/OPS-SECURITY.md and
-- ADR 0023. Migration 0254 already did the schema half: every table with row
-- security FORCES it, and db.system() runs as curahold_system (owns nothing,
-- reaches rows through its own policy). What is left is the logins:
--
--   owner            owns every table and function; runs migrations only
--                    (MIGRATION_DATABASE_URL). Must be a superuser or have
--                    BYPASSRLS (the definer functions run as it; 0254 checks).
--   curahold_login   what the Worker / Hyperdrive / self-host server connects
--                    as (DATABASE_URL). NOINHERIT, owns nothing, no BYPASSRLS.
--                    May only `set role` to the three working roles.
--
-- Replace the password and run as the owner (Supabase: the postgres role).

-- 0. Nobody but the owner creates objects in the schema (the default on
--    Postgres 15+; a database created earlier or upgraded may still allow it).
revoke create on schema public from public;

-- 1. The application's login: not the owner, nothing of its own.
create role curahold_login login noinherit password 'CHANGE-ME';
grant curahold_app, curahold_portal, curahold_system to curahold_login;
grant usage on schema public to curahold_login;

-- 2. Check (each must return no rows / false):
--   select relname from pg_class where relowner = (select oid from pg_roles where rolname = 'curahold_login');
--   select rolbypassrls or rolsuper from pg_roles where rolname = 'curahold_login';
--   select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relrowsecurity and not c.relforcerowsecurity;
--
-- 3. Point Hyperdrive (or DATABASE_URL) at curahold_login and keep the owner's
--    connection string for `MIGRATION_DATABASE_URL=… npm run migrate` only.
