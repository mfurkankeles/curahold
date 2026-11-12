-- Curahold — a calendar that can be someone else's.
--
-- A role with 'calendar.view_team' can narrow the calendar to a teammate or to
-- a whole team (an administrator: to anyone). It narrows what that person may
-- already see and opens nothing new: a private board stays private, and a
-- customer outside their reach stays outside it. Administrators and team
-- leads get it; any other role can be given it on the roles screen.

update roles set perms = array(select distinct unnest(perms || array['calendar.view_team']))
 where 'org.manage' = any (perms) or (system and key = 'manager');
