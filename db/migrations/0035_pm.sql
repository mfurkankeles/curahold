-- Product / project management foundation. It extends tasks and boards rather
-- than adding a second system: the workflow stages are the board's own columns
-- (boards.columns, one of them marked done), subtasks are tasks.parent_id, rank
-- is tasks.position. What this adds is the vocabulary agile teams need on top:
-- an issue type, story points, an epic a story belongs to, and sprints.
--
-- A sprint belongs to one board; a task is in at most one sprint (sprint_id),
-- and "the backlog" is simply the board's tasks with no sprint. Only one sprint
-- per board may be active at a time (partial unique index below).

create table sprints (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  board_id     uuid not null,
  name         text not null check (length(name) between 1 and 80),
  goal         text not null default '' check (length(goal) <= 2000),
  state        text not null default 'future' check (state in ('future', 'active', 'closed')),
  starts_on    date,
  ends_on      date,
  position     double precision not null default 0,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz,
  unique (org_id, id),
  check (starts_on is null or ends_on is null or starts_on <= ends_on),
  foreign key (org_id, board_id) references boards (org_id, id) on delete cascade,
  foreign key (org_id, created_by) references users (org_id, id) on delete set null (created_by)
);
create index sprints_board_idx on sprints (org_id, board_id) where archived_at is null;
-- One running sprint per board, enforced by the database, not only by the route.
create unique index sprints_one_active_idx on sprints (org_id, board_id) where state = 'active' and archived_at is null;

alter table tasks
  add column issue_type   text not null default 'task'
              check (issue_type in ('epic', 'story', 'task', 'bug', 'subtask', 'spike')),
  add column story_points numeric check (story_points is null or story_points >= 0),
  add column epic_id      uuid,
  add column sprint_id    uuid,
  add foreign key (org_id, epic_id) references tasks (org_id, id) on delete set null (epic_id),
  add foreign key (org_id, sprint_id) references sprints (org_id, id) on delete set null (sprint_id);
create index tasks_sprint_idx on tasks (org_id, sprint_id) where sprint_id is not null;
create index tasks_epic_idx on tasks (org_id, epic_id) where epic_id is not null;

alter table sprints enable row level security;

-- Same reach as the board the sprint is on: anyone who can see the board sees
-- its sprints; whoever may write (a full seat) plans and runs them.
create policy sprints_select on sprints for select
  using (org_id = app_org() and board_id in (select app_visible_boards()));
create policy sprints_insert on sprints for insert
  with check (org_id = app_org() and (select app_can_write()) and board_id in (select app_visible_boards()));
create policy sprints_update on sprints for update
  using (org_id = app_org() and board_id in (select app_visible_boards()))
  with check (org_id = app_org() and (select app_can_write()) and board_id in (select app_visible_boards()));
create policy sprints_delete on sprints for delete
  using (org_id = app_org() and board_id in (select app_visible_boards()) and (select app_can_write()));

grant select, insert, update, delete on sprints to curahold_app;
