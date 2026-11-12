-- Billing (Paddle). Nothing to compute on a schedule: what the billing
-- provider last said is kept on the company row, which every request already
-- reads, and the trial end sits beside it. See shared/src/billing.ts.

-- What the provider last told us: status, plan, interval, seats, period end, ids.
alter table orgs add column billing jsonb not null default '{}'::jsonb;
-- A new company can use everything until then (companies made before this get the same from today).
alter table orgs add column trial_ends_at timestamptz default now() + interval '14 days';

-- Each provider event is applied once (they can arrive twice, or late).
create table billing_events (
  id           text primary key check (length(id) <= 120),
  org_id       uuid references orgs(id) on delete cascade,
  kind         text not null check (length(kind) <= 80),
  received_at  timestamptz not null default now()
);
-- Only the server's own (system) connection writes or reads it.
alter table billing_events enable row level security;

-- The company row as every request sees it, now with its billing.
drop function resolve_org(text);
create function resolve_org(p_slug text)
returns table (id uuid, slug text, name text, locale text, timezone text, terms jsonb, settings jsonb,
               domains text[], join_requests boolean, auto_join boolean, currency text, template text,
               account_fields jsonb, setup jsonb, billing jsonb, trial_ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.id, o.slug, o.name, o.locale, o.timezone, o.terms, o.settings,
         o.domains, o.join_requests, o.auto_join, o.currency, o.template, o.account_fields, o.setup,
         o.billing, o.trial_ends_at
  from orgs o where o.slug = lower(p_slug)
$$;
grant execute on function resolve_org(text) to curahold_app;
