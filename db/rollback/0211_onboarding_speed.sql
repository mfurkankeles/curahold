-- Undo 0211_onboarding_speed.sql: back to the per-row visibility functions of 0200.
-- Not a migration (the runner never reads this folder). Run it by hand, as the
-- owner, in one transaction:  psql "$DATABASE_URL" -1 -f db/rollback/0211_onboarding_speed.sql
alter policy onboarding_plans_select on onboarding_plans
  using (org_id = app_org() and (account_id is null or app_sees_account(account_id)));
alter policy onboarding_plans_write on onboarding_plans
  using (org_id = app_org() and (select app_can_write())
         and ((account_id is null and (select app_has_perm('org.manage'))) or (account_id is not null and app_sees_account(account_id))))
  with check (org_id = app_org() and (select app_can_write())
         and ((account_id is null and (select app_has_perm('org.manage'))) or (account_id is not null and app_sees_account(account_id))));

alter policy onboarding_people_select on onboarding_people using (org_id = app_org() and app_sees_plan(plan_id));
alter policy onboarding_people_write on onboarding_people
  using (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id))
  with check (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id));

alter policy onboarding_sites_select on onboarding_sites using (org_id = app_org() and app_sees_plan(plan_id));
alter policy onboarding_sites_write on onboarding_sites
  using (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id))
  with check (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id));

alter policy onboarding_steps_select on onboarding_steps using (org_id = app_org() and app_sees_plan(plan_id));
alter policy onboarding_steps_write on onboarding_steps
  using (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id))
  with check (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id));

alter policy onboarding_goals_select on onboarding_goals using (org_id = app_org() and app_sees_plan(plan_id));
alter policy onboarding_goals_write on onboarding_goals
  using (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id))
  with check (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id));

alter policy onboarding_issues_select on onboarding_issues using (org_id = app_org() and app_sees_plan(plan_id));
alter policy onboarding_issues_write on onboarding_issues
  using (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id))
  with check (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id));

alter policy onboarding_fields_select on onboarding_fields using (org_id = app_org() and app_sees_plan(plan_id));
alter policy onboarding_fields_write on onboarding_fields
  using (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id))
  with check (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id));

alter policy onboarding_metrics_select on onboarding_metrics using (org_id = app_org() and app_sees_plan(plan_id));
alter policy onboarding_metrics_write on onboarding_metrics
  using (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id))
  with check (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id));

drop index if exists records_account_any_idx;
drop index if exists tasks_portal_author_idx;
