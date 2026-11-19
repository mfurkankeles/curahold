-- Accounting programs, read only (Zoho Books, Xero, Odoo, freee, Paraşüt,
-- QuickBooks Online, or a file in the template's columns).
--
-- An accounting connection is a data source (connections.kind = 'source')
-- whose runs copy the program's customers, invoices and payments into the
-- three tables below; nothing is ever sent back. Each accounting customer is
-- matched to at most one Curahold customer: automatically by tax number, web
-- domain or name when exactly one fits, otherwise by an administrator on the
-- review list. The customer page sums what is open and overdue from here, and
-- the health score's "late payment" signal counts the days.
--
-- Money is sensitive: these rows are seen only by people whose role has
-- 'finance.view' (and by whoever manages connections, to review matches).
-- Rows are written by the sync with owner access; the review list changes the
-- match only.

create table finance_customers (
  -- Its own id, so a customer deleted to the trash and brought back gets its accounting link back too.
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  connection_id   uuid not null,
  remote_id       text not null check (length(remote_id) between 1 and 200),
  name            text not null default '',
  tax_id          text,
  email           text,
  website         text,
  currency        text check (currency ~ '^[A-Z]{3}$'),
  balance         numeric(18, 2),
  account_id      uuid,
  -- auto: matched by the rule in `match_reason`; manual: chosen on the review list; ignored: not one of ours.
  match_state     text not null default 'none' check (match_state in ('none', 'auto', 'manual', 'ignored')),
  match_reason    text check (match_reason in ('tax', 'domain', 'name')),
  -- Customers that fit equally well when no single one did, for the review list.
  candidates      uuid[] not null default '{}',
  modified_at     timestamptz,
  synced_at       timestamptz not null default now(),
  unique (connection_id, remote_id),
  foreign key (org_id, connection_id) references connections (org_id, id) on delete cascade,
  foreign key (org_id, account_id) references accounts (org_id, id) on delete set null (account_id)
);
create index finance_customers_account_idx on finance_customers (org_id, account_id) where account_id is not null;
create index finance_customers_review_idx on finance_customers (org_id, connection_id) where match_state = 'none';

create table finance_invoices (
  org_id          uuid not null references orgs(id) on delete cascade,
  connection_id   uuid not null,
  remote_id       text not null check (length(remote_id) between 1 and 200),
  customer_id     text,
  number          text,
  issued_on       date,
  due_on          date,
  currency        text check (currency ~ '^[A-Z]{3}$'),
  total           numeric(18, 2) not null default 0,
  balance         numeric(18, 2) not null default 0,
  status          text not null default 'open' check (status in ('open', 'paid', 'void', 'draft')),
  modified_at     timestamptz,
  synced_at       timestamptz not null default now(),
  primary key (connection_id, remote_id),
  foreign key (org_id, connection_id) references connections (org_id, id) on delete cascade
);
create index finance_invoices_customer_idx on finance_invoices (connection_id, customer_id, status);

create table finance_payments (
  org_id          uuid not null references orgs(id) on delete cascade,
  connection_id   uuid not null,
  remote_id       text not null check (length(remote_id) between 1 and 200),
  customer_id     text,
  invoice_id      text,
  paid_on         date,
  amount          numeric(18, 2) not null default 0,
  currency        text check (currency ~ '^[A-Z]{3}$'),
  modified_at     timestamptz,
  synced_at       timestamptz not null default now(),
  primary key (connection_id, remote_id),
  foreign key (org_id, connection_id) references connections (org_id, id) on delete cascade
);
create index finance_payments_customer_idx on finance_payments (connection_id, customer_id, paid_on desc);

alter table finance_customers enable row level security;
alter table finance_invoices  enable row level security;
alter table finance_payments  enable row level security;

create policy finance_customers_select on finance_customers for select
  using (org_id = app_org() and (app_has_perm('finance.view') or app_has_perm('connections.manage')));
-- The review list: an administrator confirms, changes or ignores a match. Nothing else is changed by people.
create policy finance_customers_match on finance_customers for update
  using (org_id = app_org() and app_has_perm('connections.manage'))
  with check (org_id = app_org() and app_has_perm('connections.manage'));
create policy finance_invoices_select on finance_invoices for select
  using (org_id = app_org() and (app_has_perm('finance.view') or app_has_perm('connections.manage')));
create policy finance_payments_select on finance_payments for select
  using (org_id = app_org() and (app_has_perm('finance.view') or app_has_perm('connections.manage')));

grant select on finance_customers, finance_invoices, finance_payments to curahold_app;
grant update (account_id, match_state, match_reason, candidates) on finance_customers to curahold_app;

-- The health score's "late payment" signal, for whoever works the score out: per matched customer, how many
-- days the oldest unpaid invoice is past due and how many are. Days and counts only, never amounts, so the
-- score is the same for everyone who sees the customer, finance.view or not.
create function finance_late(p_org uuid, p_ids uuid[], p_today date) returns table (account_id uuid, late int, overdue int)
language sql stable security definer set search_path = public, pg_temp as $$
  select fc.account_id, coalesce(max(p_today - i.due_on), 0)::int, count(i.remote_id)::int
    from finance_customers fc
    left join finance_invoices i on i.org_id = fc.org_id and i.connection_id = fc.connection_id and i.customer_id = fc.remote_id
         and i.status = 'open' and i.balance > 0 and i.due_on < p_today
   where fc.org_id = p_org and p_org = coalesce(app_org(), p_org) and fc.account_id is not null
     and (p_ids is null or fc.account_id = any (p_ids))
   group by fc.account_id
$$;
revoke all on function finance_late(uuid, uuid[], date) from public;
grant execute on function finance_late(uuid, uuid[], date) to curahold_app;

-- Who sees the figures: administrators (every permission) and the built-in manager role, from today.
-- Other roles get it on the roles screen (or, with departments, by being in Finance, Customer Success or Sales).
update roles set perms = array(select distinct unnest(perms || array['finance.view']))
 where 'org.manage' = any (perms) or (system and key = 'manager');
