-- Curahold — the customer portal.
--
-- A company can open chosen boards to its customers' people. They sign in on
-- a separate address (acme.curahold-portal.com: another registrable domain,
-- so no cookie or storage of the app is ever shared), and can only:
--   * see the tasks of their own customer that were shared with them,
--   * open a task (it lands in the board's intake column, assigned to the
--     customer's owner),
--   * comment, and read the replies meant for them.
-- They never see another customer, internal notes, people, fields or boards.
--
-- The portal runs as its own database role, curahold_portal, which holds no
-- table privileges at all: everything goes through the portal_* functions
-- below, which work out the company and the customer from the signed-in
-- portal person (never from what the request says).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'curahold_portal') then
    create role curahold_portal nologin;
  end if;
exception when duplicate_object or unique_violation then null;
end $$;
grant curahold_portal to current_user;
grant usage on schema public to curahold_portal;

-- Functions are callable by everyone unless said otherwise; from here on only
-- the app's role (and, below, the portal role for its own functions) may call them.
revoke execute on all functions in schema public from public;
grant execute on all functions in schema public to curahold_app;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public grant execute on functions to curahold_app;

create function app_portal_user() returns uuid language sql stable as $$
  select nullif(current_setting('app.portal_user', true), '')::uuid
$$;

-- ------------------------------------------------------------ people

create table portal_users (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  account_id    uuid not null,
  email         text not null check (email = lower(email) and length(email) between 3 and 254),
  name          text not null check (length(name) between 1 and 120),
  status        text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
  locale        text check (locale in ('tr', 'en')),
  invited_by    uuid,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  unique (org_id, id),
  unique (org_id, email),
  foreign key (org_id, account_id) references accounts (org_id, id) on delete cascade,
  foreign key (org_id, invited_by) references users (org_id, id) on delete set null (invited_by)
);
create index portal_users_account_idx on portal_users (org_id, account_id);
alter table portal_users enable row level security;
-- Inside the company: whoever can see the customer sees its portal people.
create policy portal_users_select on portal_users for select
  using (org_id = app_org() and exists (select 1 from accounts a where a.id = portal_users.account_id));
-- Inviting and switching off: administrators, and the customer's own owner.
create policy portal_users_insert on portal_users for insert
  with check (org_id = app_org() and app_can_write() and (app_has_perm('org.manage')
    or exists (select 1 from accounts a where a.id = portal_users.account_id and a.owner_id = app_user())));
create policy portal_users_update on portal_users for update
  using (org_id = app_org() and (app_has_perm('org.manage')
    or exists (select 1 from accounts a where a.id = portal_users.account_id and a.owner_id = app_user())))
  with check (org_id = app_org());
grant select, insert, update on portal_users to curahold_app;

-- Sign-in links and sessions: reached only with owner access, by the portal's own routes.
create table portal_tokens (
  token_hash     text primary key,
  org_id         uuid not null references orgs(id) on delete cascade,
  portal_user_id uuid not null,
  expires_at     timestamptz not null,
  used_at        timestamptz,
  created_at     timestamptz not null default now(),
  foreign key (org_id, portal_user_id) references portal_users (org_id, id) on delete cascade
);
alter table portal_tokens enable row level security;

create table portal_sessions (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  portal_user_id uuid not null,
  token_hash     text not null unique,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  foreign key (org_id, portal_user_id) references portal_users (org_id, id) on delete cascade
);
alter table portal_sessions enable row level security;

-- ------------------------------------------------- boards, tasks, comments

-- A board's portal: { enabled, intake: column key, labels: { column key: what the customer reads }, fields: [...] }.
alter table boards add column portal jsonb;
-- Shared with the customer (tasks they opened always are), and who opened it.
alter table tasks add column portal_shared boolean not null default false;
alter table tasks add column portal_author_id uuid;
alter table tasks add foreign key (org_id, portal_author_id) references portal_users (org_id, id) on delete set null (portal_author_id);
-- Comments are internal unless written for the customer (or by them).
alter table comments add column visibility text not null default 'internal' check (visibility in ('internal', 'customer'));
alter table comments add column portal_author_id uuid;
alter table comments add foreign key (org_id, portal_author_id) references portal_users (org_id, id) on delete set null (portal_author_id);

