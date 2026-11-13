-- Security hardening: every SECURITY DEFINER function pins its search_path with
-- pg_temp LAST. Without pg_temp named, Postgres searches the session's temporary
-- schema first for relations, so a caller could shadow a table the function
-- uses with a temporary one and have the function (running as the table owner)
-- read or write the wrong thing. tests/rls.test.ts keeps it this way for any
-- function added later.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
  end loop;
end $$;
