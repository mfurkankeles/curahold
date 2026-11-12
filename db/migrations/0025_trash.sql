-- The trash: what is deleted stays for 30 days and can be put back.
--
-- Deleting a customer, a record, a task, a timeline entry, a page, a saved report or an
-- automation still removes its rows, as before: every list, count, report, search and sync
-- goes on reading live rows only, and nothing has to remember to leave deleted ones out.
-- Just before the delete, a copy is kept here of every row about to go: the thing itself,
-- everything the database removes with it (comments, files, time, the records under a
-- customer and so on), and the links other rows held to it (a customer's tasks stay, but
-- stop pointing at it). Putting it back writes those rows again under their own ids and
-- ties the links again.
--
-- Which rows go with a thing is read from the foreign keys themselves, so a table added
-- later is covered without a change here. A later migration that renames or drops a
-- column should think of the copies: a copy made before it is put back by column name.
--
-- The copies are read and written only by the functions below. No role of the app can read
-- trash_rows or trash_links: a copy may hold more than the person looking at the list may see.

create table trash (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  kind        text not null check (kind in ('account', 'record', 'task', 'activity', 'page', 'report', 'automation')),
  -- What was deleted: one thing as a rule; undoing an import removes many at once.
  root_ids    uuid[] not null default '{}',
  label       text not null,
  -- Small things for the list (which board, which customer) and how many rows of each table went along.
  detail      jsonb not null default '{}'::jsonb,
  row_count   int not null default 0,
  deleted_by  uuid,
  deleted_at  timestamptz not null default now(),
  purge_at    timestamptz not null default now() + interval '30 days',
  foreign key (org_id, deleted_by) references users (org_id, id) on delete set null (deleted_by)
);
create index trash_org_idx on trash (org_id, deleted_at desc);
create index trash_purge_idx on trash (purge_at);

-- One row of the copy. "key" is the row's primary key written out; "lvl" is how far it hangs
-- below the deleted thing (0 is the thing itself).
create table trash_rows (
  trash_id  uuid not null references trash(id) on delete cascade,
  tbl       text not null,
  key       text not null,
  lvl       int not null,
  data     jsonb not null,
  primary key (trash_id, tbl, key)
);

-- A link another row held to something in the copy, which the delete cleared: which row
-- ("key" holds its key columns), which column, and what it pointed at.
create table trash_links (
  trash_id  uuid not null references trash(id) on delete cascade,
  tbl       text not null,
  key       jsonb not null,
  col       text not null,
  val       text not null
);
create index trash_links_idx on trash_links (trash_id);

alter table trash enable row level security;
alter table trash_rows enable row level security;
alter table trash_links enable row level security;
-- A person sees what they deleted themselves; whoever runs the company or looks after
-- privacy sees all of it. Nothing is written here except through the functions below.
create policy trash_select on trash for select
  using (org_id = app_org() and (deleted_by = app_user() or app_has_perm('org.manage') or app_has_perm('privacy.manage')));
grant select on trash to curahold_app;

-- ------------------------------------------------------------- reading the schema

create function app_trash_table(p_kind text) returns text
language sql immutable as $$
  select case p_kind
    when 'account' then 'accounts' when 'record' then 'records' when 'task' then 'tasks'
    when 'activity' then 'activities' when 'page' then 'pages' when 'report' then 'reports'
    when 'automation' then 'automations' end
$$;

-- The columns of a table's primary key, in order.
create function app_trash_pk(p_tbl text) returns text[]
language sql stable set search_path = public, pg_catalog as $$
  select array_agg(a.attname::text order by k.ord)
    from pg_index i
    cross join lateral unnest(i.indkey) with ordinality k(n, ord)
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.n
   where i.indrelid = ('public.' || quote_ident(p_tbl))::regclass and i.indisprimary
$$;

-- The primary key of a row written out as one text, as an expression over the alias given.
create function app_trash_keyexpr(p_tbl text, p_alias text) returns text
language sql stable set search_path = public, pg_catalog as $$
  select 'concat_ws(''|'', ' || string_agg(format('%I.%I::text', p_alias, k.c), ', ' order by k.ord) || ')'
    from unnest(app_trash_pk(p_tbl)) with ordinality k(c, ord)
$$;

