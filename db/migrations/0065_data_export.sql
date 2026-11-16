-- Curahold — exporting is a permission of its own ('data.export').
--
-- A file of customers, records, tasks or a report leaves the product, so who
-- may make one is a choice on the roles screen, checked by the server and
-- written to the activity log (api/src/routes/exports.ts). Administrators and
-- team leads have it; members and read-only seats do not until a role is given it.

update roles set perms = array(select distinct unnest(perms || array['data.export']))
 where 'org.manage' = any (perms) or (system and key = 'manager');
