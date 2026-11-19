-- Undo 0160_flow.sql: no request links, customer teams, hand-overs or promises.
-- Not a migration (the runner never reads this folder). Run it by hand, as the
-- owner, in one transaction:  psql "$DATABASE_URL" -1 -f db/rollback/0160_flow.sql
drop function if exists app_set_draft(uuid, text);
drop function if exists app_mark_told(uuid);
drop function if exists app_unlink_request(uuid);
drop function if exists app_link_request(uuid, uuid, text, uuid, text);
drop function if exists app_story_customers(uuid);
drop function if exists app_story_demand(uuid, text, text);
drop function if exists app_linkable_stories(text, int);
drop function if exists app_account_linked_work(uuid);
drop table if exists handovers;
drop table if exists promises;
drop table if exists request_links;
drop table if exists account_team;
drop function if exists app_sees_account(uuid);
