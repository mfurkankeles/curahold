-- Curahold — phase 3: records attached to accounts (contacts, opportunities
-- and anything else a CRM holds), two-way sync with CRMs and spreadsheets,
-- and a permission of its own for connected tools. Same rules as before:
-- every business row carries org_id and row-level security keeps companies
-- apart.

-- -------------------------------------------------------------- permission

-- Connecting tools used to need "company settings"; it is now its own right.
-- Everyone who could connect tools before still can.
update roles set perms = array(select distinct unnest(perms || array['connections.manage']))
 where 'org.manage' = any (perms);

drop policy connections_write on connections;
create policy connections_write on connections for all
  using (org_id = app_org() and app_has_perm('connections.manage'))
  with check (org_id = app_org() and app_has_perm('connections.manage'));

drop policy chat_identities_all on chat_identities;
create policy chat_identities_all on chat_identities for all
  using (org_id = app_org() and (user_id = app_user() or app_has_perm('connections.manage')))
  with check (org_id = app_org() and (user_id = app_user() or app_has_perm('connections.manage')));

-- Where each sync stands: per-object cursors and the last result. Kept apart
-- from `config` (what an administrator chose) so a running sync never
-- overwrites a mapping someone is editing.
alter table connections add column state jsonb not null default '{}'::jsonb;

-- ----------------------------------------------------------------- records

-- Kinds of records kept under an account: contacts, opportunities, risks,
-- renewals, cases… Built-in kinds have known fields Curahold can reason about
-- (an opportunity's amount and whether it is still open); custom kinds are
-- whatever the company or its CRM defines.
create table record_types (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  key          text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  -- {"one": {"en": "Contact", "tr": "Kişi"}, "other": {"en": "Contacts", "tr": "Kişiler"}}
  name         jsonb not null,
  kind         text not null default 'custom' check (kind in ('contact', 'opportunity', 'custom')),
  -- Same shape as orgs.account_fields.
  fields       jsonb not null default '[]'::jsonb,
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz,
  unique (org_id, key),
  unique (org_id, id)
);

create table records (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  type_id      uuid not null,
  account_id   uuid,
  name         text not null check (length(name) between 1 and 300),
  owner_id     uuid,
  fields       jsonb not null default '{}'::jsonb,
  source       text not null default 'manual' check (length(source) <= 60),
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz,
  unique (org_id, id),
  foreign key (org_id, type_id) references record_types (org_id, id) on delete cascade,
  foreign key (org_id, account_id) references accounts (org_id, id) on delete cascade,
  foreign key (org_id, owner_id) references users (org_id, id) on delete set null (owner_id),
  foreign key (org_id, created_by) references users (org_id, id) on delete set null (created_by)
);
create index records_account_idx on records (org_id, account_id, type_id) where archived_at is null;
create index records_type_idx on records (org_id, type_id, lower(name));

-- -------------------------------------------------------------------- sync

-- One row per item that exists on both sides: which CRM object and id it is
-- there, which account/record/task it is here, and fingerprints of the
-- mapped values as last agreed — so an unchanged side is never rewritten and
-- our own writes are not read back as someone else's change.
create table sync_links (
  org_id              uuid not null references orgs(id) on delete cascade,
  connection_id       uuid not null,
  object              text not null check (length(object) between 1 and 120),
  remote_id           text not null check (length(remote_id) between 1 and 200),
  entity              text not null check (entity in ('account', 'record', 'task')),
  -- Empty once the item was deleted here: the CRM row is then left alone
  -- instead of being brought back by the next sync.
  entity_id           uuid,
  ignored             boolean not null default false,
  remote_hash         text,
  local_hash          text,
  remote_modified_at  timestamptz,
  synced_at           timestamptz not null default now(),
  primary key (connection_id, object, remote_id),
  foreign key (org_id, connection_id) references connections (org_id, id) on delete cascade
);
create unique index sync_links_entity_idx on sync_links (connection_id, entity, entity_id) where entity_id is not null;
create index sync_links_lookup_idx on sync_links (org_id, entity, entity_id) where entity_id is not null;

create function sync_links_forget() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update sync_links set entity_id = null, ignored = true where entity = tg_argv[0] and entity_id = old.id;
  delete from sync_changes where entity = tg_argv[0] and entity_id = old.id;
  return old;
end
$$;

-- Changes made here that still have to reach the CRM. One row per item and
-- connection; later edits merge into it until it is delivered.
create table sync_changes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  connection_id  uuid not null,
  entity         text not null check (entity in ('account', 'record', 'task')),
  entity_id      uuid not null,
  -- Local field keys that changed; null means "send everything" (new item).
  fields         text[],
  changed_at     timestamptz not null default now(),
  attempts       int not null default 0,
  next_at        timestamptz not null default now(),
  last_error     text,
  unique (connection_id, entity, entity_id),
  foreign key (org_id, connection_id) references connections (org_id, id) on delete cascade
);
create index sync_changes_due_idx on sync_changes (next_at);

