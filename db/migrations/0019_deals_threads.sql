-- Money in more than one currency, threads and files on records, tasks that
-- belong to a record, playbooks dated from a renewal or a close date,
-- dashboards apart from home pages, and the columns a company picks for its
-- record tables.

-- ------------------------------------------------------------ currencies
-- A customer or a record can be in its own currency; without one it is in the
-- company's. Rates live in orgs.settings->'fx'->'rates' ({"USD": 34.2}: one US
-- dollar is 34.2 of the company's currency) and are set by an administrator.
-- Totals are worked out in the company's currency when someone looks.
alter table accounts add column currency text check (currency ~ '^[A-Z]{3}$');
alter table records add column currency text check (currency ~ '^[A-Z]{3}$');

-- ------------------------------------------------ the columns of a table
-- Which fields a record table shows (built-ins such as created_by too), as the
-- company chose them. Empty: Tendwell's own choice.
alter table record_types add column columns text[] check (columns is null or cardinality(columns) <= 20);

-- --------------------------------------------- tasks that belong to a record
alter table tasks add column record_id uuid;
alter table tasks add constraint tasks_record_fk foreign key (org_id, record_id) references records (org_id, id) on delete set null (record_id);
create index tasks_record_idx on tasks (record_id) where record_id is not null;

-- ------------------------------------------------- threads on records
create table record_comments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  record_id   uuid not null,
  author_id   uuid,
  -- Empty when the comment is only a file or a picture.
  body        text not null check (length(body) <= 10000),
  mentions    uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  foreign key (org_id, record_id) references records (org_id, id) on delete cascade,
  foreign key (org_id, author_id) references users (org_id, id) on delete set null (author_id)
);
create index record_comments_record_idx on record_comments (record_id, created_at);
alter table record_comments enable row level security;
-- Whoever can see the record can read and add to its thread.
create policy record_comments_select on record_comments for select
  using (org_id = app_org() and (select true from records r where r.id = record_comments.record_id));
create policy record_comments_insert on record_comments for insert
  with check (org_id = app_org() and app_can_write() and author_id = app_user()
              and (select true from records r where r.id = record_comments.record_id));
create policy record_comments_delete on record_comments for delete
  using (org_id = app_org() and (author_id = app_user() or app_has_perm('privacy.manage')));
grant select, insert, delete on record_comments to tendwell_app;

-- --------------------------------------- files on comments and on records
-- A comment can be only a pasted screenshot.
alter table comments drop constraint comments_body_check;
alter table comments add constraint comments_body_check check (length(body) <= 10000);

alter table files alter column task_id drop not null;
alter table files add column record_id uuid;
alter table files add column comment_id uuid references comments (id) on delete set null;
alter table files add column record_comment_id uuid references record_comments (id) on delete set null;
alter table files add constraint files_record_fk foreign key (org_id, record_id) references records (org_id, id) on delete cascade;
-- Every file belongs to one task or one record.
alter table files add constraint files_owner_check check (num_nonnulls(task_id, record_id) = 1);
create index files_record_idx on files (record_id) where record_id is not null;
create index files_comment_idx on files (comment_id) where comment_id is not null;
create index files_record_comment_idx on files (record_comment_id) where record_comment_id is not null;
alter policy files_select on files using (
  org_id = app_org() and coalesce((select true from tasks t where t.id = files.task_id), (select true from records r where r.id = files.record_id), false));
alter policy files_insert on files with check (
  org_id = app_org() and app_can_write()
  and coalesce((select true from tasks t where t.id = files.task_id), (select true from records r where r.id = files.record_id), false));
-- The person who uploaded a file ties it to the comment it came with.
create policy files_update on files for update
  using (org_id = app_org() and uploaded_by = app_user()) with check (org_id = app_org());

-- ------------------------------------------------------------- playbooks
-- A plan's tasks are dated from the day it is applied ('start'), or so many days
-- before the customer's renewal date ('renewal') or a deal's close date ('close').
alter table plan_templates add column anchor text not null default 'start' check (anchor in ('start', 'renewal', 'close'));
alter table plan_templates add column description text not null default '' check (length(description) <= 500);

-- Renewals Tendwell started by itself: each customer's renewal is started once.
create table playbook_runs (
  org_id      uuid not null references orgs(id) on delete cascade,
  account_id  uuid not null,
  anchor_day  date not null,
  plan_id     uuid,
  record_id   uuid,
  tasks       int not null default 0,
  created_at  timestamptz not null default now(),
  primary key (org_id, account_id, anchor_day),
  foreign key (org_id, account_id) references accounts (org_id, id) on delete cascade
);
alter table playbook_runs enable row level security;
create policy playbook_runs_select on playbook_runs for select using (org_id = app_org());
grant select on playbook_runs to tendwell_app;

-- ------------------------------------------------------------ dashboards
-- A page is a home (its tabs on Home) or a dashboard (charts from reports, with
-- filters that apply to all of them, under Reports → Dashboards).
alter table pages add column kind text not null default 'home' check (kind in ('home', 'dashboard'));
alter table pages add column filters jsonb not null default '{}'::jsonb;
