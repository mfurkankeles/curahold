-- Curahold — phase 2: self-serve signup, joining, connectors, notifications,
-- accounts and automations. Same rules as 0001: every business row carries
-- org_id and row-level security decides what a request can touch.

-- ---------------------------------------------------------------- companies

alter table orgs
  -- Email domains this company has proven it owns (from the signup address,
  -- or later by a code mailed to an address at the domain). Join requests
  -- and automatic joining only accept addresses at these domains.
  add column domains        text[] not null default '{}',
  add column join_requests  boolean not null default true,
  add column auto_join      boolean not null default false,
  add column currency       text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  add column template       text not null default 'blank' check (template ~ '^[a-z_]{2,30}$'),
  -- [{"key": "renewal_date", "label": {"en": "Renewal", "tr": "Yenileme"}, "type": "date"}]
  add column account_fields jsonb not null default '[]'::jsonb,
  -- Setup wizard progress: {"done": ["company", "messaging"], "finishedAt": "..."}
  add column setup          jsonb not null default '{}'::jsonb;

drop function resolve_org(text);
create function resolve_org(p_slug text)
returns table (id uuid, slug text, name text, locale text, timezone text, terms jsonb, settings jsonb,
               domains text[], join_requests boolean, auto_join boolean, currency text, template text,
               account_fields jsonb, setup jsonb)
language sql stable security definer set search_path = public as $$
  select o.id, o.slug, o.name, o.locale, o.timezone, o.terms, o.settings,
         o.domains, o.join_requests, o.auto_join, o.currency, o.template, o.account_fields, o.setup
  from orgs o where o.slug = lower(p_slug)
$$;

-- Managers run accounts and automations; admins can do everything.
update roles set perms = array(select distinct unnest(perms || array['accounts.manage', 'automations.manage']))
 where system and key in ('admin', 'manager');

-- ------------------------------------------------------------------ signup

-- Company sign-ups in progress on the central address (app.curahold.com),
-- before any company exists. Only the owner role reads it.
create table signups (
  id           uuid primary key default gen_random_uuid(),
  email        text not null check (email = lower(email)),
  token_hash   text not null unique,
  locale       text not null default 'en' check (locale in ('en', 'tr')),
  ip           text,
  verified_at  timestamptz,
  org_id       uuid references orgs(id) on delete set null,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);
create index signups_email_idx on signups (email, created_at);
create index signups_ip_idx on signups (ip, created_at);
alter table signups enable row level security;

-- 'join': proves the address of someone asking to join a company.
-- 'domain': proves a company owns another email domain.
alter table login_tokens drop constraint login_tokens_kind_check;
alter table login_tokens add constraint login_tokens_kind_check
  check (kind in ('magic', 'oauth', 'device', 'join', 'domain'));

create table join_requests (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  email       text not null check (email = lower(email)),
  name        text not null check (length(name) between 1 and 120),
  note        text check (length(note) <= 500),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by  uuid,
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, decided_by) references users (org_id, id) on delete set null (decided_by)
);
create unique index join_requests_pending_idx on join_requests (org_id, email) where status = 'pending';

-- ------------------------------------------------------------------ people

alter table users
  -- {"channel": "auto" | "email" | "none" | "<connection id>",
  --  "events": {"assigned": true, ...}, "digest": true}
  add column prefs                jsonb not null default '{}'::jsonb,
  add column onboarded_at         timestamptz,
  -- Personal calendar feed (.ics); the token is the only credential.
  add column calendar_token_hash  text unique;

-- ------------------------------------------------------------- connections

-- One row per connected outside service (messaging today; customer sources
-- and support tools later). Credentials live in `secret`, sealed with
-- AES-GCM by the API; the request role cannot even select that column.
create table connections (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  kind         text not null check (kind in ('messaging', 'source', 'support', 'calendar')),
  provider     text not null check (provider ~ '^[a-z0-9_]{2,30}$'),
  label        text not null check (length(label) between 1 and 120),
  -- The service's own id for the workspace/tenant (Slack team, Microsoft
  -- tenant, Google Workspace domain). Inbound events are routed by it.
  external_id  text,
  config       jsonb not null default '{}'::jsonb,
  secret       text,
  status       text not null default 'active' check (status in ('active', 'error', 'disabled')),
  last_error   text,
  last_ok_at   timestamptz,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, created_by) references users (org_id, id) on delete set null (created_by)
);
-- A workspace can belong to one Curahold company only.
create unique index connections_external_idx on connections (provider, external_id) where external_id is not null;

