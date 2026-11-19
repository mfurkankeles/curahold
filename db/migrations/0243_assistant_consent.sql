-- Consent before a chat with the AI assistant (package l2-privacy, owner
-- requirement 20 Nov 2026; api/src/assistant/consent.ts).
--
-- Before the first question of a session reaches the server, the person sees
-- what is sent to the AI provider, why, for how long, the privacy notice and
-- that they can withdraw — and chooses Accept or Decline. The API refuses a
-- question without a "yes" to the current notice version (consent_required),
-- so the check is not only on screen. Each choice is a new row (append-only):
-- the latest row of a person for a surface is their current answer; a new
-- notice version means no current "yes", so they are asked again.
--
-- 1. assistant_consents: people in a company (app) and people at its
--    customers (portal). Row security on app_org(); a person reads and writes
--    only their own. The portal role has no table privileges at all: it goes
--    through the two security-definer functions below, which take the person
--    from the portal session, never from an argument.
-- 2. assistant_public_consents: visitors of the public docs and sales site,
--    known only by the random consent id their browser keeps (no company, no
--    person, no address). Written by the server alone.

create table assistant_consents (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  user_id        uuid,
  portal_user_id uuid,
  surface        text not null check (surface in ('app', 'portal')),
  version        text not null check (length(version) between 1 and 40),
  locale         text not null check (length(locale) between 2 and 10),
  granted        boolean not null,
  created_at     timestamptz not null default now(),
  check (num_nonnulls(user_id, portal_user_id) = 1),
  check ((surface = 'app') = (user_id is not null)),
  foreign key (org_id, user_id) references users (org_id, id) on delete cascade,
  foreign key (org_id, portal_user_id) references portal_users (org_id, id) on delete cascade
);
create index assistant_consents_user_idx on assistant_consents (org_id, user_id, created_at desc) where user_id is not null;
create index assistant_consents_portal_idx on assistant_consents (org_id, portal_user_id, created_at desc) where portal_user_id is not null;
alter table assistant_consents enable row level security;
create policy assistant_consents_select on assistant_consents for select using (org_id = app_org() and user_id = app_user());
create policy assistant_consents_insert on assistant_consents for insert with check (org_id = app_org() and user_id = app_user() and surface = 'app');
grant select, insert on assistant_consents to curahold_app;

create table assistant_public_consents (
  id          uuid primary key default gen_random_uuid(),
  consent_id  uuid not null,
  surface     text not null check (surface in ('docs', 'site')),
  version     text not null check (length(version) between 1 and 40),
  locale      text not null check (length(locale) between 2 and 10),
  granted     boolean not null,
  created_at  timestamptz not null default now()
);
create index assistant_public_consents_id_idx on assistant_public_consents (consent_id, created_at desc);
alter table assistant_public_consents enable row level security;

-- The signed-in portal person's current answer for this notice version (true / false / null = not asked yet).
create function portal_assist_consent(p_version text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select c.granted from assistant_consents c
   where c.org_id = app_org() and c.portal_user_id = app_portal_user() and c.version = p_version
     and exists (select 1 from portal_whoami())
   order by c.created_at desc limit 1
$$;

-- Records the signed-in portal person's choice (accept, decline or withdraw).
create function portal_assist_consent_set(p_version text, p_locale text, p_granted boolean) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare me record;
begin
  select * into me from portal_whoami();
  if me.user_id is null then return false; end if;
  insert into assistant_consents (org_id, portal_user_id, surface, version, locale, granted)
  values (me.org_id, me.user_id, 'portal', p_version, p_locale, p_granted);
  return true;
end $$;

revoke execute on function portal_assist_consent(text), portal_assist_consent_set(text, text, boolean) from curahold_app;
grant execute on function portal_assist_consent(text), portal_assist_consent_set(text, text, boolean) to curahold_portal;
