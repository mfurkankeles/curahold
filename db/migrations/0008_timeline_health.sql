-- Tendwell — the customer timeline and an explainable health score.
--
-- Activities are what happened with a customer: notes, calls, meetings,
-- emails. Together with task changes, comments and score changes they make
-- the customer's timeline, and they are what "last touch" counts from.
--
-- The health score is worked out from Tendwell's own data with weights each
-- company chooses, and is kept as an ordinary (calculated) customer field so
-- lists, filters, cards, exports, the API and CRM syncs all see it. It is
-- recomputed only when something about that customer changes (marked here
-- by triggers, picked up right after the request) and once a day for the
-- passing of time. One snapshot per customer per day gives the trend.

create table activities (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  account_id   uuid not null,
  author_id    uuid,
  kind         text not null check (kind in ('note', 'call', 'meeting', 'email')),
  body         text not null check (length(body) between 1 and 20000),
  happened_at  timestamptz not null default now(),
  contact_ids  uuid[] not null default '{}',
  pinned       boolean not null default false,
  source       text not null default 'manual' check (length(source) <= 60),
  external_id  text check (length(external_id) <= 200),
  created_at   timestamptz not null default now(),
  edited_at    timestamptz,
  unique (org_id, id),
  foreign key (org_id, account_id) references accounts (org_id, id) on delete cascade,
  foreign key (org_id, author_id) references users (org_id, id) on delete set null (author_id)
);
create index activities_account_idx on activities (org_id, account_id, happened_at desc);
create unique index activities_external_idx on activities (org_id, source, external_id) where external_id is not null;

alter table activities enable row level security;
-- Activities follow their customer: whoever sees the customer sees them.
create policy activities_select on activities for select
  using (org_id = app_org() and exists (select 1 from accounts a where a.id = activities.account_id));
create policy activities_insert on activities for insert
  with check (org_id = app_org() and app_can_write() and author_id = app_user()
              and exists (select 1 from accounts a where a.id = activities.account_id));
-- Changed or removed by whoever wrote it, or by people who manage customers.
create policy activities_update on activities for update
  using (org_id = app_org() and (author_id = app_user() or app_has_perm('accounts.manage'))
         and exists (select 1 from accounts a where a.id = activities.account_id))
  with check (org_id = app_org() and app_can_write());
create policy activities_delete on activities for delete
  using (org_id = app_org() and app_can_write() and (author_id = app_user() or app_has_perm('accounts.manage'))
         and exists (select 1 from accounts a where a.id = activities.account_id));
grant select, insert, update, delete on activities to tendwell_app;

create trigger activities_webhook after insert on activities for each row execute function webhook_capture('activity');

-- ------------------------------------------------------------ health score

-- Customers whose score may have changed. Written by triggers, emptied
-- right after the request (and by the hourly run, for anything missed).
create table health_dirty (
  org_id      uuid not null references orgs(id) on delete cascade,
  account_id  uuid not null,
  marked_at   timestamptz not null default now(),
  primary key (org_id, account_id)
);
alter table health_dirty enable row level security;

create function health_mark(p_org uuid, p_account uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_account is null then return; end if;
  -- Only companies that switched the score on pay for keeping it.
  if exists (select 1 from orgs o where o.id = p_org and coalesce((o.settings->'health'->>'enabled')::boolean, false)) then
    insert into health_dirty (org_id, account_id) values (p_org, p_account) on conflict do nothing;
  end if;
end $$;

create function health_mark_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec record;
begin
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;
  if tg_table_name = 'accounts' then
    -- The score writing itself back is not a change to react to.
    if tg_op = 'UPDATE' and (new.fields - 'health_score') is not distinct from (old.fields - 'health_score')
       and new.archived_at is not distinct from old.archived_at then
      return null;
    end if;
    perform health_mark(rec.org_id, rec.id);
  elsif tg_table_name = 'comments' then
    perform health_mark(rec.org_id, (select t.account_id from tasks t where t.id = rec.task_id));
  else
    perform health_mark(rec.org_id, rec.account_id);
    if tg_op = 'UPDATE' and old.account_id is distinct from new.account_id then
      perform health_mark(old.org_id, old.account_id);
    end if;
  end if;
  return null;
end $$;

create trigger accounts_health after insert or update on accounts for each row execute function health_mark_row();
create trigger tasks_health after insert or update or delete on tasks for each row execute function health_mark_row();
create trigger records_health after insert or update or delete on records for each row execute function health_mark_row();
create trigger activities_health after insert or update or delete on activities for each row execute function health_mark_row();
create trigger comments_health after insert on comments for each row execute function health_mark_row();

-- One score per customer per day, for the trend and the weekly summary.
create table health_history (
  org_id      uuid not null references orgs(id) on delete cascade,
  account_id  uuid not null,
  day         date not null,
  score       smallint not null check (score between 0 and 100),
  primary key (org_id, account_id, day),
  foreign key (org_id, account_id) references accounts (org_id, id) on delete cascade
);
alter table health_history enable row level security;
create policy health_history_select on health_history for select
  using (org_id = app_org() and exists (select 1 from accounts a where a.id = health_history.account_id));
grant select on health_history to tendwell_app;

-- The score's settings live with the company. People who manage customers
-- tune them without needing the rest of the company settings.
create function app_set_health(p_health jsonb, p_fields jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app_has_perm('accounts.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update orgs set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('health', p_health),
                  account_fields = coalesce(p_fields, account_fields)
   where id = app_org();
end $$;
grant execute on function app_set_health(jsonb, jsonb) to tendwell_app;

-- ------------------------------------------------------------ task finished

-- When a task reached a "done" column: for the timeline, the weekly summary
-- and reports. Kept by the database, so every way of finishing a task (the
-- board, the API, a chat button, a sync) sets it.
alter table tasks add column done_at timestamptz;

create function task_done_at() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  is_done boolean;
begin
  select exists (select 1 from boards b, jsonb_array_elements(b.columns) col
                  where b.id = new.board_id and col->>'key' = new.status and (col->>'done')::boolean)
    into is_done;
  if not is_done then
    new.done_at := null;
  elsif tg_op = 'INSERT' then
    new.done_at := coalesce(new.done_at, now());
  elsif old.done_at is null then
    new.done_at := now();
  end if; -- moving between two "done" columns keeps the first time
  return new;
end $$;
create trigger tasks_done_at before insert or update of status, board_id on tasks for each row execute function task_done_at();

update tasks t set done_at = t.updated_at
 where exists (select 1 from boards b, jsonb_array_elements(b.columns) col
                where b.id = t.board_id and col->>'key' = t.status and (col->>'done')::boolean);
create index tasks_done_idx on tasks (org_id, done_at) where done_at is not null;
