-- The personal-data breach log (package l2-privacy, 20 Nov 2026;
-- docs/compliance/breach-runbook.md, scripts/compliance/incident.ts).
--
-- GDPR Art. 33(5), KVKK (Kurul kararı 2019/10) and the DPA (§7) require a
-- record of every personal-data breach — including the ones not notified —
-- with the facts, the effects, what was done and why a notification was or was
-- not made. Curahold's own record, outside any company: no row security policy
-- for the app role (nobody reaches it through the product), written by the
-- operator with the script. Rows are never deleted or rewritten: a correction
-- is a new entry pointing at the one it corrects.
create table incident_log (
  id             uuid primary key default gen_random_uuid(),
  ref            text not null unique default ('INC-' || to_char(now(), 'YYYYMMDD-HH24MISS')),
  corrects       uuid references incident_log (id),
  detected_at    timestamptz not null,
  aware_at       timestamptz not null,
  recorded_at    timestamptz not null default now(),
  recorded_by    text not null check (length(recorded_by) between 3 and 320),
  severity       text not null check (severity in ('sev1', 'sev2', 'sev3')),
  summary        text not null check (length(summary) between 1 and 2000),
  data_kinds     text[] not null default '{}',
  companies      int check (companies >= 0),
  people         int check (people >= 0),
  laws           text[] not null default '{}',
  notified       jsonb not null default '[]'::jsonb,
  not_notified_reason text check (length(not_notified_reason) <= 2000),
  actions        text check (length(actions) <= 4000)
);
alter table incident_log enable row level security;

create function incident_log_frozen() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'incident_log is append-only (% refused)', tg_op using errcode = 'insufficient_privilege';
end;
$$;
create trigger incident_log_no_change before update or delete on incident_log for each row execute function incident_log_frozen();
create trigger incident_log_no_truncate before truncate on incident_log for each statement execute function incident_log_frozen();
