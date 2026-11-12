-- Rhythm: targets, business reviews, and nudges for work that has gone still.
--
-- Nothing here needs a new table. Targets, the default review rhythm and the
-- nudge thresholds are company settings (orgs.settings->'rhythm'); a review is
-- an activity like a call or a meeting; a customer may have its own rhythm.

-- A business review is something that happened with a customer.
alter table activities drop constraint activities_kind_check;
alter table activities add constraint activities_kind_check check (kind in ('note', 'call', 'meeting', 'email', 'review'));

-- Days between reviews for this customer. Null: the company's rhythm. 0: none.
alter table accounts add column review_days int check (review_days is null or review_days between 0 and 730);

create index activities_review_idx on activities (org_id, account_id, happened_at desc) where kind = 'review';

-- Targets and rhythm are tuned by whoever manages customers, without the
-- rest of the company settings.
create function app_set_rhythm(p_rhythm jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (app_has_perm('accounts.manage') or app_has_perm('org.manage')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update orgs set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('rhythm', p_rhythm) where id = app_org();
end $$;
grant execute on function app_set_rhythm(jsonb) to tendwell_app;
