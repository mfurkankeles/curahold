-- Meetings. A meeting, a business review or a call with a customer is an
-- activity with a little more: a title, how long it took, who was there from
-- our side, and the next steps agreed — which become tasks that remember the
-- meeting they came from. Nothing new to keep in step: the customer page reads
-- these rows as they are.

alter table activities add column title text not null default '' check (length(title) <= 300);
alter table activities add column minutes int check (minutes is null or minutes between 1 and 1440);
-- Our people who were there (the customer's people are contact_ids).
alter table activities add column user_ids uuid[] not null default '{}';

-- A meeting's notes may be empty: what was decided can live in its next steps.
-- Notes, emails and calls logged on their own still need words.
alter table activities drop constraint activities_body_check;
alter table activities add constraint activities_body_check
  check (length(body) <= 20000 and (length(body) >= 1 or kind in ('meeting', 'review', 'call')));

-- A next step agreed in a meeting is a task that remembers the meeting.
alter table tasks add column activity_id uuid;
alter table tasks add constraint tasks_activity_fk
  foreign key (org_id, activity_id) references activities (org_id, id) on delete set null (activity_id);
create index tasks_activity_idx on tasks (activity_id) where activity_id is not null;

-- The customer page lists its meetings newest first.
create index activities_meetings_idx on activities (org_id, account_id, happened_at desc)
  where kind in ('meeting', 'review', 'call');
