-- Curahold — the owner console (desk.<domain>) becomes the owner's cockpit,
-- and the AI team gets one shared data model.
--
-- Trial requests from the sales site wait here for the owner's yes. Plan
-- targets, the go-live checklist's progress and the console's own settings
-- are the owner's. Seats (roles, filled by an agent, a person, or a person
-- with an agent as assistant), the agents in them, their queues, the approval
-- queue, the shared company log, each seat's memory, meetings with minutes,
-- the audit trail and the pause switches are what the Office and the agents
-- read and write.
--
-- Everything here is Curahold's own, across companies: no policy and no
-- grant, so the application's role (curahold_app) and the portal's can
-- neither read nor write it. Only the owner connection the console's and the
-- agents' routes use reaches these tables.

-- ------------------------------------------------------------ trial requests

create sequence trial_request_number start 1001;
create table trial_requests (
  id                 uuid primary key default gen_random_uuid(),
  ref                text not null unique default ('TQ-' || lpad(nextval('trial_request_number')::text, 6, '0')),
  status             text not null default 'new' check (status in ('new', 'contacted', 'approved', 'rejected')),
  name               text not null check (length(name) between 1 and 120),
  email              text not null check (email = lower(email) and length(email) <= 320),
  email_verified_at  timestamptz not null,
  company            text not null check (length(company) between 1 and 160),
  country            text not null check (country ~ '^[A-Z]{2}$'),
  departments        text[] not null default '{}' check (departments <@ array['sales', 'success', 'product', 'finance']),
  seats              int check (seats between 1 and 100000),
  -- The rest of the form, as the site sent it (shared/src/trialRequest.ts TrialRequestInput).
  details            jsonb not null default '{}'::jsonb,
  -- Which texts were shown and agreed to, with version and digest; marketing permission; IP country.
  consent            jsonb not null default '{}'::jsonb,
  contacted_at       timestamptz,
  decided_at         timestamptz,
  decided_by         text check (length(decided_by) <= 320),
  seat_cap           int check (seat_cap between 1 and 100000),
  trial_ends_at      timestamptz,
  created_org        uuid references orgs (id) on delete set null,
  reject_reason      text check (length(reject_reason) <= 2000),
  reply_draft        text check (length(reply_draft) <= 8000),
  note               text check (length(note) <= 4000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index trial_requests_status_idx on trial_requests (status, created_at desc);
create index trial_requests_company_idx on trial_requests (lower(company));
create index trial_requests_domain_idx on trial_requests (split_part(email, '@', 2));
alter table trial_requests enable row level security;

-- A trial's seat cap, set when the owner approves a request (null: no cap).
alter table orgs add column trial_seat_cap int check (trial_seat_cap between 1 and 100000);

-- The console's own settings (e.g. trial.seatCap, trial.months).
create table console_settings (
  key         text primary key check (key ~ '^[a-z][a-zA-Z0-9_.]{1,60}$'),
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text check (length(updated_by) <= 320)
);
alter table console_settings enable row level security;

-- ------------------------------------------------------------ plan & targets

-- A target for one metric in one month ("2026-12").
create table plan_targets (
  metric      text not null check (metric ~ '^[a-z][a-z_]{1,40}$'),
  period      text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  target      numeric not null check (target >= 0),
  updated_at  timestamptz not null default now(),
  updated_by  text check (length(updated_by) <= 320),
  primary key (metric, period)
);
alter table plan_targets enable row level security;

-- What the owner does today / this week / this month.
create table plan_tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(title) between 1 and 300),
  due_on      date not null,
  done_at     timestamptz,
  source      text not null default 'owner' check (source in ('owner', 'plan', 'agent')),
  created_at  timestamptz not null default now()
);
create index plan_tasks_due_idx on plan_tasks (due_on);
alter table plan_tasks enable row level security;

