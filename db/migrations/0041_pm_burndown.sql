-- PM polish (Wave-5D): a per-board "enable product management" switch, and a
-- daily burndown history for sprints.
--
-- 1. boards.pm_enabled: a three-state switch. NULL means "unset" — the board
--    behaves as before (the backlog/sprint views appear when the board looks
--    like a product board, i.e. it has the Backlog and QA stages). TRUE turns
--    the PM features on for any board; FALSE turns them off, so a non-product
--    team never sees the clutter and the PM endpoints answer "not found".
-- 2. sprint_burndowns: one row per sprint per day, written by the daily engine
--    (api/src/lib/burndown.ts). It records the scope and what is left so the
--    sprint view can draw the ideal line against the actual one. Same reach as
--    the sprint it belongs to: whoever can see the board sees its burndown.

alter table boards add column pm_enabled boolean;

create table sprint_burndowns (
  org_id           uuid not null references orgs(id) on delete cascade,
  board_id         uuid not null,
  sprint_id        uuid not null,
  -- The company's own calendar day (its time zone), so a point lands once a day.
  day              date not null,
  -- The scope and what remains, in story points and in item count.
  total_points     numeric not null default 0 check (total_points >= 0),
  remaining_points numeric not null default 0 check (remaining_points >= 0),
  total_count      int not null default 0 check (total_count >= 0),
  remaining_count  int not null default 0 check (remaining_count >= 0),
  created_at       timestamptz not null default now(),
  primary key (org_id, sprint_id, day),
  foreign key (org_id, board_id) references boards (org_id, id) on delete cascade,
  foreign key (org_id, sprint_id) references sprints (org_id, id) on delete cascade
);
create index sprint_burndowns_sprint_idx on sprint_burndowns (org_id, sprint_id, day);

alter table sprint_burndowns enable row level security;

-- Same reach as the sprint's board (mirrors the sprints policies in 0035): anyone
-- who can see the board sees its burndown; a full seat may write it. The daily
-- engine writes as the table owner (api/src/lib/burndown.ts), not as curahold_app.
create policy sprint_burndowns_select on sprint_burndowns for select
  using (org_id = app_org() and board_id in (select app_visible_boards()));
create policy sprint_burndowns_insert on sprint_burndowns for insert
  with check (org_id = app_org() and (select app_can_write()) and board_id in (select app_visible_boards()));
create policy sprint_burndowns_update on sprint_burndowns for update
  using (org_id = app_org() and board_id in (select app_visible_boards()))
  with check (org_id = app_org() and (select app_can_write()) and board_id in (select app_visible_boards()));
create policy sprint_burndowns_delete on sprint_burndowns for delete
  using (org_id = app_org() and board_id in (select app_visible_boards()) and (select app_can_write()));

grant select, insert, update, delete on sprint_burndowns to curahold_app;
