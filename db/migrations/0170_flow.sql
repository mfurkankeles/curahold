-- The flow between departments: Sales → (Onboarding) → Customer Success → Product and back.
--
--   * request_links: many customer requests (from the customer page, a support
--     ticket, a meeting, a portal request) point at one product story. The
--     backlog adds up who is waiting, what they are worth a year and when the
--     nearest of them renews (app_story_demand); the customer page shows where
--     the linked work stands to anyone who can see the customer, without
--     opening Product's board (app_account_linked_work).
--   * account_team: one owner per department on a customer (Sales, Onboarding,
--     Customer Success…), beside the customer's own owner.
--   * handovers: when a deal is won, one card with what the next team needs;
--     the owner is set when someone confirms it.
--   * promises: what we told the customer we would do, kept with the customer.
--
-- When a linked story is finished, each customer's owner gets a task with a
-- drafted message (request_links.shipped_at, draft). Nothing is sent to the
-- customer by itself. Undo: db/rollback/0170_flow.sql.

-- ------------------------------------------------------------------ tables

create table account_team (
  org_id         uuid not null references orgs(id) on delete cascade,
  account_id     uuid not null,
  department_id  uuid not null,
  user_id        uuid not null,
  created_at     timestamptz not null default now(),
  primary key (account_id, department_id),
  foreign key (org_id, account_id) references accounts (org_id, id) on delete cascade,
  foreign key (org_id, department_id) references departments (org_id, id) on delete cascade,
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);
create index account_team_user_idx on account_team (org_id, user_id);

