-- Errors, recorded. An unhandled server error or a browser error was only ever
-- written to the server console and lost. Now each one lands here — what
-- happened, where, and (when known) for whom — so a real fault can be seen and
-- fixed instead of guessed at. The person still gets a plain message that says
-- what to do; this is the record behind it.
--
-- Written only by the owner connection (the app on a 500, or the browser
-- through /client-error); never by the tenant role. An administrator can read
-- their own company's errors; rows with no company (a fault before sign-in)
-- stay with the Curahold team. No request bodies, headers or secrets are kept
-- here — only the message, where it happened and a stack.

create table error_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references orgs(id) on delete cascade,
  user_id     uuid,
  at          timestamptz not null default now(),
  source      text not null check (source in ('server', 'browser')),
  method      text check (method is null or length(method) <= 10),
  path        text check (path is null or length(path) <= 500),
  message     text not null check (length(message) <= 1000),
  detail      text check (detail is null or length(detail) <= 4000),
  agent       text check (agent is null or length(agent) <= 300),
  request_id  text check (request_id is null or length(request_id) <= 80)
);
create index error_log_at_idx on error_log (at);
create index error_log_org_idx on error_log (org_id, at desc) where org_id is not null;

alter table error_log enable row level security;
-- An administrator reads their own company's errors. Writes go through the
-- owner connection, which is not subject to this, so there is no write policy.
create policy error_log_select on error_log for select
  using (org_id = app_org() and app_has_perm('org.manage'));

grant select on error_log to curahold_app;
