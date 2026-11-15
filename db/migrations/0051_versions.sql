-- Customers (accounts) and records get a version, like tasks, so two people
-- editing the same one at once are told instead of the second silently
-- replacing the first.
--
-- version          goes up by one with every change that touches a tracked column or a field;
-- field_versions   says, per column and per field ("f:<key>"), the version that last changed it.
--
-- A trigger keeps both, so every writer counts: the API, CRM sync, imports,
-- automations, the health score writing back, the trash putting a row back.
-- A save that names the version it started from (baseVersion) is refused only
-- when a column or field it changes was changed by someone else since; edits
-- to different fields merge (api/src/lib/versions.ts).
alter table accounts add column version int not null default 1,
                     add column field_versions jsonb not null default '{}'::jsonb;
alter table records  add column version int not null default 1,
                     add column field_versions jsonb not null default '{}'::jsonb;

create function stamp_versions() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v int := old.version + 1;
  fv jsonb := coalesce(old.field_versions, '{}'::jsonb);
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  col text;
  k text;
  changed boolean := false;
begin
  foreach col in array tg_argv loop
    if (o -> col) is distinct from (n -> col) then
      fv := fv || jsonb_build_object(col, v);
      changed := true;
    end if;
  end loop;
  for k in select jsonb_object_keys(coalesce(old.fields, '{}'::jsonb) || coalesce(new.fields, '{}'::jsonb)) loop
    if (old.fields -> k) is distinct from (new.fields -> k) then
      fv := fv || jsonb_build_object('f:' || k, v);
      changed := true;
    end if;
  end loop;
  if changed then
    new.version := v;
    new.field_versions := fv;
  else
    -- Nothing tracked changed (a touch of updated_at): the version stays, whatever the writer sent.
    new.version := old.version;
    new.field_versions := old.field_versions;
  end if;
  return new;
end $$;

create trigger accounts_version before update on accounts
  for each row execute function stamp_versions('name', 'owner_id', 'team_id', 'archived_at', 'review_days', 'currency');
create trigger records_version before update on records
  for each row execute function stamp_versions('name', 'owner_id', 'account_id', 'parent_id', 'archived_at', 'currency', 'type_id');
