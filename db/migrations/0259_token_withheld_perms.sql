-- Curahold — an API key or an app's token never carries administrator-level
-- permissions, in the database either (review S1 of the security fixes, ADR 0024).
--
-- The API strips those permissions from a token's person (api/src/lib/tokenScope.ts
-- withheldPerms) and passes them, comma-separated, as app.withheld in the request's
-- transaction (TENANT_SETUP_SQL). Row security asks app_has_perm(), which until now
-- read only the person's role, so a policy guarded by an administrator's permission
-- would still let their key through. It now refuses a permission listed there.
-- A browser session sets app.withheld to '' and nothing changes for it. Same body as
-- 0190 otherwise.
create or replace function app_has_perm(p text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (
    exists (
      select 1 from users u join roles r on r.id = u.role_id
      where u.id = app_user() and u.org_id = app_org()
        and u.status = 'active' and p = any (r.perms)
    ) or (p = 'finance.view' and app_user_sees_finance(app_user()))
  ) and not coalesce(p = any (string_to_array(nullif(current_setting('app.withheld', true), ''), ',')), false)
$$;
