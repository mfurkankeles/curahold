-- The customer portal: files on requests and replies, both ways, and "the
-- latest word is the team's" on each request.
--
-- A file reaches the portal only through a task the person may see, and only
-- when it belongs to a reply written for the customer (or by them), or to the
-- request they opened. A file on an internal note, or added to the task inside
-- the company, never does.

alter table files add column portal_author_id uuid;
alter table files add foreign key (org_id, portal_author_id) references portal_users (org_id, id) on delete set null (portal_author_id);
create index files_portal_author_idx on files (org_id, portal_author_id, created_at) where portal_author_id is not null;

-- The task as the customer sees it, now also saying whether the latest reply is the team's.
create or replace function portal_task_json(t tasks, b boards) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id,
    'boardId', t.board_id,
    'title', t.title,
    'description', t.description,
    'status', t.status,
    'createdAt', t.created_at,
    'updatedAt', t.updated_at,
    'mine', t.portal_author_id = app_portal_user(),
    'openedBy', (select pu.name from portal_users pu where pu.id = t.portal_author_id),
    'dueDate', case when b.portal->'fields' ? 'due' then t.due_date end,
    'priority', case when b.portal->'fields' ? 'priority' then t.priority end,
    'assignees', case when b.portal->'fields' ? 'assignee' then
        (select coalesce(jsonb_agg(u.name order by u.name), '[]'::jsonb) from users u where u.org_id = t.org_id and u.id = any (t.assignee_ids)) end,
    'replies', (select count(*) from comments c where c.task_id = t.id and c.org_id = t.org_id and c.visibility = 'customer'),
    'lastFromTeam', coalesce((select c.portal_author_id is null from comments c
                               where c.task_id = t.id and c.org_id = t.org_id and c.visibility = 'customer'
                               order by c.created_at desc limit 1), false))
$$;

-- The task the signed-in person may see, or nothing.
create function portal_visible_task(p_task uuid) returns tasks
language plpgsql stable security definer set search_path = public as $$
declare me record; t tasks;
begin
  select * into me from portal_whoami();
  if me.user_id is null then raise exception 'portal_signed_out'; end if;
  select * into t from tasks where id = p_task and org_id = me.org_id and account_id = me.account_id and portal_shared and archived_at is null;
  if t.id is null or not exists (select 1 from boards b where b.id = t.board_id and b.org_id = me.org_id and coalesce((b.portal->>'enabled')::boolean, false)) then
    raise exception 'portal_not_found';
  end if;
  return t;
end $$;

-- Is this file on this task one the customer may see?
create function portal_file_open(f files, t tasks) returns boolean
language sql stable security definer set search_path = public as $$
  select f.task_id = t.id and f.org_id = t.org_id and (
    (f.comment_id is not null and exists (select 1 from comments c where c.id = f.comment_id and c.task_id = t.id and c.org_id = t.org_id and c.visibility = 'customer'))
    or (f.comment_id is null and f.portal_author_id is not null))
$$;

-- The files of a request: on the request itself (commentId null) and on its replies.
create function portal_task_files(p_task uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t tasks;
begin
  t := portal_visible_task(p_task);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'size', f.size, 'mime', f.mime, 'commentId', f.comment_id) order by f.created_at), '[]'::jsonb)
            from files f where f.task_id = t.id and f.org_id = t.org_id and portal_file_open(f, t));
end $$;

-- One file, for downloading: where it is kept, what it is called.
create function portal_file(p_file uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me record; f files; t tasks;
begin
  select * into me from portal_whoami();
  if me.user_id is null then raise exception 'portal_signed_out'; end if;
  select * into f from files where id = p_file and org_id = me.org_id;
  if f.id is null then raise exception 'portal_not_found'; end if;
  t := portal_visible_task(f.task_id);
  if not portal_file_open(f, t) then raise exception 'portal_not_found'; end if;
  return jsonb_build_object('name', f.name, 'mime', f.mime, 'key', f.storage_key);
end $$;

-- A file from the customer: on their request (p_comment null, only the person who opened it)
-- or on a reply they wrote. Limited per person per day.
create function portal_add_file(p_task uuid, p_comment uuid, p_name text, p_size int, p_mime text, p_key text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare me record; t tasks; id uuid; n int;
begin
  select * into me from portal_whoami();
  if me.user_id is null then raise exception 'portal_signed_out'; end if;
  t := portal_visible_task(p_task);
  if p_comment is null and t.portal_author_id is distinct from me.user_id then raise exception 'portal_not_found'; end if;
  if p_comment is not null and not exists (select 1 from comments c where c.id = p_comment and c.task_id = t.id and c.org_id = t.org_id and c.portal_author_id = me.user_id) then
    raise exception 'portal_not_found';
  end if;
  select count(*) into n from files where org_id = me.org_id and portal_author_id = me.user_id and created_at > now() - interval '1 day';
  if n >= 60 then raise exception 'portal_rate'; end if;
  insert into files (org_id, task_id, comment_id, name, size, mime, storage_key, portal_author_id)
  values (me.org_id, t.id, p_comment, left(p_name, 200), p_size, p_mime, p_key, me.user_id)
  returning files.id into id;
  return id;
end $$;

revoke execute on function portal_visible_task(uuid), portal_file_open(files, tasks), portal_task_files(uuid), portal_file(uuid),
  portal_add_file(uuid, uuid, text, int, text, text) from public, curahold_app;
grant execute on function portal_visible_task(uuid), portal_file_open(files, tasks), portal_task_files(uuid), portal_file(uuid),
  portal_add_file(uuid, uuid, text, int, text, text) to curahold_portal;
