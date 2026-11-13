-- Billing data model (Paddle): the canonical subscription and invoice records
-- for a company, the two billing-contact columns on the company row, and a
-- small zero-code onboarding checklist.
--
-- This is the system of record that provisioning, the billing routes and the
-- platform's own reporting read and write. It sits beside the lighter
-- orgs.billing snapshot from 0021 (which every request already reads to gate
-- writes); the service in api/src/billing keeps this table in step from the
-- same Paddle events.
--
-- RLS follows 0035/0036: a company sees only its own rows (org_id = app_org()),
-- by-hand changes are for administrators, and the rows the server writes on a
-- provider's behalf (new subscriptions, webhook updates, invoices) are written
-- as the owner — never as a request role — so those tables grant the request
-- role no more than it needs to read.

-- ---------------------------------------------------------- company billing
-- Shown on invoices and captured during onboarding. Nullable: a company in its
-- trial has not necessarily entered them yet.
alter table orgs add column tax_number text;
alter table orgs add column billing_email text;

-- ------------------------------------------------------------ subscriptions
-- One per company. What the payment provider last told us, in its own columns
-- (so reporting can query it) rather than only as JSON on the company row.
create table subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null unique references orgs(id) on delete cascade,
  provider                 text not null default 'paddle',
  provider_customer_id     text,
  provider_subscription_id text,
  plan                     text not null,
  status                   text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'paused')),
  -- When a free trial ends (status 'trialing'); null once a plan is paid for.
  trial_ends_at            timestamptz,
  -- The end of the period paid for: the next bill, or the end of a cancelled one.
  current_period_end       timestamptz,
  -- Cancelled, but still usable until current_period_end (the monthly exit right).
  cancel_at_period_end     boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
-- The provider's id is how a webhook finds the row; unique per provider in practice.
create index subscriptions_provider_sub_idx on subscriptions (provider_subscription_id) where provider_subscription_id is not null;

alter table subscriptions enable row level security;
-- Everyone in the company sees its subscription; only administrators change it by
-- hand (leaving at period end, resuming). Inserts and the provider's own webhook
-- updates come from the server (owner), so the request role gets no insert/delete.
create policy subscriptions_select on subscriptions for select
  using (org_id = app_org());
create policy subscriptions_update on subscriptions for update
  using (org_id = app_org() and app_has_perm('org.manage'))
  with check (org_id = app_org() and app_has_perm('org.manage'));
grant select, update on subscriptions to curahold_app;

-- ------------------------------------------------------------------ invoices
-- The invoices the provider raised, so a company can see its own history. Written
-- by the server from provider webhooks; read-only to the company.
create table invoices (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references orgs(id) on delete cascade,
  provider_invoice_id text unique,
  amount_cents        integer not null,
  currency            text not null,
  status              text not null,
  issued_at           timestamptz
);
create index invoices_org_idx on invoices (org_id, issued_at desc nulls last);

alter table invoices enable row level security;
create policy invoices_select on invoices for select using (org_id = app_org());
grant select on invoices to curahold_app;

-- ------------------------------------------------------ onboarding checklist
-- Zero-code onboarding: the first-run steps a company has ticked off, and whether
-- its welcome email has gone out. One row per company; the step keys live in the
-- route (api/src/routes/onboarding.ts), not the schema.
create table onboarding_checklists (
  org_id      uuid primary key references orgs(id) on delete cascade,
  done        text[] not null default '{}',
  welcomed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table onboarding_checklists enable row level security;
create policy onboarding_select on onboarding_checklists for select
  using (org_id = app_org());
create policy onboarding_insert on onboarding_checklists for insert
  with check (org_id = app_org() and app_has_perm('org.manage'));
create policy onboarding_update on onboarding_checklists for update
  using (org_id = app_org() and app_has_perm('org.manage'))
  with check (org_id = app_org() and app_has_perm('org.manage'));
grant select, insert, update on onboarding_checklists to curahold_app;