-- The go-live checklist's items live in the repo (shared/src/checklist.ts); this is his progress.
create table checklist_progress (
  item          text primary key check (item ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  status        text not null default 'todo' check (status in ('todo', 'done', 'skipped')),
  note          text check (length(note) <= 4000),
  evidence      text check (length(evidence) <= 1000),
  triggered_at  timestamptz,
  trigger_why   text check (length(trigger_why) <= 500),
  at            timestamptz not null default now(),
  by_email      text check (length(by_email) <= 320)
);
alter table checklist_progress enable row level security;

-- ------------------------------------------------------------ the AI team

-- A seat: a role with its card. Filled by an agent, a person, or a person with the agent as assistant.
create table seats (
  seat           text primary key check (seat ~ '^[a-z][a-z0-9-]{1,40}$'),
  title          text not null check (length(title) between 1 and 120),
  -- One line in Turkish: what the seat does.
  title_tr       text not null default '' check (length(title_tr) <= 200),
  team           text not null check (team ~ '^[a-z][a-z0-9-]{1,40}$'),
  reports_to     text references seats (seat) on delete set null,
  tier           text not null check (tier in ('ceo-office', 'executive', 'lead', 'specialist', 'advisor', 'note-taker')),
  state          text not null default 'on-call' check (state in ('standing', 'on-call', 'dormant')),
  filled_by      text not null default 'agent' check (filled_by in ('agent', 'human', 'human-with-agent')),
  human_email    text check (length(human_email) <= 320),
  cadence        text check (length(cadence) <= 120),
  -- Tokens a week; the agent pauses and tells the COO when it is reached.
  weekly_budget  int not null default 0 check (weekly_budget >= 0),
  -- For a dormant seat: what wakes it, in plain words.
  wake_trigger   text check (length(wake_trigger) <= 500),
  -- mission, responsibilities, kpis, inputs, outputs, playbook, tools, permissions.
  card           jsonb not null default '{}'::jsonb,
  -- Digest of the seat's own key (agents call /api/agent with it); null: no key.
  key_hash       text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table seats enable row level security;

-- An agent (an AI persona) sitting in a seat. A seat can be handed over; the agent row stays for history.
create table agents (
  id            uuid primary key default gen_random_uuid(),
  seat          text references seats (seat) on delete set null,
  name          text not null check (length(name) between 1 and 60),
  avatar        text check (length(avatar) <= 300),
  model         text check (length(model) <= 60),
  effort        text check (length(effort) <= 20),
  last_run_at   timestamptz,
  next_run_at   timestamptz,
  last_summary  text check (length(last_summary) <= 2000),
  created_at    timestamptz not null default now()
);
create unique index agents_seat_idx on agents (seat) where seat is not null;
alter table agents enable row level security;

-- Usage per seat per week (week = its Monday).
create table agent_usage (
  seat      text not null references seats (seat) on delete cascade,
  week      date not null,
  tokens    bigint not null default 0 check (tokens >= 0),
  cost_usd  numeric(12, 4) not null default 0 check (cost_usd >= 0),
  runs      int not null default 0 check (runs >= 0),
  primary key (seat, week)
);
alter table agent_usage enable row level security;

-- A seat's work queue.
create table agent_tasks (
  id          uuid primary key default gen_random_uuid(),
  seat        text not null references seats (seat) on delete cascade,
  title       text not null check (length(title) between 1 and 300),
  detail      text check (length(detail) <= 8000),
  status      text not null default 'queued' check (status in ('queued', 'running', 'done', 'blocked', 'cancelled')),
  priority    text not null default 'normal' check (priority in ('urgent', 'normal', 'low')),
  from_seat   text check (length(from_seat) <= 41),
  due_at      timestamptz,
  result      text check (length(result) <= 8000),
  created_at  timestamptz not null default now(),
  done_at     timestamptz
);
create index agent_tasks_seat_idx on agent_tasks (seat, status, created_at);
alter table agent_tasks enable row level security;

-- Meetings, with or without the owner, and their minutes (written by the note-taker seat).
create table meetings (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(title) between 1 and 200),
  goal          text check (length(goal) <= 2000),
  called_by     text not null check (length(called_by) <= 41),
  with_owner    boolean not null default false,
  attendees     text[] not null default '{}',
  status        text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended', 'cancelled')),
  starts_at     timestamptz,
  time_box_min  int check (time_box_min between 1 and 600),
  token_budget  int check (token_budget >= 0),
  started_at    timestamptz,
  ended_at      timestamptz,
  -- { agenda[], items[{topic, summary}], decisions[], actions[{seat, what, due}], openQuestions[], transcriptUrl }
  minutes       jsonb,
  created_at    timestamptz not null default now()
);
create index meetings_at_idx on meetings (created_at desc);
alter table meetings enable row level security;

-- What was said in a meeting, line by line ("owner" for the owner's own words).
create table meeting_lines (
  id       bigint generated always as identity primary key,
  meeting  uuid not null references meetings (id) on delete cascade,
  speaker  text not null check (length(speaker) <= 41),
  body     text not null check (length(body) between 1 and 8000),
  at       timestamptz not null default now()
);
create index meeting_lines_idx on meeting_lines (meeting, id);
alter table meeting_lines enable row level security;

-- The approval queue. Agents propose; only the owner, signed in to the console, decides.
create sequence approval_number start 1;
create table approvals (
  id               uuid primary key default gen_random_uuid(),
  ref              text not null unique default ('AP-' || lpad(nextval('approval_number')::text, 5, '0')),
  title            text not null check (length(title) between 1 and 200),
  summary          text not null default '' check (length(summary) <= 4000),
  why              text not null default '' check (length(why) <= 4000),
  what_changes     text not null default '' check (length(what_changes) <= 4000),
  proposed_by      text not null check (length(proposed_by) <= 41),
  discussed_with   text[] not null default '{}',
  risk             text not null default 'low' check (risk in ('low', 'medium', 'high')),
  risk_note        text check (length(risk_note) <= 2000),
  cost_usd         numeric(12, 2) check (cost_usd >= 0),
  usage_tokens     bigint check (usage_tokens >= 0),
  reversible       boolean not null default true,
  undo_note        text check (length(undo_note) <= 2000),
  link             text check (length(link) <= 1000),
  meeting          uuid references meetings (id) on delete set null,
  priority         text not null default 'normal' check (priority in ('urgent', 'normal', 'low')),
  -- What runs after a yes: { kind, ...payload }. Nothing runs without one.
  action           jsonb not null default '{}'::jsonb,
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'meeting', 'done', 'failed')),
  decided_at       timestamptz,
  decided_by       text check (length(decided_by) <= 320),
  decision_note    text check (length(decision_note) <= 4000),
  -- The owner's edits before his yes (fields he changed).
  edited           jsonb,
  result           text check (length(result) <= 4000),
  result_at        timestamptz,
  created_at       timestamptz not null default now()
);
create index approvals_status_idx on approvals (status, created_at);
alter table approvals enable row level security;

