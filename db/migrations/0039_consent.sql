-- An auditable record of consent choices made inside the product. The banner in
-- the browser is the source of truth for what loads (nothing non-essential runs
-- without a stored, granted choice); this table is the durable, per-person trail
-- a KVKK/GDPR review asks for — who allowed which category, and when.
--
-- It is org- and user-scoped like the rest of the schema. It is append-only: a
-- changed choice is a new row, so the history stays intact. The marketing site
-- is static and anonymous and writes nothing here; only the signed-in app does.

create table consent_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid not null,
  -- "necessary" is always on and is not a choice, so it is not stored; these two are.
  analytics   boolean not null default false,
  marketing   boolean not null default false,
  -- Where the choice was made. The product writes 'app'; 'site' is reserved for a future, signed-in surface.
  source      text not null default 'app' check (source in ('app', 'site')),
  user_agent  text check (user_agent is null or length(user_agent) <= 400),
  created_at  timestamptz not null default now(),
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);
-- The person's own history, newest first.
create index consent_log_user_idx on consent_log (org_id, user_id, created_at desc);

alter table consent_log enable row level security;

-- A person sees and records only their own consent. No write seat is required —
-- a viewer consents too — and there is no update or delete policy: the log is
-- append-only, and a person's rows leave with them (the cascade above).
create policy consent_log_select on consent_log for select
  using (org_id = app_org() and user_id = app_user());
create policy consent_log_insert on consent_log for insert
  with check (org_id = app_org() and user_id = app_user());

grant select, insert on consent_log to curahold_app;
