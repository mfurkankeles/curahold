-- The free trial is three months (was 14 days). New companies get the longer
-- default; existing companies keep whatever trial end they already have.
alter table orgs alter column trial_ends_at set default now() + interval '3 months';
