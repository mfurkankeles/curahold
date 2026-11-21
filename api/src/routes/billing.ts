// Billing, for a company's administrators — the one billing path (docs/ADR/0019).
// Every route reads or writes the subscriptions table through api/src/billing,
// and the provider's webhook is applied there too:
//
//   GET   /billing              where the company stands, the plans with their caps and
//                               regional prices, usage against the caps, checkout values
//   GET   /billing/subscription the same (kept for older clients)
//   POST  /billing/checkout     what Paddle.js needs to open checkout (signed company id)
//   POST  /billing/change       another plan or interval, prorated
//   POST  /billing/portal       Paddle's customer portal: invoices, payment method
//   POST  /billing/cancel       leave at the end of the paid period (the monthly exit right)
//   POST  /billing/resume       undo that before the period ends
//   PATCH /billing/profile      tax number, billing e-mail and billing country on invoices
//   POST  /api/inbound/billing/paddle (and the older /api/billing/webhook): Paddle's notifications
//
// With billing off (no Paddle settings: self-hosted, demo, development) the
// page says so and nothing here charges anyone.
import { Hono } from 'hono';
import { z } from 'zod';
import { CATALOGUE, INTERVALS, PLAN_LIST, isPlanKey, planOf, regionFor, regionalPrice } from '../../../shared/src/billing';
import { accessFor, nowOf, requirePerm, run, type AppEnv, type C } from '../context';
import { capsForOrg, usageOf, withinCap } from '../billing/entitlements';
import { projectBilling } from '../billing/project';
import { LIVE, SEATS_SQL, applyWebhook, billedSeats, billingRegionKey, changePlan, ensureSubscription, providerFor, readSubscription } from '../billing/service';
import { audit } from '../lib/audit';
import { fail } from '../lib/errors';
import { body, email } from '../lib/validate';
import { NEVER_OFFERED } from '../../../shared/src/compliance/consentTexts';

/**
 * Curahold is never sold where sanctions apply (NEVER_OFFERED, MASTER-RULES: Iran is always excluded): not as a
 * billing country, and not to a connection from there. Checked where money is taken, not only on the trial form.
 */
function refuseNotOffered(...countries: (string | null | undefined)[]) {
  if (countries.some((x) => !!x && NEVER_OFFERED.includes(x.toUpperCase()))) fail('country_not_offered');
}

export const billingRoutes = new Hono<AppEnv>();

const planKey = z.string().refine(isPlanKey, { message: 'unknown plan' });

/** Where the company stands, the price list it sees, and what it uses against its caps. */
async function overview(c: C) {
  const deps = c.get('deps');
  const org = c.get('org');
  const cfg = deps.config.billing;
  const isAdmin = c.get('auth').perms.includes('org.manage');
  // Older companies and demo data may predate the table; backfill from their trial.
  await ensureSubscription(deps, org.id);
  const access = accessFor(c);
  const { sub, profile, caps, usage } = await run(c, async (q) => {
    const caps = await capsForOrg(q, org.id, access);
    return {
      sub: await readSubscription(q, nowOf(deps)),
      profile: (
        await q.query<{ tax_number: string | null; billing_email: string | null; billing_country: string | null; trial_seat_cap: number | null }>(
          'select tax_number, billing_email, billing_country, trial_seat_cap from orgs where id = $1',
          [org.id],
        )
      )[0],
      caps,
      usage: await usageOf(q, org.id, caps),
    };
  });
  // The terms promise the trial limits "shown at sign-up and on the Billing page" (legal-terms §4): during the trial
  // the seat row counts against the seats approved for the trial (orgs.trial_seat_cap, enforced by lib/trial.ts
  // seatGuard), not the plan's seatsMax, which would otherwise read "no limit" for a Business trial.
  const trialSeatCap = access.state === 'trial' && profile?.trial_seat_cap != null ? Number(profile.trial_seat_cap) : null;
  if (trialSeatCap != null) usage.seats = { ...usage.seats, cap: trialSeatCap };
  const trialLimits = access.state === 'trial' ? { seats: trialSeatCap, storageGbPerSeat: CATALOGUE.trial.caps.storageGbPerSeat ?? null } : null;
  // The buyer's region for the prices shown (Cloudflare's country header; Paddle decides the real one at checkout).
  const region = regionFor(c.req.header('cf-ipcountry') ?? null);
  // The fewest seats each plan is billed for here (billedSeats): the screen counts the total with it.
  const billedIn = billingRegionKey(profile?.billing_country ?? c.req.header('cf-ipcountry'));
  const plans = PLAN_LIST.map((p) => ({
    ...p,
    regional: { month: regionalPrice(region, p.key, 'month'), year: regionalPrice(region, p.key, 'year') },
    minSeats: { month: billedSeats(deps, p.key, 'month', billedIn, 1), year: billedSeats(deps, p.key, 'year', billedIn, 1) },
  }));
  return c.json({
    enabled: !!cfg,
    access,
    plans,
    catalogue: { version: CATALOGUE.version, status: CATALOGUE.status, currency: CATALOGUE.currency, trialMonths: CATALOGUE.trial.months, graceDays: CATALOGUE.dunning.graceDays },
    region: region ? { key: region.key, currency: region.currency, collect: region.collect, tax: region.tax } : null,
    seats: caps.fullSeats,
    caps,
    usage,
    trialLimits,
    // The plan and its state are everyone's to see; the tax number, the billing address and the provider's ids are for
    // the people who may pay (security audit L1).
    subscription: sub && !isAdmin ? { ...sub, providerCustomerId: null, providerSubscriptionId: null } : sub,
    profile: isAdmin
      ? { taxNumber: profile?.tax_number ?? null, billingEmail: profile?.billing_email ?? null, country: profile?.billing_country ?? null }
      : { taxNumber: null, billingEmail: null, country: null },
    // Public values Paddle.js needs, for the people who may pay. Never a secret: the API key and webhook secret stay on the server.
    ...(cfg && isAdmin ? { checkout: { env: cfg.env, clientToken: cfg.clientToken, prices: cfg.prices, email: c.get('auth').email } } : {}),
  });
}

