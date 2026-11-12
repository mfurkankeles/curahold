-- Curahold — the support desk gets a screen and people of its own.
--
-- Until now the desk was an API opened by one shared key. Now each member of
-- Curahold's team signs in with a one-time code sent to their own address,
-- takes a request, answers it, and what they did is written down.
--
-- Everything here is Curahold's own, across companies: none of it has a
-- policy or a grant, so the application's role (curahold_app) and the
-- portal's can neither read nor write it. Only the owner connection the desk
-- routes use reaches these tables.

-- Request references stop carrying the product's old working name.
alter table help_requests alter column ref set default ('CH-' || lpad(nextval('help_request_number')::text, 6, '0'));
update help_requests set ref = 'CH-' || substr(ref, 4) where ref like 'TW-%';

-- A sign-in code for the desk. Only its digest is kept; five wrong tries and it is spent.
create table desk_codes (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (length(email) <= 320),
  code_hash   text not null,
  attempts    int not null default 0,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index desk_codes_email_idx on desk_codes (email, created_at desc);
alter table desk_codes enable row level security;

-- Who at Curahold has taken a request.
create table desk_claims (
  request_id  uuid primary key references help_requests (id) on delete cascade,
  staff_email text not null check (length(staff_email) <= 320),
  at          timestamptz not null default now()
);
alter table desk_claims enable row level security;

-- What the desk did: who signed in, who opened, answered, took or closed which request.
create table desk_log (
  id          bigint generated always as identity primary key,
  staff_email text not null check (length(staff_email) <= 320),
  action      text not null check (length(action) <= 60),
  ref         text check (length(ref) <= 40),
  org_id      uuid references orgs (id) on delete set null,
  message_id  uuid,
  at          timestamptz not null default now()
);
create index desk_log_at_idx on desk_log (at desc);
create index desk_log_ref_idx on desk_log (ref, at desc);
alter table desk_log enable row level security;