-- A task given to another customer stops being shared: it would otherwise
-- show one customer's conversation to another.
create function task_portal_guard() returns trigger language plpgsql as $$
begin
  if new.account_id is distinct from old.account_id then
    new.portal_shared := false;
  end if;
  return new;
end $$;
create trigger tasks_portal_guard before update of account_id on tasks for each row execute function task_portal_guard();

-- ------------------------------------------------- the portal's functions

-- The signed-in portal person, still allowed in: their company, customer, and the company's switch.
create function portal_whoami()
returns table (user_id uuid, org_id uuid, account_id uuid, name text, email text, locale text)
language sql stable security definer set search_path = public as $$
  select pu.id, pu.org_id, pu.account_id, pu.name, pu.email, pu.locale
    from portal_users pu
    join orgs o on o.id = pu.org_id
    join accounts a on a.id = pu.account_id and a.org_id = pu.org_id and a.archived_at is null
   where pu.id = app_portal_user() and pu.org_id = app_org() and pu.status = 'active'
     and coalesce((o.settings->'portal'->>'enabled')::boolean, false)
$$;

-- What a board shows a customer: only open boards, only their labels and fields.
create function portal_board_json(b boards) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', b.id,
    'name', b.name,
    'columns', (select coalesce(jsonb_agg(jsonb_build_object(
                  'key', c->>'key',
                  'name', coalesce(nullif(b.portal->'labels'->>(c->>'key'), ''), c->>'name'),
                  'done', coalesce((c->>'done')::boolean, false)) order by ord), '[]'::jsonb)
                from jsonb_array_elements(b.columns) with ordinality as x(c, ord)),
    'fields', coalesce(b.portal->'fields', '[]'::jsonb))
$$;

create function portal_me() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me record;
begin
  select * into me from portal_whoami();
  if me.user_id is null then return null; end if;
  return jsonb_build_object(
    'user', jsonb_build_object('id', me.user_id, 'name', me.name, 'email', me.email, 'locale', me.locale),
    'account', (select jsonb_build_object('id', a.id, 'name', a.name) from accounts a where a.id = me.account_id),
    'boards', (select coalesce(jsonb_agg(portal_board_json(b) order by b.name), '[]'::jsonb)
                 from boards b where b.org_id = me.org_id and coalesce((b.portal->>'enabled')::boolean, false)));
end $$;

-- A task as the customer sees it.
create function portal_task_json(t tasks, b boards) returns jsonb
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
    'replies', (select count(*) from comments c where c.task_id = t.id and c.org_id = t.org_id and c.visibility = 'customer'))
$$;

create function portal_tasks(p_board uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me record; b boards;
begin
  select * into me from portal_whoami();
  if me.user_id is null then raise exception 'portal_signed_out'; end if;
  select * into b from boards where id = p_board and org_id = me.org_id and coalesce((portal->>'enabled')::boolean, false);
  if b.id is null then raise exception 'portal_not_found'; end if;
  return (select coalesce(jsonb_agg(portal_task_json(t, b) order by t.updated_at desc), '[]'::jsonb)
            from tasks t
           where t.org_id = me.org_id and t.board_id = b.id and t.account_id = me.account_id
             and t.portal_shared and t.archived_at is null and t.parent_id is null);
end $$;

create function portal_task(p_task uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me record; t tasks; b boards;
begin
  select * into me from portal_whoami();
  if me.user_id is null then raise exception 'portal_signed_out'; end if;
  select * into t from tasks where id = p_task and org_id = me.org_id and account_id = me.account_id and portal_shared and archived_at is null;
  if t.id is null then raise exception 'portal_not_found'; end if;
  select * into b from boards where id = t.board_id and org_id = me.org_id and coalesce((portal->>'enabled')::boolean, false);
  if b.id is null then raise exception 'portal_not_found'; end if;
  return portal_task_json(t, b) || jsonb_build_object(
    'board', portal_board_json(b),
    'comments', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'body', c.body,
        'createdAt', c.created_at,
        'fromCustomer', c.portal_author_id is not null,
        'mine', c.portal_author_id = me.user_id,
        'author', coalesce((select pu.name from portal_users pu where pu.id = c.portal_author_id),
                           (select u.name from users u where u.id = c.author_id and u.org_id = c.org_id)))
        order by c.created_at), '[]'::jsonb)
      from comments c where c.task_id = t.id and c.org_id = t.org_id and c.visibility = 'customer'));
