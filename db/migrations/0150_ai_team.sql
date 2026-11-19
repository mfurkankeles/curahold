-- Curahold — the AI team's foundation, on top of the shared model in
-- 0110_owner_console.sql (seats, agents, queues, approvals, company log,
-- memory, meetings, audit, pauses). Added here:
--   * the owner's chats with each seat (threads + messages, full history),
--   * golden-task results (a seat is active only after passing them),
--   * the wake pre-check's cursor (a wake with nothing new costs nothing),
--   * output-check findings on each approval card.
-- Like 0110: Curahold's own data across companies — row security on, no
-- policy, no grant; only the owner connection reaches it.

alter table seats add column activated_at timestamptz;
alter table approvals add column checks jsonb;
-- A meeting's model spend so far (its token budget is enforced on it) and who is speaking now (live view).
alter table meetings add column spent_tokens int not null default 0;
alter table meetings add column speaking text check (length(speaking) <= 41);

-- A conversation with one seat: the owner's private chat (or, later, a person in the seat).
create table agent_threads (
  id          uuid primary key default gen_random_uuid(),
  seat        text not null references seats (seat) on delete cascade,
  title       text not null default '' check (length(title) <= 200),
  -- Rolling summary of the older part of the thread (the agent reads this, not the whole history).
  summary     text check (length(summary) <= 8000),
  -- Messages folded into the summary (by id): newer ones are read as they are.
  summarized_to bigint not null default 0,
  created_at  timestamptz not null default now(),
  last_at     timestamptz not null default now()
);
create index agent_threads_seat_idx on agent_threads (seat, last_at desc);
alter table agent_threads enable row level security;

create table agent_messages (
  id         bigint generated always as identity primary key,
  thread     uuid not null references agent_threads (id) on delete cascade,
  role       text not null check (role in ('owner', 'agent', 'system')),
  body       text not null check (length(body) between 1 and 16000),
  -- Tokens and cost of the reply (agent messages), output-check findings, tasks/proposals it made.
  meta       jsonb not null default '{}'::jsonb,
  at         timestamptz not null default now()
);
create index agent_messages_thread_idx on agent_messages (thread, id);
alter table agent_messages enable row level security;

-- Golden-task results, newest first per seat and task.
create table seat_evals (
  id         bigint generated always as identity primary key,
  seat       text not null references seats (seat) on delete cascade,
  task       text not null check (length(task) <= 80),
  passed     boolean not null,
  -- 'model' (a judge model scored the rubric) or 'checks' (deterministic checks only).
  judge      text not null check (judge in ('model', 'checks')),
  score      numeric(4, 2),
  output     text check (length(output) <= 16000),
  detail     jsonb not null default '{}'::jsonb,
  at         timestamptz not null default now()
);
create index seat_evals_seat_idx on seat_evals (seat, task, at desc);
alter table seat_evals enable row level security;

-- The wake pre-check's cursor per seat: what it had already seen.
create table agent_wakes (
  seat        text primary key references seats (seat) on delete cascade,
  checked_at  timestamptz not null default now(),
  seen_log    bigint not null default 0,
  ran_at      timestamptz,
  -- 'skipped' (nothing new: no model call), 'ran', 'paused', 'inactive', 'budget'.
  last_result text not null default 'skipped',
  skipped     int not null default 0,
  ran         int not null default 0
);
alter table agent_wakes enable row level security;