-- Who is who on a connected messaging service.
create table chat_identities (
  org_id         uuid not null references orgs(id) on delete cascade,
  connection_id  uuid not null,
  user_id        uuid not null,
  external_id    text not null,
  -- e.g. the direct-message conversation to post into
  data           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  primary key (connection_id, external_id),
  unique (connection_id, user_id),
  foreign key (org_id, connection_id) references connections (org_id, id) on delete cascade,
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);

-- Where a board posts its updates: [{"connectionId": "...", "channel": "C123", "events": ["created", "done"]}]
alter table boards add column notify jsonb not null default '[]'::jsonb;

-- ----------------------------------------------------------- notifications

-- Outbox and in-app inbox in one: every notification is written here inside
-- the request's transaction, then delivered (chat, email) after it commits.
create table notifications (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  user_id        uuid,
  -- Channel posts have no person: they go to a connection (and channel).
  connection_id  uuid,
  channel        text,
  kind           text not null check (kind ~ '^[a-z_]{2,40}$'),
  task_id        uuid,
  actor_id       uuid,
  data           jsonb not null default '{}'::jsonb,
  dedupe_key     text,
  state          text not null default 'pending' check (state in ('pending', 'sent', 'failed', 'skipped')),
  via            text,
  attempts       int not null default 0,
  error          text,
  read_at        timestamptz,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz,
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade,
  foreign key (org_id, task_id) references tasks (org_id, id) on delete cascade,
  foreign key (org_id, connection_id) references connections (org_id, id) on delete cascade,
  foreign key (org_id, actor_id) references users (org_id, id) on delete set null (actor_id)
);
create unique index notifications_dedupe_idx on notifications (org_id, dedupe_key) where dedupe_key is not null;
create index notifications_pending_idx on notifications (created_at) where state = 'pending';
create index notifications_user_idx on notifications (org_id, user_id, created_at desc);

-- ---------------------------------------------------------------- accounts

-- The customers a team looks after. Kept in Curahold whether or not a CRM
-- is connected; `source` + `external_id` link a row to where it came from.
create table accounts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  name         text not null check (length(name) between 1 and 200),
  owner_id     uuid,
  team_id      uuid,
  fields       jsonb not null default '{}'::jsonb,
  source       text not null default 'manual' check (length(source) <= 60),
  external_id  text check (length(external_id) <= 200),
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz,
  unique (org_id, id),
  foreign key (org_id, owner_id) references users (org_id, id) on delete set null (owner_id),
  foreign key (org_id, team_id) references teams (org_id, id) on delete set null (team_id),
  foreign key (org_id, created_by) references users (org_id, id) on delete set null (created_by)
);
create unique index accounts_external_idx on accounts (org_id, source, external_id) where external_id is not null;
create index accounts_name_idx on accounts (org_id, lower(name));
create index accounts_owner_idx on accounts (org_id, owner_id) where archived_at is null;

-- Every import is kept long enough to be undone: what it created and what
-- the rows it changed looked like before.
create table import_batches (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  kind         text not null default 'accounts' check (kind in ('accounts')),
  file_name    text check (length(file_name) <= 200),
  created_ids  uuid[] not null default '{}',
  previous     jsonb not null default '[]'::jsonb,
  summary      jsonb not null default '{}'::jsonb,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  undone_at    timestamptz,
  unique (org_id, id),
  foreign key (org_id, created_by) references users (org_id, id) on delete set null (created_by)
);

-- Tasks now point at an account instead of carrying a free-text name.
alter table tasks add column account_id uuid;
alter table tasks add foreign key (org_id, account_id) references accounts (org_id, id) on delete set null (account_id);
create index tasks_account_idx on tasks (org_id, account_id) where archived_at is null;

