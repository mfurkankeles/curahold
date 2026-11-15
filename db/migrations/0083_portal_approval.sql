-- The customer portal: the customer approves finished work, and hears when
-- work starts and when it is done (status emails, sent by the API).

alter table tasks add column portal_approved_at timestamptz;
alter table tasks add column portal_approved_by uuid;
alter table tasks add foreign key (org_id, portal_approved_by) references portal_users (org_id, id) on delete set null (portal_approved_by);
-- The last step the customer was told by email ('doing' or 'done'), so a move is told once.
alter table tasks add column portal_status_told text check (portal_status_told in ('doing', 'done'));

-- The task as the customer sees it, now with who approved it and when.
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
                               order by c.created_at desc limit 1), false),
    'approvedAt', t.portal_approved_at,
    'approvedBy', (select pu.name from portal_users pu where pu.id = t.portal_approved_by))
$$;

-- "Done, and done well": only on a finished request, once, by someone at the customer.
-- The approval goes into the conversation (p_body, in the company's language) for both sides.
create function portal_approve(p_task uuid, p_body text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare me record; t tasks; id uuid;
begin
  select * into me from portal_whoami();
  t := portal_visible_task(p_task);
  if not exists (select 1 from boards b, jsonb_array_elements(b.columns) c
                  where b.id = t.board_id and c->>'key' = t.status and coalesce((c->>'done')::boolean, false)) then
    raise exception 'portal_not_found';
  end if;
  if t.portal_approved_at is not null then return null; end if;
  update tasks set portal_approved_at = now(), portal_approved_by = me.user_id, updated_at = now() where tasks.id = t.id;
  insert into comments (org_id, task_id, body, visibility, portal_author_id)
  values (me.org_id, t.id, left(btrim(p_body), 10000), 'customer', me.user_id)
  returning comments.id into id;
  return id;
end $$;

revoke execute on function portal_approve(uuid, text) from public, curahold_app;
grant execute on function portal_approve(uuid, text) to curahold_portal;
