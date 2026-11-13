-- Planned meetings. The logged meetings in 0020 are the past: what already
-- happened with a customer. This is the future — a meeting someone has put on
-- the calendar but not held yet: its type, when it starts, who is invited from
-- both sides, the agenda, and whether it repeats.
--
-- A planned meeting has a life: it starts `planned`, and ends `held`,
-- `postponed` or `cancelled`. Marking it held writes the logged meeting
-- (an activity, 0020) and links the two, so what was planned turns into what
-- happened on the customer's timeline without re-typing it. Postponing or
-- cancelling keeps a short reason. Nothing is deleted in v1: a meeting that is
-- off is cancelled, not removed, so the history of what was planned stays.
--
-- The type is one of the three meeting kinds (meeting / review / call) so it
-- lands cleanly as an activity when held; a company can also give it a label
-- of its own ("Kickoff", "QBR") and seed the agenda from a saved prompt
-- (orgs.settings.meetingTypes), neither of which needs a column here.

create table planned_meetings (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  account_id   uuid not null,
  kind         text not null default 'meeting' check (kind in ('meeting', 'review', 'call')),
  type_label   text not null default '' check (length(type_label) <= 80),
  title        text not null default '' check (length(title) <= 300),
  agenda       text not null default '' check (length(agenda) <= 20000),
  starts_at    timestamptz not null,
  minutes      int check (minutes is null or minutes between 1 and 1440),
  status       text not null default 'planned' check (status in ('planned', 'held', 'postponed', 'cancelled')),
  reason       text not null default '' check (length(reason) <= 2000),
  contact_ids  uuid[] not null default '{}',
  user_ids     uuid[] not null default '{}',
  repeat       text not null default 'none' check (repeat in ('none', 'weekly', 'biweekly', 'monthly', 'quarterly')),
  created_by   uuid,
  -- When held, the logged meeting (activity) it became.
  activity_id  uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, account_id) references accounts (org_id, id) on delete cascade,
  foreign key (org_id, created_by) references users (org_id, id) on delete set null (created_by),
  foreign key (org_id, activity_id) references activities (org_id, id) on delete set null (activity_id)
);

-- The customer page lists a company's upcoming meetings soonest first.
create index planned_meetings_account_idx on planned_meetings (org_id, account_id, starts_at);
-- The calendar reads the ones still to come across a window.
create index planned_meetings_window_idx on planned_meetings (org_id, starts_at) where status = 'planned';

alter table planned_meetings enable row level security;

-- Same reach as the customer page itself: anyone in the company can see a
-- planned meeting on an account they can see; whoever can write can plan one;
-- the person who planned it, or someone who manages customers, can change it.
-- No delete policy: v1 does not remove planned meetings (cancel instead); the
-- row only goes when its account does, through the cascade above.
create policy planned_meetings_select on planned_meetings for select
  using (org_id = app_org() and exists (select 1 from accounts a where a.id = planned_meetings.account_id));
create policy planned_meetings_insert on planned_meetings for insert
  with check (org_id = app_org() and app_can_write() and created_by = app_user()
              and exists (select 1 from accounts a where a.id = planned_meetings.account_id));
create policy planned_meetings_update on planned_meetings for update
  using (org_id = app_org() and (created_by = app_user() or app_has_perm('accounts.manage'))
         and exists (select 1 from accounts a where a.id = planned_meetings.account_id))
  with check (org_id = app_org() and app_can_write());

grant select, insert, update on planned_meetings to curahold_app;
