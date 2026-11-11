-- Tendwell — everyday work: repeating tasks, quiet hours, muting a task,
-- and undo for changes made to many things at once.
-- Everything here is event-driven (no extra scheduled jobs): a repeating
-- task makes its next copy when it is done; held notifications go out with
-- the hourly run that already exists.

-- {"every": 1, "unit": "week", "from": "due"} — next copy when this one is done.
alter table tasks add column repeat jsonb;

-- Held until the person's quiet hours end.
alter table notifications add column not_before timestamptz;
create index notifications_held_idx on notifications (not_before) where state = 'pending';

-- "Stop telling me about this task": comments stop; assignments and @mentions still come.
create table task_mutes (
  org_id     uuid not null references orgs(id) on delete cascade,
  task_id    uuid not null,
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id),
  foreign key (org_id, task_id) references tasks (org_id, id) on delete cascade,
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);
alter table task_mutes enable row level security;
create policy task_mutes_own on task_mutes for all
  using (org_id = app_org() and user_id = app_user())
  with check (org_id = app_org() and user_id = app_user());
grant select, insert, delete on task_mutes to tendwell_app;

-- Who muted a task (each person sees only their own row; the comment writer
-- needs to know whom to skip).
create function app_task_muted(p_task uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(user_id), '{}') from task_mutes where task_id = p_task and org_id = app_org()
$$;
grant execute on function app_task_muted(uuid) to tendwell_app;

-- What a change to many things replaced, kept a short while so it can be put back.
create table undo_log (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  user_id    uuid not null,
  kind       text not null check (kind in ('tasks', 'accounts')),
  -- [{"id": "...", "status": "...", ...previous values}]
  payload    jsonb not null,
  created_at timestamptz not null default now(),
  used_at    timestamptz,
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);
alter table undo_log enable row level security;
create policy undo_log_own on undo_log for all
  using (org_id = app_org() and user_id = app_user())
  with check (org_id = app_org() and user_id = app_user());
grant select, insert, update on undo_log to tendwell_app;