-- Every foreign key between the app's tables, as "child.ccol points at parent.pcol". The
-- company column that travels with most keys is left out: it is the same on both sides.
-- rule: c = the child row goes with its parent, n = the link is cleared, a / r = the parent
-- cannot be deleted while the child is there.
create function app_trash_fks()
returns table (child text, parent text, ccol text, pcol text, ctype text, rule text, nullable boolean, parent_has_org boolean)
language sql stable set search_path = public, pg_catalog as $$
  select cc.relname::text, pc.relname::text, ca.attname::text, pa.attname::text,
         format_type(ca.atttypid, ca.atttypmod), con.confdeltype::text, not ca.attnotnull,
         exists (select 1 from pg_attribute o where o.attrelid = pc.oid and o.attname = 'org_id' and not o.attisdropped)
    from pg_constraint con
    join pg_class cc on cc.oid = con.conrelid
    join pg_class pc on pc.oid = con.confrelid
    cross join lateral unnest(con.conkey, con.confkey) as pair(c, p)
    join pg_attribute ca on ca.attrelid = con.conrelid and ca.attnum = pair.c
    join pg_attribute pa on pa.attrelid = con.confrelid and pa.attnum = pair.p
   where con.contype = 'f' and cc.relnamespace = 'public'::regnamespace and ca.attname <> 'org_id'
$$;

-- ------------------------------------------------------------------- keeping a copy

