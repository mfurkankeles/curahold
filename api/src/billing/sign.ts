// The company id that travels through checkout, signed. The browser opens
// Paddle's checkout and could put anything in custom_data, so the server hands
// it the company id together with an HMAC only the server can make (keyed with
// the webhook secret). A webhook then trusts a company id only when the
// signature checks out — never a raw id (docs/ADR/0019, SECURITY.md).
import type { BillingConfig } from '../context';
import { hmacHex, safeEqual } from '../lib/crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the server hands the browser to put in checkout's custom_data. */
export async function checkoutCustomData(cfg: Pick<BillingConfig, 'webhookSecret'>, orgId: string): Promise<{ org_id: string; sig: string }> {
  return { org_id: orgId, sig: await hmacHex(cfg.webhookSecret, `checkout:${orgId}`) };
}

/** The company id in custom_data, only when its signature checks out; otherwise null. */
export async function signedOrgOf(cfg: Pick<BillingConfig, 'webhookSecret'>, custom: unknown): Promise<string | null> {
  const c = (custom ?? {}) as { org_id?: unknown; sig?: unknown };
  if (typeof c.org_id !== 'string' || !UUID.test(c.org_id) || typeof c.sig !== 'string') return null;
  const want = await hmacHex(cfg.webhookSecret, `checkout:${c.org_id.toLowerCase()}`);
  return safeEqual(c.sig, want) ? c.org_id.toLowerCase() : null;
}
