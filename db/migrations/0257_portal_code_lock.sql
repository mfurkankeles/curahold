-- Curahold — the customer portal's e-mail code is guessed one try at a time, and a
-- person's codes lock after ten wrong tries (security audit M5).
--
-- The try counter on a code was read, compared and raised in separate statements,
-- so parallel guesses all saw the same count; and each new code (five an hour)
-- brought five new guesses. api/src/portalSignIn.ts now locks the person's row,
-- raises the counter in the statement that checks the limit, and counts wrong
-- codes per person here: ten in a row stop that person's codes for 15 minutes, as
-- portal_passwords already does for passwords. Additive; only the server's own
-- role (curahold_system) reads these columns.
alter table portal_users add column code_failed int not null default 0 check (code_failed >= 0);
alter table portal_users add column code_locked_until timestamptz;
