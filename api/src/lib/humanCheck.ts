// "Was this form sent by a person?" for the public forms: the trial request,
// the instant sign-up, and the portal's sign-in, password and password-reset
// steps. Free mechanisms only:
//
// 1. A honeypot: a field people never see (hidden off-screen, out of the tab
//    order, hidden from screen readers). A form robot fills it.
// 2. A fill time: the form says how long it was open (ms). Under the minimum,
//    no person typed it. The trial request has a signed server stamp of its own.
// 3. Cloudflare Turnstile (free), when TURNSTILE_SITE_KEY and
//    TURNSTILE_SECRET_KEY are set (config.turnstile): the form carries a token
//    from the widget and the server asks Cloudflare whether it is good.
//    Without the keys, (1) and (2) stand alone, with the request limits.
//
// A robot caught by (1) or (2) gets the same answer a person would (nothing is
// sent, nothing is learned). A missing or refused Turnstile token is told
// plainly (errors.human_check), because a real person can fix it.
//
// If Cloudflare cannot be reached, the form is let through (logged): a
// Turnstile outage must not lock people out, and the limits still hold.
import { z } from 'zod';
import { fetchOf, type Deps } from '../context';

/** The fields a public form may add; every one optional, so an older page still works. */
export const humanFields = {
  hp: z.string().max(200).optional(),
  ms: z.number().int().min(0).max(86_400_000).optional(),
  ts: z.string().max(2048).optional(),
};
export interface HumanProof {
  hp?: string;
  ms?: number;
  ts?: string;
}

/** The shortest time a person takes to fill a one- or two-field form (an e-mail, a password). */
export const MIN_FILL_MS = 1200;

export const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** The widget's public key for the browser, or null when Turnstile is off. */
export const turnstileSiteKey = (deps: Deps): string | null => deps.config.turnstile?.siteKey ?? null;

/**
 * 'person': go on. 'bot': answer as if done, do nothing. 'failed': Turnstile is
 * on and the token is missing or refused (tell the person, fail('human_check')).
 */
export async function humanCheck(deps: Deps, proof: HumanProof, opts: { ip?: string | null; minMs?: number } = {}): Promise<'person' | 'bot' | 'failed'> {
  if (proof.hp) return 'bot';
  if (proof.ms !== undefined && proof.ms < (opts.minMs ?? MIN_FILL_MS)) return 'bot';
  const t = deps.config.turnstile;
  if (!t) return 'person';
  if (!proof.ts) return 'failed';
  try {
    const form = new URLSearchParams({ secret: t.secretKey, response: proof.ts });
    // Data minimisation (L1 audit): the visitor's address goes to Cloudflare only where the operator chose it
    // (TURNSTILE_SEND_IP=1); the check works without it, and the privacy texts say which is the case.
    if (opts.ip && t.sendIp) form.set('remoteip', opts.ip);
    const res = await fetchOf(deps)(TURNSTILE_VERIFY, { method: 'POST', body: form, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`siteverify ${res.status}`);
    const out = (await res.json()) as { success?: boolean };
    return out.success === true ? 'person' : 'failed';
  } catch (e) {
    console.warn('[curahold] turnstile not reachable; form let through', e instanceof Error ? e.message : String(e));
    return 'person';
  }
}
