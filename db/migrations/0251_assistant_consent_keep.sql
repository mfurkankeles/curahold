-- Erasing a customer's portal person (lib/erasure.ts) deleted their answers to the assistant's notice along with
-- them (0243 cascaded), so the proof that the assistant was used with consent went too. A team member's erasure keeps
-- those rows, attached to the anonymised person; a portal person is deleted, so their rows now stay without anyone
-- attached: portal_user_id is set to null instead, which leaves version, language, answer and time — no identity.
-- The nightly purge removes them after the consent period like any answer no longer in force (lib/retention.ts).
do $$
declare c text;
begin
  select conname into c from pg_constraint where conrelid = 'assistant_consents'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%num_nonnulls%';
  if c is not null then execute format('alter table assistant_consents drop constraint %I', c); end if;
  select conname into c from pg_constraint where conrelid = 'assistant_consents'::regclass and contype = 'f' and pg_get_constraintdef(oid) like '%portal_users%';
  if c is not null then execute format('alter table assistant_consents drop constraint %I', c); end if;
end $$;
alter table assistant_consents
  -- One person at most; none only for an erased portal person (an app answer always names its team member).
  add constraint assistant_consents_one_person check (num_nonnulls(user_id, portal_user_id) <= 1),
  add constraint assistant_consents_portal_fk foreign key (org_id, portal_user_id) references portal_users (org_id, id) on delete set null (portal_user_id);
