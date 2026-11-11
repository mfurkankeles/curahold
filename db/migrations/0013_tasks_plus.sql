-- Tasks that carry more: a board's own fields, a start date, a history,
-- followers, links between tasks ("waits for", "related"), time spent,
-- reusable checklists, saved views, plans for a customer and intake forms.

-- -------------------------------------------------------------- boards

-- [{"key":"type","label":{"en":"Type","tr":"Tür"},"type":"select","options":[...],"required":"done"}]
-- "required": "done" — the task cannot be finished while the field is empty.
alter table boards add column task_fields jsonb not null default '[]'::jsonb;
-- An intake form on the board: {"on":true,"title":"...","intro":"...","fields":["description","account","due","f:type"],"column":"todo"}
alter table boards add column form jsonb;

-- --------------------------------------------------------------- tasks

alter table tasks add column fields jsonb not null default '{}'::jsonb;
alter table tasks add column start_date date;

-- What happened to a task, step by step: who changed what, when.
create table task_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  task_id     uuid not null,
  actor_id    uuid,
  kind        text not null check (kind ~ '^[a-z_]{2,30}$'),
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  foreign key (org_id, task_id) references tasks (org_id, id) on delete cascade
);
create index task_events_task_idx on task_events (task_id, created_at);
alter table task_events enable row level security;
create policy task_events_select on task_events for select
  using (org_id = app_org() and exists (select 1 from tasks t where t.id = task_id));
create policy task_events_insert on task_events for insert
  with check (org_id = app_org() and exists (select 1 from tasks t where t.id = task_id));
grant select, insert on task_events to tendwell_app;

-- People who follow a task: told about comments and changes like its assignees.
create table task_watchers (
  org_id      uuid not null references orgs(id) on delete cascade,
  task_id     uuid not null,
  user_id     uuid not null,
  created_at  timestamptz not null default now(),
  primary key (task_id, user_id),
  foreign key (org_id, task_id) references tasks (org_id, id) on delete cascade,
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);
alter table task_watchers enable row level security;
-- Anyone who sees the task sees who follows it; each person follows or stops for themselves.
create policy task_watchers_select on task_watchers for select
  using (org_id = app_org() and exists (select 1 from tasks t where t.id = task_id));
create policy task_watchers_insert on task_watchers for insert
  with check (org_id = app_org() and user_id = app_user() and exists (select 1 from tasks t where t.id = task_id));
create policy task_watchers_delete on task_watchers for delete
  using (org_id = app_org() and user_id = app_user());
grant select, insert, delete on task_watchers to tendwell_app;

-- "A blocks B" (B waits for A) or "A relates to B".
create table task_links (
  org_id      uuid not null references orgs(id) on delete cascade,
  from_id     uuid not null,
  to_id       uuid not null,
  kind        text not null check (kind in ('blocks', 'relates')),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  primary key (from_id, to_id, kind),
  check (from_id <> to_id),
  foreign key (org_id, from_id) references tasks (org_id, id) on delete cascade,
  foreign key (org_id, to_id) references tasks (org_id, id) on delete cascade
);
create index task_links_to_idx on task_links (to_id);
alter table task_links enable row level security;
-- A link is seen, made and removed by someone who can see both ends.
create policy task_links_select on task_links for select
  using (org_id = app_org() and exists (select 1 from tasks t where t.id = from_id) and exists (select 1 from tasks t where t.id = to_id));
create policy task_links_insert on task_links for insert
  with check (org_id = app_org() and app_can_write() and exists (select 1 from tasks t where t.id = from_id) and exists (select 1 from tasks t where t.id = to_id));
create policy task_links_delete on task_links for delete
  using (org_id = app_org() and app_can_write() and exists (select 1 from tasks t where t.id = from_id) and exists (select 1 from tasks t where t.id = to_id));
grant select, insert, delete on task_links to tendwell_app;

