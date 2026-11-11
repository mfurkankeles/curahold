-- Tendwell — initial schema.
--
-- Every business table carries org_id. The API never connects as the table
-- owner: each request runs in a transaction that sets app.org_id /
-- app.user_id and switches to the tendwell_app role, so row-level security
-- decides what a query can see or change. A bug in a route can therefore
-- not leak another company's rows — the database refuses.
--
-- Helper functions marked SECURITY DEFINER run as the owner (who bypasses
-- RLS because no table uses FORCE ROW LEVEL SECURITY); each of them still
-- filters on app_org() itself.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'tendwell_app') then
    create role tendwell_app nologin;
  end if;
end $$;

-- ---------------------------------------------------------------- tables

create table orgs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique
              check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name        text not null check (length(name) between 1 and 120),
  locale      text not null default 'en' check (locale in ('en', 'tr')),
  timezone    text not null default 'UTC',
  -- Company vocabulary, e.g. {"partner": {"en": "Client", "tr": "Müşteri"}}
  terms       jsonb not null default '{}'::jsonb,
  settings    jsonb not null default '{}'::jsonb,
  plan        text not null default 'trial',
  created_at  timestamptz not null default now()
);

create table roles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  key         text not null check (key ~ '^[a-z][a-z0-9_-]{1,30}$'),
  name        text not null,
  perms       text[] not null default '{}',
  system      boolean not null default false,
  unique (org_id, key),
  unique (org_id, id)
);

create table users (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  email           text not null check (email = lower(email)),
  name            text not null,
  role_id         uuid not null,
  seat            text not null default 'full' check (seat in ('full', 'viewer')),
  status          text not null default 'active'
                  check (status in ('active', 'invited', 'disabled', 'deleted')),
  locale          text check (locale in ('en', 'tr')),
  created_at      timestamptz not null default now(),
  last_active_at  timestamptz,
  unique (org_id, email),
  unique (org_id, id),
  foreign key (org_id, role_id) references roles (org_id, id)
);

create table teams (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null,
  lead_id     uuid,
  created_at  timestamptz not null default now(),
  unique (org_id, name),
  unique (org_id, id),
  foreign key (org_id, lead_id) references users (org_id, id) on delete set null (lead_id)
);

create table team_members (
  org_id   uuid not null references orgs(id) on delete cascade,
  team_id  uuid not null,
  user_id  uuid not null,
  primary key (team_id, user_id),
  foreign key (org_id, team_id) references teams (org_id, id) on delete cascade,
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);

create table sessions (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  user_id        uuid not null,
  token_hash     text not null unique,
  device_id      text not null,
  device_label   text,
  method         text not null check (method in ('magic', 'oauth')),
  ip             text,
  geo            text,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  revoke_reason  text,
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);
create index sessions_user_idx on sessions (org_id, user_id) where revoked_at is null;

-- One-time tokens: magic links, OAuth hand-offs and new-device codes.
create table login_tokens (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  email       text not null,
  token_hash  text not null unique,
  kind        text not null check (kind in ('magic', 'oauth', 'device')),
  device_id   text,
  -- For kind = 'device': sha256 of the 6-digit code mailed to the person.
  code_hash   text,
  attempts    int not null default 0,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index login_tokens_email_idx on login_tokens (org_id, email, created_at);

create table boards (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  team_id      uuid,
  name         text not null check (length(name) between 1 and 80),
  visibility   text not null default 'team' check (visibility in ('org', 'team', 'private')),
  -- [{"key": "todo", "name": "To do", "done": false}, ...]
  columns      jsonb not null,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz,
  unique (org_id, id),
  foreign key (org_id, team_id) references teams (org_id, id) on delete set null (team_id),
  foreign key (org_id, created_by) references users (org_id, id) on delete set null (created_by)
);

create table board_members (
  org_id    uuid not null references orgs(id) on delete cascade,
  board_id  uuid not null,
  user_id   uuid not null,
  primary key (board_id, user_id),
  foreign key (org_id, board_id) references boards (org_id, id) on delete cascade,
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);

create table tasks (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  board_id      uuid not null,
  parent_id     uuid,
  title         text not null check (length(title) between 1 and 300),
  description   text not null default '' check (length(description) <= 20000),
  status        text not null,
  assignee_ids  uuid[] not null default '{}',
  partner_name  text check (length(partner_name) <= 200),
  due_date      date,
  priority      text not null default 'normal'
                check (priority in ('low', 'normal', 'high', 'urgent')),
  position      double precision not null default 0,
  version       int not null default 1,
  created_by    uuid,
  updated_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz,
  unique (org_id, id),
  foreign key (org_id, board_id) references boards (org_id, id) on delete cascade,
  foreign key (org_id, parent_id) references tasks (org_id, id) on delete cascade
);
create index tasks_board_idx on tasks (org_id, board_id) where archived_at is null;
create index tasks_due_idx on tasks (org_id, due_date) where archived_at is null;

create table comments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  task_id     uuid not null,
  author_id   uuid,
  body        text not null check (length(body) between 1 and 10000),
  mentions    uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  foreign key (org_id, task_id) references tasks (org_id, id) on delete cascade,
  foreign key (org_id, author_id) references users (org_id, id) on delete set null (author_id)
);
create index comments_task_idx on comments (org_id, task_id);

create table files (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  task_id      uuid not null,
  name         text not null,
  size         int not null check (size >= 0),
  mime         text not null,
  storage_key  text not null,
  uploaded_by  uuid,
  created_at   timestamptz not null default now(),
  foreign key (org_id, task_id) references tasks (org_id, id) on delete cascade,
  foreign key (org_id, uploaded_by) references users (org_id, id) on delete set null (uploaded_by)
);