/**
 * Where the company stands with billing: plan, status, usage against the plan's caps and the plans with regional
 * prices, for every member; the billing profile, the provider's ids and checkout values only with org.manage.
 */
billingRoutes.get('/billing', overview);
/** Same answer as GET /billing, kept for older clients. */
billingRoutes.get('/billing/subscription', overview);

/** What the browser needs to open the provider's checkout, for those who may pay. */
billingRoutes.post('/billing/checkout', async (c) => {
  requirePerm(c, 'org.manage');
  const deps = c.get('deps');
  const provider = providerFor(deps);
  if (!provider) return fail('billing_off');
  const input = await body(c, z.object({ plan: planKey, interval: z.enum(INTERVALS).optional() }));
  const org = c.get('org');
  const [{ seats, billing_country }] = await run(c, (q) => q.query<{ seats: number; billing_country: string | null }>(`select ${SEATS_SQL} as seats, o.billing_country from orgs o where o.id = $1`, [org.id]));
  refuseNotOffered(billing_country, c.req.header('cf-ipcountry'));
  // A plan with a seat limit cannot be bought for more full seats than it allows.
  withinCap('seats', planOf(input.plan)!.caps.seatsMax, 0, Math.max(1, Number(seats)));
  // Never fewer seats than the plan's minimum for that interval and region (billedSeats).
  const interval = input.interval ?? 'month';
  const quantity = billedSeats(deps, input.plan, interval, billingRegionKey(billing_country ?? c.req.header('cf-ipcountry')), Number(seats));
  const checkout = await provider.createCheckout({ orgId: org.id, plan: input.plan, interval, quantity, email: c.get('auth').email });
  return c.json({ checkout });
});

/** Another plan or interval for a running subscription: an upgrade is billed now, a downgrade at the next bill. */
billingRoutes.post('/billing/change', async (c) => {
  requirePerm(c, 'org.manage');
  const deps = c.get('deps');
  const provider = providerFor(deps);
  if (!provider) return fail('billing_off');
  const input = await body(c, z.object({ plan: planKey, interval: z.enum(INTERVALS) }));
  const org = c.get('org');
  const { sub, seats, country } = await run(c, async (q) => {
    const [o] = await q.query<{ n: number; billing_country: string | null }>(`select ${SEATS_SQL} as n, o.billing_country from orgs o where o.id = $1`, [org.id]);
    return { sub: await readSubscription(q, nowOf(deps)), seats: Number(o?.n ?? 0), country: o?.billing_country ?? null };
  });
  if (!sub?.providerSubscriptionId || !['active', 'trialing', 'past_due'].includes(sub.status)) return fail('validation', { fields: 'plan' }, { fields: ['plan'] });
  withinCap('seats', planOf(input.plan)!.caps.seatsMax, 0, Math.max(1, seats));
  await changePlan(deps, provider, org.id, sub, input.plan, input.interval, seats, country ? billingRegionKey(country) : null);
  await run(c, (q) => audit(q, { orgId: org.id, actorId: c.get('auth').userId, action: 'billing.changed', entity: 'org', entityId: org.id, meta: { plan: input.plan, interval: input.interval } }));
  return c.json({ ok: true });
});

