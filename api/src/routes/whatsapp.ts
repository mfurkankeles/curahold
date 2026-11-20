// WhatsApp Business: the callback address Meta posts to (GET once to check it, then POST per change). The address
// names the connection by its public source id; the verify token and the app secret are sealed on the connection and
// read with owner access anchored to the company the address belongs to (like Segment). A message lands on the
// customer whose contact has the sender's number (digits compared, the last ten when a local form was typed), as a
// timeline note, once per message id; one from an unknown number is counted on the connection, not stored.
//
// Mounted before sign-in (like the other inbound routers), so it is exempt from the cross-site write check.
import type { ActivitiesRow } from '../db/rows.gen';
import { Hono } from 'hono';
import { secretsKey, type AppEnv } from '../context';
import { unseal } from '../lib/crypto';
import { safeEqual } from '../lib/crypto';
import { parseWhatsApp, verifyMeta, type WaMessage } from '../sync/adapters/whatsapp';
import type { Q } from '../db';

export const whatsappInboundRoutes = new Hono<AppEnv>();

/** Meta's own ceiling for a delivery. */
const MAX_BODY = 3_000_000;

async function connectionOf(c: any, source: string) {
  if (!/^[A-Za-z0-9_-]{6,60}$/.test(source)) return null;
  const deps = c.get('deps');
  const [conn] = await deps.db.system((q: Q) =>
    q.query<{ id: string; secret: string | null; config: any }>(`select id, secret, config from connections where org_id = $1 and kind = 'source' and provider = 'whatsapp' and status <> 'disabled' and config->>'sourceId' = $2`, [c.get('org').id, source]),
  );
  if (!conn) return null;
  const secret = await unseal<{ verifyToken?: string; appSecret?: string }>(conn.secret, secretsKey(deps.config));
  return { id: conn.id, config: conn.config ?? {}, verifyToken: secret?.verifyToken ?? '', appSecret: secret?.appSecret ?? '' };
}

/** WhatsApp's webhook check: answers the challenge only when the verify token matches (constant-time compare). */
whatsappInboundRoutes.get('/inbound/whatsapp/:source', async (c) => {
  const conn = await connectionOf(c, c.req.param('source') ?? '');
  if (!conn) return c.json({ error: 'not_found' }, 404);
  if (c.req.query('hub.mode') !== 'subscribe' || !safeEqual(c.req.query('hub.verify_token') ?? '', conn.verifyToken)) return c.json({ error: 'forbidden' }, 403);
  return c.text(String(c.req.query('hub.challenge') ?? '').slice(0, 200));
});

/** The customer whose contact has this number. */
async function accountForNumber(q: Q, orgId: string, digits: string): Promise<string | null> {
  if (digits.length < 7) return null;
  const [hit] = await q.query<{ account_id: string }>(
    `select r.account_id from records r join record_types rt on rt.id = r.type_id
      where r.org_id = $1 and rt.kind = 'contact' and r.archived_at is null and r.account_id is not null
        and exists (select 1 from jsonb_each_text(r.fields) f where f.key in ('phone', 'mobile', 'whatsapp')
                     and length(regexp_replace(f.value, '\\D', '', 'g')) >= 7
                     and (regexp_replace(f.value, '\\D', '', 'g') = $2 or right(regexp_replace(f.value, '\\D', '', 'g'), 10) = right($2, 10)))
      order by r.created_at limit 1`,
    [orgId, digits],
  );
  return hit?.account_id ?? null;
}

/**
 * Receives WhatsApp messages for one company's connection; size-capped, and the Meta signature (x-hub-signature-256)
 * is checked before the body is used (401).
 */
whatsappInboundRoutes.post('/inbound/whatsapp/:source', async (c) => {
  const deps = c.get('deps');
  const org = c.get('org');
  if (Number(c.req.header('content-length') ?? 0) > MAX_BODY) return c.json({ error: 'too_large' }, 413);
  const conn = await connectionOf(c, c.req.param('source') ?? '');
  if (!conn) return c.json({ error: 'not_found' }, 404);
  const raw = await c.req.text();
  if (raw.length > MAX_BODY) return c.json({ error: 'too_large' }, 413);
  if (!(await verifyMeta(conn.appSecret, raw, c.req.header('x-hub-signature-256') ?? null))) return c.json({ error: 'bad_signature' }, 401);
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return c.json({ error: 'validation' }, 400);
  }
  const messages: WaMessage[] = parseWhatsApp(payload, String(conn.config.phoneNumberId ?? ''));
  let stored = 0;
  let unmatched = 0;
  await deps.db.system(async (q: Q) => {
    for (const m of messages) {
      const account = await accountForNumber(q, org.id, m.from);
      if (!account) {
        unmatched++;
        continue;
      }
      const rows = await q.query<Pick<ActivitiesRow, 'id'>>(
        `insert into activities (org_id, account_id, author_id, kind, body, happened_at, source, external_id)
         values ($1, $2, null, 'note', $3, coalesce($4::timestamptz, now()), 'whatsapp', $5)
         on conflict (org_id, source, external_id) where external_id is not null do nothing returning id`,
        [org.id, account, `WhatsApp · ${m.name ? `${m.name} ` : ''}+${m.from}\n${m.text}`.slice(0, 20_000), m.at, m.id],
      );
      stored += rows.length;
    }
    // What the setup checks read: when a message last arrived, and how many came from numbers nobody here has.
    await q.query(
      `update connections set state = coalesce(state, '{}'::jsonb) || jsonb_build_object('lastInboundAt', now()::text, 'unmatched', coalesce((state->>'unmatched')::int, 0) + $3::int), last_ok_at = now(), status = case when status = 'error' then 'active' else status end, last_error = null
        where id = $1 and org_id = $2`,
      [conn.id, org.id, unmatched],
    );
  });
  // Meta wants a 200 for every delivery it may not retry; the counts help when testing by hand.
  return c.json({ ok: true, stored, unmatched });
});