-- Call just before deleting, in the same transaction. Returns the id of the copy, or null
-- when none of the ids is there. The rows copied are locked until the transaction ends, so
-- nothing can be added under them between the copy and the delete.
create function app_trash_put(p_kind text, p_ids uuid[], p_label text, p_detail jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org   uuid := app_org();
  v_root  text := app_trash_table(p_kind);
  -- Not copied: notices already sent, and a customer's sign-ins (they sign in again).
  v_skip  text[] := array['notifications', 'portal_sessions', 'portal_tokens'];
  v_id    uuid;
  v_lvl   int := 0;
  v_new   int;
  v_n     int;
  fk      record;
begin
  if v_org is null or v_root is null or not app_can_write() then
    raise exception 'trash_forbidden' using errcode = 'TR403';
  end if;
  insert into trash (org_id, kind, label, detail, deleted_by)
  values (v_org, p_kind, left(coalesce(nullif(btrim(p_label), ''), '-'), 300), coalesce(p_detail, '{}'::jsonb), app_user())
  returning id into v_id;

  -- The things themselves.
  execute format(
    'insert into trash_rows (trash_id, tbl, key, lvl, data)
     (select $1, %L, %s, 0, to_jsonb(r) from %I r where r.org_id = $2 and r.id = any($3) for update of r)',
    v_root, app_trash_keyexpr(v_root, 'r'), v_root)
    using v_id, v_org, p_ids;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    delete from trash where id = v_id;
    return null;
  end if;

  -- Everything the database deletes with them, level by level.
  loop
    v_new := 0;
    for fk in
      select f.* from app_trash_fks() f
       where f.rule = 'c' and f.child <> all (v_skip)
         and f.parent in (select distinct t.tbl from trash_rows t where t.trash_id = v_id and t.lvl = v_lvl)
    loop
      execute format(
        'insert into trash_rows (trash_id, tbl, key, lvl, data)
         (select $1, %L, %s, $2 + 1, to_jsonb(c) from %I c
           where c.org_id = $3
             and c.%I in (select (p.data->>%L)::%s from trash_rows p where p.trash_id = $1 and p.tbl = %L and p.lvl = $2)
             for update of c)
         on conflict do nothing',
        fk.child, app_trash_keyexpr(fk.child, 'c'), fk.child, fk.ccol, fk.pcol, fk.ctype, fk.parent)
        using v_id, v_lvl, v_org;
      get diagnostics v_n = row_count;
      v_new := v_new + v_n;
    end loop;
    exit when v_new = 0;
    v_lvl := v_lvl + 1;
    if v_lvl > 30 then
      raise exception 'trash: nested too deep';
    end if;
  end loop;

  -- Links the delete is about to clear on rows that stay.
  for fk in
    select f.* from app_trash_fks() f
     where f.rule = 'n' and f.parent in (select distinct t.tbl from trash_rows t where t.trash_id = v_id)
  loop
    execute format(
      'insert into trash_links (trash_id, tbl, key, col, val)
       select $1, %L, jsonb_build_object(''id'', c.id), %L, c.%I::text from %I c
        where c.org_id = $2
          and c.%I in (select (p.data->>%L)::%s from trash_rows p where p.trash_id = $1 and p.tbl = %L)
          and not exists (select 1 from trash_rows me where me.trash_id = $1 and me.tbl = %L and me.key = c.id::text)',
      fk.child, fk.ccol, fk.ccol, fk.child, fk.ccol, fk.pcol, fk.ctype, fk.parent, fk.child)
      using v_id, v_org;
  end loop;
  -- A task that loses its customer also stops being shared with that customer's portal.
  insert into trash_links (trash_id, tbl, key, col, val)
  select v_id, 'tasks', l.key, 'portal_shared', 'true'
    from trash_links l join tasks t on t.id = (l.key->>'id')::uuid
   where l.trash_id = v_id and l.tbl = 'tasks' and l.col = 'account_id' and t.portal_shared;
  -- The CRM rows these came from: left alone while the thing is deleted, followed again when it is back.
  insert into trash_links (trash_id, tbl, key, col, val)
  select v_id, 'sync_links', jsonb_build_object('connection_id', s.connection_id, 'object', s.object, 'remote_id', s.remote_id),
         'entity_id', s.entity_id::text
    from sync_links s
    join trash_rows r on r.trash_id = v_id and r.key = s.entity_id::text
                     and r.tbl = case s.entity when 'account' then 'accounts' when 'record' then 'records' else 'tasks' end
   where s.org_id = v_org and s.entity_id is not null;

  update trash t
     set root_ids = (select array_agg((r.data->>'id')::uuid) from trash_rows r where r.trash_id = v_id and r.lvl = 0),
         row_count = (select count(*) from trash_rows r where r.trash_id = v_id),
         detail = t.detail || jsonb_build_object(
           'parts', (select jsonb_object_agg(x.tbl, x.n) from (select r.tbl, count(*) as n from trash_rows r where r.trash_id = v_id group by r.tbl) x),
           'links', coalesce((select jsonb_object_agg(y.k, y.n)
                                from (select l.tbl || '.' || l.col as k, count(*) as n from trash_links l where l.trash_id = v_id group by 1) y), '{}'::jsonb))
   where t.id = v_id;
  return v_id;
end $$;

-- ------------------------------------------------------------------ putting it back

-- Writes the copy back and removes it from the trash. What happened to the rest of the
-- company in the meantime is respected the way the database itself would have: a row whose
-- parent has since gone for good is left out (and counted in "dropped"), a link to something
-- that has gone is cleared (listed in "unlinked"). When the thing itself cannot come back
-- (its customer or parent task is gone, or something else now holds its place) nothing
-- is changed and the error says why:
--   TR404 not there (or past its 30 days) · TR403 not yours to restore
--   TR424 its parent is missing: detail = {"table", "id", "label"}; label is set when the parent is in the trash too
--   TR409 something else holds its place: detail = {"table", "constraint"}
create function app_trash_restore(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org       uuid := app_org();
  t           trash%rowtype;
  v_root      text;
  v_n         int;
  v_keys      text[];
  v_changed   boolean;
  v_pass      int := 0;
  v_dropped   jsonb := '{}'::jsonb;
  v_unlinked  jsonb := '[]'::jsonb;
  v_accounts  jsonb;
  v_sql       text := '';
  v_sum       text := '0';
  v_cols      text;
  v_sel       text;
  v_i         int := 0;
  v_tbl       text;
  v_table     text;
  v_cons      text;
  v_missing   text;
  fk          record;
  g           record;
begin
  select * into t from trash where id = p_id and org_id = v_org and purge_at > now() for update;
  if not found then
    raise exception 'trash_not_found' using errcode = 'TR404';
  end if;
  if not app_can_write()
     or not (coalesce(t.deleted_by = app_user(), false) or app_has_perm('org.manage') or app_has_perm('privacy.manage')) then
    raise exception 'trash_forbidden' using errcode = 'TR403';
  end if;
  v_root := app_trash_table(t.kind);

  -- Already there (put back another way): the copy has nothing left to do.
  execute format('select count(*) from %I r where r.org_id = $1 and r.id = any($2)', v_root) into v_n using v_org, t.root_ids;
  if v_n = cardinality(t.root_ids) then
    delete from trash where id = p_id;
    return jsonb_build_object('kind', t.kind, 'ids', to_jsonb(t.root_ids), 'label', t.label, 'detail', t.detail, 'already', true,
                              'rows', 0, 'dropped', '{}'::jsonb, 'unlinked', '[]'::jsonb, 'accounts', '[]'::jsonb);
  end if;

  -- What the copy points at outside itself may have gone since. Apply the rule the foreign
  -- key would have applied had the row been alive; repeat until nothing more falls away.
  loop
    v_changed := false;
    v_pass := v_pass + 1;
    if v_pass > 30 then
      raise exception 'trash: too many passes';
    end if;
    for fk in
      select f.* from app_trash_fks() f
       where f.child in (select distinct r.tbl from trash_rows r where r.trash_id = p_id)
    loop
      execute format(
        'select array_agg(c.key) from trash_rows c
          where c.trash_id = $1 and c.tbl = %L and c.data->>%L is not null
            and not exists (select 1 from %I p where %s p.%I = (c.data->>%L)::%s)
            and not exists (select 1 from trash_rows q where q.trash_id = $1 and q.tbl = %L and q.data->>%L = c.data->>%L)',
        fk.child, fk.ccol, fk.parent, case when fk.parent_has_org then 'p.org_id = $2 and' else '$2 is not null and' end,
        fk.pcol, fk.ccol, fk.ctype, fk.parent, fk.pcol, fk.ccol)
        into v_keys using p_id, v_org;
      continue when v_keys is null;
      if fk.rule = 'n' or (fk.rule <> 'c' and fk.nullable) then
        update trash_rows set data = data || jsonb_build_object(fk.ccol, null)
         where trash_id = p_id and tbl = fk.child and key = any (v_keys);
        v_unlinked := v_unlinked || jsonb_build_object('table', fk.child, 'col', fk.ccol, 'parent', fk.parent, 'n', cardinality(v_keys));
      elsif exists (select 1 from trash_rows r where r.trash_id = p_id and r.tbl = fk.child and r.key = any (v_keys) and r.lvl = 0) then
        select r.data->>fk.ccol into v_missing from trash_rows r
         where r.trash_id = p_id and r.tbl = fk.child and r.key = any (v_keys) and r.lvl = 0 limit 1;
        raise exception 'trash_parent_missing' using errcode = 'TR424', detail = jsonb_build_object(
          'table', fk.parent, 'id', v_missing,
          'label', (select x.label from trash x
                     where x.org_id = v_org and x.purge_at > now() and x.id <> p_id and v_missing = any (x.root_ids::text[]) limit 1))::text;
      else
        delete from trash_rows where trash_id = p_id and tbl = fk.child and key = any (v_keys);
        v_dropped := v_dropped || jsonb_build_object(fk.child, coalesce((v_dropped->>fk.child)::int, 0) + cardinality(v_keys));
        v_changed := true;
      end if;
    end loop;
    exit when not v_changed;
  end loop;

  select coalesce(jsonb_agg(distinct x.a), '[]'::jsonb) into v_accounts
    from (select case when t.kind = 'account' then r.data->>'id' else r.data->>'account_id' end as a
            from trash_rows r where r.trash_id = p_id and r.lvl = 0) x
   where x.a is not null;

  -- Every table in one statement: foreign keys are checked when the statement ends, so the
  -- order of the tables (and rows that point at each other) does not matter. A row that is
  -- already there under the same key is left as it is. A column added since the copy was
  -- made takes its default; generated columns work themselves out.
  for v_tbl in select distinct r.tbl from trash_rows r where r.trash_id = p_id order by 1 loop
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum), string_agg('r.' || quote_ident(a.attname), ', ' order by a.attnum)
      into v_cols, v_sel
      from pg_attribute a
     where a.attrelid = ('public.' || quote_ident(v_tbl))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
       and (select s.data ? a.attname::text from trash_rows s where s.trash_id = p_id and s.tbl = v_tbl limit 1);
    v_i := v_i + 1;
    v_sql := v_sql || case when v_i > 1 then ', ' else '' end || format(
      'i%s as (insert into %I (%s) select %s from trash_rows s cross join lateral jsonb_populate_record(null::%I, s.data) r
                where s.trash_id = $1 and s.tbl = %L on conflict (%s) do nothing returning 1)',
      v_i, v_tbl, v_cols, v_sel, v_tbl, v_tbl,
      (select string_agg(quote_ident(k.c), ', ' order by k.ord) from unnest(app_trash_pk(v_tbl)) with ordinality k(c, ord)));
    v_sum := v_sum || format(' + (select count(*) from i%s)', v_i);
  end loop;

  -- Coming back is not news to send out: nobody was told it had gone.
  perform set_config('app.restoring', '1', true);
  begin
    execute 'with ' || v_sql || ' select ' || v_sum into v_n using p_id;
  exception when unique_violation then
    get stacked diagnostics v_table = table_name, v_cons = constraint_name;
    raise exception 'trash_conflict' using errcode = 'TR409', detail = jsonb_build_object('table', v_table, 'constraint', v_cons)::text;
  end;

  -- A task whose column was removed from its board meanwhile goes where that board's tasks went: the first column.
  if exists (select 1 from trash_rows r where r.trash_id = p_id and r.tbl = 'tasks') then
    update tasks k
       set status = (select b.columns->0->>'key' from boards b where b.id = k.board_id)
     where k.org_id = v_org
       and k.id in (select (r.data->>'id')::uuid from trash_rows r where r.trash_id = p_id and r.tbl = 'tasks')
       and not exists (select 1 from boards b, jsonb_array_elements(b.columns) col where b.id = k.board_id and col->>'key' = k.status);
  end if;

  -- Links other rows held: tied again where the row is still there and has not been pointed elsewhere since.
  for g in
    select l.tbl, l.col from trash_links l
     where l.trash_id = p_id and l.tbl <> 'sync_links' and l.col <> 'portal_shared' group by l.tbl, l.col
  loop
    select f.* into fk from app_trash_fks() f where f.child = g.tbl and f.ccol = g.col limit 1;
    continue when not found;
    execute format(
      'update %I c set %I = l.val::%s from trash_links l
        where l.trash_id = $1 and l.tbl = %L and l.col = %L and c.org_id = $2 and c.id = (l.key->>''id'')::uuid and c.%I is null
          and exists (select 1 from %I p where p.%I = l.val::%s)',
      g.tbl, g.col, fk.ctype, g.tbl, g.col, g.col, fk.parent, fk.pcol, fk.ctype)
      using p_id, v_org;
  end loop;
  update tasks k set portal_shared = true
    from trash_links l
   where l.trash_id = p_id and l.tbl = 'tasks' and l.col = 'portal_shared' and k.org_id = v_org and k.id = (l.key->>'id')::uuid
     and exists (select 1 from trash_links a
                  where a.trash_id = p_id and a.tbl = 'tasks' and a.col = 'account_id' and a.key = l.key and k.account_id = a.val::uuid);
  update sync_links s set entity_id = l.val::uuid, ignored = false
    from trash_links l
   where l.trash_id = p_id and l.tbl = 'sync_links' and s.org_id = v_org and s.entity_id is null
     and s.connection_id = (l.key->>'connection_id')::uuid and s.object = l.key->>'object' and s.remote_id = l.key->>'remote_id'
     and case s.entity when 'account' then exists (select 1 from accounts x where x.id = l.val::uuid)
                       when 'record' then exists (select 1 from records x where x.id = l.val::uuid)
                       else exists (select 1 from tasks x where x.id = l.val::uuid) end
     and not exists (select 1 from sync_links o where o.connection_id = s.connection_id and o.entity = s.entity and o.entity_id = l.val::uuid);
  perform set_config('app.restoring', '', true);

  delete from trash where id = p_id;
  return jsonb_build_object('kind', t.kind, 'ids', to_jsonb(t.root_ids), 'label', t.label, 'detail', t.detail, 'already', false,
                            'rows', v_n, 'dropped', v_dropped, 'unlinked', v_unlinked, 'accounts', v_accounts);
