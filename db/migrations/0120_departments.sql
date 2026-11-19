-- Departments: Inside Sales, Sales, Onboarding (optional), Customer Success & Support
-- (tickets live here), Product, Finance. A customer moves Inside Sales → Sales →
-- (Onboarding) → Customer Success; Product and Finance are linked to all of them.
--
-- A company works in up to six departments. Each one is switched on or off
-- for the company (what it has bought: `enabled`), has leads and members, and
-- holds boards. Every board belongs to exactly one department:
--
--   * people see the boards of the departments they are in (and a board
--     someone shared with them by name); administrators and roles with
--     "see every board" see every department;
--   * only administrators and a department's leads open boards in it;
--   * a department that is switched off keeps its boards, but nobody sees them
--     until it is switched on again.
--
-- Work crosses departments through links and requests (app_task_link_cards,
-- app_request_desks below), never by opening the other department's board.
--
-- Existing companies are moved in by the block at the end: every board goes to
-- a department (worked out from its sprints, its name, its team's name and the
-- company's template), people who demonstrably work on a board become members
-- of its department, and everyone else who could see the board before is
-- written down as a suggestion an administrator can accept with one click
-- (department_moves). Undo: db/rollback/0120_departments.sql.

create table departments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  key         text not null check (key in ('inside_sales', 'sales', 'onboarding', 'success', 'product', 'finance')),
  -- Part of the company's plan. Off: hidden everywhere, its boards kept.
  enabled     boolean not null default true,
  position    int not null default 0,
  -- Which departments see this department's band on the shared customer page; null = every department.
  band_view   text[],
  created_at  timestamptz not null default now(),
  unique (org_id, key),
  unique (org_id, id)
);

create table department_members (
  org_id         uuid not null references orgs(id) on delete cascade,
  department_id  uuid not null,
  user_id        uuid not null,
  role           text not null default 'member' check (role in ('lead', 'member')),
  created_at     timestamptz not null default now(),
  primary key (department_id, user_id),
  foreign key (org_id, department_id) references departments (org_id, id) on delete cascade,
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);
create index department_members_user_idx on department_members (user_id);

-- The record of the move into departments: where each board went and why, and
-- the people who could see a board before but were not made members (applied = false).
create table department_moves (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  kind           text not null check (kind in ('board', 'member')),
  department_id  uuid not null,
  board_id       uuid,
  user_id        uuid,
  reason         text not null,
  applied        boolean not null default true,
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  foreign key (org_id, department_id) references departments (org_id, id) on delete cascade,
  foreign key (org_id, board_id) references boards (org_id, id) on delete cascade,
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);
create index department_moves_org_idx on department_moves (org_id, kind);

alter table boards add column department_id uuid;
alter table boards add constraint boards_department_fk foreign key (org_id, department_id) references departments (org_id, id);
create index boards_department_idx on boards (department_id);

-- ------------------------------------------------------------------ helpers

