-- Session replay for Curahold's own support: so the team can see what a
-- person did before an error, the browser records the page (rrweb) with every
-- input masked, and keeps it for a week. The recording is disclosed and the
-- company can switch it off (orgs.settings.recordSessions); every playback is
-- written to the support desk's log.
--
-- A company never reads its own replays — only Curahold's desk does, through
-- the owner connection. So, like the desk's own tables, these have row-level
-- security on with no policy and no grant: the application's database role
-- (curahold_app) cannot touch them at all. The ingest endpoint writes through
-- the owner connection, scoped in code to the signed-in person.

create table replay_sessions (
  id           uuid primary key,
  org_id       uuid not null references orgs(id) on delete cascade,
  user_id      uuid not null,
  -- The sign-in session this recording belongs to (a reload starts a new recording).
  auth_session uuid,
  started_at   timestamptz not null default now(),
  last_at      timestamptz not null default now(),
  -- Rough signposts, so the desk can choose a recording without opening it.
  page_first   text,
  page_last    text,
  events       int not null default 0,
  bytes        bigint not null default 0,
  had_error    boolean not null default false,
  agent        text,
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade
);
create index replay_sessions_find on replay_sessions (org_id, user_id, last_at desc);
create index replay_sessions_age on replay_sessions (last_at);

create table replay_chunks (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references replay_sessions(id) on delete cascade,
  org_id      uuid not null,
  seq         int not null,
  -- The recording's events for this chunk, gzipped then base64url: opaque text
  -- to the database (base64, not bytea, to round-trip the same on every driver).
  body        text not null,
  created_at  timestamptz not null default now(),
  unique (session_id, seq)
);
create index replay_chunks_of on replay_chunks (session_id, seq);
create index replay_chunks_age on replay_chunks (created_at);

-- On, with no policy and no grant: only the owner connection (the support
-- desk, and the ingest endpoint acting for the signed-in person) touches them.
alter table replay_sessions enable row level security;
alter table replay_chunks enable row level security;
