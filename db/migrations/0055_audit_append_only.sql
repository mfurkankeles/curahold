-- The activity log is written once and never changed or removed: not through
-- the application, and not through its database role. The request role has no
-- UPDATE or DELETE policy (row-level security) and now no such privilege
-- either; a trigger refuses UPDATE, DELETE and TRUNCATE for every role.
--
-- One exception: a company deleted as a whole takes its log with it (the
-- foreign key cascades; by then the company row is gone).
-- The database owner could drop the trigger; separating that role from the
-- migration role is an operations step (db/OPS-SECURITY.md).
create function audit_log_append_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from orgs where id = old.org_id) then
    return old;
  end if;
  raise exception 'audit_log is append-only (% refused)', tg_op using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function audit_log_append_only();
create trigger audit_log_no_truncate before truncate on audit_log
  for each statement execute function audit_log_append_only();

revoke update, delete, truncate on audit_log from curahold_app;
