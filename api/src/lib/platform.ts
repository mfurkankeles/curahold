// Who may open the platform owner's super-admin console. This is for the
// BUSINESS OPERATOR (the product owner and their staff), never for an ordinary
// tenant administrator — the console reads across every customer company, so a
// normal org admin must be turned away with 403.
//
// The gate is an env allowlist, resolved from the same configuration the hosted
// service already builds (see api/src/worker.ts):
//   - PLATFORM_OWNER  → config.owner        — the one platform owner's email.
//   - STAFF_KEYS      → config.staffKeys     — "addr:key,addr:key" pairs; the
//                        staff IDENTIFIERS are the addresses (the keys open
//                        support sessions and are irrelevant here).
//   - SUPPORT_STAFF   → config.support.staff — the same staff, listed plainly.
// The owner check itself (email === config.owner, with the self-host/dev
// fallback) lives in context.ts; we reuse it so there is a single source of
// truth and add the staff addresses on top.
import type { C, Config } from '../context';
import { isOwner } from '../context';
import { fail } from './errors';

/** The staff identifiers (lower-cased emails) allowed into the console beyond the owner. */
export function platformStaff(cfg: Pick<Config, 'staffKeys' | 'support'>): Set<string> {
  const out = new Set<string>();
  for (const addr of Object.keys(cfg.staffKeys ?? {})) out.add(addr.toLowerCase());
  for (const addr of cfg.support?.staff ?? []) out.add(addr.toLowerCase());
  return out;
}

/** Is the signed-in person the platform owner, or a listed staff member? */
export function isPlatformStaff(c: C): boolean {
  if (isOwner(c)) return true;
  const email = c.get('auth')?.email?.toLowerCase();
  if (!email) return false;
  return platformStaff(c.get('deps').config).has(email);
}

/** Guard for the console routes: a non-owner, non-staff caller gets 403. */
export function requirePlatform(c: C): void {
  if (!isPlatformStaff(c)) fail('forbidden');
}

/** The flags the browser needs to decide whether to show the console (no tenant data). */
export function platformAccess(c: C): { owner: boolean; staff: boolean; platform: boolean } {
  const owner = isOwner(c);
  const staff = isPlatformStaff(c);
  return { owner, staff, platform: staff };
}
