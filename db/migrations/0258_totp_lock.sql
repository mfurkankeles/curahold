-- Curahold — wrong authenticator codes are counted per person, across sign-ins (security audit L2).
--
-- A sign-in's second step allowed five tries per step token, but every new e-mail
-- link brings a new token. Someone who already controls the mailbox could keep
-- asking for links and guessing. api/src/lib/identity.ts useTotp now counts wrong
-- codes here and stops the person's codes for 15 minutes after ten in a row, as the
-- support desk already does; a right code clears the count. Additive; only the
-- server's own role (curahold_system) reads user_totp.
alter table user_totp add column failed int not null default 0 check (failed >= 0);
alter table user_totp add column locked_until timestamptz;
