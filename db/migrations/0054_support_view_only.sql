-- Curahold staff reach a customer's data only with the customer's explicit,
-- time-boxed permission, and only to look (owner's target, 15 Nov 2026).
-- "Edit" grants are gone: open ones become read only, and no new one can be
-- written. Every visit is in the company's activity log (support.entered,
-- support.viewed; api/src/lib/support.ts).
update support_grants set level = 'view' where level <> 'view';
alter table support_grants drop constraint if exists support_grants_level_check;
alter table support_grants add constraint support_grants_level_check check (level = 'view');
