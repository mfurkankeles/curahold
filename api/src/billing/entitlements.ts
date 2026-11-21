// The plan's caps on what costs us money (shared/src/plans.json → caps), checked
// on the server before the costly thing happens: assistant questions answered by
// the model, files kept, connected tools, full seats, and how often a connected
// tool syncs. The numbers are data; this file only counts and compares.
//
// Why: the owner's pricing rule is "the cheapest possible, but never loss-making
// per customer". The worst case of each cost driver is bounded by a cap, and
// scripts/quality/cost.mts prices exactly that worst case per plan.
import { accessOf, capsOf, type Access, type Caps, type OrgBilling } from '../../../shared/src/billing';
import type { Q } from '../db';
import { fail } from '../lib/errors';
import { SEATS_SQL } from './service';

/** Which limit was reached, as the error and the screen name it. */
export type CapKind = 'seats' | 'storage' | 'connectors' | 'ai';

/** The limits that apply to a company now, with its full seats counted. */
export type OrgCaps = ReturnType<typeof capsOf> & { fullSeats: number };

/** The company's caps (billing off: none). Reads with the given runner; works for request and system roles alike. */
export async function capsForOrg(q: Q, orgId: string, access: Pick<Access, 'state' | 'plan'>): Promise<OrgCaps> {
  const [r] = await q.query<{ n: number }>(`select ${SEATS_SQL} as n from orgs o where o.id = $1`, [orgId]);
  const fullSeats = Number(r?.n ?? 0);
  return { ...capsOf(access, fullSeats), fullSeats };
}

/**
 * The seats the company pays for now: the full seats in use, or the subscription's billed quantity when that is
 * higher (the plan's minimum, billing/service.ts billedSeats). The AI money ceiling counts these: a one-person
 * company billed for 3 seats gets the ceiling of 3 (independent review nit). Row security scopes the read.
 */
export async function paidSeats(q: Q, orgId: string, fullSeats: number): Promise<number> {
  const [r] = await q.query<{ seats: number | null }>(
    `select seats from subscriptions where org_id = $1 and provider_subscription_id is not null and status in ('active', 'trialing', 'past_due', 'paused')`,
    [orgId],
  );
  return Math.max(fullSeats, Number(r?.seats ?? 0) || 0);
}

/** As capsForOrg, from the company's row (billing snapshot + trial end), for code without a request. */
export async function capsForOrgRow(q: Q, org: { id: string; billing: OrgBilling | null; trial_ends_at: unknown }, billingOn: boolean, now: Date): Promise<OrgCaps> {
  const trial = org.trial_ends_at ? new Date(org.trial_ends_at as string).toISOString() : null;
  return capsForOrg(q, org.id, accessOf(billingOn, org.billing, trial, now));
}

/** Stops with plan_limit_<kind> when `used + adding` would pass `cap` (null: no limit). */
export function withinCap(kind: CapKind, cap: number | null, used: number, adding = 1): void {
  if (cap == null || adding <= 0) return;
  if (used + adding <= cap) return;
  const shown = kind === 'storage' ? Math.round((cap / 1024 ** 3) * 10) / 10 : cap;
  const code = kind === 'seats' ? 'plan_limit_seats' : kind === 'storage' ? 'plan_limit_storage' : 'plan_limit_connectors';
  fail(code, { cap: shown }, { what: kind, cap: shown });
}

/** Bytes of files the company keeps (task attachments and other uploads). */
export async function storageUsed(q: Q, orgId: string): Promise<number> {
  const [r] = await q.query<{ n: string | number | null }>(`select coalesce(sum(size), 0)::bigint as n from files where org_id = $1`, [orgId]);
  return Number(r?.n ?? 0);
}

/** Before storing an upload of `bytes`: the plan's storage cap. */
export async function checkStorage(q: Q, orgId: string, access: Pick<Access, 'state' | 'plan'>, bytes: number): Promise<void> {
  const caps = await capsForOrg(q, orgId, access);
  if (caps.storageBytes == null) return;
  withinCap('storage', caps.storageBytes, await storageUsed(q, orgId), bytes);
}

/** Connected tools that count against the plan (the demo source never does). */
export async function connectorsUsed(q: Q, orgId: string): Promise<number> {
  const [r] = await q.query<{ n: number }>(`select count(*)::int as n from connections where org_id = $1 and kind = 'source' and provider <> 'demo' and status <> 'disabled'`, [orgId]);
  return Number(r?.n ?? 0);
}

/** Before a new connected tool: the plan's connector cap. */
export async function checkConnectors(q: Q, orgId: string, access: Pick<Access, 'state' | 'plan'>): Promise<void> {
  const caps = await capsForOrg(q, orgId, access);
  if (caps.connectors == null) return;
  withinCap('connectors', caps.connectors, await connectorsUsed(q, orgId));
}

/** Model-answered assistant questions this calendar month. */
export async function aiQuestionsUsed(q: Q, orgId: string): Promise<number> {
  const [r] = await q.query<{ n: number }>(`select model_questions as n from assistant_usage where org_id = $1 and month = date_trunc('month', now())::date`, [orgId]);
  return Number(r?.n ?? 0);
}

/** What the company uses against each cap (Settings → Billing). */
export async function usageOf(q: Q, orgId: string, caps: OrgCaps): Promise<Record<CapKind, { used: number; cap: number | null }>> {
  return {
    seats: { used: caps.fullSeats, cap: caps.seatsMax },
    storage: { used: await storageUsed(q, orgId), cap: caps.storageBytes },
    connectors: { used: await connectorsUsed(q, orgId), cap: caps.connectors },
    ai: { used: await aiQuestionsUsed(q, orgId), cap: caps.aiQuestionsPerMonth },
  };
}

/** The minutes between two automatic syncs for a plan (the scheduler's own floor is 50: it runs hourly). */
export const syncGapMinutes = (caps: Pick<Caps, 'syncEveryMinutes'>): number => Math.max(50, caps.syncEveryMinutes ?? 50);
