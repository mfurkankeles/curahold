-- Tendwell — who sees what, and how.
--   * Account reach per role: every account, the team's, or only one's own.
--     Records under an account follow the account.
--   * Field access (who sees / who changes each field) lives on the field
--     definitions themselves (orgs.account_fields, record_types.fields).
--   * Pages: a role's home and shared report pages, built from cards.

-- ---------------------------------------------------------- account reach

-- Nothing changes for existing companies: every role keeps seeing every
-- account until an administrator narrows it.
update roles set perms = array(select distinct unnest(perms || array['accounts.view_all']));

create function app_role_key() returns text
language sql stable security definer set search_path = public as $$
  select r.key from users u join roles r on r.id = u.role_id
   where u.id = app_user() and u.org_id = app_org()
$$;

create function app_sees_account(p_owner uuid, p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app_has_perm('accounts.view_all')
      or (p_owner is not null and p_owner = app_user())
      or (app_has_perm('accounts.view_team') and (
            -- the account belongs to one of my teams (as member or lead)
            (p_team is not null and exists (select 1 from team_members m where m.team_id = p_team and m.user_id = app_user()))
         or (p_team is not null and exists (select 1 from teams t where t.id = p_team and t.lead_id = app_user()))
            -- or its owner is in a team with me, or in a team I lead
         or (p_owner is not null and exists (
               select 1 from team_members a join team_members b on b.team_id = a.team_id
                where a.user_id = app_user() and b.user_id = p_owner))
         or (p_owner is not null and exists (
               select 1 from teams t join team_members m on m.team_id = t.id
                where t.lead_id = app_user() and m.user_id = p_owner))
      ))
$$;

drop policy accounts_select on accounts;
drop policy accounts_update on accounts;
drop policy accounts_delete on accounts;
create policy accounts_select on accounts for select
  using (org_id = app_org() and app_sees_account(owner_id, team_id));
create policy accounts_update on accounts for update
  using (org_id = app_org() and app_sees_account(owner_id, team_id))
  with check (org_id = app_org() and app_can_write());
create policy accounts_delete on accounts for delete
  using (org_id = app_org() and app_has_perm('accounts.manage') and app_sees_account(owner_id, team_id));

-- Handing customers to someone else may put them out of the giver's own
-- reach (a rep with "only their own" passing one to a colleague). A plain
-- update cannot do that under the rules above, so this one checks the giver
-- could see and change each row, then makes the change.
create function app_reassign_accounts(p_ids uuid[], p_set_owner boolean, p_owner uuid, p_set_team boolean, p_team uuid)
returns setof uuid
language plpgsql security definer set search_path = public as $$
begin
  if not app_can_write() then
    raise exception 'read only seat' using errcode = '42501';
  end if;
  return query
    update accounts a
       set owner_id = case when p_set_owner then p_owner else a.owner_id end,
           team_id = case when p_set_team then p_team else a.team_id end,
           updated_at = now()
     where a.org_id = app_org() and a.id = any (p_ids) and app_sees_account(a.owner_id, a.team_id)
     returning a.id;
end $$;

-- Account fields are set by people who manage customers, who may not run
-- the rest of the company settings (the orgs row needs org.manage).
create function app_set_account_fields(p_fields jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app_has_perm('accounts.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update orgs set account_fields = p_fields where id = app_org();
end $$;

-- Records follow their account; a record with no account follows its owner.
drop policy records_select on records;
drop policy records_update on records;
create policy records_select on records for select
  using (org_id = app_org() and (
    (account_id is null and (app_has_perm('accounts.view_all') or owner_id = app_user() or created_by = app_user()))
    or exists (select 1 from accounts a where a.id = records.account_id)
  ));
create policy records_update on records for update
  using (org_id = app_org() and (
    (account_id is null and (app_has_perm('accounts.view_all') or owner_id = app_user() or created_by = app_user()))
    or exists (select 1 from accounts a where a.id = records.account_id)
  ))
  with check (org_id = app_org() and app_can_write());

-- ------------------------------------------------------------------ pages

create table pages (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  name         text not null check (length(name) between 1 and 80),
  -- [{"id": "c1", "type": "renewals", "size": "half", "scope": "mine", "days": 90}, ...]
  cards        jsonb not null default '[]'::jsonb,
  -- Role keys whose home this page is.
  home_for     text[] not null default '{}',
  -- Role keys that may open it; empty means everyone in the company.
  shared_with  text[] not null default '{}',
  position     int not null default 0,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, created_by) references users (org_id, id) on delete set null (created_by)
);

alter table pages enable row level security;
create policy pages_select on pages for select using (
  org_id = app_org() and (
    cardinality(shared_with) = 0 or app_role_key() = any (shared_with) or app_role_key() = any (home_for) or app_has_perm('org.manage')
  ));
create policy pages_write on pages for all
  using (org_id = app_org() and app_has_perm('org.manage'))
  with check (org_id = app_org() and app_has_perm('org.manage'));
grant select, insert, update, delete on pages to tendwell_app;
grant execute on function app_role_key() to tendwell_app;
grant execute on function app_sees_account(uuid, uuid) to tendwell_app;
grant execute on function app_set_account_fields(jsonb) to tendwell_app;
grant execute on function app_reassign_accounts(uuid[], boolean, uuid, boolean, uuid) to tendwell_app;

-- Three starting pages for every existing company (new ones get them at sign-up).
insert into pages (org_id, name, cards, home_for, position)
select o.id,
       case when o.locale = 'tr' then 'Benim günüm' else 'My day' end,
       '[{"id":"c1","type":"my_tasks","size":"half"},{"id":"c2","type":"renewals","size":"half","scope":"mine","days":90},{"id":"c3","type":"attention","size":"half","scope":"mine"},{"id":"c4","type":"quiet","size":"half","scope":"mine","days":30},{"id":"c5","type":"stakeholders","size":"full","scope":"mine"}]'::jsonb,
       array['member'], 0
  from orgs o;
insert into pages (org_id, name, cards, home_for, position)
select o.id,
       case when o.locale = 'tr' then 'Ekip görünümü' else 'Team view' end,
       '[{"id":"c1","type":"metric","size":"third","metric":"accounts"},{"id":"c2","type":"metric","size":"third","metric":"money"},{"id":"c3","type":"metric","size":"third","metric":"attention"},{"id":"c4","type":"team_load","size":"full"},{"id":"c5","type":"renewals","size":"half","scope":"all","days":90},{"id":"c6","type":"attention","size":"half","scope":"all"},{"id":"c7","type":"breakdown","size":"half","by":"field"},{"id":"c8","type":"breakdown","size":"half","by":"owner"},{"id":"c9","type":"sync_health","size":"full"}]'::jsonb,
       array['admin', 'manager'], 1
  from orgs o;
insert into pages (org_id, name, cards, home_for, position)
select o.id,
       case when o.locale = 'tr' then 'Yönetim özeti' else 'Leadership summary' end,
       '[{"id":"c1","type":"metric","size":"third","metric":"accounts"},{"id":"c2","type":"metric","size":"third","metric":"money"},{"id":"c3","type":"metric","size":"third","metric":"renewals","days":90},{"id":"c4","type":"breakdown","size":"half","by":"field"},{"id":"c5","type":"renewals","size":"half","scope":"all","days":90}]'::jsonb,
       array['viewer'], 2
  from orgs o;