create table request_links (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  story_id     uuid not null,
  account_id   uuid not null,
  -- Where the customer asked: their page, a ticket (record), a meeting (activity), a portal request or a task.
  source       text not null check (source in ('account', 'ticket', 'meeting', 'portal', 'task')),
  source_id    uuid,
  note         text not null default '' check (length(note) <= 2000),
  created_by   uuid,
  created_at   timestamptz not null default now(),
  -- The story was finished: the owner's task and draft were made then.
  shipped_at   timestamptz,
  draft        text not null default '' check (length(draft) <= 8000),
  loop_task_id uuid,
  -- The owner said the customer has been told (or closed the portal request).
  told_at      timestamptz,
  told_by      uuid,
  foreign key (org_id, story_id) references tasks (org_id, id) on delete cascade,
  foreign key (org_id, account_id) references accounts (org_id, id) on delete cascade
);
create unique index request_links_one_idx on request_links (story_id, account_id, source, coalesce(source_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index request_links_account_idx on request_links (org_id, account_id);
create index request_links_story_idx on request_links (org_id, story_id);

create table promises (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  account_id   uuid not null,
  body         text not null check (length(body) between 1 and 500),
  -- Where it was said: a deal (record) or a meeting (activity); both may be empty.
  record_id    uuid,
  activity_id  uuid,
  due_date     date,
  kept_at      timestamptz,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  foreign key (org_id, account_id) references accounts (org_id, id) on delete cascade
);
create index promises_account_idx on promises (org_id, account_id);

create table handovers (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  account_id     uuid not null,
  -- The deal that was won: a record (opportunity) or a task on a pipeline board.
  source_kind    text not null check (source_kind in ('record', 'task')),
  source_id      uuid not null,
  source_name    text not null default '',
  stage          text not null default 'won',
  status         text not null default 'open' check (status in ('open', 'confirmed', 'dismissed')),
  -- The department that takes the customer over: onboarding when the company has one, else success.
  to_department  text not null default 'success',
  -- The pinned summary of the sales thread (written when the card is made; editable until confirmed).
  summary        text not null default '' check (length(summary) <= 8000),
  plan_id        uuid,
  owner_id       uuid,
  seller_id      uuid,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  confirmed_at   timestamptz,
  confirmed_by   uuid,
  unique (org_id, source_kind, source_id),
  foreign key (org_id, account_id) references accounts (org_id, id) on delete cascade
);
create index handovers_account_idx on handovers (org_id, account_id);
create index handovers_open_idx on handovers (org_id) where status = 'open';

-- ------------------------------------------------------------------ helpers

-- Whether this person may see a customer: the same test as the accounts policy.
create function app_sees_account(p_account uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from accounts a where a.id = p_account and a.org_id = app_org() and (
      app_has_perm('accounts.view_all')
      or a.owner_id = app_user()
      or (app_has_perm('accounts.view_team') and (a.team_id in (select app_my_teams()) or a.owner_id in (select app_my_people())))))
$$;

-- ------------------------------------------------------------------ reads

-- The customer page's status window: the product work this customer is waiting
-- for, as much as anyone who sees the customer may know (title, where it
-- stands, sprint end, department), the board only when they can open it.
create function app_account_linked_work(p_account uuid)
returns table (link_id uuid, story_id uuid, title text, status_name text, done boolean, sprint_name text, sprint_ends date,
               department_key text, board_id uuid, source text, source_id uuid, note text, created_at timestamptz,
               shipped_at timestamptz, told_at timestamptz, draft text, loop_task_id uuid, portal boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  with vis as (select app_visible_boards() as id)
  select l.id, t.id, t.title,
         (select c ->> 'name' from jsonb_array_elements(b.columns) c where c ->> 'key' = t.status limit 1),
         t.done_at is not null, s.name, s.ends_on, d.key,
         case when b.id in (select id from vis) then b.id end,
         l.source, l.source_id, l.note, l.created_at, l.shipped_at, l.told_at, l.draft, l.loop_task_id,
         (l.source = 'portal' and exists (select 1 from tasks pt where pt.id = l.source_id and pt.done_at is null))
    from request_links l
    join tasks t on t.id = l.story_id and t.archived_at is null
    join boards b on b.id = t.board_id
    join departments d on d.id = b.department_id and d.enabled
    left join sprints s on s.id = t.sprint_id and s.archived_at is null
   where l.org_id = app_org() and l.account_id = p_account and app_sees_account(p_account)
   order by (t.done_at is null) desc, coalesce(s.ends_on, t.due_date) nulls last, l.created_at
$$;

-- Product work anyone may link a customer's request to: work on the Product
-- department's boards that are not someone's private board (title and where
-- it stands only), and on sprint boards the person can open.
create function app_linkable_stories(p_query text, p_limit int)
returns table (id uuid, title text, status_name text, done boolean, department_key text, waiting int)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.id, t.title,
         (select c ->> 'name' from jsonb_array_elements(b.columns) c where c ->> 'key' = t.status limit 1),
         t.done_at is not null, d.key,
         (select count(distinct l.account_id)::int from request_links l where l.story_id = t.id)
    from tasks t
    join boards b on b.id = t.board_id and b.archived_at is null
    join departments d on d.id = b.department_id and d.enabled
   where t.org_id = app_org() and t.archived_at is null and t.parent_id is null and t.issue_type <> 'epic'
     and ((d.key = 'product' and b.visibility <> 'private') or (b.pm_enabled is true and b.id in (select app_visible_boards())))
     and (coalesce(p_query, '') = '' or t.title ilike '%' || replace(replace(p_query, '%', '\%'), '_', '\_') || '%')
   order by (t.done_at is null) desc, (d.key = 'product') desc, t.updated_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

-- The backlog's demand columns, for the stories of one board the person can
-- open: how many customers wait, their annual value (field p_value, in the
-- company's money; the server leaves it out for people who may not see that
-- field), and the nearest renewal (field p_renewal).
create function app_story_demand(p_board uuid, p_value text, p_renewal text)
returns table (story_id uuid, waiting int, value numeric, nearest_renewal date, renewing_90 int)
language sql stable security definer set search_path = public, pg_temp as $$
  select l.story_id, count(distinct a.id)::int,
         -- In the company's money: each customer's own currency at the company's rates (lib/fx.ts).
         round(sum(case when jsonb_typeof(a.fields -> p_value) = 'number' then (a.fields ->> p_value)::numeric
                        * coalesce(((select o.settings -> 'fx' -> 'rates' from orgs o where o.id = app_org()) ->> a.currency)::numeric, 1) end), 2),
         min(case when a.fields ->> p_renewal ~ '^\d{4}-\d{2}-\d{2}' then left(a.fields ->> p_renewal, 10)::date end)
           filter (where a.fields ->> p_renewal ~ '^\d{4}-\d{2}-\d{2}' and left(a.fields ->> p_renewal, 10)::date >= app_today()),
         count(distinct a.id) filter (where a.fields ->> p_renewal ~ '^\d{4}-\d{2}-\d{2}'
           and left(a.fields ->> p_renewal, 10)::date between app_today() and app_today() + 90)::int
    from request_links l
    join tasks t on t.id = l.story_id and t.board_id = p_board and t.archived_at is null
    join accounts a on a.id = l.account_id and a.archived_at is null
   where l.org_id = app_org() and p_board in (select app_visible_boards())
   group by l.story_id
$$;

-- The customers waiting for one story: names only of the ones the person may see.
create function app_story_customers(p_story uuid)
returns table (link_id uuid, account_id uuid, account_name text, visible boolean, source text, created_at timestamptz,
               shipped_at timestamptz, told_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select l.id, case when app_sees_account(a.id) then a.id end, case when app_sees_account(a.id) then a.name end,
         app_sees_account(a.id), l.source, l.created_at, l.shipped_at, l.told_at
    from request_links l join accounts a on a.id = l.account_id
   where l.org_id = app_org() and l.story_id = p_story
     and exists (select 1 from tasks t where t.id = p_story and t.board_id in (select app_visible_boards()))
   order by l.created_at
$$;

-- ------------------------------------------------------------------ writes

-- Links a customer's request to a story the person may link to (see app_linkable_stories).
create function app_link_request(p_story uuid, p_account uuid, p_source text, p_source_id uuid, p_note text)
returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not app_can_write() or not app_sees_account(p_account) then return null; end if;
  if not exists (select 1 from app_linkable_stories(null, 50) s where s.id = p_story)
     and not exists (select 1 from tasks t join boards b on b.id = t.board_id join departments d on d.id = b.department_id
                      where t.id = p_story and t.org_id = app_org() and t.archived_at is null
                        and ((d.key = 'product' and b.visibility <> 'private') or (b.pm_enabled is true and b.id in (select app_visible_boards())))) then
    return null;
  end if;
  insert into request_links (org_id, story_id, account_id, source, source_id, note, created_by)
  values (app_org(), p_story, p_account, p_source, p_source_id, coalesce(p_note, ''), app_user())
  on conflict do nothing returning id into v_id;
  if v_id is null then
    select l.id into v_id from request_links l
     where l.story_id = p_story and l.account_id = p_account and l.source = p_source
       and coalesce(l.source_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_source_id, '00000000-0000-0000-0000-000000000000'::uuid);
  end if;
  return v_id;
end
$$;

-- Removes a link: whoever made it, or someone who sees the customer or can open the story's board.
create function app_unlink_request(p_link uuid) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not app_can_write() then return false; end if;
  delete from request_links l where l.id = p_link and l.org_id = app_org() and (
    l.created_by = app_user() or app_sees_account(l.account_id)
    or exists (select 1 from tasks t where t.id = l.story_id and t.board_id in (select app_visible_boards())));
  return found;
end
$$;

-- The owner of a customer marks the customer as told (or the portal request closed).
create function app_mark_told(p_link uuid) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not app_can_write() then return false; end if;
  update request_links l set told_at = coalesce(l.told_at, now()), told_by = coalesce(l.told_by, app_user())
   where l.id = p_link and l.org_id = app_org() and l.shipped_at is not null and app_sees_account(l.account_id);
  return found;
end
$$;

-- The owner edits the drafted message before sending it themselves.
create function app_set_draft(p_link uuid, p_draft text) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not app_can_write() then return false; end if;
  update request_links l set draft = left(coalesce(p_draft, ''), 8000)
   where l.id = p_link and l.org_id = app_org() and app_sees_account(l.account_id);
  return found;
end
$$;

-- ---------------------------------------------------------------------- RLS

alter table account_team enable row level security;
alter table request_links enable row level security;
alter table promises enable row level security;
alter table handovers enable row level security;

create policy account_team_select on account_team for select using (org_id = app_org());
-- Account managers, the department's leads and the customer's own owner set who owns it in a department.
create policy account_team_write on account_team for all
  using (org_id = app_org() and (select app_can_write()) and app_sees_account(account_id)
         and ((select app_has_perm('accounts.manage')) or app_leads_department(department_id)
              or exists (select 1 from accounts a where a.id = account_id and a.owner_id = app_user())))
  with check (org_id = app_org() and (select app_can_write()) and app_sees_account(account_id)
         and ((select app_has_perm('accounts.manage')) or app_leads_department(department_id)
              or exists (select 1 from accounts a where a.id = account_id and a.owner_id = app_user())));

-- Read through the functions above; the table itself shows a person the links of customers they see.
create policy request_links_select on request_links for select using (org_id = app_org() and app_sees_account(account_id));

create policy promises_select on promises for select using (org_id = app_org() and app_sees_account(account_id));
create policy promises_write on promises for all
  using (org_id = app_org() and (select app_can_write()) and app_sees_account(account_id))
  with check (org_id = app_org() and (select app_can_write()) and app_sees_account(account_id));

create policy handovers_select on handovers for select using (org_id = app_org() and app_sees_account(account_id));
create policy handovers_insert on handovers for insert with check (org_id = app_org() and (select app_can_write()) and app_sees_account(account_id));
create policy handovers_update on handovers for update
  using (org_id = app_org() and (select app_can_write()) and app_sees_account(account_id))
  with check (org_id = app_org() and (select app_can_write()) and app_sees_account(account_id));

grant select, insert, update, delete on account_team to curahold_app;
grant select on request_links to curahold_app;
grant select, insert, update, delete on promises to curahold_app;
grant select, insert, update on handovers to curahold_app;
