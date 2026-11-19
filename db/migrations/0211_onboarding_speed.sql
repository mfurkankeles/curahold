-- Onboarding at portfolio size: row security worked out once per query instead
-- of once per row, and the two indexes the plans' own signals were missing.
--
-- 0200 checked every step, goal, issue, person, field, site and metric row with
-- app_sees_plan(plan_id), and every plan with app_sees_account(account_id). Both
-- are SECURITY DEFINER functions, which Postgres cannot fold into the query, so
-- each row paid a lookup of its own: the portfolio (400 plans, 5,200 steps) took
-- 1.8–2.3 s to read its steps. The same rule written as "the plan is one this
-- person may read" (a subquery under the plans' own row security, and the plans'
-- under the customers') is evaluated once per query and hashed: 1.5 s → 8 ms.
-- Who sees what is unchanged: the plans a person may read are exactly those
-- whose customer they may read (or the company's own plan), as before.
-- app_sees_plan stays for the files policy (one onboarding file at a time).
--
-- Indexes: a customer plan moves on from what is known about its customer
-- (lib/onboarding.ts customerFacts): "a ticket of theirs exists" read every
-- record of the company (records_account_idx leaves archived ones out), and "a
-- request from their portal" every task (no index on portal_author_id). The
-- hourly sweep asks both for every running plan: 40–75 ms each, 17 s for 400.
-- Undo: db/rollback/0211_onboarding_speed.sql.

alter policy onboarding_plans_select on onboarding_plans
  using (org_id = app_org() and (account_id is null or account_id in (select a.id from accounts a)));
alter policy onboarding_plans_write on onboarding_plans
  using (org_id = app_org() and (select app_can_write())
         and ((account_id is null and (select app_has_perm('org.manage'))) or (account_id is not null and account_id in (select a.id from accounts a))))
  with check (org_id = app_org() and (select app_can_write())
         and ((account_id is null and (select app_has_perm('org.manage'))) or (account_id is not null and account_id in (select a.id from accounts a))));

alter policy onboarding_people_select on onboarding_people using (org_id = app_org() and plan_id in (select p.id from onboarding_plans p));
alter policy onboarding_people_write on onboarding_people
  using (org_id = app_org() and (select app_can_write()) and plan_id in (select p.id from onboarding_plans p))
  with check (org_id = app_org() and (select app_can_write()) and plan_id in (select p.id from onboarding_plans p));

alter policy onboarding_sites_select on onboarding_sites using (org_id = app_org() and plan_id in (select p.id from onboarding_plans p));
alter policy onboarding_sites_write on onboarding_sites
  using (org_id = app_org() and (select app_can_write()) and plan_id in (select p.id from onboarding_plans p))
  with check (org_id = app_org() and (select app_can_write()) and plan_id in (select p.id from onboarding_plans p));

alter policy onboarding_steps_select on onboarding_steps using (org_id = app_org() and plan_id in (select p.id from onboarding_plans p));
alter policy onboarding_steps_write on onboarding_steps
  using (org_id = app_org() and (select app_can_write()) and plan_id in (select p.id from onboarding_plans p))
  with check (org_id = app_org() and (select app_can_write()) and plan_id in (select p.id from onboarding_plans p));

alter policy onboarding_goals_select on onboarding_goals using (org_id = app_org() and plan_id in (select p.id from onboarding_plans p));
alter policy onboarding_goals_write on onboarding_goals
  using (org_id = app_org() and (select app_can_write()) and plan_id in (select p.id from onboarding_plans p))
  with check (org_id = app_org() and (select app_can_write()) and plan_id in (select p.id from onboarding_plans p));

alter policy onboarding_issues_select on onboarding_issues using (org_id = app_org() and plan_id in (select p.id from onboarding_plans p));
alter policy onboarding_issues_write on onboarding_issues
  using (org_id = app_org() and (select app_can_write()) and plan_id in (select p.id from onboarding_plans p))
  with check (org_id = app_org() and (select app_can_write()) and plan_id in (select p.id from onboarding_plans p));

alter policy onboarding_fields_select on onboarding_fields using (org_id = app_org() and plan_id in (select p.id from onboarding_plans p));
alter policy onboarding_fields_write on onboarding_fields
  using (org_id = app_org() and (select app_can_write()) and plan_id in (select p.id from onboarding_plans p))
  with check (org_id = app_org() and (select app_can_write()) and plan_id in (select p.id from onboarding_plans p));

alter policy onboarding_metrics_select on onboarding_metrics using (org_id = app_org() and plan_id in (select p.id from onboarding_plans p));
alter policy onboarding_metrics_write on onboarding_metrics
  using (org_id = app_org() and (select app_can_write()) and plan_id in (select p.id from onboarding_plans p))
  with check (org_id = app_org() and (select app_can_write()) and plan_id in (select p.id from onboarding_plans p));

create index records_account_any_idx on records (account_id) where account_id is not null;
create index tasks_portal_author_idx on tasks (portal_author_id) where portal_author_id is not null;
