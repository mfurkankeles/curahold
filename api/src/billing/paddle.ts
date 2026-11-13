// The Paddle adapter (https://developer.paddle.com). It speaks Paddle Billing in
// sandbox or live, with keys read from the server's BillingConfig, and turns
// Paddle's shapes into the provider-neutral ones in provider.ts.
//
// Checkout runs in the browser (Paddle.js), so createCheckout makes no HTTP call
// — it only hands back the public values and the signed company id. Cancel,
// resume and reconcile call Paddle's API through an injected fetch, so tests run
// against a mock and never touch the network.
import { type SubscriptionStatus } from '../../../shared/src/billing';
import type { BillingConfig } from '../context';
import { checkoutCustomData } from '../lib/billing';
import { hmacHex, safeEqual } from '../lib/crypto';
import { fail } from '../lib/errors';
import { planOfPrice, verifyPaddle, type PaddleSubscription } from '../lib/paddle';
import type { CheckoutHandle, CheckoutInput, PaymentProvider, ProviderInvoice, ProviderSubscription, WebhookEvent } from './provider';

const API = { sandbox: 'https://sandbox-api.paddle.com', live: 'https://api.paddle.com' } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    return this.normalizeSubscription(sub, sub.custom_data);
  }

  async cancelAtPeriodEnd(id: string): Promise<void> {
    // Paddle schedules the cancellation for the end of the period paid for.
    await this.call('POST', `/subscriptions/${id}/cancel`, { effective_from: 'next_billing_period' });
  }

  async resume(id: string): Promise<void> {
    // Clearing the scheduled change undoes a pending cancellation.
    await this.call('PATCH', `/subscriptions/${id}`, { scheduled_change: null });
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
    if (!ev?.event_id || !ev.event_type || typeof ev.occurred_at !== 'string') return null;
    const base = { id: ev.event_id, type: ev.event_type, occurredAt: ev.occurred_at };
    if (ev.event_type.startsWith('subscription.')) {
      const sub = ev.data as PaddleSubscription;
      if (!sub?.id) return { ...base };
      return { ...base, subscription: await this.normalizeSubscription(sub, sub.custom_data) };
    }
    // A completed transaction becomes an invoice record. Other events are acknowledged, not applied.
    if (ev.event_type.startsWith('transaction.')) {
      const invoice = await this.normalizeInvoice(ev.data as PaddleTransaction);
      return invoice ? { ...base, invoice } : { ...base };
    }
    return { ...base };
  }

  // ------------------------------------------------------------- internals

  private async normalizeSubscription(sub: PaddleSubscription, custom: Record<string, unknown> | null | undefined): Promise<ProviderSubscription> {
    const price = planOfPrice(this.cfg, sub.items?.[0]?.price?.id);
    const periodEnd = sub.current_billing_period?.ends_at ?? sub.scheduled_change?.effective_at ?? sub.canceled_at ?? null;
    return {
      providerSubscriptionId: sub.id,
      providerCustomerId: sub.customer_id ?? null,
      status: sub.status as SubscriptionStatus,
      plan: price?.plan ?? null,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: sub.scheduled_change?.action === 'cancel',
      // A trial's end is the current period's end while it is still 'trialing'.
      trialEndsAt: sub.status === 'trialing' ? (sub.current_billing_period?.ends_at ?? null) : null,
      signedOrgId: await this.verifiedOrg(custom),
    };
  }

  private async normalizeInvoice(tx: PaddleTransaction | null | undefined): Promise<ProviderInvoice | undefined> {
    if (!tx?.id) return undefined;
    const total = Number(tx.details?.totals?.grand_total);
    return {
      providerInvoiceId: tx.invoice_id || tx.id,
      amountCents: Number.isFinite(total) ? Math.round(total) : 0,
      currency: tx.currency_code ?? 'USD',
      status: tx.status,
      issuedAt: tx.billed_at ?? null,
      providerSubscriptionId: tx.subscription_id ?? null,
      signedOrgId: await this.verifiedOrg(tx.custom_data),
    };
  }

  /** The company id in custom_data, only when its signature checks out (see lib/billing checkoutCustomData). */
  private async verifiedOrg(custom: Record<string, unknown> | null | undefined): Promise<string | null> {
    const c = (custom ?? {}) as { org_id?: unknown; sig?: unknown };
    if (typeof c.org_id !== 'string' || !UUID.test(c.org_id) || typeof c.sig !== 'string') return null;
    const want = await hmacHex(this.cfg.webhookSecret, `checkout:${c.org_id.toLowerCase()}`);
    return safeEqual(c.sig, want) ? c.org_id.toLowerCase() : null;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchFn(`${API[this.cfg.env]}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.cfg.apiKey}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: T };
    if (!res.ok) {
      console.error('[curahold] paddle', method, path, res.status);
      return fail('billing_error');
    }
    return (json.data ?? (json as unknown)) as T;
  }
}
