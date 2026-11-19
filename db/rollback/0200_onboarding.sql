-- Undo 0200_onboarding.sql: no onboarding plans, templates or anything inside them.
-- Not a migration (the runner never reads this folder). Run it by hand, as the
-- owner, in one transaction:  psql "$DATABASE_URL" -1 -f db/rollback/0200_onboarding.sql
-- Request links and hand-over cards made by onboarding plans are removed first,
-- so the older checks can come back.
delete from request_links where source = 'onboarding';
delete from handovers where source_kind = 'onboarding';
alter table request_links drop constraint request_links_source_check;
alter table request_links add constraint request_links_source_check check (source in ('account', 'ticket', 'meeting', 'portal', 'task'));
alter table handovers drop constraint handovers_source_kind_check;
alter table handovers add constraint handovers_source_kind_check check (source_kind in ('record', 'task'));
-- A step's files go with it; the files policies and owner check are as 0019 left them.
delete from files where onboarding_step_id is not null;
alter policy files_select on files using (
  org_id = app_org() and coalesce((select true from tasks t where t.id = files.task_id), (select true from records r where r.id = files.record_id), false));
alter policy files_insert on files with check (
  org_id = app_org() and app_can_write()
  and coalesce((select true from tasks t where t.id = files.task_id), (select true from records r where r.id = files.record_id), false));
alter table files drop constraint files_owner_check;
alter table files add constraint files_owner_check check (num_nonnulls(task_id, record_id) = 1);
alter table files drop column onboarding_step_id;
drop function if exists portal_onboarding_act(text, uuid, jsonb);
drop function if exists portal_onboarding();
drop function if exists app_keeps_onboarding_templates();
drop table if exists onboarding_metrics;
drop table if exists onboarding_fields;
drop table if exists onboarding_issues;
drop table if exists onboarding_goals;
drop table if exists onboarding_steps;
drop table if exists onboarding_sites;
drop table if exists onboarding_people;
drop table if exists onboarding_plans;
drop table if exists onboarding_templates;
drop function if exists app_sees_plan(uuid);
