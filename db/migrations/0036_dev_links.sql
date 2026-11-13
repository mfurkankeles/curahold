-- Developer tools: Jira sprints in the sync, and commits, branches and pull
-- requests (GitHub, GitLab) linked to tasks.
--
-- 1. Sprints take part in the two-way sync like accounts, records and tasks:
--    sync_links / sync_changes may now name an entity of kind 'sprint', and a
--    sprint is forgotten by the sync when it is deleted. Changes made in the
--    app to a task's project fields (issue type, story points, epic, sprint) or
--    to a sprint are queued for the connections that hold them by a trigger, so
--    the routes that make them (pm.ts) need no knowledge of the sync. The sync
--    itself writes as the owner, never as curahold_app, and so does not echo.
-- 2. dev_links: a branch, pull request or commit that names a task. Written by
--    the webhook receiver (no signed-in person) through the definer functions
--    below, which only ever touch the request's own company; read by whoever
--    can see the task.
-- 3. dev_hooks: which hosts a company has switched on, with the salt their
--    webhook secret is derived from (the secret itself is never stored).

-- ------------------------------------------------------------ sprints in sync

alter table sync_links drop constraint sync_links_entity_check;
alter table sync_links add constraint sync_links_entity_check check (entity in ('account', 'record', 'task', 'sprint'));
alter table sync_changes drop constraint sync_changes_entity_check;
alter table sync_changes add constraint sync_changes_entity_check check (entity in ('account', 'record', 'task', 'sprint'));

create trigger sprints_sync_forget after delete on sprints for each row execute function sync_links_forget('sprint');

-- Queues what changed for every active, started, writable connection that holds the item.
create function pm_queue_sync() returns trigger
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
  select new.org_id, l.connection_id, v_kind, new.id, v_keys
    from sync_links l join connections c on c.id = l.connection_id
   where l.org_id = new.org_id and l.entity = v_kind and l.entity_id = new.id and not l.ignored
     and c.status = 'active' and c.kind = 'source' and c.config->'sync'->>'startedAt' is not null
     and c.provider not in ('jsm', 'bigquery')
  on conflict (connection_id, entity, entity_id) do update set
    fields = case when sync_changes.fields is null then null else array(select distinct unnest(sync_changes.fields || excluded.fields)) end,
    changed_at = now(), next_at = now(), attempts = 0, last_error = null;
  return new;
end
$$;

create trigger tasks_pm_sync after update on tasks for each row
  when (old.issue_type is distinct from new.issue_type or old.story_points is distinct from new.story_points
        or old.epic_id is distinct from new.epic_id or old.sprint_id is distinct from new.sprint_id)
  execute function pm_queue_sync('task');

create trigger sprints_pm_sync after update on sprints for each row
  when (old.name is distinct from new.name or old.goal is distinct from new.goal or old.state is distinct from new.state
        or old.starts_on is distinct from new.starts_on or old.ends_on is distinct from new.ends_on)
  execute function pm_queue_sync('sprint');

-- A sprint made here goes to every connection set up to create sprints on its board.
create function pm_queue_sprint_created() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user <> 'curahold_app' then
    return new;
  end if;
  insert into sync_changes (org_id, connection_id, entity, entity_id, fields)
  select new.org_id, c.id, 'sprint', new.id, null
    from connections c
   where c.org_id = new.org_id and c.status = 'active' and c.kind = 'source' and c.config->'sync'->>'startedAt' is not null
     and c.provider not in ('jsm', 'bigquery')
     and exists (select 1 from jsonb_array_elements(coalesce(c.config->'sync'->'objects', '[]'::jsonb)) o
                  where o->>'target' = 'sprint' and (o->>'enabled')::boolean and (o->>'create')::boolean and o->>'boardId' = new.board_id::text)
  on conflict (connection_id, entity, entity_id) do nothing;
  return new;
end
$$;

create trigger sprints_pm_created after insert on sprints for each row execute function pm_queue_sprint_created();

-- ---------------------------------------------------------------- dev_hooks

create table dev_hooks (
  org_id      uuid not null references orgs(id) on delete cascade,
  provider    text not null check (provider in ('github', 'gitlab')),
  -- The webhook secret is HMAC(server secret, company | host | salt): shown to the administrator, never stored.
  -- Rotating the secret is a new salt.
  salt        text not null check (length(salt) between 16 and 100),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  primary key (org_id, provider),
  foreign key (org_id, created_by) references users (org_id, id) on delete set null (created_by)
);

alter table dev_hooks enable row level security;
-- The receiver reads the salt before anyone is signed in; the salt alone opens nothing.
create policy dev_hooks_select on dev_hooks for select using (org_id = app_org());
create policy dev_hooks_insert on dev_hooks for insert with check (org_id = app_org() and app_has_perm('connections.manage'));
create policy dev_hooks_update on dev_hooks for update
  using (org_id = app_org() and app_has_perm('connections.manage'))
  with check (org_id = app_org() and app_has_perm('connections.manage'));
create policy dev_hooks_delete on dev_hooks for delete using (org_id = app_org() and app_has_perm('connections.manage'));
grant select, insert, update, delete on dev_hooks to curahold_app;

-- ---------------------------------------------------------------- dev_links

