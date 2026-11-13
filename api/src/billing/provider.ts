// The payment provider, behind one small interface so the rest of billing never
// names Paddle. A provider turns the app's intents (open checkout, leave at
// period end, resume) into calls on its own API, and turns its webhooks into the
// normalised events the service applies to the subscriptions table.
//
// Everything a provider needs (keys, environment, price ids) is read from the
// server's BillingConfig at construction; nothing here holds a secret.
import type { Interval, PlanKey, SubscriptionStatus } from '../../../shared/src/billing';

/** What the browser needs to open the provider's hosted checkout (public values only). */
export interface CheckoutHandle {
  provider: string;
  env: 'sandbox' | 'live';
  /** Client-side token, safe to hand a browser. */
  clientToken: string;
  priceId: string;
  quantity: number;
  /**
   * Opaque data echoed back on the subscription's webhook. Carries the company id
   * with a signature only the server can make, so the webhook trusts no raw id.
   */
  customData: Record<string, string>;
  email: string;
}

/** A subscription as the provider reports it, normalised to the app's vocabulary. */
export interface ProviderSubscription {
  providerSubscriptionId: string;
  providerCustomerId: string | null;
  status: SubscriptionStatus;
  /** Which plan the priced item maps to, when it is one we recognise. */
  plan: PlanKey | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  /**
   * The company a new subscription is for, taken from checkout's custom_data and
   * verified by signature. Null when the data is absent or does not verify — the
   * service then only matches an existing row, never trusts an unsigned id.
   */
  signedOrgId: string | null;
}

/** An invoice as the provider reports it, normalised. */
export interface ProviderInvoice {
  providerInvoiceId: string;
  amountCents: number;
  currency: string;
  status: string;
  issuedAt: string | null;
  providerSubscriptionId: string | null;
  signedOrgId: string | null;
}

/** One normalised provider notification: at most one subscription or invoice. */
export interface WebhookEvent {
  id: string;
  type: string;
  occurredAt: string;
  subscription?: ProviderSubscription;
  invoice?: ProviderInvoice;
}

export interface CheckoutInput {
  orgId: string;
  plan: PlanKey;
  interval: Interval;
  quantity: number;
  email: string;
}

export interface PaymentProvider {
  /** A short identifier stored on each subscription row, e.g. 'paddle'. */
  readonly name: string;
  /** What the browser opens to subscribe for the first time. */
  createCheckout(input: CheckoutInput): Promise<CheckoutHandle>;
  /** The provider's current view of a subscription (a reconcile, rarely needed). */
  getSubscription(providerSubscriptionId: string): Promise<ProviderSubscription>;
  /** Leave at the end of the paid period (the monthly exit right). */
  cancelAtPeriodEnd(providerSubscriptionId: string): Promise<void>;
  /** Undo a scheduled cancellation before it takes effect. */
  resume(providerSubscriptionId: string): Promise<void>;
  /** Whether a webhook body truly came from the provider (signature + freshness). */
  verifyWebhook(rawBody: string, signature: string | undefined, now: Date): Promise<boolean>;
  /** Parse a verified webhook body into an event, or null if it carries nothing we apply. */
  parseWebhookEvent(rawBody: string): Promise<WebhookEvent | null>;
}
