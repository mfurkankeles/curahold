-- Tendwell — the developer platform: personal API keys, apps connected
-- with OAuth (Claude, ChatGPT and other AI assistants), and webhooks.
-- A key or an app always acts as the person who made it, with that
-- person's role, reach and field access, and never more.

-- Personal API keys and OAuth access tokens. Only hashes are stored.
create table api_tokens (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  user_id        uuid not null,
  kind           text not null check (kind in ('key', 'oauth')),
  name           text not null check (length(name) between 1 and 80),
  token_hash     text not null unique,
  -- OAuth only: refresh token (hash) and the app it was given to.
  refresh_hash   text unique,
  client_id      text,
  -- Read only, or read and write (still limited by the person's own rights).
  can_write      boolean not null default false,
  prefix         text not null,
  expires_at     timestamptz,
  refresh_expires_at timestamptz,
  last_used_at   timestamptz,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now(),
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);
create index api_tokens_user_idx on api_tokens (org_id, user_id) where revoked_at is null;
alter table api_tokens enable row level security;
-- People manage their own keys; administrators can see and revoke anyone's.
create policy api_tokens_select on api_tokens for select
  using (org_id = app_org() and (user_id = app_user() or app_has_perm('users.manage')));
create policy api_tokens_insert on api_tokens for insert
  with check (org_id = app_org() and user_id = app_user());
create policy api_tokens_update on api_tokens for update
  using (org_id = app_org() and (user_id = app_user() or app_has_perm('users.manage')))
  with check (org_id = app_org());
grant select, insert, update on api_tokens to tendwell_app;

-- Apps that registered themselves (OAuth dynamic client registration).
create table oauth_clients (
  id             text primary key,
  name           text not null,
  redirect_uris  text[] not null,
  created_at     timestamptz not null default now()
);
-- One-time codes, valid for minutes. Server-side only (owner access).
create table oauth_codes (
  code_hash      text primary key,
  org_id         uuid not null references orgs(id) on delete cascade,
  user_id        uuid not null,
  client_id      text not null references oauth_clients(id) on delete cascade,
  redirect_uri   text not null,
  challenge      text not null,
  can_write      boolean not null,
  expires_at     timestamptz not null,
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);
alter table oauth_clients enable row level security;
alter table oauth_codes enable row level security;

-- Webhooks: Tendwell tells another system when something changes.
create table webhooks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  url            text not null check (url ~ '^https://' and length(url) <= 500),
  events         text[] not null,
  -- The signing secret, sealed like other credentials.
  secret         text not null,
  active         boolean not null default true,
  failures       int not null default 0,
  last_status    int,
  last_at        timestamptz,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, created_by) references users (org_id, id) on delete set null (created_by)
);
alter table webhooks enable row level security;
create policy webhooks_all on webhooks for all
  using (org_id = app_org() and app_has_perm('connections.manage'))
  with check (org_id = app_org() and app_has_perm('connections.manage'));
-- The secret can be written but never read back by the app role.
grant select (id, org_id, url, events, active, failures, last_status, last_at, created_by, created_at) on webhooks to tendwell_app;
grant insert, update, delete on webhooks to tendwell_app;

-- What happened, waiting to be sent. Written by triggers, so every path
-- (screen, API, CRM sync, automations) is covered the same way.
create table webhook_events (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  event          text not null,
  entity_id      uuid not null,
  created_at     timestamptz not null default now(),
  state          text not null default 'pending' check (state in ('pending', 'sent', 'failed')),
  attempts       int not null default 0,
  next_at        timestamptz not null default now()
);
create index webhook_events_pending_idx on webhook_events (next_at) where state = 'pending';
alter table webhook_events enable row level security;

create function webhook_capture() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ev text;
begin
  -- Nothing is written unless the company has a webhook that wants it.
  ev := tg_argv[0] || case when tg_op = 'INSERT' then '.created' else '.updated' end;
  if exists (select 1 from webhooks w where w.org_id = new.org_id and w.active and ev = any (w.events)) then
    -- Many changes to one thing within a minute are sent once.
    if not exists (select 1 from webhook_events e where e.org_id = new.org_id and e.entity_id = new.id and e.event = ev
                    and e.state = 'pending' and e.created_at > now() - interval '1 minute') then
      insert into webhook_events (org_id, event, entity_id) values (new.org_id, ev, new.id);
    end if;
  end if;
  return new;
end $$;

create trigger tasks_webhook after insert or update on tasks for each row execute function webhook_capture('task');
create trigger accounts_webhook after insert or update on accounts for each row execute function webhook_capture('account');
create trigger records_webhook after insert or update on records for each row execute function webhook_capture('record');
create trigger comments_webhook after insert on comments for each row execute function webhook_capture('comment');
