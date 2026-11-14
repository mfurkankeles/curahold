-- A PM field edit (sprint, epic, issue type, story points; a sprint's own
-- fields) on a task or sprint that is still waiting for its first sync must be
-- recorded, not only one that already has a sync link. pm_queue_sync looked at
-- sync_links alone, so a brand-new task put in a sprint in the same burst its
-- create was going out could lose the sprint: the create raced ahead and went
-- out before the sprint was set, and the trigger queued no correction because
-- no link existed yet. Also cover a connection that merely has the item's
-- create still queued — the edit then merges into that queued create, which
-- bumps changed_at (the push's delete guards on it, so an in-flight create no
-- longer clears the refreshed row) and the edit rides out on the next run.
create or replace function pm_queue_sync() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_keys text[] := '{}';
  v_kind text := tg_argv[0];
begin
  -- Only changes made by people (the request role); what the sync itself writes is not sent back.
  if current_user <> 'curahold_app' then
    return new;
  end if;
  if v_kind = 'task' then
    if new.issue_type is distinct from old.issue_type then v_keys := array_append(v_keys, 'issue_type'::text); end if;
    if new.story_points is distinct from old.story_points then v_keys := array_append(v_keys, 'story_points'::text); end if;
    if new.epic_id is distinct from old.epic_id then v_keys := array_append(v_keys, 'epic'::text); end if;
    if new.sprint_id is distinct from old.sprint_id then v_keys := array_append(v_keys, 'sprint'::text); end if;
  else
    if new.name is distinct from old.name then v_keys := array_append(v_keys, 'name'::text); end if;
    if new.goal is distinct from old.goal then v_keys := array_append(v_keys, 'goal'::text); end if;
    if new.state is distinct from old.state then v_keys := array_append(v_keys, 'state'::text); end if;
    if new.starts_on is distinct from old.starts_on then v_keys := array_append(v_keys, 'starts_on'::text); end if;
    if new.ends_on is distinct from old.ends_on then v_keys := array_append(v_keys, 'ends_on'::text); end if;
  end if;
  if cardinality(v_keys) = 0 then
    return new;
  end if;
  insert into sync_changes (org_id, connection_id, entity, entity_id, fields)
  select new.org_id, c.id, v_kind, new.id, v_keys
    from connections c
   where c.org_id = new.org_id and c.status = 'active' and c.kind = 'source'
     and c.config->'sync'->>'startedAt' is not null and c.provider not in ('jsm', 'bigquery')
     and (
       exists (select 1 from sync_links l where l.connection_id = c.id and l.entity = v_kind and l.entity_id = new.id and not l.ignored)
       or exists (select 1 from sync_changes s where s.connection_id = c.id and s.entity = v_kind and s.entity_id = new.id)
     )
  on conflict (connection_id, entity, entity_id) do update set
    fields = case when sync_changes.fields is null then null else array(select distinct unnest(sync_changes.fields || excluded.fields)) end,
    changed_at = now(), next_at = now(), attempts = 0, last_error = null;
  return new;
end
$$;
