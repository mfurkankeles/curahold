-- A request sent twice does its work once.
--
-- Every change the app sends carries a key of its own (the Idempotency-Key header). The first
-- transaction of that request writes the key here, so the key and the change are saved together or
-- not at all. The same key arriving again (a retry after a lost answer, a double click, a queue
-- replaying after the connection came back) finds its row and gets the first answer back instead
-- of doing the work a second time.
--
-- A key belongs to one person in one company. Rows are cleared after two days.
create table idempotency_keys (
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid not null,
  key         text not null check (length(key) between 8 and 200),
  method      text not null,
  path        text not null,
  -- What was asked, so the same key on a different request is refused rather than answered wrongly.
  body_hash   text not null,
  -- The first answer; empty until that request has finished.
  status      int,
  response    jsonb,
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id, key)
);
create index idempotency_keys_age on idempotency_keys (created_at);

alter table idempotency_keys enable row level security;
create policy idempotency_keys_own on idempotency_keys
  using (org_id = app_org() and user_id = app_user())
  with check (org_id = app_org() and user_id = app_user());
grant select, insert, update, delete on idempotency_keys to curahold_app;
