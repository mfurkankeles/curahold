-- The trial form's consent step now shows the compliance package's texts
-- (shared/src/compliance/consentTexts.ts), whose block ids carry the rule set
-- in capitals ('TR.M1', 'AE.C', 'ALL.A'). Records stored before keep their
-- lower-case ids ('tr.m1', 'any.marketing'); both stay valid.
alter table consent_records drop constraint consent_records_block_check;
alter table consent_records add constraint consent_records_block_check check (block ~ '^[A-Za-z0-9_.-]{2,60}$');
