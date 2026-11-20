// The Paddle adapter (https://developer.paddle.com), the only code that speaks
// Paddle Billing. Paddle is the merchant of record: it charges the buyer in
// their currency, adds and files the tax of their country, retries failed
// payments (dunning) and hosts invoices and the customer portal. We keep what it
// tells us in the subscriptions table (docs/ADR/0019).
//
// Checkout runs in the browser (Paddle.js), so createCheckout makes no HTTP call
// — it only hands back the public values and the signed company id. Every other
// call goes through an injected fetch, so tests run against a mock and never
// touch the network; there are no real keys anywhere in the repository.
import type { Interval, PlanKey, Proration, SubscriptionStatus } from '../../../shared/src/billing';
import type { BillingConfig } from '../context';
import { hmacHex, safeEqual } from '../lib/crypto';
import { fail } from '../lib/errors';
import type { CheckoutHandle, CheckoutInput, PaymentProvider, ProviderInvoice, ProviderSubscription, WebhookEvent } from './provider';
import { checkoutCustomData, signedOrgOf } from './sign';

const API = { sandbox: 'https://sandbox-api.paddle.com', live: 'https://api.paddle.com' } as const;

/**
 * A webhook is Paddle's when its Paddle-Signature header ("ts=…;h1=…") holds an
 * HMAC-SHA256 of "ts:raw body" made with our secret. Several h1 can come while
 * Paddle rotates secrets; any one matching is enough. Old timestamps are refused
 * so a captured call cannot be replayed later (replays inside the window are
 * caught by the event ledger in service.ts).
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
  for (const [plan, byInterval] of Object.entries(cfg.prices)) {
    for (const [interval, id] of Object.entries(byInterval) as [Interval, string][]) if (id === priceId) return { plan, interval };
  }
  return null;
}

/** What a subscription will do at the end of its period, when something is scheduled. */
type ScheduledAction = 'cancel' | 'pause' | 'resume';

/** A Paddle subscription, as much of it as we read. */
export interface PaddleSubscription {
  id: string;
  status: 'active' | 'canceled' | 'past_due' | 'paused' | 'trialing';
  customer_id: string;
  currency_code?: string;
  items: { price: { id: string }; quantity: number }[];
  current_billing_period?: { starts_at: string; ends_at: string } | null;
  scheduled_change?: { action: ScheduledAction; effective_at: string } | null;
  canceled_at?: string | null;
  custom_data?: Record<string, unknown> | null;
}

/** A Paddle transaction, as much of it as an invoice needs. */
interface PaddleTransaction {
  id: string;
  invoice_id?: string | null;
  status: string;
  currency_code?: string;
  billed_at?: string | null;
  subscription_id?: string | null;
  details?: { totals?: { grand_total?: string } } | null;
  custom_data?: Record<string, unknown> | null;
}

/** Paddle's notifications that carry an invoice: a paid one, or a renewal that could not be charged. */
const INVOICE_EVENTS = new Set(['transaction.completed', 'transaction.paid', 'transaction.past_due', 'transaction.payment_failed', 'transaction.billed', 'transaction.canceled']);

export class PaddleProvider implements PaymentProvider {
  readonly name = 'paddle';
  constructor(
    private cfg: BillingConfig,
    private fetchFn: typeof fetch,
  ) {}

  async createCheckout(input: CheckoutInput): Promise<CheckoutHandle> {
    const priceId = this.cfg.prices[input.plan]?.[input.interval];
    if (!priceId) return fail('validation', { fields: 'plan' }, { fields: ['plan'] });
    return {
      provider: this.name,
      env: this.cfg.env,
      clientToken: this.cfg.clientToken,
      priceId,
      quantity: Math.max(1, input.quantity),
      customData: await checkoutCustomData(this.cfg, input.orgId),
      email: input.email,
    };
  }

  async getSubscription(id: string): Promise<ProviderSubscription> {
    const sub = await this.call<PaddleSubscription>('GET', `/subscriptions/${id}`);
    return this.normalizeSubscription(sub);
  }

  async cancelAtPeriodEnd(id: string): Promise<void> {
    // Paddle schedules the cancellation for the end of the period paid for (the monthly exit right).
    await this.call('POST', `/subscriptions/${id}/cancel`, { effective_from: 'next_billing_period' });
  }

  async resume(id: string): Promise<void> {
    // Clearing the scheduled change undoes a pending cancellation.
    await this.call('PATCH', `/subscriptions/${id}`, { scheduled_change: null });
  }