-- Who did what, for the customer's own records and KVKK/GDPR requests.
create table audit_log (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  actor_id   uuid,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  meta       jsonb not null default '{}'::jsonb,
  at         timestamptz not null default now()
);
create index audit_org_at_idx on audit_log (org_id, at desc);

-- ------------------------------------------------------------- functions

create function app_org() returns uuid language sql stable as $$
  select nullif(current_setting('app.org_id', true), '')::uuid
$$;

create function app_user() returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create function app_has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from users u join roles r on r.id = u.role_id
    where u.id = app_user() and u.org_id = app_org()
      and u.status = 'active' and p = any (r.perms)
  )
$$;

-- A full seat that is active may write; viewers and disabled people read only.
create function app_can_write() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from users u
    where u.id = app_user() and u.org_id = app_org()
      and u.status = 'active' and u.seat = 'full'
  )
$$;

create function app_can_see_board(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from boards bd
    where bd.id = b and bd.org_id = app_org() and (
      app_has_perm('boards.view_all')
      or bd.visibility = 'org'
      or bd.created_by = app_user()
      or exists (select 1 from board_members m
                 where m.board_id = bd.id and m.user_id = app_user())
      or (bd.visibility = 'team' and exists (
            select 1 from team_members tm
            where tm.team_id = bd.team_id and tm.user_id = app_user()))
      or (bd.visibility = 'team' and exists (
            select 1 from teams t
            where t.id = bd.team_id and t.lead_id = app_user()))
    )
  )
$$;

-- Used before anyone is signed in: the subdomain is the only input.
create function resolve_org(p_slug text)
returns table (id uuid, slug text, name text, locale text, timezone text, terms jsonb, settings jsonb)
language sql stable security definer set search_path = public as $$
  select o.id, o.slug, o.name, o.locale, o.timezone, o.terms, o.settings
  from orgs o where o.slug = lower(p_slug)
$$;

-- ------------------------------------------------------------------- RLS

alter table orgs          enable row level security;
alter table roles         enable row level security;
alter table users         enable row level security;
alter table teams         enable row level security;
alter table team_members  enable row level security;
alter table sessions      enable row level security;
alter table login_tokens  enable row level security;
alter table boards        enable row level security;
alter table board_members enable row level security;
alter table tasks         enable row level security;
alter table comments      enable row level security;
alter table files         enable row level security;
alter table audit_log     enable row level security;

create policy orgs_select on orgs for select using (id = app_org());
create policy orgs_update on orgs for update
  using (id = app_org() and app_has_perm('org.manage'))
  with check (id = app_org());

-- Org-scoped tables with no further rule.
create policy roles_all on roles for all
  using (org_id = app_org()) with check (org_id = app_org());
create policy users_all on users for all
  using (org_id = app_org()) with check (org_id = app_org());
create policy teams_all on teams for all
  using (org_id = app_org()) with check (org_id = app_org());
create policy team_members_all on team_members for all
  using (org_id = app_org()) with check (org_id = app_org());
create policy sessions_all on sessions for all
  using (org_id = app_org()) with check (org_id = app_org());
create policy login_tokens_all on login_tokens for all
  using (org_id = app_org()) with check (org_id = app_org());
create policy board_members_all on board_members for all
  using (org_id = app_org()) with check (org_id = app_org());

create policy boards_select on boards for select
  using (org_id = app_org() and app_can_see_board(id));
create policy boards_insert on boards for insert
  with check (org_id = app_org() and app_can_write());
create policy boards_update on boards for update
  using (org_id = app_org() and app_can_see_board(id))
  with check (org_id = app_org() and app_can_write());
create policy boards_delete on boards for delete
  using (org_id = app_org() and app_has_perm('boards.manage_all'));

create policy tasks_select on tasks for select
  using (org_id = app_org() and app_can_see_board(board_id));
create policy tasks_insert on tasks for insert
  with check (org_id = app_org() and app_can_write() and app_can_see_board(board_id));
create policy tasks_update on tasks for update
  using (org_id = app_org() and app_can_see_board(board_id))
  with check (org_id = app_org() and app_can_write() and app_can_see_board(board_id));
create policy tasks_delete on tasks for delete
  using (org_id = app_org() and app_can_see_board(board_id) and app_can_write());

create policy comments_select on comments for select
  using (org_id = app_org() and exists (select 1 from tasks t where t.id = task_id));
create policy comments_insert on comments for insert
  with check (org_id = app_org() and app_can_write()
              and exists (select 1 from tasks t where t.id = task_id));
create policy comments_update on comments for update
  using (org_id = app_org() and author_id = app_user())
  with check (org_id = app_org());
create policy comments_delete on comments for delete
  using (org_id = app_org() and (author_id = app_user() or app_has_perm('privacy.manage')));

create policy files_select on files for select
  using (org_id = app_org() and exists (select 1 from tasks t where t.id = task_id));
create policy files_insert on files for insert
  with check (org_id = app_org() and app_can_write()
              and exists (select 1 from tasks t where t.id = task_id));
create policy files_delete on files for delete
  using (org_id = app_org() and (uploaded_by = app_user() or app_has_perm('privacy.manage')));

create policy audit_insert on audit_log for insert with check (org_id = app_org());
create policy audit_select on audit_log for select
  using (org_id = app_org() and (app_has_perm('org.manage') or app_has_perm('privacy.manage')));

grant usage on schema public to tendwell_app;
grant select, insert, update, delete on all tables in schema public to tendwell_app;
grant execute on all functions in schema public to tendwell_app;

-- The role that runs migrations may switch to tendwell_app (on Supabase the
-- "postgres" role is not a superuser and needs the membership). The API's own
-- login role should be a separate, minimal role — see README, "Database roles".
grant tendwell_app to current_user;