-- The department a board goes to when nobody said: the company's own kind of work.
create function app_home_department(p_org uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select d.id from departments d join orgs o on o.id = d.org_id
   where d.org_id = p_org
   order by (d.key = case
               when o.template = 'sales' then 'sales'
               when o.template = 'marketing' then 'inside_sales'
               when o.template in ('product', 'it') then 'product'
               when o.template = 'finance' then 'finance'
               else 'success' end) desc,
            d.enabled desc, d.position
   limit 1
$$;

-- Departments this person is in (switched-on ones only).
create function app_my_departments() returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select dm.department_id from department_members dm join departments d on d.id = dm.department_id
   where dm.user_id = app_user() and dm.org_id = app_org() and d.enabled
$$;

create function app_leads_department(p_dept uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from department_members dm join departments d on d.id = dm.department_id
                  where dm.department_id = p_dept and dm.user_id = app_user() and dm.org_id = app_org()
                    and dm.role = 'lead' and d.enabled)
$$;

-- Every company has the four departments, from the moment it exists.
create function app_departments_for_new_org() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Finance's band on the customer page (money owed, invoices) is Finance's own until an administrator widens it.
  insert into departments (org_id, key, position, band_view)
  values (new.id, 'inside_sales', 0, null), (new.id, 'sales', 1, null), (new.id, 'onboarding', 2, null),
         (new.id, 'success', 3, null), (new.id, 'product', 4, null), (new.id, 'finance', 5, array['finance'])
  on conflict do nothing;
  return new;
end
$$;
create trigger orgs_departments after insert on orgs for each row execute function app_departments_for_new_org();

-- A board made without a department goes to one the maker leads, then one they
-- are in, then the company's home department.
create function app_board_department_default() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.department_id is null then
    select dm.department_id into new.department_id
      from department_members dm join departments d on d.id = dm.department_id
     where dm.user_id = new.created_by and dm.org_id = new.org_id and d.enabled
     order by (dm.role = 'lead') desc, d.position
     limit 1;
  end if;
  if new.department_id is null then
    new.department_id := app_home_department(new.org_id);
  end if;
  return new;
end
$$;
create trigger boards_department_default before insert on boards for each row execute function app_board_department_default();

-- Moving a board to another department is an administrator's decision
-- (the server's own connection, which has no person, may do it too).
create function app_board_department_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.department_id is distinct from old.department_id and app_user() is not null
     and not app_has_perm('boards.manage_all') then
    raise exception 'only an administrator moves a board to another department' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger boards_department_guard before update on boards for each row execute function app_board_department_guard();

-- Who sees which board: worked out once per statement (see 0017_speed.sql).
create or replace function app_visible_boards() returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select bd.id from boards bd
    join departments d on d.id = bd.department_id and d.enabled
   where bd.org_id = app_org() and (
     app_has_perm('boards.view_all')
     -- shared with this person by name
     or exists (select 1 from board_members m where m.board_id = bd.id and m.user_id = app_user())
     or exists (
       select 1 from department_members dm
        where dm.department_id = bd.department_id and dm.user_id = app_user() and (
          -- a lead sees every board of the department except someone's private one
          (dm.role = 'lead' and bd.visibility <> 'private')
          or bd.visibility = 'org'
          or bd.created_by = app_user()
          or (bd.visibility = 'team' and exists (select 1 from team_members tm where tm.team_id = bd.team_id and tm.user_id = app_user()))
          or (bd.visibility = 'team' and exists (select 1 from teams t where t.id = bd.team_id and t.lead_id = app_user()))
        ))
   )
$$;

create or replace function app_can_see_board(b uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select b in (select app_visible_boards())
$$;

-- Boards other departments can send a request to: the intake form is on.
create function app_request_desks() returns table (id uuid, name text, department_key text, columns jsonb, form jsonb, task_fields jsonb, notify jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  select bd.id, bd.name, d.key, bd.columns, bd.form, bd.task_fields, bd.notify
    from boards bd join departments d on d.id = bd.department_id and d.enabled
   where bd.org_id = app_org() and bd.archived_at is null
     and coalesce((bd.form ->> 'on')::boolean, false)
   order by d.position, bd.name
$$;

-- The other end of each of a task's links, as much as the person may know about it:
-- title, where it stands and which department holds it; the board only when they can open it.
create function app_task_link_cards(p_task uuid)
returns table (task_id uuid, title text, kind text, outgoing boolean, done boolean, status_name text,
               due_date date, department_key text, board_id uuid, board_name text)
language sql stable security definer set search_path = public, pg_temp as $$
  with me as (select t.id from tasks t where t.id = p_task and t.org_id = app_org() and t.board_id in (select app_visible_boards())),
       vis as (select app_visible_boards() as id)
  select o.id, o.title, l.kind, (l.from_id = p_task), o.done_at is not null,
         (select c ->> 'name' from jsonb_array_elements(b.columns) c where c ->> 'key' = o.status limit 1),
         o.due_date, d.key,
         case when b.id in (select id from vis) then b.id end,
         case when b.id in (select id from vis) then b.name end
    from task_links l
    join me on true
    join tasks o on o.id = case when l.from_id = p_task then l.to_id else l.from_id end
    join boards b on b.id = o.board_id
    join departments d on d.id = b.department_id
   where (l.from_id = p_task or l.to_id = p_task) and l.org_id = app_org() and o.archived_at is null
     -- a switched-off department's work is not shown at all
     and d.enabled
   order by l.created_at
$$;

-- A hand-off: the task someone can see, linked to the request they just sent to another department.
create function app_link_handoff(p_from uuid, p_to uuid) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not app_can_write() then return false; end if;
  if not exists (select 1 from tasks t where t.id = p_from and t.org_id = app_org() and t.board_id in (select app_visible_boards())) then
    return false;
  end if;
  if not exists (select 1 from tasks t join app_request_desks() r on r.id = t.board_id
                  where t.id = p_to and t.org_id = app_org() and t.created_by = app_user()
                    and t.created_at > now() - interval '10 minutes') then
    return false;
  end if;
  insert into task_links (org_id, from_id, to_id, kind, created_by)
  values (app_org(), least(p_from, p_to), greatest(p_from, p_to), 'relates', app_user())
  on conflict do nothing;
  return true;
end
$$;

-- The history line of a request just sent to another department's board ("came in through the form").
create function app_request_created(p_task uuid) returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  insert into task_events (org_id, task_id, actor_id, kind, data)
  select t.org_id, t.id, app_user(), 'created', '{"form": true}'::jsonb
    from tasks t join app_request_desks() r on r.id = t.board_id
   where t.id = p_task and t.org_id = app_org() and t.created_by = app_user() and t.created_at > now() - interval '10 minutes'
     and not exists (select 1 from task_events e where e.task_id = t.id and e.kind = 'created')
$$;

-- The shared customer page: each department's open work for one customer, as counts.
-- Only for a customer the person can see (the same test as the accounts policy).
create function app_account_departments(p_account uuid)
returns table (department_key text, open int, overdue int, next_due date, mine boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select d.key,
         count(t.id) filter (where t.done_at is null)::int,
         count(t.id) filter (where t.done_at is null and t.due_date < app_today())::int,
         min(t.due_date) filter (where t.done_at is null and t.due_date >= app_today()),
         d.id in (select app_my_departments())
    from departments d
    left join boards b on b.department_id = d.id and b.archived_at is null
    left join tasks t on t.board_id = b.id and t.account_id = p_account and t.archived_at is null and t.parent_id is null
   where d.org_id = app_org() and d.enabled
     and exists (
       select 1 from accounts a where a.id = p_account and a.org_id = app_org() and (
         app_has_perm('accounts.view_all')
         or a.owner_id = app_user()
         or (app_has_perm('accounts.view_team') and (a.team_id in (select app_my_teams()) or a.owner_id in (select app_my_people())))))
   group by d.id, d.key, d.position
   order by d.position
$$;

-- ---------------------------------------------------------------------- RLS

alter table departments enable row level security;
alter table department_members enable row level security;
alter table department_moves enable row level security;

create policy departments_select on departments for select using (org_id = app_org());
create policy departments_update on departments for update
  using (org_id = app_org() and app_has_perm('org.manage'))
  with check (org_id = app_org() and app_has_perm('org.manage'));

create policy department_members_select on department_members for select using (org_id = app_org());
-- People managers set anyone; a lead adds and removes members (not leads) of their own department.
create policy department_members_insert on department_members for insert
  with check (org_id = app_org() and (select app_can_write()) and (
    (select app_has_perm('users.manage')) or (role = 'member' and app_leads_department(department_id))));
create policy department_members_update on department_members for update
  using (org_id = app_org() and (select app_has_perm('users.manage')))
  with check (org_id = app_org() and (select app_has_perm('users.manage')));
create policy department_members_delete on department_members for delete
  using (org_id = app_org() and (select app_can_write()) and (
    (select app_has_perm('users.manage')) or (role = 'member' and app_leads_department(department_id))));

create policy department_moves_select on department_moves for select
  using (org_id = app_org() and (select app_has_perm('org.manage')));
create policy department_moves_update on department_moves for update
  using (org_id = app_org() and (select app_has_perm('org.manage')))
  with check (org_id = app_org() and (select app_has_perm('org.manage')));

grant select, update on departments to curahold_app;
grant select, insert, update, delete on department_members to curahold_app;
grant select, update on department_moves to curahold_app;

-- Boards are opened only by administrators and the department's leads.
alter policy boards_insert on boards
  with check (org_id = app_org() and app_can_write() and (app_has_perm('boards.manage_all') or app_leads_department(department_id)));

-- A request can be sent to another department's intake board without seeing the board.
alter policy tasks_insert on tasks with check (
  org_id = app_org() and (select app_can_write())
  and (board_id in (select app_visible_boards()) or board_id in (select r.id from app_request_desks() r)));

-- ------------------------------------------------------- existing companies

insert into departments (org_id, key, position, band_view)
select o.id, k.key, k.position, case when k.key = 'finance' then array['finance'] end from orgs o
 cross join (values ('inside_sales', 0), ('sales', 1), ('onboarding', 2), ('success', 3), ('product', 4), ('finance', 5)) as k (key, position)
on conflict do nothing;

-- 1. Every board to a department, with the reason.
create temporary table board_dept_guess on commit drop as
select b.id as board_id, b.org_id,
       case
         when b.pm_enabled is true or exists (select 1 from sprints s where s.board_id = b.id) then 'product'
         when lower(b.name || ' ' || coalesce(t.name, '')) ~ '(financ|finans|fatura|invoice|billing|muhasebe|accounting|tahsilat|collection|payment|ödeme|odeme|مالي|فاتور|محاسب|כספ|חשבונ|財務|财务|会計|経理|請求|发票|發票|재무|회계|청구)' then 'finance'
         when lower(b.name || ' ' || coalesce(t.name, '')) ~ '(product|ürün|urun|sprint|roadmap|backlog|engineering|geliştirme|gelistirme|release|bug|منتج|محصول|מוצר|製品|产品|產品|プロダクト|제품|스프린트)' then 'product'
         when lower(b.name || ' ' || coalesce(t.name, '')) ~ '(onboarding|kurulum|devreye|implementation|go-live|تهيئة|راه‌اندازی|הטמעה|入职|導入|オンボーディング|온보딩)' then 'onboarding'
         when lower(b.name || ' ' || coalesce(t.name, '')) ~ '(inside sales|inside-sales|sdr|bdr|lead|outbound|prospect|cold call|iç satış|ön satış|مبيعات داخلية|عملاء محتملين|سرنخ|לידים|潜在客户|潛在客戶|インサイドセールス|リード|인사이드 세일즈|리드)' then 'inside_sales'
         when lower(b.name || ' ' || coalesce(t.name, '')) ~ '(sales|satış|satis|deal|pipeline|fırsat|firsat|proposal|teklif|مبيع|فروش|מכיר|営業|销售|銷售|商談|영업|세일즈)' then 'sales'
         when lower(b.name || ' ' || coalesce(t.name, '')) ~ '(success|başarı|basari|customer|müşteri|musteri|support|destek|ticket|talep|renewal|yenileme|account|escalation|نجاح|عملاء|دعم|موفقیت|پشتیبانی|הצלח|לקוח|תמיכה|成功|支持|支援|サクセス|サポート|고객|지원)' then 'success'
         else null
       end as key,
       case
         when b.pm_enabled is true or exists (select 1 from sprints s where s.board_id = b.id) then 'sprints'
         when lower(b.name || ' ' || coalesce(t.name, '')) ~ '(financ|finans|fatura|invoice|billing|muhasebe|accounting|tahsilat|collection|payment|ödeme|odeme|مالي|فاتور|محاسب|כספ|חשבונ|財務|财务|会計|経理|請求|发票|發票|재무|회계|청구|product|ürün|urun|sprint|roadmap|backlog|engineering|geliştirme|gelistirme|release|bug|منتج|محصول|מוצר|製品|产品|產品|プロダクト|제품|스프린트|onboarding|kurulum|devreye|implementation|go-live|تهيئة|راه‌اندازی|הטמעה|入职|導入|オンボーディング|온보딩|inside sales|inside-sales|sdr|bdr|lead|outbound|prospect|cold call|iç satış|ön satış|مبيعات داخلية|عملاء محتملين|سرنخ|לידים|潜在客户|潛在客戶|インサイドセールス|リード|인사이드 세일즈|리드|sales|satış|satis|deal|pipeline|fırsat|firsat|proposal|teklif|مبيع|فروش|מכיר|営業|销售|銷售|商談|영업|세일즈|success|başarı|basari|customer|müşteri|musteri|support|destek|ticket|talep|renewal|yenileme|account|escalation|نجاح|عملاء|دعم|موفقیت|پشتیبانی|הצלח|לקוח|תמיכה|成功|支持|支援|サクセス|サポート|고객|지원)' then 'name'
         else 'company'
       end as reason
  from boards b left join teams t on t.id = b.team_id;

update boards b set department_id = coalesce(
    (select d.id from departments d join board_dept_guess g on g.key = d.key and g.org_id = d.org_id where g.board_id = b.id),
    app_home_department(b.org_id))
 where b.department_id is null;

insert into department_moves (org_id, kind, department_id, board_id, user_id, reason, detail)
select b.org_id, 'board', b.department_id, b.id, b.created_by, g.reason,
       jsonb_build_object('name', b.name, 'visibility', b.visibility, 'teamId', b.team_id,
                          'personal', (b.visibility = 'private' and not exists (select 1 from board_members m where m.board_id = b.id and m.user_id <> b.created_by)))
  from boards b join board_dept_guess g on g.board_id = b.id;

alter table boards alter column department_id set not null;

-- 2. People who work on a board join its department. Team leads lead it.
create temporary table dept_evidence on commit drop as
select distinct b.org_id, b.department_id, x.user_id, x.reason, x.lead
  from boards b
  cross join lateral (
    select t.lead_id as user_id, 'team_lead' as reason, true as lead from teams t where t.id = b.team_id and t.lead_id is not null
    union all
    select tm.user_id, 'team', false from team_members tm where tm.team_id = b.team_id
    union all
    select m.user_id, 'board_member', false from board_members m where m.board_id = b.id
    union all
    select b.created_by, 'creator', false where b.created_by is not null
    union all
    select distinct a.user_id, 'active', false
      from tasks tk cross join lateral unnest(tk.assignee_ids || array[tk.created_by]) as a (user_id)
     where tk.board_id = b.id and a.user_id is not null and tk.updated_at > now() - interval '180 days'
  ) x
  join users u on u.id = x.user_id and u.status <> 'deleted'
 where b.archived_at is null;

insert into department_members (org_id, department_id, user_id, role)
select org_id, department_id, user_id, case when bool_or(lead) then 'lead' else 'member' end
  from dept_evidence group by org_id, department_id, user_id
on conflict do nothing;

insert into department_moves (org_id, kind, department_id, user_id, reason)
select org_id, 'member', department_id, user_id, min(reason)
  from dept_evidence group by org_id, department_id, user_id;

-- 3. Nobody is left without a department: the rest join the company's home one.
insert into department_members (org_id, department_id, user_id, role)
select u.org_id, app_home_department(u.org_id), u.id, 'member'
  from users u
 where u.status <> 'deleted'
   and not exists (select 1 from department_members dm where dm.user_id = u.id)
on conflict do nothing;

insert into department_moves (org_id, kind, department_id, user_id, reason)
select dm.org_id, 'member', dm.department_id, dm.user_id, 'home'
  from department_members dm
 where not exists (select 1 from department_moves mv where mv.kind = 'member' and mv.user_id = dm.user_id and mv.department_id = dm.department_id);

-- 4. Who could see a board before and now would not: a suggestion, not applied.
insert into department_moves (org_id, kind, department_id, user_id, reason, applied, detail)
select b.org_id, 'member', b.department_id, u.id, 'could_see', false, jsonb_build_object('boards', count(*))
  from boards b
  join users u on u.org_id = b.org_id and u.status <> 'deleted'
  join roles r on r.id = u.role_id
 where b.archived_at is null
   and not ('boards.view_all' = any (r.perms))
   and (b.visibility = 'org'
        or (b.visibility = 'team' and exists (select 1 from team_members tm where tm.team_id = b.team_id and tm.user_id = u.id)))
   and not exists (select 1 from department_members dm where dm.department_id = b.department_id and dm.user_id = u.id)
   and not exists (select 1 from board_members m where m.board_id = b.id and m.user_id = u.id)
 group by b.org_id, b.department_id, u.id;
