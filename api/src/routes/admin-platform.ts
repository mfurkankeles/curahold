// The platform owner's super-admin console: every customer company on one
// screen, with its people, plan and billing standing — plus one company's full
// detail. These reads cross the per-company isolation every other screen keeps,
// so they run over the owner connection (deps.db.system), and ONLY the platform
// owner/staff may reach them (requirePlatform → 403 for anyone else). Every
// statement is still anchored to a company (from orgs / org_id = $1), so one
// customer's rows never bleed into another's.
//
// Read-only: the console shows, it does not change. Nothing here writes, so
// there is no audit entry and no seat it could touch.
//
// Billing lives in two places and we read whichever is present (feature-detected
// with to_regclass, so this never crashes when 0037 has not landed yet):
//   - the normalized schema (0037): subscriptions, invoices, orgs.tax_number…
//   - the legacy snapshot: orgs.billing (jsonb) and orgs.trial_ends_at.
import { Hono } from 'hono';
import { nowOf, type AppEnv } from '../context';
import type { Q } from '../db';
import { fail } from '../lib/errors';
import { platformAccess, requirePlatform } from '../lib/platform';
import { PLANS, PRICE_CURRENCY } from '../../../shared/src/billing';
import type { MetricPoint } from '../../../shared/src/metrics';
import type { PlatformCustomer, PlatformCustomerDetail, PlatformInvoice, PlatformOverview, SubStatus } from '../../../shared/src/platform';

export const platformRoutes = new Hono<AppEnv>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
const str = (v: unknown): string | null => (v == null ? null : String(v));

/** Does the normalized billing schema (migration 0037) exist in this database? */
async function hasBilling(q: Q): Promise<boolean> {
  const [r] = await q.query<{ has: boolean }>(`select to_regclass('public.subscriptions') is not null as has`);
  return !!r?.has;
}

/** The lifecycle label: the provider's own status, or — for a company that never subscribed — trial vs none. */
function normStatus(raw: unknown, trialEndsAt: string | null, nowMs: number): SubStatus {
  const s = typeof raw === 'string' ? raw : '';
  if (s === 'trialing' || s === 'active' || s === 'past_due' || s === 'canceled' || s === 'paused') return s;
  if (trialEndsAt && Date.parse(trialEndsAt) > nowMs) return 'trialing';
  return 'none';
}

/** Per-seat monthly price × seats, from the shared PLANS config (0 for an unknown plan). */
function planMrr(plan: string | null, interval: string, seats: number): number {
  const p = plan === 'team' || plan === 'business' ? plan : null;
  if (!p) return 0;
  const iv = interval === 'year' ? 'year' : 'month';
  return PLANS[p].price[iv] * Math.max(0, num(seats));
}

const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

// ----------------------------------------------------------------- access

// Open to any signed-in person: it reveals only whether THEY are owner/staff, no
// tenant data, so the browser can decide whether to show the console at all.
platformRoutes.get('/platform/access', (c) => c.json(platformAccess(c)));

// ----------------------------------------------------------------- overview

platformRoutes.get('/platform/overview', async (c) => {
  requirePlatform(c);
  const deps = c.get('deps');

  const data = await deps.db.system(async (q) => {
    const billing = await hasBilling(q);

    const [totals] = billing
      ? await q.query(
          `select count(*)::int as customers,
                  count(*) filter (where s.status = 'active')::int as active,
                  count(*) filter (where s.status = 'trialing' or (s.status is null and o.trial_ends_at > now()))::int as trialing,
                  count(*) filter (where s.status = 'past_due')::int as past_due,
                  count(*) filter (where s.status = 'canceled')::int as canceled,
                  count(*) filter (where s.status = 'paused')::int as paused
             from orgs o left join subscriptions s on s.org_id = o.id`,
        )
      : await q.query(
          `select count(*)::int as customers,
                  count(*) filter (where o.billing->>'status' = 'active')::int as active,
                  count(*) filter (where o.billing->>'status' = 'trialing' or (o.billing->>'status' is null and o.trial_ends_at > now()))::int as trialing,
                  count(*) filter (where o.billing->>'status' = 'past_due')::int as past_due,
                  count(*) filter (where o.billing->>'status' = 'canceled')::int as canceled,
                  count(*) filter (where o.billing->>'status' = 'paused')::int as paused
             from orgs o`,
        );

    // The paying companies (active + past_due) with the pieces MRR needs.
    const paying = billing
      ? await q.query(
          `select s.plan as plan, 'month' as interval,
                  (select count(*)::int from users u where u.org_id = o.id and u.seat = 'full' and u.status = 'active') as seats
             from orgs o join subscriptions s on s.org_id = o.id
            where s.status in ('active', 'past_due')`,
        )
      : await q.query(
          `select coalesce(o.billing->>'plan', o.plan) as plan,
                  coalesce(o.billing->>'interval', 'month') as interval,
                  coalesce((o.billing->>'seats')::int, (select count(*)::int from users u where u.org_id = o.id and u.seat = 'full' and u.status = 'active')) as seats
             from orgs o
            where o.billing->>'status' in ('active', 'past_due')`,
        );

    const signups = (await q.query(
      `select to_char(date_trunc('month', created_at), 'YYYY-MM') as t, count(*)::int as v
         from orgs
        where created_at >= date_trunc('month', now()) - interval '11 months'
        group by 1 order by 1`,
    )) as MetricPoint[];

    return { billing, totals, paying, signups };
  });

  const mrr = (data.paying as { plan: string | null; interval: string; seats: number }[]).reduce(
    (sum, r) => sum + planMrr(r.plan, r.interval, num(r.seats)),
    0,
  );
  const t = data.totals ?? {};
  const overview: PlatformOverview = {
    billingSchema: data.billing,
    totals: {
      customers: num(t.customers),
      active: num(t.active),
      trialing: num(t.trialing),
      pastDue: num(t.past_due),
      canceled: num(t.canceled),
      paused: num(t.paused),
    },
    mrr: Math.round(mrr),
    arr: Math.round(mrr * 12),
    currency: PRICE_CURRENCY,
    signups: data.signups,
  };
  return c.json(overview);
});

