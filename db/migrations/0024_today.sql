-- "Today" by the company's clock.
--
-- current_date is the server's day (UTC). For a company in Istanbul that is
-- wrong for three hours every night: work due "today" is not yet overdue at
-- 00:30, and the week has not turned. Every query that needs the day asks
-- app_today() instead.
--
-- The server sets app.today for each request from the company's time zone
-- (and from its own clock, so tests can travel in time). Where nothing set it
-- (a background job, a migration), the company's time zone is read here; with
-- no company at all it is the UTC day.
create or replace function app_today() returns date
language sql stable
set search_path = public
as $$
  select coalesce(
    nullif(current_setting('app.today', true), '')::date,
    (now() at time zone coalesce((select o.timezone from orgs o where o.id = app_org()), 'UTC'))::date
  )
$$;
