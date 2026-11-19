-- The public side of the free-trial request (the form on app.<domain>/signup)
-- and the evidence it leaves. The request itself is stored in trial_requests
-- (0110, the owner console's migration); these tables hold what the form and
-- the activation step need around it:
--
--   trial_codes      one-time codes that prove the work e-mail before the form is sent
--   consent_records  append-only: every notice shown and every choice made, with the
--                    version, the hash of the exact text read, the time and the country
--   org_agreements   the terms of service and DPA a new company's administrator accepts
--                    with a click before the trial opens (and again on a new version)
--   trial_reminders  which trial e-mails (14/7/1 days, ended) went out, once each
--
-- All four are central (no company in the address) and written by the server
-- over the owner connection. Only org_agreements is readable by the company
-- itself: its administrator sees what was accepted, when and by whom.

create table trial_codes (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email = lower(email) and length(email) <= 254),
  code_hash   text not null,
  -- A hash of the network address (never the address itself): enough to count requests.
  ip_hash     text,
  tries       int not null default 0,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index trial_codes_email_idx on trial_codes (email, created_at desc);
create index trial_codes_ip_idx on trial_codes (ip_hash, created_at desc);
alter table trial_codes enable row level security;

-- No foreign key to trial_requests on purpose: the evidence of what someone was
-- shown and agreed to must outlive a request that is later deleted or anonymised.
create table consent_records (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid,
  org_id      uuid references orgs(id) on delete set null,
  email       text not null check (email = lower(email) and length(email) <= 254),
  -- The block (e.g. 'tr.notice', 'kr.transfer', 'any.marketing.email') and its text version.
  block       text not null check (block ~ '^[a-z0-9_.-]{2,60}$'),
  version     text not null check (length(version) between 1 and 40),
  kind        text not null check (kind in ('notice', 'consent', 'marketing', 'withdrawal')),
  locale      text not null,
  -- sha256 of the exact sentence shown, in the language it was shown in.
  text_hash   text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  granted     boolean not null,
  ip_country  text check (ip_country is null or ip_country ~ '^[A-Z]{2}$'),
  -- Where it happened: the trial form, a link in an e-mail (withdrawal), the console.
  source      text not null default 'trial_form' check (source in ('trial_form', 'email_link', 'console')),
  created_at  timestamptz not null default now()
);
create index consent_records_request_idx on consent_records (request_id, created_at);
create index consent_records_email_idx on consent_records (email, created_at desc);
alter table consent_records enable row level security;

create table org_agreements (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  doc            text not null check (doc in ('terms', 'dpa')),
  version        text not null check (length(version) between 1 and 40),
  text_hash      text check (text_hash is null or text_hash ~ '^[0-9a-f]{64}$'),
  locale         text,
  due_at         timestamptz not null default now(),
  accepted_at    timestamptz,
  accepted_by    uuid,
  accepted_email text,
  accepted_name  text,
  ip_country     text check (ip_country is null or ip_country ~ '^[A-Z]{2}$'),
  user_agent     text check (user_agent is null or length(user_agent) <= 400),
  unique (org_id, doc, version)
);
create index org_agreements_due_idx on org_agreements (org_id) where accepted_at is null;
alter table org_agreements enable row level security;
-- The company reads its own record; writing goes through the server only.
create policy org_agreements_select on org_agreements for select using (org_id = app_org());
grant select on org_agreements to curahold_app;

create table trial_reminders (
  org_id         uuid not null references orgs(id) on delete cascade,
  kind           text not null check (kind in ('d14', 'd7', 'd1', 'ended')),
  -- A trial that is extended has a new end, and its reminders go out again.
  trial_ends_at  timestamptz not null,
  sent_at        timestamptz not null default now(),
  primary key (org_id, kind, trial_ends_at)
);
alter table trial_reminders enable row level security;