// ----------------------------------------------------------------- customers

platformRoutes.get('/platform/customers', async (c) => {
  requirePlatform(c);
  const deps = c.get('deps');
  const nowMs = nowOf(deps).getTime();

  const rows = await deps.db.system(async (q) => {
    const billing = await hasBilling(q);
    return billing
      ? q.query(
          `select o.id, o.name, o.slug, o.created_at, o.trial_ends_at, o.tax_number, o.billing_email,
                  (select count(*)::int from users u where u.org_id = o.id and u.status = 'active') as users,
                  (select count(*)::int from users u where u.org_id = o.id and u.status = 'active' and u.seat = 'full') as seats,
                  s.plan as plan, s.status as status, s.cancel_at_period_end as cancel, s.current_period_end as period_end,
                  inv.status as inv_status, inv.issued_at as inv_at
             from orgs o
             left join subscriptions s on s.org_id = o.id
             left join lateral (
               select i.status, i.issued_at from invoices i where i.org_id = o.id order by i.issued_at desc nulls last limit 1
             ) inv on true
            order by o.created_at desc`,
        )
      : q.query(
          `select o.id, o.name, o.slug, o.created_at, o.trial_ends_at,
                  null as tax_number, null as billing_email,
                  (select count(*)::int from users u where u.org_id = o.id and u.status = 'active') as users,
                  (select count(*)::int from users u where u.org_id = o.id and u.status = 'active' and u.seat = 'full') as seats,
                  coalesce(o.billing->>'plan', o.plan) as plan, o.billing->>'status' as status,
                  (o.billing->>'cancelAtPeriodEnd')::boolean as cancel, o.billing->>'periodEnd' as period_end,
                  null as inv_status, null as inv_at
             from orgs o
            order by o.created_at desc`,
        );
  });

  const customers: PlatformCustomer[] = rows.map((r): PlatformCustomer => {
    const trialEndsAt = iso(r.trial_ends_at);
    return {
      orgId: String(r.id),
      name: String(r.name),
      slug: String(r.slug),
      createdAt: iso(r.created_at) ?? '',
      users: num(r.users),
      seats: num(r.seats),
      plan: str(r.plan),
      status: normStatus(r.status, trialEndsAt, nowMs),
      trialEndsAt,
      cancelAtPeriodEnd: r.cancel === true,
      currentPeriodEnd: iso(r.period_end),
      taxNumber: str(r.tax_number),
      billingEmail: str(r.billing_email),
      latestInvoiceStatus: str(r.inv_status),
      latestInvoiceAt: iso(r.inv_at),
    };
  });
  return c.json({ customers });
});

// ------------------------------------------------------------ one customer

