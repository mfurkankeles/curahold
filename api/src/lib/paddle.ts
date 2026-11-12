// Paddle Billing (https://developer.paddle.com): the few calls Curahold makes,
// and checking that a webhook really comes from Paddle.
//
// - Checkout happens in the browser (Paddle.js, see web/src/components/Billing.tsx):
//   the company's id travels in custom_data, and Paddle tells us the result by webhook.
// - Seats: the subscription's quantity follows the company's full seats (scheduler).
// - Invoices, payment method and cancelling live in Paddle's customer portal.
import type { Interval, PlanKey } from '../../../shared/src/billing';
import type { BillingConfig } from '../context';
import { hmacHex, safeEqual } from './crypto';
import { fail } from './errors';

const BASE = { sandbox: 'https://sandbox-api.paddle.com', live: 'https://api.paddle.com' } as const;

/**
 * A webhook is Paddle's when its Paddle-Signature header ("ts=…;h1=…") holds an
 * HMAC-SHA256 of "ts:raw body" made with our secret. Several h1 can come while
 * Paddle rotates secrets; any one matching is enough. Old timestamps are refused
 * so a captured call cannot be replayed later.
 */
export async function verifyPaddle(header: string | undefined, raw: string, secret: string, now: Date, toleranceSeconds = 300): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(';').map((p) => {
    const i = p.indexOf('=');
    return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as const;
  });
  const ts = parts.find(([k]) => k === 'ts')?.[1];
  const sigs = parts.filter(([k]) => k === 'h1').map(([, v]) => v);
  if (!ts || !/^\d+$/.test(ts) || !sigs.length) return false;
  if (Math.abs(now.getTime() / 1000 - Number(ts)) > toleranceSeconds) return false;
  const want = await hmacHex(secret, `${ts}:${raw}`);
  return sigs.some((s) => safeEqual(s, want));
}

/** Which plan and interval a Paddle price id stands for (from the PADDLE_PRICES setting). */
export function planOfPrice(cfg: BillingConfig, priceId: string | undefined): { plan: PlanKey; interval: Interval } | null {
  if (!priceId) return null;
  for (const [plan, byInterval] of Object.entries(cfg.prices) as [PlanKey, Record<Interval, string>][]) {
    for (const [interval, id] of Object.entries(byInterval) as [Interval, string][]) if (id === priceId) return { plan, interval };
  }
  return null;
}

/** One call to Paddle's API; a failure becomes "billing_error" (the provider's message is logged, not shown). */
async function call<T>(cfg: BillingConfig, f: typeof fetch, method: string, path: string, body?: unknown): Promise<T> {
  const res = await f(`${BASE[cfg.env]}${path}`, {
    method,
    headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code?: string; detail?: string } };
  if (!res.ok || !json.data) {
    console.error('[curahold] paddle', method, path, res.status, json.error?.code, json.error?.detail);
    return fail('billing_error');
  }
  return json.data;
}

/** What a subscription will do at the end of its period, when something is scheduled. */
type ScheduledAction = 'cancel' | 'pause' | 'resume';

export interface PaddleSubscription {
  id: string;
  status: 'active' | 'canceled' | 'past_due' | 'paused' | 'trialing';
  customer_id: string;
  items: { price: { id: string }; quantity: number }[];
  current_billing_period?: { starts_at: string; ends_at: string } | null;
  scheduled_change?: { action: ScheduledAction; effective_at: string } | null;
  canceled_at?: string | null;
  custom_data?: Record<string, unknown> | null;
}

/**
 * Change the subscription's plan, interval or seats. More seats or a better plan
 * are billed now for the rest of the period; fewer seats are credited at the next bill.
 */
export function updateItems(cfg: BillingConfig, f: typeof fetch, subscriptionId: string, priceId: string, quantity: number, mode: 'prorated_immediately' | 'prorated_next_billing_period') {
  return call<PaddleSubscription>(cfg, f, 'PATCH', `/subscriptions/${subscriptionId}`, {
    items: [{ price_id: priceId, quantity: Math.max(1, quantity) }],
    proration_billing_mode: mode,
  });
}

/** A signed-in link to Paddle's customer portal: invoices, payment method, cancelling. */
export async function portalLink(cfg: BillingConfig, f: typeof fetch, customerId: string, subscriptionId?: string): Promise<string> {
  const session = await call<{ urls: { general: { overview: string } } }>(cfg, f, 'POST', `/customers/${customerId}/portal-sessions`, subscriptionId ? { subscription_ids: [subscriptionId] } : {});
  return session.urls.general.overview;
}
