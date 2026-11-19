-- Undo 0120_departments.sql: back to boards without departments.
-- Not a migration (the runner never reads this folder). Run it by hand, as the
-- owner, in one transaction:  psql "$DATABASE_URL" -1 -f db/rollback/0120_departments.sql
-- tests/departments-migration.test.ts runs it and checks that every person sees
-- exactly the boards they saw before the move.

alter policy boards_insert on boards with check (org_id = app_org() and app_can_write());
alter policy tasks_insert on tasks with check (org_id = app_org() and (select app_can_write()) and board_id in (select app_visible_boards()));

create or replace function app_visible_boards() returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select bd.id from boards bd
   where bd.org_id = app_org() and (
     app_has_perm('boards.view_all')
     or bd.visibility = 'org'
     or bd.created_by = app_user()
     or exists (select 1 from board_members m where m.board_id = bd.id and m.user_id = app_user())
     or (bd.visibility = 'team' and exists (select 1 from team_members tm where tm.team_id = bd.team_id and tm.user_id = app_user()))
     or (bd.visibility = 'team' and exists (select 1 from teams t where t.id = bd.team_id and t.lead_id = app_user()))
   )
$$;

create or replace function app_can_see_board(b uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from boards bd
    where bd.id = b and bd.org_id = app_org() and (
      app_has_perm('boards.view_all')
      or bd.visibility = 'org'
      or bd.created_by = app_user()
      or exists (select 1 from board_members m
                 where m.board_id = bd.id and m.user_id = app_user())
      or (bd.visibility = 'team' and exists (
            select 1 from team_members tm
            where tm.team_id = bd.team_id and tm.user_id = app_user()))
      or (bd.visibility = 'team' and exists (
            select 1 from teams t
            where t.id = bd.team_id and t.lead_id = app_user()))
    )
  )
$$;

drop trigger if exists boards_department_guard on boards;
drop trigger if exists boards_department_default on boards;
drop trigger if exists orgs_departments on orgs;
drop function if exists app_board_department_guard();
drop function if exists app_board_department_default();
drop function if exists app_departments_for_new_org();
drop function if exists app_account_departments(uuid);
drop function if exists app_link_handoff(uuid, uuid);
drop function if exists app_request_created(uuid);
drop function if exists app_task_link_cards(uuid);
drop function if exists app_request_desks();

alter table boards drop constraint if exists boards_department_fk;
drop index if exists boards_department_idx;
alter table boards drop column if exists department_id;

drop table if exists department_moves;
drop table if exists department_members;
drop function if exists app_leads_department(uuid);
drop function if exists app_my_departments();
drop function if exists app_home_department(uuid);
drop table if exists departments;

delete from schema_migrations where name = '0120_departments.sql';
