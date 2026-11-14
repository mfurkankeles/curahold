// Applying billing to the subscriptions / invoices tables: build the provider
// from configuration, start a company's trial when it is provisioned, and fold a
// provider's webhooks into its subscription and invoices.
//
// The webhook and the trial have no signed-in person and must reach the right
// company directly, so they run as the owner (db.system). Every such statement
// names org_id, so one company's billing can never spill into another's. By-hand
// changes an administrator makes (leaving, resuming) go through the request role
// and row-level security, in the route — not here.
import { trialEndsAt, type PlanKey, type Subscription, type SubscriptionStatus } from '../../../shared/src/billing';
import { fetchOf, nowOf, type Deps } from '../context';
import type { Q } from '../db';
import { audit } from '../lib/audit';
import { PaddleProvider } from './paddle';
import { projectBillingQ } from './project';
import type { PaymentProvider, ProviderInvoice, ProviderSubscription } from './provider';

/** A subscription in one of these states is live and must never be moved between companies. */
const LIVE: SubscriptionStatus[] = ['active', 'trialing', 'past_due', 'paused'];
const DAY = 86_400_000;

/** The configured payment provider, or null when billing is off (self-hosted, demo, tests). */
export function providerFor(deps: Pick<Deps, 'config' | 'fetch'>): PaymentProvider | null {
  const cfg = deps.config.billing;
  if (!cfg) return null;
  return new PaddleProvider(cfg, fetchOf(deps as Deps));
}

/**
 * Start a company's free trial: a 'trialing' subscription that ends TRIAL_MONTHS
 * out. Idempotent — a company that already has a subscription keeps it. Returns
 * true when a trial was created.
 */
export async function startTrial(deps: Deps, input: { orgId: string; plan: PlanKey }): Promise<boolean> {
  const ends = trialEndsAt(nowOf(deps)).toISOString();
  return deps.db.system(async (q) => {
    const [row] = await q.query<{ id: string }>(
      `insert into subscriptions (org_id, provider, plan, status, trial_ends_at)
         values ($1, 'paddle', $2, 'trialing', $3)
       on conflict (org_id) do nothing
       returning id`,
      [input.orgId, input.plan, ends],
    );
    if (row) {
      await audit(q, { orgId: input.orgId, actorId: null, action: 'billing.changed', entity: 'org', entityId: input.orgId, meta: { status: 'trialing', plan: input.plan } });
      await projectBillingQ(q, input.orgId);
    }
    return !!row;
  });
}

/**
 * Make sure a company has a subscription row, backfilling one from its current
 * trial when it is missing (older companies, demo data). Keeps the real trial end
 * rather than resetting it. Idempotent.
 */
export async function ensureSubscription(deps: Deps, orgId: string): Promise<void> {
  await deps.db.system(async (q) => {
    const [has] = await q.query<{ one: number }>(`select 1 as one from subscriptions where org_id = $1`, [orgId]);
    if (has) return;
    const [org] = await q.query<{ trial_ends_at: unknown }>(`select trial_ends_at from orgs where id = $1`, [orgId]);
    const ends = org?.trial_ends_at ? (org.trial_ends_at instanceof Date ? org.trial_ends_at.toISOString() : String(org.trial_ends_at)) : trialEndsAt(nowOf(deps)).toISOString();
    const [row] = await q.query<{ id: string }>(
      `insert into subscriptions (org_id, provider, plan, status, trial_ends_at)
         values ($1, 'paddle', 'business', 'trialing', $2)
       on conflict (org_id) do nothing
       returning id`,
      [orgId, ends],
    );
    if (row) await projectBillingQ(q, orgId);
  });
}

/** Apply one normalised webhook event; returns the company it touched, or null. */
export async function applyWebhookEvent(deps: Deps, event: { subscription?: ProviderSubscription; invoice?: ProviderInvoice; occurredAt: string }): Promise<string | null> {
  if (event.subscription) return applySubscription(deps, event.subscription, event.occurredAt);
  if (event.invoice) return applyInvoice(deps, event.invoice);
  return null;
}

