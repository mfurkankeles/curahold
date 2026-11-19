-- Undo 0195_setup_health.sql: no setup checks' memory, no test runs.
-- Not a migration (the runner never reads this folder). Run it by hand, as the
-- owner, in one transaction:  psql "$DATABASE_URL" -1 -f db/rollback/0195_setup_health.sql
drop table if exists setup_test_runs;
drop table if exists setup_progress;