end $$;

-- Opening a task: into the intake column, for the customer's owner. Limited per person per day.
create function portal_create_task(p_board uuid, p_title text, p_description text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare me record; b boards; col text; owner uuid; id uuid; n int;
begin
  select * into me from portal_whoami();
  if me.user_id is null then raise exception 'portal_signed_out'; end if;
  select * into b from boards where boards.id = p_board and org_id = me.org_id and coalesce((portal->>'enabled')::boolean, false);
  if b.id is null then raise exception 'portal_not_found'; end if;
  select count(*) into n from tasks where org_id = me.org_id and portal_author_id = me.user_id and created_at > now() - interval '1 day';
  if n >= 30 then raise exception 'portal_rate'; end if;
  col := coalesce(
    (select c->>'key' from jsonb_array_elements(b.columns) c where c->>'key' = b.portal->>'intake'),
    b.columns->0->>'key');
  select a.owner_id into owner from accounts a
    join users u on u.id = a.owner_id and u.org_id = a.org_id and u.status = 'active'
   where a.id = me.account_id and a.org_id = me.org_id;
  insert into tasks (org_id, board_id, title, description, status, assignee_ids, account_id, position, portal_shared, portal_author_id)
  values (me.org_id, b.id, left(btrim(p_title), 300), left(coalesce(p_description, ''), 20000), col,
          case when owner is null then '{}'::uuid[] else array[owner] end, me.account_id,
          coalesce((select min(position) from tasks where board_id = b.id and status = col), 1000) - 1, true, me.user_id)
  returning tasks.id into id;
  return id;
end $$;

create function portal_comment(p_task uuid, p_body text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare me record; t tasks; id uuid; n int;
begin
  select * into me from portal_whoami();
  if me.user_id is null then raise exception 'portal_signed_out'; end if;
  select * into t from tasks where tasks.id = p_task and org_id = me.org_id and account_id = me.account_id and portal_shared and archived_at is null;
  if t.id is null or not exists (select 1 from boards b where b.id = t.board_id and coalesce((b.portal->>'enabled')::boolean, false)) then
    raise exception 'portal_not_found';
  end if;
  select count(*) into n from comments where org_id = me.org_id and portal_author_id = me.user_id and created_at > now() - interval '1 day';
  if n >= 200 then raise exception 'portal_rate'; end if;
  insert into comments (org_id, task_id, body, visibility, portal_author_id)
  values (me.org_id, t.id, left(btrim(p_body), 10000), 'customer', me.user_id)
  returning comments.id into id;
  update tasks set updated_at = now() where tasks.id = t.id;
  return id;
end $$;

revoke execute on function portal_whoami(), portal_board_json(boards), portal_me(), portal_task_json(tasks, boards),
  portal_tasks(uuid), portal_task(uuid), portal_create_task(uuid, text, text), portal_comment(uuid, text) from curahold_app;
grant execute on function app_org(), app_portal_user(), portal_whoami(), portal_board_json(boards), portal_me(), portal_task_json(tasks, boards),
  portal_tasks(uuid), portal_task(uuid), portal_create_task(uuid, text, text), portal_comment(uuid, text) to curahold_portal;