async function applySubscription(deps: Deps, sub: ProviderSubscription, occurredAt: string): Promise<string | null> {
  return deps.db.system(async (q) => {
    const refuse = async (orgId: string, why: string) => {
      await audit(q, { orgId, actorId: null, action: 'billing.refused', entity: 'org', entityId: orgId, meta: { why, subscription: sub.providerSubscriptionId } });
      return orgId;
    };
    // The company already holding this provider subscription, if any.
    const [holder] = await q.query<{ org_id: string }>(`select org_id from subscriptions where provider_subscription_id = $1 limit 1`, [sub.providerSubscriptionId]);
    let orgId: string | null = holder?.org_id ?? null;
    if (orgId) {
      // A live subscription cannot be re-pointed at another company by custom_data.
      if (sub.signedOrgId && sub.signedOrgId !== orgId) return refuse(orgId, 'named_other_org');
    } else {
      // A new subscription needs a signed company id — an unsigned one is ignored.
      orgId = sub.signedOrgId;
      if (!orgId) return null;
      const [existing] = await q.query<{ provider_subscription_id: string | null; status: SubscriptionStatus }>(`select provider_subscription_id, status from subscriptions where org_id = $1`, [orgId]);
      if (existing?.provider_subscription_id && existing.provider_subscription_id !== sub.providerSubscriptionId && LIVE.includes(existing.status)) return refuse(orgId, 'already_subscribed');
    }

    // Current row, to keep what the event does not carry and to ignore a stale event.
    const [cur] = await q.query<{ plan: string; trial_ends_at: string | null; updated_at: string }>(`select plan, trial_ends_at, updated_at from subscriptions where org_id = $1`, [orgId]);
    if (cur && Date.parse(cur.updated_at) > Date.parse(occurredAt)) return orgId; // a newer event already applied
    const plan = sub.plan ?? (cur?.plan as PlanKey | undefined) ?? 'business';
    const trial = sub.trialEndsAt ?? cur?.trial_ends_at ?? null;

    await q.query(
      `insert into subscriptions (org_id, provider, provider_customer_id, provider_subscription_id, plan, status, trial_ends_at, current_period_end, cancel_at_period_end, updated_at)
         values ($1, 'paddle', $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (org_id) do update set
         provider_customer_id = coalesce(excluded.provider_customer_id, subscriptions.provider_customer_id),
         provider_subscription_id = excluded.provider_subscription_id,
         plan = excluded.plan, status = excluded.status,
         trial_ends_at = excluded.trial_ends_at, current_period_end = excluded.current_period_end,
         cancel_at_period_end = excluded.cancel_at_period_end, updated_at = excluded.updated_at`,
      [orgId, sub.providerCustomerId, sub.providerSubscriptionId, plan, sub.status, trial, sub.currentPeriodEnd, sub.cancelAtPeriodEnd, occurredAt],
    );
    await audit(q, { orgId, actorId: null, action: 'billing.changed', entity: 'org', entityId: orgId, meta: { status: sub.status, plan } });
    await projectBillingQ(q, orgId);
    return orgId;
  });
}

async function applyInvoice(deps: Deps, invoice: ProviderInvoice): Promise<string | null> {
  return deps.db.system(async (q) => {
    let orgId: string | null = null;
    if (invoice.providerSubscriptionId) {
      const [h] = await q.query<{ org_id: string }>(`select org_id from subscriptions where provider_subscription_id = $1 limit 1`, [invoice.providerSubscriptionId]);
      orgId = h?.org_id ?? null;
    }
    orgId = orgId ?? invoice.signedOrgId;
    if (!orgId) return null;
    await q.query(
      `insert into invoices (org_id, provider_invoice_id, amount_cents, currency, status, issued_at)
         values ($1, $2, $3, $4, $5, $6)
       on conflict (provider_invoice_id) do update set
         status = excluded.status, amount_cents = excluded.amount_cents, issued_at = excluded.issued_at
       where invoices.org_id = $1`,
      [orgId, invoice.providerInvoiceId, invoice.amountCents, invoice.currency, invoice.status, invoice.issuedAt],
    );
    return orgId;
  });
}

/** This company's subscription (read inside a tenant transaction; RLS scopes it), or null. */
export async function readSubscription(q: Q, now: Date): Promise<Subscription | null> {
  const [r] = await q.query(`select * from subscriptions limit 1`);
  if (!r) return null;
  const until = r.cancel_at_period_end ? r.current_period_end : r.status === 'trialing' ? r.trial_ends_at : null;
  const daysLeft = until ? Math.max(0, Math.ceil((Date.parse(iso(until)!) - now.getTime()) / DAY)) : null;
  return {
    plan: r.plan as PlanKey,
    status: r.status as SubscriptionStatus,
    trialEndsAt: iso(r.trial_ends_at),
    currentPeriodEnd: iso(r.current_period_end),
    cancelAtPeriodEnd: !!r.cancel_at_period_end,
    providerCustomerId: r.provider_customer_id ?? null,
    providerSubscriptionId: r.provider_subscription_id ?? null,
    daysLeft,
  };
}

const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
