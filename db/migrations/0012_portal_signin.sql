-- Tendwell — ways for customers' people to sign in to the portal, chosen
-- by each company: an email link with a code, Google, Microsoft, passkeys
-- and (if wanted) a password. Everything here is reached only with owner
-- access by the portal's own sign-in routes: row-level security is on and
-- no role has a policy, so neither the app nor the portal role can read it.

-- Links and codes: an invitation, a sign-in email (link + six-digit code),
-- the hand-over after Google/Microsoft, the one-time confirmation of a new
-- Microsoft sign-in, and a password reset.
alter table portal_tokens add column kind text not null default 'link'
  check (kind in ('invite', 'link', 'oauth', 'oauth_confirm', 'reset'));
alter table portal_tokens add column code_hash text;
alter table portal_tokens add column attempts int not null default 0;
-- The browser that started a Google/Microsoft sign-in must be the one that finishes it.
alter table portal_tokens add column flow_hash text;
alter table portal_tokens add column provider text check (provider in ('google', 'microsoft'));
alter table portal_tokens add column subject text;
create index portal_tokens_user_idx on portal_tokens (org_id, portal_user_id, created_at desc);

-- A Google or Microsoft account linked to a portal person (by the provider's own id).
create table portal_identities (
  org_id         uuid not null references orgs(id) on delete cascade,
  portal_user_id uuid not null,
  provider       text not null check (provider in ('google', 'microsoft')),
  subject        text not null check (length(subject) between 1 and 255),
  email          text not null,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz,
  primary key (org_id, provider, subject),
  foreign key (org_id, portal_user_id) references portal_users (org_id, id) on delete cascade
);
alter table portal_identities enable row level security;

create table portal_passkeys (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  portal_user_id uuid not null,
  credential_id  text not null,
  public_key     text not null,
  counter        bigint not null default 0,
  transports     text[] not null default '{}',
  name           text not null default '' check (length(name) <= 80),
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz,
  unique (org_id, credential_id),
  foreign key (org_id, portal_user_id) references portal_users (org_id, id) on delete cascade
);
alter table portal_passkeys enable row level security;

-- One-time passkey challenges (five minutes).
create table portal_challenges (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  portal_user_id uuid,
  kind           text not null check (kind in ('register', 'login')),
  challenge      text not null,
  expires_at     timestamptz not null,
  used_at        timestamptz
);
alter table portal_challenges enable row level security;

-- Kept apart from portal_users, which people inside the company can read.
create table portal_passwords (
  org_id         uuid not null references orgs(id) on delete cascade,
  portal_user_id uuid not null,
  hash           text not null,
  set_at         timestamptz not null default now(),
  failed         int not null default 0,
  locked_until   timestamptz,
  primary key (org_id, portal_user_id),
  foreign key (org_id, portal_user_id) references portal_users (org_id, id) on delete cascade
);
alter table portal_passwords enable row level security;

-- How a session was opened: closing a way of signing in ends its sessions.
alter table portal_sessions add column method text not null default 'link'
  check (method in ('invite', 'link', 'code', 'google', 'microsoft', 'passkey', 'password'));
alter table portal_sessions add column client text check (length(client) <= 120);