-- The shared company log every seat writes to and reads its own slice of.
create table company_log (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  seat    text not null check (length(seat) <= 41),
  kind    text not null check (kind in ('note', 'report', 'decision', 'handoff', 'alert', 'thread')),
  thread  uuid,
  body    text not null check (length(body) between 1 and 8000),
  ref     text check (length(ref) <= 200),
  meta    jsonb not null default '{}'::jsonb
);
create index company_log_at_idx on company_log (at desc);
create index company_log_seat_idx on company_log (seat, at desc);
create index company_log_thread_idx on company_log (thread, id) where thread is not null;
alter table company_log enable row level security;

-- Each seat's own memory: what stays with the seat when the person or agent in it changes.
create table agent_memory (
  seat        text not null references seats (seat) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9][a-z0-9._-]{0,80}$'),
  value       text not null check (length(value) <= 16000),
  updated_at  timestamptz not null default now(),
  primary key (seat, key)
);
alter table agent_memory enable row level security;

-- The audit trail: every tool call, read, message and proposal, with seat and time. Never changed.
create table agent_audit (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  seat    text not null check (length(seat) <= 41),
  actor   text not null check (actor in ('agent', 'human', 'owner', 'system')),
  action  text not null check (length(action) between 1 and 80),
  target  text check (length(target) <= 300),
  detail  jsonb not null default '{}'::jsonb
);
create index agent_audit_at_idx on agent_audit (at desc);
create index agent_audit_seat_idx on agent_audit (seat, at desc);
alter table agent_audit enable row level security;

create function agent_audit_frozen() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'agent_audit is append-only';
end $$;
create trigger agent_audit_no_update before update or delete on agent_audit for each row execute function agent_audit_frozen();
create trigger agent_audit_no_truncate before truncate on agent_audit for each statement execute function agent_audit_frozen();

-- Pause switches: one seat, one team, or every agent. Open while resumed_at is null.
create table agent_pauses (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null check (scope in ('all', 'team', 'seat')),
  target      text check (length(target) <= 41),
  reason      text check (length(reason) <= 500),
  paused_at   timestamptz not null default now(),
  paused_by   text not null check (length(paused_by) <= 320),
  resumed_at  timestamptz,
  resumed_by  text check (length(resumed_by) <= 320),
  check ((scope = 'all') = (target is null))
);
create index agent_pauses_open_idx on agent_pauses (scope, target) where resumed_at is null;
alter table agent_pauses enable row level security;

-- ------------------------------------------------------------ the sales site's own numbers

-- First-party, consent-bound counts per day and site variant, written by the site's analytics
-- (no third-party tracker). The console's Overview and Plan & targets read them.
create table site_daily (
  day         date not null,
  variant     text not null default 'site' check (variant ~ '^[a-z0-9-]{1,20}$'),
  visitors    int not null default 0 check (visitors >= 0),
  form_starts int not null default 0 check (form_starts >= 0),
  requests    int not null default 0 check (requests >= 0),
  primary key (day, variant)
);
alter table site_daily enable row level security;
