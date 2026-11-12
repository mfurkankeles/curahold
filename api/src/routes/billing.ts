// Billing, for a company's administrators: where it stands, the plans, a link
// to Paddle's portal (invoices, payment method, cancelling), changing plan or
// interval. Choosing a plan the first time happens in the browser with
// Paddle.js; Paddle then calls the webhook below and the company row follows.
//
// With billing off (no Paddle settings: self-hosted, demo, development) the
// page says so and nothing here charges anyone.
import { Hono } from 'hono';
import { z } from 'zod';
import { INTERVALS, PLANS, PLAN_KEYS, type OrgBilling } from '../../../shared/src/billing';
import { accessFor, fetchOf, nowOf, requirePerm, run, type AppEnv, type C } from '../context';
import { applyPaddleEvent, SEATS_SQL, type PaddleEvent } from '../lib/billing';
import { fail } from '../lib/errors';
import { planOfPrice, portalLink, updateItems, verifyPaddle } from '../lib/paddle';
import { body } from '../lib/validate';

export const billingRoutes = new Hono<AppEnv>();

const configOf = (c: C) => c.get('deps').config.billing;

billingRoutes.get('/billing', async (c) => {
  const cfg = configOf(c);
  const org = c.get('org');
  const isAdmin = c.get('auth').perms.includes('org.manage');
  const [{ seats }] = await run(c, (q) => q.query(`select ${SEATS_SQL} as seats from orgs o where o.id = $1`, [org.id]));
  const b = (org.billing ?? {}) as OrgBilling;
  return c.json({
    enabled: !!cfg,
    access: accessFor(c),
    plans: PLAN_KEYS.map((k) => PLANS[k]),
    seats,
    subscription: b.subscriptionId ? { status: b.status, plan: b.plan, interval: b.interval, seats: b.seats, periodEnd: b.periodEnd, cancelAtPeriodEnd: !!b.cancelAtPeriodEnd } : null,
    // What the browser needs to open Paddle's checkout (public values only), for the people who may pay.
    ...(cfg && isAdmin ? { checkout: { env: cfg.env, clientToken: cfg.clientToken, prices: cfg.prices, orgId: org.id, email: c.get('auth').email } } : {}),
  });
});

/** Another plan or interval for a running subscription: billed now for the rest of the period. */
billingRoutes.post('/billing/change', async (c) => {
  requirePerm(c, 'org.manage');
  const cfg = configOf(c);
  if (!cfg) return fail('billing_off');
  const input = await body(c, z.object({ plan: z.enum(PLAN_KEYS), interval: z.enum(INTERVALS) }));
  const org = c.get('org');
  const b = (org.billing ?? {}) as OrgBilling;
  if (!b.subscriptionId || !['active', 'trialing', 'past_due'].includes(b.status ?? '')) return fail('validation', { fields: 'plan' }, { fields: ['plan'] });
  const sub = await updateItems(cfg, fetchOf(c.get('deps')), b.subscriptionId, cfg.prices[input.plan][input.interval], b.seats ?? 1, 'prorated_immediately');
  // Shown at once; Paddle's webhook confirms it a moment later.
  const price = planOfPrice(cfg, sub.items?.[0]?.price?.id) ?? input;
  await c.get('deps').db.system((q) => q.query(`update orgs set billing = billing || $2::jsonb where id = $1`, [org.id, JSON.stringify({ plan: price.plan, interval: price.interval })]));
  return c.json({ ok: true });
});

/** Paddle's customer portal, signed in: invoices, payment method, cancelling. */
billingRoutes.post('/billing/portal', async (c) => {
  requirePerm(c, 'org.manage');
  const cfg = configOf(c);
  if (!cfg) return fail('billing_off');
  const b = (c.get('org').billing ?? {}) as OrgBilling;
  if (!b.customerId) return fail('not_found');
  return c.json({ url: await portalLink(cfg, fetchOf(c.get('deps')), b.customerId, b.subscriptionId) });
});

/**
 * Paddle's notifications, on the central address (no company in the host).
 * Checked against the secret, then applied once each; anything else is ignored.
 */
export async function billingWebhook(c: C) {
  const deps = c.get('deps');
  const cfg = deps.config.billing;
  if (!cfg) return fail('not_found');
  const raw = await c.req.text();
  if (!(await verifyPaddle(c.req.header('paddle-signature'), raw, cfg.webhookSecret, nowOf(deps)))) return c.json({ error: 'bad_signature' }, 401);
  let ev: PaddleEvent;
  try {
    ev = JSON.parse(raw);
  } catch {
    return c.json({ error: 'bad_body' }, 400);
  }
  if (!ev?.event_id || !ev.event_type) return c.json({ error: 'bad_body' }, 400);
  await applyPaddleEvent(deps.db, cfg, ev);
  return c.json({ ok: true });
}
