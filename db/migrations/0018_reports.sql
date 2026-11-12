-- Reports people build themselves (see shared/src/reports.ts).
--
-- A report is a small description: what to look at, the filters, the grouping,
-- the figure and the chart. Nothing is stored about its results: it is worked
-- out when someone opens it, as that person, so the same shared report shows
-- each of them what they are allowed to see.

create table reports (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  name         text not null check (length(name) between 1 and 120),
  description  text not null default '' check (length(description) <= 500),
  def          jsonb not null,
  -- Everyone in the company can open it. Otherwise only the person who made it.
  shared       boolean not null default false,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, created_by) references users (org_id, id) on delete set null (created_by)
);
create index reports_org_idx on reports (org_id, updated_at desc);

alter table reports enable row level security;
create policy reports_select on reports for select
  using (org_id = app_org() and (shared or created_by = app_user()));
create policy reports_insert on reports for insert
  with check (org_id = app_org() and created_by = app_user());
-- Its maker changes it; a shared one can also be kept in order by whoever runs the company settings.
create policy reports_update on reports for update
  using (org_id = app_org() and (created_by = app_user() or (shared and (select app_has_perm('org.manage')))))
  with check (org_id = app_org() and (created_by = app_user() or (shared and (select app_has_perm('org.manage')))));
create policy reports_delete on reports for delete
  using (org_id = app_org() and (created_by = app_user() or (shared and (select app_has_perm('org.manage')))));
grant select, insert, update, delete on reports to curahold_app;