/** Paddle's customer portal, signed in: invoices, payment method, cancelling. */
billingRoutes.post('/billing/portal', async (c) => {
  requirePerm(c, 'org.manage');
  const deps = c.get('deps');
  const provider = providerFor(deps);
  if (!provider) return fail('billing_off');
  const sub = await run(c, (q) => readSubscription(q, nowOf(deps)));
  if (!sub?.providerCustomerId) return fail('not_found');
  return c.json({ url: await provider.portalUrl(sub.providerCustomerId, sub.providerSubscriptionId) });
});

/**
 * Leave at the end of the period paid for — the monthly exit right: everything
 * stays usable until then, and is never cut off mid-period.
 */
billingRoutes.post('/billing/cancel', async (c) => {
  requirePerm(c, 'org.manage');
  const deps = c.get('deps');
  const org = c.get('org');
  const sub = await run(c, (q) => readSubscription(q, nowOf(deps)));
  if (!sub || !LIVE.includes(sub.status)) return fail('not_found');
  const provider = providerFor(deps);
  if (provider && sub.providerSubscriptionId) await provider.cancelAtPeriodEnd(sub.providerSubscriptionId);
  // Reflected at once; the provider's webhook confirms it.
  await run(c, async (q) => {
    await q.query('update subscriptions set cancel_at_period_end = true, updated_at = now() where org_id = $1', [org.id]);
    await audit(q, { orgId: org.id, actorId: c.get('auth').userId, action: 'billing.changed', entity: 'org', entityId: org.id, meta: { cancelAtPeriodEnd: true } });
  });
  await projectBilling(deps, org.id);
  return c.json({ ok: true });
});

/** Undo a pending cancellation before the period ends. */
billingRoutes.post('/billing/resume', async (c) => {
  requirePerm(c, 'org.manage');
  const deps = c.get('deps');
  const org = c.get('org');
  const sub = await run(c, (q) => readSubscription(q, nowOf(deps)));
  if (!sub) return fail('not_found');
  const provider = providerFor(deps);
  if (provider && sub.providerSubscriptionId) await provider.resume(sub.providerSubscriptionId);
  await run(c, async (q) => {
    await q.query('update subscriptions set cancel_at_period_end = false, updated_at = now() where org_id = $1', [org.id]);
    await audit(q, { orgId: org.id, actorId: c.get('auth').userId, action: 'billing.changed', entity: 'org', entityId: org.id, meta: { cancelAtPeriodEnd: false } });
  });
  await projectBilling(deps, org.id);
  return c.json({ ok: true });
});

/** The billing-contact details shown on invoices. A country Curahold is never offered in is refused. */
billingRoutes.patch('/billing/profile', async (c) => {
  requirePerm(c, 'org.manage');
  const input = await body(
    c,
    z.object({ taxNumber: z.string().trim().max(60).nullish(), billingEmail: email.nullish(), country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).nullish() }),
  );
  refuseNotOffered(input.country);
  const org = c.get('org');
  await run(c, async (q) => {
    // `country` left out keeps the one on file (older clients send only the tax number and e-mail).
    await q.query('update orgs set tax_number = $2, billing_email = $3, billing_country = case when $5 then $4 else billing_country end where id = $1', [
      org.id,
      input.taxNumber ?? null,
      input.billingEmail ?? null,
      input.country ?? null,
      input.country !== undefined,
    ]);
    await audit(q, { orgId: org.id, actorId: c.get('auth').userId, action: 'org.updated', entity: 'org', entityId: org.id, meta: { billing: true } });
  });
  return c.json({ ok: true, taxNumber: input.taxNumber ?? null, billingEmail: input.billingEmail ?? null });
});

/**
 * The provider's notifications, on the central address (no company in the host),
 * mounted before sign-in: the signature is the credential. Checked against the
 * secret and its timestamp, parsed, then applied once (service.applyWebhook).
 * Mounted at /api/inbound/billing/paddle and at the older /api/billing/webhook,
 * so a Paddle destination set up either way lands in the same code.
 */
export async function billingWebhook(c: C) {
  const deps = c.get('deps');
  const provider = providerFor(deps);
  if (!provider) return fail('not_found');
  const raw = await c.req.text();
  if (!(await provider.verifyWebhook(raw, c.req.header('paddle-signature'), nowOf(deps)))) return c.json({ error: 'bad_signature' }, 401);
  const event = await provider.parseWebhookEvent(raw);
  if (!event) return c.json({ error: 'bad_body' }, 400);
  await applyWebhook(deps, provider.name, event);
  return c.json({ ok: true });
}
