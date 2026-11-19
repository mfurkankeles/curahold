-- The analytics feed: one read-only way for BI tools (Power BI, Excel, Fabric,
-- Tableau, Qlik, Zoho Analytics, the Looker Studio connector, scripts) to read
-- a company's data, as OData v4 and as plain JSON/CSV (api/src/routes/analytics.ts).
--
-- An analytics key is a kind of API key: read only, good for the feed and
-- nothing else, limited to the datasets and departments chosen when it was
-- made, and it acts as the person who made it (their role, reach and fields),
-- so a BI tool never sees more than that person sees in Curahold.

alter table api_tokens drop constraint if exists api_tokens_kind_check;
alter table api_tokens add constraint api_tokens_kind_check check (kind in ('key', 'oauth', 'analytics'));
-- Analytics keys only: which datasets (null = every one the person may read) and which departments (null = all).
alter table api_tokens add column datasets text[];
alter table api_tokens add column departments text[];
-- When the secret was last replaced (the key keeps its name, scope and history).
alter table api_tokens add column rotated_at timestamptz;

-- Every pull from the feed: who (key and person), which dataset, how many rows,
-- the query, the tool that asked. Exact counts for the daily row budget and for
-- the admin page; kept 400 days (lib/scheduler.ts cleanUp).
create table analytics_pulls (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references orgs(id) on delete cascade,
  token_id    uuid references api_tokens(id) on delete set null,
  user_id     uuid,
  dataset     text not null check (length(dataset) <= 80),
  face        text not null check (face in ('odata', 'json', 'csv')),
  rows        int not null check (rows >= 0),
  query       text check (length(query) <= 1000),
  client      text check (length(client) <= 200),
  at          timestamptz not null default now(),
  foreign key (org_id, user_id) references users (org_id, id) on delete set null (user_id)
);
create index analytics_pulls_org_at_idx on analytics_pulls (org_id, at desc);
create index analytics_pulls_token_idx on analytics_pulls (token_id, at desc) where token_id is not null;
alter table analytics_pulls enable row level security;
-- Written by the person the key acts as (even on a read-only seat); read by the
-- person themselves and by people who manage people (the admin page).
create policy analytics_pulls_insert on analytics_pulls for insert with check (org_id = app_org() and user_id = app_user());
create policy analytics_pulls_select on analytics_pulls for select
  using (org_id = app_org() and (user_id = app_user() or app_has_perm('users.manage') or app_has_perm('org.manage')));
grant select, insert on analytics_pulls to curahold_app;

-- The company's rows pulled in the last 24 hours, counted exactly on every isolate.
create function app_analytics_rows_today() returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(rows), 0)::bigint from analytics_pulls where org_id = app_org() and at > now() - interval '24 hours'
$$;
grant execute on function app_analytics_rows_today() to curahold_app;

-- Paging by modified time and id, so "changed since" (BI incremental refresh) is an index read.
create index if not exists accounts_feed_idx on accounts (org_id, updated_at, id);
create index if not exists tasks_feed_idx on tasks (org_id, updated_at, id);
create index if not exists records_feed_idx on records (org_id, type_id, updated_at, id);
create index if not exists health_history_feed_idx on health_history (org_id, day, account_id);
