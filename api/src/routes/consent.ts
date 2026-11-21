// Proof of cookie consent (consent_log, migrations 0039 + 0160; consent_events, 0160).
// The browser gates what loads (shared/src/consent/); these endpoints keep the
// record a KVKK / GDPR / PDPL review asks the controller to show: the choice,
// the cookie-policy version, a SHA-256 of the exact words shown, the language,
// the surface, the country (from the edge, never the IP address) and an
// anonymous consent id.
//
//   GET  /api/consent        → the person's latest choice, or null
//   POST /api/consent        → record a signed-in person's choice
//   POST /api/consent-event  → record a visitor's choice (public, no account;
//                              text/plain body so a beacon from the static site
//                              needs no CORS preflight; rate-limited per address)
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { run } from '../context';
import { body } from '../lib/validate';
import { CONSENT_POLICY_VERSION, SURFACES, bannerText, sha256Hex, type Surface } from '../../../shared/src/consent/core';
import { CONSENT_STRINGS } from '../../../shared/src/consent/strings';
import SITE_TEXT_HASHES from '../../../shared/src/consent/site-text-hashes.json';
import { LOCALES, normalizeLocale } from '../../../shared/src/i18n';

export const consentRoutes = new Hono<AppEnv>();

const evidence = {
  consentId: z.string().uuid().optional(),
  action: z.enum(['accept_all', 'reject_all', 'custom', 'withdraw']).optional(),
  policyVersion: z.string().min(1).max(40).optional(),
  textHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  locale: z.string().min(2).max(10).optional(),
};
const consentInput = z.object({
  analytics: z.boolean(),
  marketing: z.boolean(),
  source: z.enum(SURFACES as [Surface, ...Surface[]]).optional(),
  ...evidence,
  /** Which optional categories the banner showed (its text, and so its hash, depends on them). */
  inUse: z.object({ analytics: z.boolean(), marketing: z.boolean() }).optional(),
});

/**
 * The hash of the words the in-app banner shows for this language and these categories, computed here from the same
 * text builder the banner uses (shared/src/consent): the stored proof never rests on a value the browser sent.
 */
export async function shownTextHash(locale: string | undefined, inUse: { analytics: boolean; marketing: boolean }): Promise<string> {
  const strings = CONSENT_STRINGS[normalizeLocale(locale)] ?? CONSENT_STRINGS.en!;
  return sha256Hex(bannerText(strings as unknown as Record<string, string>, inUse));
}
const IN_USE_COMBOS = [false, true].flatMap((analytics) => [false, true].map((marketing) => ({ analytics, marketing })));
let known: Promise<Set<string>> | undefined;
/**
 * Every text a banner of ours can show under the policy in force, as hashes: the in-app banner in each language and
 * category combination (computed here, once per isolate), and the static pages' banner (site-text-hashes.json, built
 * from the site copy by scripts/compliance/build-consent.ts and kept current by tests/compliance.test.ts — the site
 * copy is too big to bundle into the API). The public door stores a visitor's hash only when it is one of these, so
 * the proof never names words we did not show (review 20 Nov; ADR 0014).
 */
export function knownTextHashes(): Promise<Set<string>> {
  known ??= (async () => {
    const out = new Set<string>(SITE_TEXT_HASHES.policyVersion === CONSENT_POLICY_VERSION ? SITE_TEXT_HASHES.hashes : []);
    for (const l of LOCALES) for (const inUse of IN_USE_COMBOS) out.add(await shownTextHash(l, inUse));
    return out;
  })();
  return known;
}
const eventInput = z.object({
  analytics: z.boolean(),
  marketing: z.boolean(),
  surface: z.enum(SURFACES as [Surface, ...Surface[]]),
  ...evidence,
  consentId: z.string().uuid(),
  action: z.enum(['accept_all', 'reject_all', 'custom', 'withdraw']),
  policyVersion: z.string().min(1).max(40),
});

/** The visitor's country as the edge saw it (Cloudflare), never the address itself. */
export const countryOf = (h: string | undefined) => (h && /^[A-Z]{2}$/.test(h) && h !== 'XX' && h !== 'T1' ? h : null);

