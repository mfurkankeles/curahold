// Segment event ingestion. Segment posts track / identify events to the
// company's inbound address (POST /api/inbound/segment/{source}); the source id
// in the address names the Segment connection, and the shared secret set on the
// Segment destination signs the delivery. The receiver has no signed-in person:
// it finds the connection (and its sealed signing secret) with owner access
// anchored to the company the address belongs to, verifies the signature, then
// writes each event through the org-scoped segment_ingest() function of
// migration 0042. Each event becomes a timeline activity under the customer
// matched by its email.
//
// This router is mounted before sign-in (like the ticket and code-webhook
// inbound routers), so it is exempt from the cross-site write check. The source
// management (the inbound address to give Segment) is on the connection itself,
// in routes/sync.ts.
import { Hono } from 'hono';
import { secretsKey, type AppEnv, type C } from '../context';
import { unseal } from '../lib/crypto';
import { parseSegmentEvent, verifySegment } from '../sync/adapters/segment';

export const segmentInboundRoutes = new Hono<AppEnv>();

const MAX_BODY = 2_000_000;
const MAX_EVENTS = 100;

/** The inbound address for a Segment connection: the company host plus its public source id. */
export const segmentInboundUrl = (c: C, sourceId: string) => `${new URL(c.req.url).origin}/api/inbound/segment/${sourceId}`;

segmentInboundRoutes.post('/inbound/segment/:source', async (c) => {
  const org = c.get('org');
  const deps = c.get('deps');
  const source = c.req.param('source');
  if (!source || !/^[A-Za-z0-9_-]{6,60}$/.test(source)) return c.json({ error: 'not_found' }, 404);
  if (Number(c.req.header('content-length') ?? 0) > MAX_BODY) return c.json({ error: 'too_large' }, 413);

  // Owner access, anchored to this company: the connection's shared secret is sealed and, by design, not readable
  // through the request role (only the `state` column is granted to curahold_app). loadCrm reads connections the same way.
  const [conn] = await deps.db.system((q) =>
    q.query<{ id: string; secret: string | null }>(`select id, secret from connections where org_id = $1 and kind = 'source' and provider = 'segment' and status <> 'disabled' and config->>'sourceId' = $2`, [org.id, source]),
  );
  if (!conn) return c.json({ error: 'not_found' }, 404);
  const sealed = await unseal<{ signingSecret?: string }>(conn.secret, secretsKey(deps.config));
  const secret = sealed?.signingSecret ?? '';

  const raw = await c.req.text();
  if (raw.length > MAX_BODY) return c.json({ error: 'too_large' }, 413);
  if (!(await verifySegment(secret, raw, c.req.header('x-signature') ?? null))) return c.json({ error: 'bad_signature' }, 401);

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return c.json({ error: 'validation', message: 'Send the event as application/json.' }, 400);
  }
  // A single event, or a classic batch of them.
  const raws: unknown[] = Array.isArray(payload?.batch) ? payload.batch.slice(0, MAX_EVENTS) : [payload];
  const events = raws.map((e) => parseSegmentEvent(e)).filter((e): e is NonNullable<typeof e> => !!e);
  if (!events.length) return c.json({ ok: true, ingested: 0, matched: 0 });

  // No signed-in person: the org-scoped definer function matches the customer and writes the activity.
  const ctx = { orgId: org.id, userId: null };
  let ingested = 0;
  let matched = 0;
  await deps.db.tenant(ctx, async (q) => {
    for (const e of events) {
      const [res] = await q.query<{ r: { matched?: boolean; created?: boolean } }>('select segment_ingest($1::jsonb) as r', [JSON.stringify({ ...e, source: `segment:${source}` })]);
      if (res?.r?.matched) matched++;
      if (res?.r?.created) ingested++;
    }
  });
  return c.json({ ok: true, ingested, matched });
});
