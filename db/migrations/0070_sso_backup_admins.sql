-- Backup administrators for a company that requires SSO (api/src/routes/sso.ts, auth.ts).
--
-- If the identity provider stops working, nobody could sign in. Up to two
-- administrators chosen here keep the emailed link, always followed by their
-- passkey or authenticator app (never the link alone); every such sign-in goes
-- in the activity log and is emailed to every other administrator. SSO cannot
-- be required until at least one of them has a second step.
alter table sso_configs
  add column backup_admin_ids uuid[] not null default '{}'
    check (cardinality(backup_admin_ids) <= 2);
-- Readable like the rest of the non-secret config (the column grant of 0043 names each column).
grant select (backup_admin_ids) on sso_configs to curahold_app;

-- A sign-in waiting for its second step remembers that it is a backup administrator's,
-- so only a passkey or the authenticator app finishes it, and the others are told.
alter table identity_steps add column backup boolean not null default false;
