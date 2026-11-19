-- Uploads held back for the optional scanner (api/src/lib/uploadScan.ts).
-- A row exists only while a file waits for the scanner ('pending'), could not
-- be scanned yet ('error', retried hourly) or was found infected ('infected',
-- its bytes already deleted). No row: the file is served as before. Without a
-- configured scanner nothing is ever written here. Only the server's own
-- connection touches it: row-level security on, no policy, no privileges for
-- the request roles.
create table file_scans (
  org_id       uuid not null references orgs(id) on delete cascade,
  storage_key  text not null check (length(storage_key) <= 300),
  status       text not null default 'pending' check (status in ('pending', 'error', 'infected')),
  note         text check (length(note) <= 200),
  attempts     int not null default 0,
  created_at   timestamptz not null default now(),
  scanned_at   timestamptz,
  primary key (org_id, storage_key)
);
create index file_scans_held_idx on file_scans (created_at) where status in ('pending', 'error');
alter table file_scans enable row level security;
revoke all on file_scans from curahold_app;
