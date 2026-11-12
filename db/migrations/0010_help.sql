-- Curahold — asking Curahold for help, and letting Curahold's support team
-- in, only with consent.
--
-- A help request carries what support needs to act without a back-and-forth:
-- the page, screenshots, and (shown to the person first, removable) the
-- browser, recent pages, errors and failed requests.
--
-- Support access is a grant a person gives: time-limited (24 hours to 7
-- days), read only unless an administrator allows changes, revocable at any
-- moment, and only within what the company's policy allows. Support then sees
-- exactly what the person who granted it sees. Every entry, and every change
-- made with an "edit" grant, is written to the activity log.

create sequence help_request_number;

create table help_requests (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  ref          text not null unique default ('TW-' || lpad(nextval('help_request_number')::text, 6, '0')),
  user_id      uuid,
  category     text not null check (category in ('bug', 'question', 'idea', 'data', 'billing')),
  impact       text check (impact in ('blocking', 'workaround', 'minor')),
  subject      text not null check (length(subject) between 1 and 200),
  description  text not null check (length(description) between 1 and 20000),
  steps        text check (length(steps) <= 10000),
  page_url     text check (length(page_url) <= 2000),
  context      jsonb not null default '{}'::jsonb,
  status       text not null default 'received' check (status in ('received', 'answered', 'solved')),
  grant_id     uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, user_id) references users (org_id, id) on delete set null (user_id)
);
create index help_requests_org_idx on help_requests (org_id, created_at desc);
alter table help_requests enable row level security;
-- The person who asked, and the company's administrators.
create policy help_requests_select on help_requests for select
  using (org_id = app_org() and (user_id = app_user() or app_has_perm('org.manage')));
create policy help_requests_insert on help_requests for insert
  with check (org_id = app_org() and user_id = app_user());
-- The only change a person makes afterwards: linking a support grant to it.
create policy help_requests_update on help_requests for update
  using (org_id = app_org() and user_id = app_user())
  with check (org_id = app_org() and user_id = app_user());
grant select, insert on help_requests to curahold_app;
grant update (grant_id, updated_at) on help_requests to curahold_app;

create table help_files (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  request_id   uuid not null,
  name         text not null check (length(name) between 1 and 200),
  mime         text not null,
  size         int not null,
  storage_key  text not null,
  created_at   timestamptz not null default now(),
  foreign key (org_id, request_id) references help_requests (org_id, id) on delete cascade
);
alter table help_files enable row level security;
create policy help_files_select on help_files for select
  using (org_id = app_org() and exists (select 1 from help_requests h where h.id = help_files.request_id));
create policy help_files_insert on help_files for insert
  with check (org_id = app_org() and exists (select 1 from help_requests h where h.id = help_files.request_id and h.user_id = app_user()));
grant select, insert on help_files to curahold_app;

create table support_grants (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  user_id      uuid not null,
  level        text not null default 'view' check (level in ('view', 'edit')),
  expires_at   timestamptz not null,
  request_id   uuid,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  revoked_by   uuid,
  last_used_at timestamptz,
  unique (org_id, id),
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);
create index support_grants_active_idx on support_grants (org_id, expires_at) where revoked_at is null;
alter table support_grants enable row level security;
create policy support_grants_select on support_grants for select
  using (org_id = app_org() and (user_id = app_user() or app_has_perm('org.manage')));
create policy support_grants_insert on support_grants for insert
  with check (org_id = app_org() and user_id = app_user());
-- Revoking: the person who granted it, or an administrator.
create policy support_grants_update on support_grants for update
  using (org_id = app_org() and (user_id = app_user() or app_has_perm('org.manage')))
  with check (org_id = app_org());
grant select, insert, update on support_grants to curahold_app;

-- Support's own sessions, apart from people's sessions: they never count
-- towards a device limit and never show among a person's devices. Opened only
-- through a one-time entry link (10 minutes) while the grant is active.
create table support_sessions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  grant_id     uuid not null,
  staff        text not null check (length(staff) between 3 and 200),
  entry_hash   text unique,
  token_hash   text unique,
  created_at   timestamptz not null default now(),
  entered_at   timestamptz,
  last_seen_at timestamptz,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  foreign key (org_id, grant_id) references support_grants (org_id, id) on delete cascade
);
alter table support_sessions enable row level security;

grant usage on sequence help_request_number to curahold_app;
