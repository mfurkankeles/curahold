-- Whose question a portal conversation was. The assistant's log (0096) knew the signed-in team member
-- (user_id) but not the customer who asked from the portal, so a portal person's questions could not be
-- found for their access request, nor removed with them. portal_user_id names them, with the paired
-- foreign key every company table uses (org_id, id): deleting the portal person removes their questions.
-- Additive; existing rows stay without a person (they were kept anonymous until now).
alter table assistant_log add column portal_user_id uuid;
alter table assistant_log
  add constraint assistant_log_portal_user_fk foreign key (org_id, portal_user_id) references portal_users (org_id, id) on delete cascade;
create index assistant_log_portal_idx on assistant_log (org_id, portal_user_id, created_at) where portal_user_id is not null;