  async changeItems(id: string, plan: PlanKey, interval: Interval, quantity: number, proration: Proration): Promise<ProviderSubscription> {
    const priceId = this.cfg.prices[plan]?.[interval];
    if (!priceId) return fail('validation', { fields: 'plan' }, { fields: ['plan'] });
    const sub = await this.call<PaddleSubscription>('PATCH', `/subscriptions/${id}`, {
      items: [{ price_id: priceId, quantity: Math.max(1, quantity) }],
      proration_billing_mode: proration,
    });
    return this.normalizeSubscription(sub);
  }

  async portalUrl(customerId: string, subscriptionId?: string | null): Promise<string> {
    const session = await this.call<{ urls: { general: { overview: string } } }>('POST', `/customers/${customerId}/portal-sessions`, subscriptionId ? { subscription_ids: [subscriptionId] } : {});
    return session.urls.general.overview;
  }

  verifyWebhook(rawBody: string, signature: string | undefined, now: Date): Promise<boolean> {
    return verifyPaddle(signature, rawBody, this.cfg.webhookSecret, now);
  }

  async parseWebhookEvent(rawBody: string): Promise<WebhookEvent | null> {
    let ev: { event_id?: string; event_type?: string; occurred_at?: string; data?: unknown };
    try {
      ev = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!ev?.event_id || !ev.event_type || typeof ev.occurred_at !== 'string' || Number.isNaN(Date.parse(ev.occurred_at))) return null;
    const base = { id: ev.event_id, type: ev.event_type, occurredAt: ev.occurred_at };
    if (ev.event_type.startsWith('subscription.')) {
      const sub = ev.data as PaddleSubscription;
      if (!sub?.id) return { ...base };
      return { ...base, subscription: await this.normalizeSubscription(sub) };
    }
    // An invoice record for a paid or failed transaction. Customers, addresses, adjustments…: acknowledged, not applied.
    if (INVOICE_EVENTS.has(ev.event_type)) {
      const invoice = await this.normalizeInvoice(ev.data as PaddleTransaction);
      return invoice ? { ...base, invoice } : { ...base };
    }
    return { ...base };
  }

  // ------------------------------------------------------------- internals

  private async normalizeSubscription(sub: PaddleSubscription): Promise<ProviderSubscription> {
    const item = sub.items?.[0];
    const price = planOfPrice(this.cfg, item?.price?.id);
    return {
      providerSubscriptionId: sub.id,
      providerCustomerId: sub.customer_id ?? null,
      status: sub.status as SubscriptionStatus,
      plan: price?.plan ?? null,
      interval: price?.interval ?? null,
      seats: Number.isFinite(item?.quantity) ? item!.quantity : null,
      currency: sub.currency_code ?? null,
      // The end of what is paid for: the current period, or when a cancellation takes effect.
      currentPeriodEnd: sub.current_billing_period?.ends_at ?? sub.scheduled_change?.effective_at ?? sub.canceled_at ?? null,
      cancelAtPeriodEnd: sub.scheduled_change?.action === 'cancel',
      // A trial's end is the current period's end while it is still 'trialing'.
      trialEndsAt: sub.status === 'trialing' ? (sub.current_billing_period?.ends_at ?? null) : null,
      signedOrgId: await signedOrgOf(this.cfg, sub.custom_data),
    };
  }

  private async normalizeInvoice(tx: PaddleTransaction | null | undefined): Promise<ProviderInvoice | undefined> {
    if (!tx?.id) return undefined;
    const total = Number(tx.details?.totals?.grand_total);
    return {
      providerInvoiceId: tx.invoice_id || tx.id,
      // Paddle sends amounts in the currency's smallest unit, tax included (the tax is Paddle's to file).
      amountCents: Number.isFinite(total) ? Math.round(total) : 0,
      currency: tx.currency_code ?? 'USD',
      status: tx.status,
      issuedAt: tx.billed_at ?? null,
      providerSubscriptionId: tx.subscription_id ?? null,
      signedOrgId: await signedOrgOf(this.cfg, tx.custom_data),
    };
  }

  /** One call to Paddle's API; a failure becomes "billing_error" (the provider's message is logged, never shown). */
  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchFn(`${API[this.cfg.env]}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.cfg.apiKey}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code?: string } };
    if (!res.ok) {
      console.error('[curahold] paddle', method, path, res.status, json.error?.code);
      return fail('billing_error');
    }
    return (json.data ?? (json as unknown)) as T;
  }
}