end $$;

-- Delete for good now, without waiting the 30 days: the copy is marked as due and the
-- clean-up (which also removes its files from storage) takes it from there.
create function app_trash_expire(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not (app_has_perm('org.manage') or app_has_perm('privacy.manage')) then
    raise exception 'trash_forbidden' using errcode = 'TR403';
  end if;
  update trash set purge_at = now() where id = p_id and org_id = app_org() and purge_at > now();
  return found;
end $$;

revoke all on function app_trash_table(text), app_trash_pk(text), app_trash_keyexpr(text, text), app_trash_fks(),
  app_trash_put(text, uuid[], text, jsonb), app_trash_restore(uuid), app_trash_expire(uuid) from public;
grant execute on function app_trash_put(text, uuid[], text, jsonb), app_trash_restore(uuid), app_trash_expire(uuid) to curahold_app;

-- A row written back by a restore is not a new row to announce.
create or replace function webhook_capture() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ev text;
begin
  if current_setting('app.restoring', true) = '1' then
    return new;
  end if;
  -- Nothing is written unless the company has a webhook that wants it.
  ev := tg_argv[0] || case when tg_op = 'INSERT' then '.created' else '.updated' end;
  if exists (select 1 from webhooks w where w.org_id = new.org_id and w.active and ev = any (w.events)) then
    -- Many changes to one thing within a minute are sent once.
    if not exists (select 1 from webhook_events e where e.org_id = new.org_id and e.entity_id = new.id and e.event = ev
                    and e.state = 'pending' and e.created_at > now() - interval '1 minute') then
      insert into webhook_events (org_id, event, entity_id) values (new.org_id, ev, new.id);
    end if;
  end if;
  return new;
end $$;