create trigger accounts_sync_forget after delete on accounts for each row execute function sync_links_forget('account');
create trigger records_sync_forget after delete on records for each row execute function sync_links_forget('record');
create trigger tasks_sync_forget after delete on tasks for each row execute function sync_links_forget('task');

-- Every sync run, for the history screen and for support.
create table sync_runs (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  connection_id  uuid not null,
  mode           text not null check (mode in ('incremental', 'full')),
  trigger        text not null check (trigger in ('schedule', 'manual', 'setup', 'change')),
  started_by     uuid,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running' check (status in ('running', 'ok', 'partial', 'error')),
  -- Stopped to stay within its time limit; the next run carries on.
  more           boolean not null default false,
  -- {"Account": {"created": 3, "updated": 12, "pushed": 2, "archived": 0, "failed": 1}}
  stats          jsonb not null default '{}'::jsonb,
  -- [{"object": "Account", "remoteId": "001…", "name": "…", "message": "…"}] (first 50)
  errors         jsonb not null default '[]'::jsonb,
  unique (org_id, id),
  foreign key (org_id, connection_id) references connections (org_id, id) on delete cascade,
  foreign key (org_id, started_by) references users (org_id, id) on delete set null (started_by)
);
create index sync_runs_conn_idx on sync_runs (connection_id, started_at desc);

-- --------------------------------------------------------------------- RLS

alter table record_types  enable row level security;
alter table records       enable row level security;
alter table sync_links    enable row level security;
alter table sync_changes  enable row level security;
alter table sync_runs     enable row level security;

create policy record_types_select on record_types for select using (org_id = app_org());
create policy record_types_write on record_types for all
  using (org_id = app_org() and app_has_perm('accounts.manage'))
  with check (org_id = app_org() and app_has_perm('accounts.manage'));

create policy records_select on records for select using (org_id = app_org());
create policy records_insert on records for insert with check (org_id = app_org() and app_can_write());
create policy records_update on records for update
  using (org_id = app_org()) with check (org_id = app_org() and app_can_write());
create policy records_delete on records for delete using (org_id = app_org() and app_has_perm('accounts.manage'));

-- Anyone may see that an item is linked to a CRM; only the sync changes links.
create policy sync_links_select on sync_links for select using (org_id = app_org());
create policy sync_links_write on sync_links for all
  using (org_id = app_org() and app_has_perm('connections.manage'))
  with check (org_id = app_org() and app_has_perm('connections.manage'));

-- Whoever edits a linked item queues the change for the CRM.
create policy sync_changes_all on sync_changes for all
  using (org_id = app_org()) with check (org_id = app_org());

create policy sync_runs_select on sync_runs for select
  using (org_id = app_org() and app_has_perm('connections.manage'));

grant select, insert, update, delete on record_types, records, sync_links, sync_changes to curahold_app;
grant select on sync_runs to curahold_app;
grant select (state) on connections to curahold_app;
