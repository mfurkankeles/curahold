-- Setup health and "Test your setup" (shared/src/setupHealth.ts).
--
-- setup_progress keeps what a company's setup checks remember, one row per thing:
--   kind 'seen'    — a check that failed at some point (so the panel can say "2 of 5 fixed");
--   kind 'ack'     — a check that cannot be read from here (DNS records), confirmed by a person;
--   kind 'test'    — a step of "Test your setup": its current state (passed, failed, left out);
--   kind 'input'   — what a step is tried with (a customer, a connection, a colleague), kept for the next try;
--   kind 'issue'   — a failed step turned into an issue (open, or resolved once the step passes);
--   kind 'approve' — the go-live approvals: item 'customer' (the company's administrator), item 'vendor' (Curahold's side);
--   kind 'done'    — "Setup complete": when, and by whom (item 'all');
--   kind 'daily'   — the last automatic check (item 'last'): detail.failing = the ids that failed.
-- setup_test_runs keeps every try of a step with what it saw (the evidence), newest read first.
-- The checks themselves are queries over the company's own tables, run as the
-- person asking (row security applies); nothing here changes anything else.
--
-- Read by contract elsewhere (docs/DEVELOPER.md, "Setup health"): the onboarding
-- plans read kind 'daily' / item 'last' and kind 'done'.

create table setup_progress (
  org_id   uuid not null references orgs(id) on delete cascade,
  kind     text not null check (kind in ('seen', 'ack', 'test', 'input', 'issue', 'approve', 'done', 'daily')),
  item     text not null check (item ~ '^[a-z][a-zA-Z0-9_.-]{1,60}$'),
  status   text not null check (status in ('pass', 'fail', 'skipped', 'seen', 'ok', 'open', 'resolved')),
  detail   jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 4000),
  by_user  uuid,
  at       timestamptz not null default now(),
  primary key (org_id, kind, item),
  foreign key (org_id, by_user) references users (org_id, id) on delete set null (by_user)
);

create table setup_test_runs (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null references orgs(id) on delete cascade,
  step     text not null check (step ~ '^[a-z][a-zA-Z0-9_.-]{1,60}$'),
  status   text not null check (status in ('pass', 'fail', 'skipped')),
  how      text not null check (how in ('run', 'person')),
  reason   text check (length(reason) <= 60),
  seen     jsonb not null default '{}'::jsonb check (pg_column_size(seen) <= 4000),
  note     text check (length(note) <= 500),
  by_user  uuid,
  at       timestamptz not null default now(),
  foreign key (org_id, by_user) references users (org_id, id) on delete set null (by_user)
);
create index setup_test_runs_step_idx on setup_test_runs (org_id, step, at desc);

alter table setup_progress enable row level security;
alter table setup_test_runs enable row level security;

-- Everyone in the company may read them (the routes show each person only the checks and steps they can act on);
-- writing needs a full seat, and the routes check the permission each step or check asks for.
create policy setup_progress_select on setup_progress for select using (org_id = app_org());
create policy setup_progress_write on setup_progress for all
  using (org_id = app_org() and (select app_can_write()))
  with check (org_id = app_org() and (select app_can_write()));
create policy setup_test_runs_select on setup_test_runs for select using (org_id = app_org());
create policy setup_test_runs_write on setup_test_runs for all
  using (org_id = app_org() and (select app_can_write()))
  with check (org_id = app_org() and (select app_can_write()));

grant select, insert, update, delete on setup_progress, setup_test_runs to curahold_app;
