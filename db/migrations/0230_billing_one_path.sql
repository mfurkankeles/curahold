-- One billing path (docs/ADR/0019): the subscriptions table is the only system
-- of record, and every Paddle notification goes through api/src/billing.
--
-- The table gains what only the older snapshot (orgs.billing) used to carry —
-- the interval, the seats on the subscription, the currency it is billed in —
-- plus when a payment first failed (dunning) and the time of the provider event
-- last applied (so an older event never overwrites a newer one).
alter table subscriptions add column billing_interval text check (billing_interval in ('month', 'year'));
alter table subscriptions add column seats integer check (seats >= 0);
alter table subscriptions add column currency text check (length(currency) = 3);
alter table subscriptions add column past_due_since timestamptz;
alter table subscriptions add column event_at timestamptz;

-- Companies that subscribed through the older webhook (/api/billing/webhook) have
-- their subscription only on orgs.billing. Copy it into the table, so nothing is
-- lost when that webhook becomes an alias of the one path. Where the table only
-- holds the trial row (no provider subscription yet), the snapshot wins: it is
-- what Paddle actually reported.
insert into subscriptions (org_id, provider, provider_customer_id, provider_subscription_id, plan, status,
                           billing_interval, seats, current_period_end, cancel_at_period_end, past_due_since, event_at, updated_at)
select o.id, 'paddle', o.billing->>'customerId', o.billing->>'subscriptionId',
       coalesce(o.billing->>'plan', 'business'), o.billing->>'status',
       case when o.billing->>'interval' in ('month', 'year') then o.billing->>'interval' end,
       case when o.billing->>'seats' ~ '^[0-9]+$' then (o.billing->>'seats')::int end,
       (o.billing->>'periodEnd')::timestamptz,
       coalesce((o.billing->>'cancelAtPeriodEnd')::boolean, false),
       case when o.billing->>'status' = 'past_due' then coalesce((o.billing->>'eventAt')::timestamptz, now()) end,
       (o.billing->>'eventAt')::timestamptz,
       coalesce((o.billing->>'eventAt')::timestamptz, now())
  from orgs o
 where o.billing->>'subscriptionId' is not null
   and o.billing->>'status' in ('trialing', 'active', 'past_due', 'canceled', 'paused')
on conflict (org_id) do update set
  provider_customer_id = excluded.provider_customer_id,
  provider_subscription_id = excluded.provider_subscription_id,
  plan = excluded.plan, status = excluded.status,
  billing_interval = excluded.billing_interval, seats = excluded.seats,
  current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end,
  past_due_since = excluded.past_due_since, event_at = excluded.event_at, updated_at = excluded.updated_at
 where subscriptions.provider_subscription_id is null
    or subscriptions.provider_subscription_id = excluded.provider_subscription_id;

-- Rows the newer path wrote kept interval and seats only on the snapshot: bring them over too.
update subscriptions s
   set billing_interval = coalesce(s.billing_interval, case when o.billing->>'interval' in ('month', 'year') then o.billing->>'interval' end),
       seats = coalesce(s.seats, case when o.billing->>'seats' ~ '^[0-9]+$' then (o.billing->>'seats')::int end)
  from orgs o
 where o.id = s.org_id and (s.billing_interval is null or s.seats is null);

-- The ledger of provider events applied once (0021) now serves the one path; it
-- keeps the provider's name so a second provider can never collide on an id.
alter table billing_events add column provider text not null default 'paddle';