platformRoutes.get('/platform/customers/:orgId', async (c) => {
  requirePlatform(c);
  const deps = c.get('deps');
  const orgId = c.req.param('orgId');
  if (!UUID.test(orgId)) fail('not_found');
  const nowMs = nowOf(deps).getTime();

  const detail = await deps.db.system(async (q): Promise<PlatformCustomerDetail | null> => {
    const billing = await hasBilling(q);

    const [org] = billing
      ? await q.query(
          `select o.id, o.name, o.slug, o.created_at, o.trial_ends_at, o.locale, o.timezone, o.currency, o.template, o.domains,
                  o.tax_number, o.billing_email, o.plan as org_plan, o.billing as legacy,
                  (select count(*)::int from users u where u.org_id = o.id and u.status = 'active') as users,
                  (select count(*)::int from users u where u.org_id = o.id and u.status = 'active' and u.seat = 'full') as seats
             from orgs o where o.id = $1`,
          [orgId],
        )
      : await q.query(
          `select o.id, o.name, o.slug, o.created_at, o.trial_ends_at, o.locale, o.timezone, o.currency, o.template, o.domains,
                  null as tax_number, null as billing_email, o.plan as org_plan, o.billing as legacy,
                  (select count(*)::int from users u where u.org_id = o.id and u.status = 'active') as users,
                  (select count(*)::int from users u where u.org_id = o.id and u.status = 'active' and u.seat = 'full') as seats
             from orgs o where o.id = $1`,
          [orgId],
        );
    if (!org) return null;

    // Counts for this one company — each subquery anchored to its org_id.
    const [counts] = await q.query(
      `select (select count(*)::int from boards where org_id = $1) as boards,
              (select count(*)::int from accounts where org_id = $1) as accounts,
              (select count(*)::int from tasks where org_id = $1 and archived_at is null) as tasks,
              (select count(*)::int from records where org_id = $1 and archived_at is null) as records,
              (select count(*)::int from users where org_id = $1 and status = 'active') as members`,
      [orgId],
    );

    const sub = billing
      ? (
          await q.query(
            `select provider, provider_customer_id, provider_subscription_id, plan, status, trial_ends_at, current_period_end, cancel_at_period_end
               from subscriptions where org_id = $1`,
            [orgId],
          )
        )[0]
      : undefined;

    const invoiceRows = billing
      ? await q.query(
          `select provider_invoice_id, amount_cents, currency, status, issued_at
             from invoices where org_id = $1 order by issued_at desc nulls last limit 20`,
          [orgId],
        )
      : [];

    const legacy = (org.legacy ?? {}) as Record<string, unknown>;
    const trialEndsAt = iso(org.trial_ends_at);
    const plan = sub ? str(sub.plan) : (str(legacy.plan) ?? str(org.org_plan));
    const status = normStatus(sub ? sub.status : legacy.status, trialEndsAt, nowMs);
    const periodEnd = sub ? iso(sub.current_period_end) : str(legacy.periodEnd);
    const cancel = sub ? sub.cancel_at_period_end === true : legacy.cancelAtPeriodEnd === true;

    const customer: PlatformCustomer = {
      orgId: String(org.id),
      name: String(org.name),
      slug: String(org.slug),
      createdAt: iso(org.created_at) ?? '',
      users: num(org.users),
      seats: num(org.seats),
      plan,
      status,
      trialEndsAt,
      cancelAtPeriodEnd: cancel,
      currentPeriodEnd: periodEnd,
      taxNumber: str(org.tax_number),
      billingEmail: str(org.billing_email),
      latestInvoiceStatus: invoiceRows[0] ? str(invoiceRows[0].status) : null,
      latestInvoiceAt: invoiceRows[0] ? iso(invoiceRows[0].issued_at) : null,
    };

    const invoices: PlatformInvoice[] = invoiceRows.map((i) => ({
      providerInvoiceId: str(i.provider_invoice_id),
      amountCents: num(i.amount_cents),
      currency: String(i.currency ?? PRICE_CURRENCY),
      status: String(i.status ?? ''),
      issuedAt: iso(i.issued_at),
    }));

    return {
      customer,
      settings: {
        locale: String(org.locale ?? 'en'),
        timezone: String(org.timezone ?? 'UTC'),
        currency: String(org.currency ?? PRICE_CURRENCY),
        template: String(org.template ?? ''),
        domains: Array.isArray(org.domains) ? (org.domains as string[]) : [],
      },
      counts: {
        boards: num(counts?.boards),
        accounts: num(counts?.accounts),
        tasks: num(counts?.tasks),
        records: num(counts?.records),
        members: num(counts?.members),
      },
      subscription: sub
        ? {
            provider: str(sub.provider),
            providerCustomerId: str(sub.provider_customer_id),
            providerSubscriptionId: str(sub.provider_subscription_id),
            plan: str(sub.plan),
            status: normStatus(sub.status, trialEndsAt, nowMs),
            trialEndsAt: iso(sub.trial_ends_at),
            currentPeriodEnd: iso(sub.current_period_end),
            cancelAtPeriodEnd: sub.cancel_at_period_end === true,
          }
        : null,
      invoices,
    };
  });

  if (!detail) fail('not_found');
  return c.json(detail);
});
