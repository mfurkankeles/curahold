-- Finance figures by department (b7's finance.view, through b5's departments).
--
-- A person sees the money a customer owes (finance_* tables, the customer
-- page's finance band) when their role has 'finance.view', as before, OR when
-- they belong to a switched-on department that sees the Finance department's
-- band on the customer page (departments.band_view of 'finance': Finance's own
-- by default; null = every department). An administrator widens it in
-- Settings → Departments, as for the band; switching Finance off takes it away.

create function app_user_sees_finance(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
      from users u
      join departments f on f.org_id = u.org_id and f.key = 'finance' and f.enabled
      join department_members dm on dm.user_id = u.id and dm.org_id = u.org_id
      join departments d on d.id = dm.department_id and d.enabled
     where u.id = p_user and u.status = 'active'
       and (f.band_view is null or d.key = any (f.band_view))
  )
$$;

-- A role's permissions plus what the person's departments add (the session carries these).
create function app_perms_of(p_user uuid, p_perms text[]) returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  select case when 'finance.view' = any (coalesce(p_perms, '{}')) or not app_user_sees_finance(p_user) then p_perms
              else coalesce(p_perms, '{}') || array['finance.view'] end
$$;

-- Row security asks the same question as the session.
create or replace function app_has_perm(p text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from users u join roles r on r.id = u.role_id
    where u.id = app_user() and u.org_id = app_org()
      and u.status = 'active' and p = any (r.perms)
  ) or (p = 'finance.view' and app_user_sees_finance(app_user()))
$$;
