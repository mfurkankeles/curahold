-- Invitations send email in the company's name, so their limit must hold exactly,
-- whichever Worker isolate a request lands on (lib/ratelimit.ts keeps the
-- in-memory budgets). The audit trail already records every invitation; this
-- counts the last hour of them for the company of the request. It runs as the
-- owner so a person who may invite (an account owner inviting a portal contact)
-- but may not read the audit trail still gets the right count, and it returns a
-- number only.
create function app_invites_last_hour() returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from audit_log
   where org_id = app_org() and action in ('user.invited', 'portal.invited') and at > now() - interval '1 hour'
$$;
revoke execute on function app_invites_last_hour() from public;
grant execute on function app_invites_last_hour() to curahold_app;
