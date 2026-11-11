// Sessions and the device limit ("Dengeli" policy, decided 11 Nov 2026):
// a seat works on up to N devices at once (default 2). Signing in on one
// more device signs out the least recently used one, and the person sees why.
import type { Q } from '../db';
import { audit } from './audit';
import { randomToken, sha256Hex } from './crypto';

export interface OpenSessionInput {
  orgId: string;
  userId: string;
  deviceId: string;
  deviceLabel: string | null;
  method: 'magic' | 'oauth';
  ip: string | null;
  geo: string | null;
  maxDevices: number;
  days: number;
}

export async function openSession(q: Q, s: OpenSessionInput) {
  // Signing in again on the same device replaces that device's session.
  await q.query(
    `update sessions set revoked_at = now(), revoke_reason = 'replaced'
      where user_id = $1 and device_id = $2 and revoked_at is null`,
    [s.userId, s.deviceId],
  );
  const active = await q.query<{ id: string; device_label: string | null }>(
    `select id, device_label from sessions
      where user_id = $1 and revoked_at is null and expires_at > now()
      order by last_seen_at asc, created_at asc`,
    [s.userId],
  );
  const evicted: string[] = [];
  let excess = active.length - (s.maxDevices - 1);
  for (const row of active) {
    if (excess <= 0) break;
    await q.query(
      `update sessions set revoked_at = now(), revoke_reason = 'device_limit' where id = $1`,
      [row.id],
    );
    await audit(q, {
      orgId: s.orgId,
      actorId: s.userId,
      action: 'session.evicted',
      entity: 'session',
      entityId: row.id,
      meta: { device: row.device_label, by: s.deviceLabel },
    });
    evicted.push(row.id);
    excess--;
  }
  const token = randomToken(32);
  const [row] = await q.query<{ id: string }>(
    `insert into sessions (org_id, user_id, token_hash, device_id, device_label, method, ip, geo, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(days => $9::int)) returning id`,
    [s.orgId, s.userId, await sha256Hex(token), s.deviceId, s.deviceLabel, s.method, s.ip, s.geo, s.days],
  );
  await audit(q, {
    orgId: s.orgId,
    actorId: s.userId,
    action: 'session.created',
    entity: 'session',
    entityId: row.id,
    meta: { method: s.method, device: s.deviceLabel },
  });
  return { token, sessionId: row.id, evicted };
}

/** A device this person has signed in from before (now or in the past). */
export async function knownDevice(q: Q, userId: string, deviceId: string): Promise<boolean> {
  const rows = await q.query('select 1 from sessions where user_id = $1 and device_id = $2 limit 1', [userId, deviceId]);
  return rows.length > 0;
}
