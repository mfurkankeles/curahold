-- Connectors of 20 November (B19).
--
-- 1. Azure DevOps joins GitHub and GitLab as a place code is linked to tasks from (service hooks).
-- 2. Incoming webhooks: any tool that can call a web address (e-signature, telephony, chat widgets, payment
--    services, Zapier, Make, a company's own code) posts to the company's own address for one hook; the delivery is
--    checked (an HMAC signature or a shared token, a timestamp window, and each event id once), then mapped onto a
--    task, a support ticket, a customer timeline entry or a note on a deal, which a later delivery of the same item
--    updates instead of duplicating.
--
--    inbound_hooks       one per company and source: how the sender proves itself, what it makes, the mapping.
--                        The secret Curahold gives out is HMAC(server key, company | hook | salt): shown, never
--                        stored (like dev_hooks). A secret the sender generates itself (some e-signature and chat
--                        tools do) is sealed in `sealed`, readable by owner access only.
--    inbound_deliveries  the log: every delivery with its outcome and the payload (cut to 20,000 characters), kept
--                        30 days and at most 500 per hook; also the replay guard (hook, event id) — a delivery whose
--                        event id was seen is answered 200 and skipped.
--    inbound_links       which Curahold item a sender's own id became, so "create or update" finds it again.
--
-- The receiver has no signed-in person: it reads the hook with owner access anchored to the company the address
-- belongs to, and writes every row with that company's id. People with connections.manage manage hooks and read
-- the log; nobody else sees either.
-- Undo: db/rollback/0245_connectors_b19.sql.

alter table dev_hooks drop constraint dev_hooks_provider_check;
alter table dev_hooks add constraint dev_hooks_provider_check check (provider in ('github', 'gitlab', 'azuredevops'));
alter table dev_links drop constraint dev_links_provider_check;
alter table dev_links add constraint dev_links_provider_check check (provider in ('github', 'gitlab', 'azuredevops'));

create table inbound_hooks (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  name             text not null check (length(name) between 1 and 120),
  -- The recipe it was made from (esign, aircall, tawkto, razorpay, curahold, custom…): screens and docs only.
  source           text not null check (source ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  -- { scheme: curahold | hmac | token, header, algo, encoding, prefix, field, maxAgeSec, eventId, timestamp }
  auth             jsonb not null default '{}'::jsonb,
  salt             text not null check (length(salt) between 16 and 100),
  sealed           text,
  target           text not null check (target in ('task', 'ticket', 'activity', 'deal_note')),
  mapping          jsonb not null default '{}'::jsonb,
  enabled          boolean not null default true,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_delivery_at timestamptz,
  unique (org_id, id),
  foreign key (org_id, created_by) references users (org_id, id) on delete set null (created_by)
);
create index inbound_hooks_org_idx on inbound_hooks (org_id, created_at);
alter table inbound_hooks enable row level security;
create policy inbound_hooks_select on inbound_hooks for select using (org_id = app_org() and app_has_perm('connections.manage'));
create policy inbound_hooks_insert on inbound_hooks for insert with check (org_id = app_org() and app_has_perm('connections.manage'));
create policy inbound_hooks_update on inbound_hooks for update
  using (org_id = app_org() and app_has_perm('connections.manage'))
  with check (org_id = app_org() and app_has_perm('connections.manage'));
create policy inbound_hooks_delete on inbound_hooks for delete using (org_id = app_org() and app_has_perm('connections.manage'));
-- The sealed sender secret is not readable through the request role.
grant select (id, org_id, name, source, auth, salt, target, mapping, enabled, created_by, created_at, updated_at, last_delivery_at) on inbound_hooks to curahold_app;
grant insert (org_id, name, source, auth, salt, target, mapping, enabled, created_by) on inbound_hooks to curahold_app;
grant update (name, auth, salt, target, mapping, enabled, updated_at) on inbound_hooks to curahold_app;
grant delete on inbound_hooks to curahold_app;

create table inbound_deliveries (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  hook_id     uuid not null,
  received_at timestamptz not null default now(),
  event_id    text check (event_id is null or length(event_id) <= 200),
  status      text not null check (status in ('ok', 'skipped', 'failed', 'rejected')),
  test        boolean not null default false,
  error       text check (error is null or length(error) <= 500),
  -- { kind, id, action: created | updated } of what was made.
  result      jsonb,
  payload     text check (payload is null or length(payload) <= 20000),
  foreign key (org_id, hook_id) references inbound_hooks (org_id, id) on delete cascade
);
create index inbound_deliveries_hook_idx on inbound_deliveries (hook_id, received_at desc);
create unique index inbound_deliveries_event_idx on inbound_deliveries (hook_id, event_id) where event_id is not null and status in ('ok', 'skipped');
alter table inbound_deliveries enable row level security;
create policy inbound_deliveries_select on inbound_deliveries for select using (org_id = app_org() and app_has_perm('connections.manage'));
grant select on inbound_deliveries to curahold_app;

create table inbound_links (
  org_id      uuid not null references orgs(id) on delete cascade,
  hook_id     uuid not null,
  external_id text not null check (length(external_id) between 1 and 200),
  kind        text not null check (kind in ('task', 'ticket', 'activity', 'deal_note')),
  target_id   uuid not null,
  created_at  timestamptz not null default now(),
  primary key (hook_id, external_id),
  foreign key (org_id, hook_id) references inbound_hooks (org_id, id) on delete cascade
);
alter table inbound_links enable row level security;
create policy inbound_links_select on inbound_links for select using (org_id = app_org() and app_has_perm('connections.manage'));
grant select on inbound_links to curahold_app;