interface ConsentRow {
  analytics: boolean;
  marketing: boolean;
  source: string;
  created_at: string;
}

const shape = (r: ConsentRow | undefined) =>
  r ? { analytics: r.analytics, marketing: r.marketing, source: r.source, at: new Date(r.created_at).toISOString() } : null;

/** The signed-in person's latest cookie and analytics consent choice. */
consentRoutes.get('/consent', async (c) => {
  const auth = c.get('auth');
  const latest = await run(c, async (q) => {
    const [row] = await q.query<ConsentRow>(
      'select analytics, marketing, source, created_at from consent_log where user_id = $1 order by created_at desc limit 1',
      [auth.userId],
    );
    return row;
  });
  return c.json({ consent: shape(latest) });
});

/**
 * Records the person's consent choice. Only the policy version in force is recorded (409 'stale_policy' otherwise, also
 * when none is named), and the hash of the words shown is computed here, so the stored proof always names the text the
 * person actually saw (ADR 0014).
 */
consentRoutes.post('/consent', async (c) => {
  const input = await body(c, consentInput);
  // Same as the public door: a version other than the one in force is not recorded as proof of it.
  if (input.policyVersion !== CONSENT_POLICY_VERSION) return c.json({ error: 'stale_policy' }, 409);
  // Without the categories named, the ones the choice speaks to (a "yes" can only be to a category that was shown).
  const inUse = input.inUse ?? { analytics: input.analytics || !input.marketing, marketing: input.marketing };
  const hash = await shownTextHash(input.locale, inUse);
  const auth = c.get('auth');
  const org = c.get('org');
  const agent = (c.req.header('user-agent') ?? '').slice(0, 400) || null;
  const stored = await run(c, async (q) => {
    const [row] = await q.query<ConsentRow>(
      `insert into consent_log (org_id, user_id, analytics, marketing, source, user_agent, policy_version, text_hash, locale, country, consent_id, action)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       returning analytics, marketing, source, created_at`,
      [
        org.id,
        auth.userId,
        input.analytics,
        input.marketing,
        input.source ?? 'app',
        agent,
        input.policyVersion,
        hash || null,
        input.locale ?? null,
        countryOf(c.req.header('cf-ipcountry')),
        input.consentId ?? null,
        input.action ?? null,
      ],
    );
    return row;
  });
  return c.json({ consent: shape(stored) });
});

/** Public: a visitor's choice. Mounted before sign-in (api/src/app.ts). */
export const consentEventRoutes = new Hono<AppEnv>();
/**
 * Public, at /api/consent-event: a visitor's consent choice before sign-in, recorded append-only as evidence (ADR 0014).
 * Body capped at 2,000 characters (413); a text hash that names none of our banners' texts is refused (400 'unknown_text').
 */
consentEventRoutes.post('/', async (c) => {
  const raw = await c.req.text();
  if (raw.length > 2000) return c.json({ error: 'too_large' }, 413);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return c.json({ error: 'invalid' }, 400);
  }
  const ok = eventInput.safeParse(parsed);
  if (!ok.success) return c.json({ error: 'invalid' }, 400);
  const e = ok.data;
  // Proof only of the notice in force (L1 audit): a choice against another policy version is not recorded as if it were.
  if (e.policyVersion !== CONSENT_POLICY_VERSION) return c.json({ error: 'stale_policy' }, 409);
  // The hash must name a text one of our banners shows; a made-up or missing one is not stored as proof.
  if (!e.textHash || !(await knownTextHashes()).has(e.textHash)) return c.json({ error: 'unknown_text' }, 400);
  await c.get('deps').db.system((q) =>
    q.query(
      `insert into consent_events (consent_id, surface, action, analytics, marketing, policy_version, text_hash, locale, country)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [e.consentId, e.surface, e.action, e.analytics, e.marketing, e.policyVersion, e.textHash ?? null, e.locale ?? null, countryOf(c.req.header('cf-ipcountry'))],
    ),
  );
  return c.body(null, 204);
});