-- Time spent on a task, by whom and on which day.
create table time_entries (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  task_id     uuid not null,
  user_id     uuid not null,
  minutes     int not null check (minutes between 1 and 1440),
  day         date not null,
  note        text not null default '' check (length(note) <= 500),
  created_at  timestamptz not null default now(),
  foreign key (org_id, task_id) references tasks (org_id, id) on delete cascade,
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);
create index time_entries_task_idx on time_entries (task_id);
create index time_entries_user_day_idx on time_entries (org_id, user_id, day);
alter table time_entries enable row level security;
create policy time_entries_select on time_entries for select
  using (org_id = app_org() and exists (select 1 from tasks t where t.id = task_id));
create policy time_entries_insert on time_entries for insert
  with check (org_id = app_org() and app_can_write() and user_id = app_user() and exists (select 1 from tasks t where t.id = task_id));
create policy time_entries_delete on time_entries for delete
  using (org_id = app_org() and (user_id = app_user() or app_has_perm('org.manage')));
grant select, insert, delete on time_entries to tendwell_app;

-- --------------------------------------------------- reusable pieces

-- Checklists: a named list of steps that becomes a task's subtasks in one go.
create table checklist_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null check (length(name) between 1 and 120),
  items       jsonb not null check (jsonb_typeof(items) = 'array'),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  unique (org_id, name)
);
alter table checklist_templates enable row level security;
create policy checklist_templates_select on checklist_templates for select using (org_id = app_org());
create policy checklist_templates_insert on checklist_templates for insert with check (org_id = app_org() and app_can_write());
create policy checklist_templates_update on checklist_templates for update
  using (org_id = app_org() and (created_by = app_user() or app_has_perm('org.manage'))) with check (org_id = app_org());
create policy checklist_templates_delete on checklist_templates for delete
  using (org_id = app_org() and (created_by = app_user() or app_has_perm('org.manage')));
grant select, insert, update, delete on checklist_templates to tendwell_app;

-- Saved views: a name for a set of filters, for oneself or for everyone who sees the board.
create table saved_views (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid not null,
  board_id    uuid,
  name        text not null check (length(name) between 1 and 80),
  filters     jsonb not null default '{}'::jsonb,
  shared      boolean not null default false,
  created_at  timestamptz not null default now(),
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade,
  foreign key (org_id, board_id) references boards (org_id, id) on delete cascade
);
create index saved_views_board_idx on saved_views (org_id, board_id);
alter table saved_views enable row level security;
create policy saved_views_select on saved_views for select
  using (org_id = app_org() and (user_id = app_user() or (shared and (board_id is null or app_can_see_board(board_id)))));
create policy saved_views_write on saved_views for all
  using (org_id = app_org() and user_id = app_user())
  with check (org_id = app_org() and user_id = app_user() and (board_id is null or app_can_see_board(board_id)));
grant select, insert, update, delete on saved_views to tendwell_app;

-- Plans: a set of tasks with days from today, put on a customer in one click
-- ("Onboarding: kickoff today, training in a week, check-in after 30 days").
create table plan_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null check (length(name) between 1 and 120),
  board_id    uuid not null,
  column_key  text,
  -- [{"title":"Kickoff call: {account_name}","dueInDays":0,"assignee":"account_owner","subtasks":["..."]}]
  tasks       jsonb not null check (jsonb_typeof(tasks) = 'array'),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, name),
  foreign key (org_id, board_id) references boards (org_id, id) on delete cascade
);
alter table plan_templates enable row level security;
create policy plan_templates_select on plan_templates for select using (org_id = app_org());
create policy plan_templates_write on plan_templates for all
  using (org_id = app_org() and app_has_perm('org.manage'))
  with check (org_id = app_org() and app_has_perm('org.manage'));
grant select, insert, update, delete on plan_templates to tendwell_app;

-- Who follows a task, read inside the company whatever the reader's own rows.
create function app_task_watchers(p_task uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(user_id), '{}') from task_watchers where task_id = p_task and org_id = app_org()
$$;
grant execute on function app_task_watchers(uuid) to tendwell_app;
