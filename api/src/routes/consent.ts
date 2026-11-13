// A minimal, auditable record of a person's consent choices (consent_log,
// migration 0039). The browser banner already gates what loads; this endpoint
// just keeps the durable per-person trail a KVKK/GDPR review expects.
//
//   GET  /api/consent  → the person's latest choice, or null if they have none
//   POST /api/consent  → record a choice { analytics, marketing, source? }
//
// Any signed-in person may record their own consent (a viewer consents too), so
// this does not require a write seat. The row is scoped to the caller by RLS.
//
// Register in api/src/app.ts alongside the other person-scoped routes:
//   import { consentRoutes } from './routes/consent';
//   app.route('/api', consentRoutes);
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { run } from '../context';
import { body } from '../lib/validate';

export const consentRoutes = new Hono<AppEnv>();

const consentInput = z.object({
  analytics: z.boolean(),
  marketing: z.boolean(),
  source: z.enum(['app', 'site']).optional(),
});

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
  const auth = c.get('auth');
  const org = c.get('org');
  const agent = (c.req.header('user-agent') ?? '').slice(0, 400) || null;
  const stored = await run(c, async (q) => {
    const [row] = await q.query<ConsentRow>(
      `insert into consent_log (org_id, user_id, analytics, marketing, source, user_agent)
       values ($1, $2, $3, $4, $5, $6)
       returning analytics, marketing, source, created_at`,
      [org.id, auth.userId, input.analytics, input.marketing, input.source ?? 'app', agent],
    );
    return row;
  });
  return c.json({ consent: shape(stored) });
});
