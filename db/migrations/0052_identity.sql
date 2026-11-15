-- Identity: passkeys, an authenticator-app second step with recovery codes,
-- and a fresh confirmation before dangerous actions (api/src/lib/identity.ts).
--
-- Every table here is read and written only by the server's own sign-in code,
-- with owner access and an explicit company filter: row-level security is on and
-- the request role (curahold_app) holds no privilege on them, so nothing a
-- person can reach through the app ever reads a secret, a key or a code.

-- How a session was opened, and which second step it passed (null: none).
alter table sessions drop constraint if exists sessions_method_check;
alter table sessions add constraint sessions_method_check check (method in ('magic', 'oauth', 'passkey'));
alter table sessions add column second_step text check (second_step is null or second_step in ('totp', 'recovery', 'passkey', 'sso')),
                     -- The last time the person confirmed it is them (passkey, code or a new emailed code).
                     add column confirmed_at timestamptz;

-- Passkeys (WebAuthn credentials) of the company's people.
create table user_passkeys (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  user_id        uuid not null,
  credential_id  text not null,
  public_key     text not null,
  counter        bigint not null default 0,
  transports     text[] not null default '{}',
  name           text not null default '' check (length(name) <= 80),
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz,
  unique (org_id, credential_id),
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);
create index user_passkeys_user_idx on user_passkeys (org_id, user_id);
alter table user_passkeys enable row level security;

-- The authenticator app (TOTP, RFC 6238). The secret is sealed with the
-- server's key; last_step stops a code being used twice.
create table user_totp (
  org_id         uuid not null references orgs(id) on delete cascade,
  user_id        uuid not null,
  secret_sealed  text not null,
  confirmed_at   timestamptz,
  last_step      bigint not null default 0,
  created_at     timestamptz not null default now(),
  primary key (org_id, user_id),
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);
alter table user_totp enable row level security;

-- One-time recovery codes (sha-256 of the code; each works once).
create table user_recovery_codes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  user_id        uuid not null,
  code_hash      text not null,
  used_at        timestamptz,
  created_at     timestamptz not null default now(),
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);
create index user_recovery_codes_user_idx on user_recovery_codes (org_id, user_id);
alter table user_recovery_codes enable row level security;

-- Short-lived steps: a sign-in waiting for its second step ('second'), passkey
-- challenges ('login', 'register'), and the code of a fresh confirmation ('confirm').
create table identity_steps (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  user_id        uuid,
  kind           text not null check (kind in ('second', 'login', 'register', 'confirm')),
  token_hash     text,
  challenge      text,
  code_hash      text,
  device_id      text,
  device_label   text,
  method         text check (method is null or method in ('magic', 'oauth')),
  attempts       int not null default 0,
  expires_at     timestamptz not null,
  used_at        timestamptz,
  created_at     timestamptz not null default now(),
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);
create unique index identity_steps_token_idx on identity_steps (token_hash) where token_hash is not null;
create index identity_steps_user_idx on identity_steps (org_id, user_id, kind);
alter table identity_steps enable row level security;

revoke all on user_passkeys, user_totp, user_recovery_codes, identity_steps from curahold_app;
