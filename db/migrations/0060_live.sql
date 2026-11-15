-- The live channel's change numbers (api/src/live/).
--
-- Every write to what the open pages show leaves a row in live_changes: which
-- company, what kind of thing (tasks, records, accounts, unread), and the
-- boards, customers and people it touched — ids only, never the data. When the
-- writing transaction commits, the row gets the company's next change number
-- (live_seq): 1, 2, 3… per company, without gaps, in commit order. A client
-- that lost its connection says "I had up to 41" and gets 42 onwards, so no
-- change is missed. NOTIFY curahold_live tells a self-hosted server to look.
--
-- Statement triggers (one row per statement, not per row), so an import of
-- ten thousand tasks is one change. The number is taken by a constraint
-- trigger deferred to commit: the company's counter row is locked only for
-- the moment of committing, not for the whole transaction.
--
-- Kept short: the last 5000 changes of a company. A client further behind
-- than that is told to reload what it shows (nothing is lost, it is just not
-- replayed one by one).

create table live_seq (
  org_id uuid primary key references orgs(id) on delete cascade,
  seq    bigint not null
);

create table live_changes (
  id       bigint generated always as identity primary key,
  org_id   uuid not null references orgs(id) on delete cascade,
  -- Null until the writing transaction commits; then the company's next number.
  seq      bigint,
  kind     text not null check (kind in ('tasks', 'records', 'accounts', 'unread')),
  boards   uuid[] not null default '{}',
  accounts uuid[] not null default '{}',
  users    uuid[] not null default '{}',
  at       timestamptz not null default now()
);
create unique index live_changes_seq_idx on live_changes (org_id, seq);

alter table live_seq enable row level security;
alter table live_changes enable row level security;
-- Read under the company's own scope; written only by the trigger functions below (the owner).
create policy live_seq_select on live_seq for select using (org_id = app_org());
create policy live_changes_select on live_changes for select using (org_id = app_org());
grant select on live_seq, live_changes to curahold_app;

-- One row per company per statement: what changed, where. (A company being deleted
-- in this statement leaves nothing: its rows go with it.)
create function live_note() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  src text;
  cols text;
  kind text;
begin
  src := case tg_op when 'INSERT' then 'live_new' when 'DELETE' then 'live_old'
         else '(select * from live_new union all select * from live_old)' end;
  case tg_table_name
    when 'tasks' then kind := 'tasks'; cols := 'x.org_id, x.board_id as b, x.account_id as a, null::uuid as u from %s x';
    when 'sprints' then kind := 'tasks'; cols := 'x.org_id, x.board_id as b, null::uuid as a, null::uuid as u from %s x';
    when 'comments' then kind := 'tasks'; cols := 'x.org_id, t.board_id as b, t.account_id as a, null::uuid as u from %s x left join tasks t on t.id = x.task_id';
    when 'records' then kind := 'records'; cols := 'x.org_id, null::uuid as b, x.account_id as a, null::uuid as u from %s x';
    when 'accounts' then kind := 'accounts'; cols := 'x.org_id, null::uuid as b, x.id as a, null::uuid as u from %s x';
    when 'activities', 'planned_meetings' then kind := 'accounts'; cols := 'x.org_id, null::uuid as b, x.account_id as a, null::uuid as u from %s x';
    when 'notifications' then kind := 'unread'; cols := 'x.org_id, null::uuid as b, null::uuid as a, x.user_id as u from %s x';
    else return null;
  end case;
  execute format(
    'insert into live_changes (org_id, kind, boards, accounts, users)
       select org_id, %L,
              coalesce(array_agg(distinct b) filter (where b is not null), ''{}''),
              coalesce(array_agg(distinct a) filter (where a is not null), ''{}''),
              coalesce(array_agg(distinct u) filter (where u is not null), ''{}'')
         from (select ' || cols || ') s
        where exists (select 1 from orgs o where o.id = s.org_id)
        group by org_id', kind, src);
  return null;
end $$;

-- At commit: the company's next number, and a word to whoever listens.
create function live_number() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n bigint;
begin
  -- Gone again before the commit (its company deleted in the same transaction): nothing to number.
  if not exists (select 1 from live_changes where id = new.id) then
    return null;
  end if;
  insert into live_seq (org_id, seq) values (new.org_id, 1)
    on conflict (org_id) do update set seq = live_seq.seq + 1
    returning seq into n;
  update live_changes set seq = n where id = new.id;
  if n % 500 = 0 then
    delete from live_changes where org_id = new.org_id and seq <= n - 5000;
  end if;
  perform pg_notify('curahold_live', new.org_id::text);
  return null;
end $$;

create constraint trigger live_number after insert on live_changes
  deferrable initially deferred for each row execute function live_number();

do $$
declare
  t text;
begin
  foreach t in array array['tasks', 'sprints', 'comments', 'records', 'accounts', 'activities', 'planned_meetings', 'notifications'] loop
    execute format('create trigger live_note_ins after insert on %I referencing new table as live_new for each statement execute function live_note()', t);
    execute format('create trigger live_note_upd after update on %I referencing new table as live_new old table as live_old for each statement execute function live_note()', t);
    execute format('create trigger live_note_del after delete on %I referencing old table as live_old for each statement execute function live_note()', t);
  end loop;
end $$;