insert into accounts (org_id, name, source)
select distinct org_id, partner_name, 'manual' from tasks where partner_name is not null and partner_name <> '';
update tasks t set account_id = a.id
  from accounts a where a.org_id = t.org_id and a.name = t.partner_name;
alter table tasks drop column partner_name;

-- ------------------------------------------------------------- automations

create table automations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null check (length(name) between 1 and 120),
  enabled     boolean not null default true,
  trigger     jsonb not null,
  action      jsonb not null,
  preset      text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, created_by) references users (org_id, id) on delete set null (created_by)
);

-- One row per (automation, thing, occasion): a rule never fires twice for
-- the same account renewal or the same overdue task.
create table automation_runs (
  org_id         uuid not null references orgs(id) on delete cascade,
  automation_id  uuid not null,
  run_key        text not null,
  at             timestamptz not null default now(),
  result         jsonb not null default '{}'::jsonb,
  primary key (automation_id, run_key),
  foreign key (org_id, automation_id) references automations (org_id, id) on delete cascade
);

-- --------------------------------------------------------------------- RLS

alter table join_requests    enable row level security;
alter table connections      enable row level security;
alter table chat_identities  enable row level security;
alter table notifications    enable row level security;
alter table accounts         enable row level security;
alter table automations      enable row level security;
alter table automation_runs  enable row level security;
alter table import_batches   enable row level security;

create policy import_batches_all on import_batches for all
  using (org_id = app_org() and app_has_perm('accounts.manage'))
  with check (org_id = app_org() and app_has_perm('accounts.manage'));

-- Anyone on the company's address may file a request (after proving their
-- email); only people who manage users can read or decide them.
create policy join_requests_insert on join_requests for insert with check (org_id = app_org());
create policy join_requests_select on join_requests for select
  using (org_id = app_org() and app_has_perm('users.manage'));
create policy join_requests_update on join_requests for update
  using (org_id = app_org() and app_has_perm('users.manage')) with check (org_id = app_org());

create policy connections_select on connections for select using (org_id = app_org());
create policy connections_write on connections for all
  using (org_id = app_org() and app_has_perm('org.manage'))
  with check (org_id = app_org() and app_has_perm('org.manage'));

create policy chat_identities_all on chat_identities for all
  using (org_id = app_org() and (user_id = app_user() or app_has_perm('org.manage')))
  with check (org_id = app_org() and (user_id = app_user() or app_has_perm('org.manage')));

-- A person sees and marks only their own notifications; anyone acting in
-- the company may queue one for someone else (e.g. "you were assigned").
create policy notifications_select on notifications for select using (org_id = app_org() and user_id = app_user());
create policy notifications_insert on notifications for insert with check (org_id = app_org());
create policy notifications_update on notifications for update
  using (org_id = app_org() and user_id = app_user()) with check (org_id = app_org());

create policy accounts_select on accounts for select using (org_id = app_org());
create policy accounts_insert on accounts for insert with check (org_id = app_org() and app_can_write());
create policy accounts_update on accounts for update
  using (org_id = app_org()) with check (org_id = app_org() and app_can_write());
create policy accounts_delete on accounts for delete using (org_id = app_org() and app_has_perm('accounts.manage'));

create policy automations_select on automations for select using (org_id = app_org());
create policy automations_write on automations for all
  using (org_id = app_org() and app_has_perm('automations.manage'))
  with check (org_id = app_org() and app_has_perm('automations.manage'));

create policy automation_runs_select on automation_runs for select
  using (org_id = app_org() and app_has_perm('automations.manage'));

grant select, insert, update, delete on join_requests, chat_identities, notifications, accounts, automations,
  import_batches to curahold_app;
grant select on automation_runs to curahold_app;
-- Credentials stay out of reach of the request role: every column but `secret`.
grant select (id, org_id, kind, provider, label, external_id, config, status, last_error, last_ok_at,
              created_by, created_at, updated_at) on connections to curahold_app;
grant insert, update, delete on connections to curahold_app;
grant execute on function resolve_org(text) to curahold_app;
