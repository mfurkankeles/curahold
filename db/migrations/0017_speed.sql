-- Speed, found by running a large company (hundreds of people, a hundred
-- thousand tasks) on a real Postgres.
--
-- Who may see a row used to be asked once per row: a function that looked the
-- board (or the customer's owner and team) up again for every task it was
-- shown. On a big table that is most of the time a page takes. The answer
-- does not change within a statement, so it is now worked out once per
-- statement — the boards a person can see, their teams, the people they
-- share a team with — and each row is only checked against that list.
-- Who sees what is exactly as before.

create function app_visible_boards() returns setof uuid
language sql stable security definer set search_path = public as $$
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

-- Teams this person is in, or leads.
create function app_my_teams() returns setof uuid
language sql stable security definer set search_path = public as $$
  select tm.team_id from team_members tm where tm.user_id = app_user() and tm.org_id = app_org()
  union
  select t.id from teams t where t.lead_id = app_user() and t.org_id = app_org()
$$;

-- People who share a team with this person, or are in a team they lead.
create function app_my_people() returns setof uuid
language sql stable security definer set search_path = public as $$
  select b.user_id from team_members a join team_members b on b.team_id = a.team_id
   where a.user_id = app_user() and a.org_id = app_org()
  union
  select m.user_id from teams t join team_members m on m.team_id = t.id
   where t.lead_id = app_user() and t.org_id = app_org()
$$;

grant execute on function app_visible_boards(), app_my_teams(), app_my_people() to curahold_app;

alter policy boards_select on boards using (org_id = app_org() and id in (select app_visible_boards()));
alter policy boards_update on boards using (org_id = app_org() and id in (select app_visible_boards()));

alter policy tasks_select on tasks using (org_id = app_org() and board_id in (select app_visible_boards()));
alter policy tasks_insert on tasks with check (org_id = app_org() and (select app_can_write()) and board_id in (select app_visible_boards()));
alter policy tasks_update on tasks
  using (org_id = app_org() and board_id in (select app_visible_boards()))
  with check (org_id = app_org() and (select app_can_write()) and board_id in (select app_visible_boards()));
alter policy tasks_delete on tasks using (org_id = app_org() and board_id in (select app_visible_boards()) and (select app_can_write()));

-- The same test app_sees_account() makes, a row at a time, against lists made once.
alter policy accounts_select on accounts using (
  org_id = app_org() and (
    (select app_has_perm('accounts.view_all'))
    or owner_id = (select app_user())
    or ((select app_has_perm('accounts.view_team')) and (team_id in (select app_my_teams()) or owner_id in (select app_my_people())))));
alter policy accounts_update on accounts using (
  org_id = app_org() and (
    (select app_has_perm('accounts.view_all'))
    or owner_id = (select app_user())
    or ((select app_has_perm('accounts.view_team')) and (team_id in (select app_my_teams()) or owner_id in (select app_my_people())))));
alter policy accounts_delete on accounts using (
  org_id = app_org() and (select app_has_perm('accounts.manage')) and (
    (select app_has_perm('accounts.view_all'))
    or owner_id = (select app_user())
    or ((select app_has_perm('accounts.view_team')) and (team_id in (select app_my_teams()) or owner_id in (select app_my_people())))));

alter policy records_select on records using (
  org_id = app_org() and (
    (account_id is null and ((select app_has_perm('accounts.view_all')) or owner_id = (select app_user()) or created_by = (select app_user())))
    or exists (select 1 from accounts a where a.id = records.account_id)));
alter policy records_update on records using (
  org_id = app_org() and (
    (account_id is null and ((select app_has_perm('accounts.view_all')) or owner_id = (select app_user()) or created_by = (select app_user())))
    or exists (select 1 from accounts a where a.id = records.account_id)));

alter policy audit_select on audit_log using (org_id = app_org() and ((select app_has_perm('org.manage')) or (select app_has_perm('privacy.manage'))));

-- Removing a task (or undoing an import) looks for what points at it.
create index notifications_task_idx on notifications (task_id) where task_id is not null;

-- A comment, a file, a history line, a time entry or a link is seen by whoever
-- sees its task. Written as "is there such a task?", the database answered by
-- first listing every task the person can see — a hundred thousand rows to
-- show three comments. Asked as a look-up of that one task, it reads one row.
-- (Same answer; null — no such visible task — hides the row, as before.)
alter policy comments_select on comments using (org_id = app_org() and (select true from tasks t where t.id = comments.task_id));
alter policy files_select on files using (org_id = app_org() and (select true from tasks t where t.id = files.task_id));
alter policy task_events_select on task_events using (org_id = app_org() and (select true from tasks t where t.id = task_events.task_id));
alter policy task_watchers_select on task_watchers using (org_id = app_org() and (select true from tasks t where t.id = task_watchers.task_id));
alter policy time_entries_select on time_entries using (org_id = app_org() and (select true from tasks t where t.id = time_entries.task_id));
alter policy task_links_select on task_links using (
  org_id = app_org()
  and (select true from tasks t where t.id = task_links.from_id)
  and (select true from tasks t where t.id = task_links.to_id));

-- A customer's last finished task and last change, including what is in the archive.
create index tasks_account_all_idx on tasks (account_id) where account_id is not null;
-- "What came in, week by week."
create index tasks_created_idx on tasks (org_id, created_at);

-- Search. Matching text against every row a person can see meant checking
-- their rights on each row first, and only then looking at the text. These
-- find the rows by their text (through a trigram index where the server has
-- one), keep those the person may see — the same tests the policies make —
-- and hand back ids; the search then reads those few rows as it reads
-- anything else, under row-level security.
create function app_find_accounts(p_like text, p_prefix text, p_limit int) returns setof uuid
language sql stable security definer set search_path = public as $$
  select a.id from accounts a
   where a.org_id = app_org() and a.archived_at is null and a.name ilike p_like
     and ((select app_has_perm('accounts.view_all'))
          or a.owner_id = (select app_user())
          or ((select app_has_perm('accounts.view_team')) and (a.team_id in (select app_my_teams()) or a.owner_id in (select app_my_people()))))
   order by (a.name ilike p_prefix) desc, lower(a.name) limit p_limit
$$;

create function app_find_tasks(p_like text, p_prefix text, p_limit int) returns setof uuid
language sql stable security definer set search_path = public as $$
  select t.id from tasks t
   where t.org_id = app_org() and t.archived_at is null and t.title ilike p_like
     and t.board_id in (select app_visible_boards())
   order by (t.title ilike p_prefix) desc, t.updated_at desc limit p_limit
$$;

create function app_find_records(p_like text, p_prefix text, p_limit int) returns setof uuid
language sql stable security definer set search_path = public as $$
  select r.id from records r
   where r.org_id = app_org() and r.archived_at is null and r.name ilike p_like
     and ((r.account_id is null and ((select app_has_perm('accounts.view_all')) or r.owner_id = (select app_user()) or r.created_by = (select app_user())))
          or exists (select 1 from accounts a
                      where a.id = r.account_id and a.org_id = app_org()
                        and ((select app_has_perm('accounts.view_all'))
                             or a.owner_id = (select app_user())
                             or ((select app_has_perm('accounts.view_team')) and (a.team_id in (select app_my_teams()) or a.owner_id in (select app_my_people()))))))
   order by (r.name ilike p_prefix) desc, lower(r.name) limit p_limit
$$;

grant execute on function app_find_accounts(text, text, int), app_find_tasks(text, text, int), app_find_records(text, text, int) to curahold_app;

-- Where the server has trigram indexes (Supabase and any stock Postgres do), "contains"
-- searches read an index instead of the table. Where it does not, search still works.
do $$
begin
  create extension if not exists pg_trgm;
  create index tasks_title_trgm on tasks using gin (title gin_trgm_ops);
  create index accounts_name_trgm on accounts using gin (name gin_trgm_ops);
  create index records_name_trgm on records using gin (name gin_trgm_ops);
exception when others then
  raise notice 'pg_trgm is not available here; search reads the tables instead';
end $$;

-- "My tasks", and the number beside it, are asked for all day long. Who a task
-- is given to is a list on the task; this finds a person's tasks through an
-- index on that list, and the page then reads those rows like any others.
create index tasks_assignees_idx on tasks using gin (assignee_ids) where archived_at is null;
create function app_tasks_of(p_user uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select t.id from tasks t where t.org_id = app_org() and t.archived_at is null and t.assignee_ids @> array[p_user]
$$;
grant execute on function app_tasks_of(uuid) to curahold_app;

-- Open work, for the counts in reports.
create index tasks_open_idx on tasks (org_id, board_id) where done_at is null and archived_at is null and parent_id is null;

-- Compiling queries before running them (JIT) costs more than it saves on
-- short queries: 300 ms of compiling for a 15 ms count, measured. The app
-- switches it off for its own transactions; this does the same for the jobs
-- that run by themselves, on servers that let a database owner say so.
do $$
begin
  execute format('alter database %I set jit = off', current_database());
exception when others then
  raise notice 'could not switch jit off for this database; set it in the server configuration';
end $$;
