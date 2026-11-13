// The table-backed billing routes: where a company stands, opening checkout,
// the monthly exit (leave at period end) and resuming, the billing-contact
// details, and the provider's signed webhook.
//
// These read and write the subscriptions / invoices tables (0037) through the
// api/src/billing module. They sit beside the existing routes in billing.ts
// (which drive Paddle.js checkout and the plan snapshot on the company row); the
// webhook below is mounted on the central address, before any company is known,
// exactly like that file's billingWebhook.
import { Hono } from 'hono';
import { z } from 'zod';
import { INTERVALS, PLAN_KEYS, PLAN_LIST, type SubscriptionStatus } from '../../../shared/src/billing';
import { nowOf, requirePerm, run, type AppEnv, type C } from '../context';
import { applyWebhookEvent, providerFor, readSubscription } from '../billing/service';
import { audit } from '../lib/audit';
import { SEATS_SQL } from '../lib/billing';
import { fail } from '../lib/errors';
import { body, email } from '../lib/validate';

export const subscriptionRoutes = new Hono<AppEnv>();

const LIVE: SubscriptionStatus[] = ['active', 'trialing', 'past_due', 'paused'];

/** Where this company stands: its subscription, the plans, and its billing-contact details. */
subscriptionRoutes.get('/billing/subscription', async (c) => {
  const deps = c.get('deps');
  const org = c.get('org');
  const { sub, profile } = await run(c, async (q) => ({
    sub: await readSubscription(q, nowOf(deps)),
    profile: (await q.query<{ tax_number: string | null; billing_email: string | null }>('select tax_number, billing_email from orgs where id = $1', [org.id]))[0],
  }));
  return c.json({
    enabled: !!deps.config.billing,
    subscription: sub,
    plans: PLAN_LIST,
    profile: { taxNumber: profile?.tax_number ?? null, billingEmail: profile?.billing_email ?? null },
  });
});

/** What the browser needs to open the provider's checkout, for those who may pay. */
subscriptionRoutes.post('/billing/checkout', async (c) => {
  requirePerm(c, 'org.manage');
  const deps = c.get('deps');
  const provider = providerFor(deps);
  if (!provider) return fail('billing_off');
  const input = await body(c, z.object({ plan: z.enum(PLAN_KEYS), interval: z.enum(INTERVALS).optional() }));
  const org = c.get('org');
  const [{ seats }] = await run(c, (q) => q.query<{ seats: number }>(`select ${SEATS_SQL} as seats from orgs o where o.id = $1`, [org.id]));
  const checkout = await provider.createCheckout({ orgId: org.id, plan: input.plan, interval: input.interval ?? 'month', quantity: Math.max(1, Number(seats)), email: c.get('auth').email });
  return c.json({ checkout });
});

/** Leave at the end of the period paid for (the monthly exit right); everything stays usable until then. */
subscriptionRoutes.post('/billing/cancel', async (c) => {
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
  return c.json({ ok: true });
});

/** Undo a pending cancellation before the period ends. */
subscriptionRoutes.post('/billing/resume', async (c) => {
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
  return c.json({ ok: true });
});

/** The billing-contact details shown on invoices. */
subscriptionRoutes.patch('/billing/profile', async (c) => {
  requirePerm(c, 'org.manage');
  const input = await body(c, z.object({ taxNumber: z.string().trim().max(60).nullish(), billingEmail: email.nullish() }));
  const org = c.get('org');
  await run(c, async (q) => {
    await q.query('update orgs set tax_number = $2, billing_email = $3 where id = $1', [org.id, input.taxNumber ?? null, input.billingEmail ?? null]);
    await audit(q, { orgId: org.id, actorId: c.get('auth').userId, action: 'org.updated', entity: 'org', entityId: org.id, meta: { billing: true } });
  });
  return c.json({ ok: true, taxNumber: input.taxNumber ?? null, billingEmail: input.billingEmail ?? null });
});

/**
 * The provider's notifications, on the central address (no company in the host).
 * Checked against the secret, parsed, then applied to the subscription/invoices.
 * Mounted before sign-in — the signature is the credential.
 */
export async function paddleInboundWebhook(c: C) {
  const deps = c.get('deps');
  const provider = providerFor(deps);
  if (!provider) return fail('not_found');
  const raw = await c.req.text();
  if (!(await provider.verifyWebhook(raw, c.req.header('paddle-signature'), nowOf(deps)))) return c.json({ error: 'bad_signature' }, 401);
  const event = await provider.parseWebhookEvent(raw);
  if (!event) return c.json({ error: 'bad_body' }, 400);
  await applyWebhookEvent(deps, event);
  return c.json({ ok: true });
}
