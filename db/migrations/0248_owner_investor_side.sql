-- Curahold — the investor side of the owner's plan, and what the console
-- sends to the owner himself.
--
-- Plan & targets gains budget against spend, fundraising windows and a manual
-- investor pipeline; the two milestone metrics of the plan (expanded and
-- switched companies) are stored in plan_targets, whose check already allows
-- their names. The weekly CEO summary and the phone alerts leave through an
-- owner outbox, one row per message with a unique key, so a week is mailed
-- once however often the hourly job runs. The owner's phones (Web Push
-- subscriptions) are kept here too.
--
-- Like the rest of the console (0110): Curahold's own, across companies; row
-- security on with no policy and no grant, so the application's role
-- (curahold_app) and the portal's can neither read nor write any of it. Only
-- the owner connection the console's routes and the scheduler use reaches
-- these tables. Additive only.

-- ------------------------------------------------------------ budget vs spend

-- One budget line for one month: what the plan allows (planned) and what was
-- really spent (actual, typed by the owner; null until he does). Amounts in
-- the plan's currency (USD), whole cents.
create table plan_budget (
  period      text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  category    text not null check (length(category) between 1 and 80),
  planned     numeric(14, 2) not null default 0 check (planned >= 0 and planned <= 1e11),
  actual      numeric(14, 2) check (actual >= 0 and actual <= 1e11),
  -- 'plan' when the loader wrote the planned amount, 'owner' when he typed a line of his own.
  source      text not null default 'owner' check (source in ('owner', 'plan')),
  updated_at  timestamptz not null default now(),
  updated_by  text check (length(updated_by) <= 320),
  primary key (period, category)
);
alter table plan_budget enable row level security;

-- ------------------------------------------------------------ fundraising windows

-- When a round could open, what it should raise and where it stands.
create table fundraising_windows (
  id            uuid primary key default gen_random_uuid(),
  -- A stable name for the loader ('pre-seed', 'seed'); null for one the owner added.
  key           text unique check (key ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name          text not null check (length(name) between 1 and 120),
  opens_on      date not null,
  closes_on     date not null,
  target_min    numeric(14, 2) check (target_min >= 0 and target_min <= 1e11),
  target_max    numeric(14, 2) check (target_max >= 0 and target_max <= 1e11),
  status        text not null default 'planned' check (status in ('planned', 'preparing', 'open', 'closed', 'skipped')),
  -- What must be true before the window opens, in the owner's words.
  conditions    text check (length(conditions) <= 2000),
  note          text check (length(note) <= 2000),
  client_key    text unique check (length(client_key) <= 200),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (closes_on >= opens_on),
  check (target_min is null or target_max is null or target_max >= target_min)
);
create index fundraising_windows_at_idx on fundraising_windows (opens_on);
alter table fundraising_windows enable row level security;

-- ------------------------------------------------------------ investor pipeline

-- The owner's own list of investors he talks to, typed by hand. Deleting puts
-- a row aside (deleted_at) for 30 days, so a slip can be undone; the nightly
-- clean-up removes it for good after that.
create table investor_pipeline (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 160),
  kind        text not null default 'angel' check (kind in ('angel', 'fund', 'public', 'accelerator', 'strategic', 'other')),
  stage       text not null default 'idea' check (stage in ('idea', 'contacted', 'meeting', 'diligence', 'term-sheet', 'committed', 'passed')),
  window_id   uuid references fundraising_windows (id) on delete set null,
  next_step   text check (length(next_step) <= 300),
  next_on     date,
  amount      numeric(14, 2) check (amount >= 0 and amount <= 1e11),
  note        text check (length(note) <= 2000),
  client_key  text unique check (length(client_key) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index investor_pipeline_next_idx on investor_pipeline (next_on) where deleted_at is null;
alter table investor_pipeline enable row level security;

-- ------------------------------------------------------------ the owner's outbox

-- What goes to the owner himself: the Monday summary by e-mail, alerts to his
-- phones. Written in the same transaction as what caused it, sent after; the
-- unique key makes a repeat a no-op (one summary per week, one push per alert).
create table owner_outbox (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('mail', 'push')),
  dedupe_key  text not null unique check (length(dedupe_key) between 1 and 200),
  -- mail: { to, subject, text }; push: { title, body, url, urgency }.
  payload     jsonb not null,
  state       text not null default 'pending' check (state in ('pending', 'sent', 'failed', 'skipped')),
  attempts    int not null default 0 check (attempts >= 0),
  not_before  timestamptz,
  error       text check (length(error) <= 500),
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index owner_outbox_pending_idx on owner_outbox (created_at) where state = 'pending';
alter table owner_outbox enable row level security;

-- The owner's phones and browsers that may receive alerts (Web Push, RFC 8030).
-- The endpoint is the push service's address for one browser; p256dh and auth
-- are that browser's public key and secret for the message encryption (RFC 8291).
create table owner_push_devices (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh      text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth        text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  label       text not null default '' check (length(label) <= 120),
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,
  failures    int not null default 0 check (failures >= 0)
);
alter table owner_push_devices enable row level security;
