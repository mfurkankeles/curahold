-- Curahold's own support staff sign in to the desk with an emailed code AND an
-- authenticator app (TOTP, api/src/routes/desk.ts). One row per staff address:
-- the sealed secret, whether it is confirmed, the last step used (no code works
-- twice) and wrong tries (five in a quarter hour lock it for that long).
-- Like the desk's other tables: row-level security on, no privilege for the
-- request roles; only the server's own desk code reads it.
create table desk_factors (
  email          text primary key check (length(email) <= 320),
  secret_sealed  text not null,
  confirmed_at   timestamptz,
  last_step      bigint not null default 0,
  fails          int not null default 0,
  failed_at      timestamptz,
  created_at     timestamptz not null default now()
);
alter table desk_factors enable row level security;
revoke all on desk_factors from curahold_app;