create table dev_links (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  task_id     uuid not null,
  provider    text not null check (provider in ('github', 'gitlab')),
  kind        text not null check (kind in ('branch', 'pr', 'commit')),
  -- "acme/web" (GitHub) or "group/sub/project" (GitLab)
  repo        text not null check (length(repo) between 1 and 300),
  -- The branch name, the pull / merge request number, or the commit sha.
  ref         text not null check (length(ref) between 1 and 300),
  title       text not null default '' check (length(title) <= 500),
  url         text check (url is null or (length(url) <= 1000 and url ~ '^https?://')),
  author      text check (author is null or length(author) <= 200),
  -- A branch is open until it is deleted; a pull request is open, merged or closed; a commit has no state.
  state       text check (state in ('open', 'merged', 'closed')),
  -- The latest checks (GitHub check suites / statuses, GitLab pipelines) on head_sha.
  checks      text not null default 'none' check (checks in ('none', 'pending', 'passing', 'failing')),
  head_sha    text check (head_sha is null or length(head_sha) <= 64),
  opened_at   timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  merged_at   timestamptz,
  closed_at   timestamptz,
  unique (org_id, task_id, provider, repo, kind, ref),
  foreign key (org_id, task_id) references tasks (org_id, id) on delete cascade
);
create index dev_links_task_idx on dev_links (org_id, task_id);
create index dev_links_sha_idx on dev_links (org_id, provider, repo, head_sha) where head_sha is not null;

alter table dev_links enable row level security;
-- Whoever can see the task sees what is linked to it (the tasks policy inside the subquery is the board rule).
create policy dev_links_select on dev_links for select
  using (org_id = app_org() and exists (select 1 from tasks t where t.id = task_id));
-- Unlinking by hand. Links are only ever made by the receiver, through dev_link_apply below.
create policy dev_links_delete on dev_links for delete
  using (org_id = app_org() and (select app_can_write()) and exists (select 1 from tasks t where t.id = task_id));
grant select, delete on dev_links to curahold_app;

-- ------------------------------------------------- functions for the receiver

-- Task ids named in branch names, titles and messages ("CURA-1a2b3c4d", or a whole id): the first 8 to 32 hex digits
-- of an id, matched as a prefix, and only when exactly one task of this company starts that way.
create function dev_resolve_tasks(p_refs text[]) returns table (ref text, task_id uuid)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  r text;
  hex text;
  hits uuid[];
begin
  if app_org() is null then
    return;
  end if;
  foreach r in array p_refs loop
    hex := lower(replace(r, '-', ''));
    continue when hex !~ '^[0-9a-f]{8,32}$';
    select array_agg(x.id) into hits from (
      select t.id from tasks t
       where t.org_id = app_org() and t.archived_at is null
         and t.id between rpad(hex, 32, '0')::uuid and rpad(hex, 32, 'f')::uuid
       limit 2
    ) x;
    if hits is not null and cardinality(hits) = 1 then
      ref := r;
      task_id := hits[1];
      return next;
    end if;
  end loop;
end
$$;

-- Records branches, pull requests and commits against tasks of this company. `p_events` is an array of
-- {task_id, provider, kind, repo, ref, title, url, author, state, head_sha, checks}. A merged pull request stays
-- merged; a new head commit starts its checks afresh. Returns how many links were written.
create function dev_link_apply(p_events jsonb) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e jsonb;
  n integer := 0;
begin
  if app_org() is null or jsonb_typeof(p_events) <> 'array' then
    return 0;
  end if;
  for e in select * from jsonb_array_elements(p_events) loop
    insert into dev_links (org_id, task_id, provider, kind, repo, ref, title, url, author, state, head_sha, checks, merged_at, closed_at)
    select app_org(), t.id, e->>'provider', e->>'kind', left(e->>'repo', 300), left(e->>'ref', 300), left(coalesce(e->>'title', ''), 500),
           nullif(e->>'url', ''), left(nullif(e->>'author', ''), 200), nullif(e->>'state', ''), left(nullif(e->>'head_sha', ''), 64),
           coalesce(nullif(e->>'checks', ''), 'none'),
           case when e->>'state' = 'merged' then now() end, case when e->>'state' in ('merged', 'closed') then now() end
      from tasks t where t.id = (e->>'task_id')::uuid and t.org_id = app_org()
    on conflict (org_id, task_id, provider, repo, kind, ref) do update set
      title = coalesce(nullif(excluded.title, ''), dev_links.title),
      url = coalesce(excluded.url, dev_links.url),
      author = coalesce(excluded.author, dev_links.author),
      state = case when dev_links.state = 'merged' then 'merged' else coalesce(excluded.state, dev_links.state) end,
      checks = case when excluded.head_sha is not null and excluded.head_sha is distinct from dev_links.head_sha and excluded.checks = 'none' then 'none'
                    when excluded.checks = 'none' then dev_links.checks else excluded.checks end,
      head_sha = coalesce(excluded.head_sha, dev_links.head_sha),
      merged_at = case when excluded.state = 'merged' then coalesce(dev_links.merged_at, now()) else dev_links.merged_at end,
      closed_at = case when excluded.state in ('merged', 'closed') then coalesce(dev_links.closed_at, now()) when excluded.state = 'open' then null else dev_links.closed_at end,
      updated_at = now();
    n := n + 1;
  end loop;
  return n;
end
$$;

-- A check suite, status or pipeline finished for a commit: every link of this company at that commit follows.
create function dev_link_checks(p_provider text, p_repo text, p_sha text, p_checks text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n integer;
begin
  if app_org() is null or p_checks not in ('none', 'pending', 'passing', 'failing') then
    return 0;
  end if;
  update dev_links set checks = p_checks, updated_at = now()
   where org_id = app_org() and provider = p_provider and repo = p_repo and (head_sha = p_sha or (kind = 'commit' and ref = p_sha));
  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function dev_resolve_tasks(text[]), dev_link_apply(jsonb), dev_link_checks(text, text, text, text) from public;
grant execute on function dev_resolve_tasks(text[]), dev_link_apply(jsonb), dev_link_checks(text, text, text, text) to curahold_app;
