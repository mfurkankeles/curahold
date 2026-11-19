-- Undo 0240_connectors_b19.sql: incoming webhooks gone (with their log), Azure DevOps links removed.
-- Not a migration (the runner never reads this folder). Run it by hand, as the
-- owner, in one transaction:  psql "$DATABASE_URL" -1 -f db/rollback/0240_connectors_b19.sql
drop table if exists inbound_links;
drop table if exists inbound_deliveries;
drop table if exists inbound_hooks;
delete from dev_links where provider = 'azuredevops';
delete from dev_hooks where provider = 'azuredevops';
alter table dev_links drop constraint dev_links_provider_check;
alter table dev_links add constraint dev_links_provider_check check (provider in ('github', 'gitlab'));
alter table dev_hooks drop constraint dev_hooks_provider_check;
alter table dev_hooks add constraint dev_hooks_provider_check check (provider in ('github', 'gitlab'));
