-- The activity log is kept for its stated period, then let go (package
-- l2-privacy, 20 Nov 2026; lib/retention.ts, RETENTION_AUDIT_DAYS, 365 days by
-- default). The log stays append-only (0055): no UPDATE, no TRUNCATE, and no
-- DELETE by the request role, which has no such privilege either. The one new
-- exception is the nightly retention job over the owner connection, and only
-- for rows older than 90 days (the lowest period the setting accepts), so a
-- mistaken or hostile statement can never remove recent history.
create or replace function audit_log_append_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from orgs where id = old.org_id) then
    return old;
  end if;
  if tg_op = 'DELETE' and current_user <> 'curahold_app' and old.at < now() - interval '90 days' then
    return old;
  end if;
  raise exception 'audit_log is append-only (% refused)', tg_op using errcode = 'insufficient_privilege';
end;
$$;
