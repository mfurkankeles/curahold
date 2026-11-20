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
import { CONSENT_POLICY_VERSION, SURFACES, type Surface } from '../../../shared/src/consent/core';

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
});
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

consentRoutes.post('/consent', async (c) => {
  const input = await body(c, consentInput);
  // Same as the public door: a version other than the one in force is not recorded as proof of it.
  if (input.policyVersion && input.policyVersion !== CONSENT_POLICY_VERSION) return c.json({ error: 'stale_policy' }, 409);
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
        input.policyVersion ?? null,
        input.textHash ?? null,
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
  await c.get('deps').db.system((q) =>
    q.query(
      `insert into consent_events (consent_id, surface, action, analytics, marketing, policy_version, text_hash, locale, country)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [e.consentId, e.surface, e.action, e.analytics, e.marketing, e.policyVersion, e.textHash ?? null, e.locale ?? null, countryOf(c.req.header('cf-ipcountry'))],
    ),
  );
  return c.body(null, 204);
});
