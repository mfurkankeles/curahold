-- The assistant (api/src/assistant): what it costs, what it may answer again
-- without asking the model, and what was asked (only as long as the company
-- keeps it).
--
-- Usage is counted per company and month, and once more for the whole
-- installation (the global monthly cap). The global row holds numbers only,
-- no company's data. Cached answers are per company (a public docs question
-- has no company: org_id null). Logs belong to the person who asked; the
-- company's privacy managers may read them; they go when the person goes and
-- when the company's retention runs out (lib/scheduler.ts, and at each write).

create table assistant_usage (
  org_id             uuid not null references orgs(id) on delete cascade,
  month              date not null,
  questions          integer not null default 0,
  model_questions    integer not null default 0,
  input_tokens       bigint not null default 0,
  output_tokens      bigint not null default 0,
  cache_read_tokens  bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  cost_micros        bigint not null default 0,
  primary key (org_id, month)
);
alter table assistant_usage enable row level security;
create policy assistant_usage_rw on assistant_usage for all
  using (org_id = app_org()) with check (org_id = app_org());
grant select, insert, update on assistant_usage to curahold_app;

create table assistant_global (
  month           date primary key,
  questions       integer not null default 0,
  model_questions integer not null default 0,
  cost_micros     bigint not null default 0
);
-- Numbers only, for the installation-wide cap: every request may read and add to them.
alter table assistant_global enable row level security;
create policy assistant_global_rw on assistant_global for all using (true) with check (true);
grant select, insert, update on assistant_global to curahold_app;

create table assistant_cache (
  key        text primary key check (length(key) = 64),
  org_id     uuid references orgs(id) on delete cascade,
  reply      jsonb not null,
  hits       integer not null default 0,
  created_at timestamptz not null default now()
);
create index assistant_cache_age_idx on assistant_cache (created_at);
alter table assistant_cache enable row level security;
create policy assistant_cache_rw on assistant_cache for all
  using (org_id is not distinct from app_org()) with check (org_id is not distinct from app_org());
grant select, insert, update, delete on assistant_cache to curahold_app;

create table assistant_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid,
  surface     text not null check (length(surface) <= 20),
  question    text check (length(question) <= 4000),
  kind        text not null check (length(kind) <= 20),
  engine      text not null check (length(engine) <= 10),
  sources     jsonb not null default '[]'::jsonb,
  cost_micros bigint not null default 0,
  created_at  timestamptz not null default now(),
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);
create index assistant_log_org_idx on assistant_log (org_id, created_at);
alter table assistant_log enable row level security;
create policy assistant_log_insert on assistant_log for insert
  with check (org_id = app_org() and (user_id is null or user_id = app_user()));
create policy assistant_log_select on assistant_log for select
  using (org_id = app_org() and (user_id = app_user() or app_has_perm('privacy.manage')));
create policy assistant_log_delete on assistant_log for delete
  using (org_id = app_org() and (user_id = app_user() or app_has_perm('privacy.manage')));
grant select, insert, delete on assistant_log to curahold_app;
