// API keys and OAuth tokens: random, shown once, stored as hashes. A token
// always acts as the person it belongs to (their role, reach and fields);
// a read-only token cannot change anything even if the person could.
import type { Db } from '../db';
import { randomToken, sha256Hex } from './crypto';

export const KEY_PREFIX = 'twk_';
export const ACCESS_PREFIX = 'twa_';
export const REFRESH_PREFIX = 'twr_';
export const ACCESS_TTL_S = 3600;
export const REFRESH_TTL_DAYS = 90;

export async function newSecret(prefix: string) {
  const token = `${prefix}${randomToken(32)}`;
  return { token, hash: await sha256Hex(token), shown: `${token.slice(0, prefix.length + 4)}…` };
}

export interface TokenUser {
  tokenId: string;
  kind: 'key' | 'oauth';
  canWrite: boolean;
  user: Record<string, any>;
}

/** Who a bearer token speaks for, or null (unknown, revoked, expired, or the person left). */
export async function resolveToken(db: Db, orgId: string, token: string): Promise<TokenUser | null> {
  if (!token.startsWith(KEY_PREFIX) && !token.startsWith(ACCESS_PREFIX)) return null;
  const hash = await sha256Hex(token);
  const rows = await db.system((q) =>
    q.query(
      `select t.id as token_id, t.kind, t.can_write, t.last_used_at < now() - interval '5 minutes' or t.last_used_at is null as stale,
              u.id as user_id, u.name, u.email, u.seat, u.status, u.locale, r.id as role_id, r.key as role_key, r.perms
         from api_tokens t join users u on u.id = t.user_id and u.org_id = t.org_id join roles r on r.id = u.role_id
        where t.token_hash = $1 and t.org_id = $2 and t.revoked_at is null and (t.expires_at is null or t.expires_at > now())`,
      [hash, orgId],
    ),
  );
  const t = rows[0];
  if (!t || t.status !== 'active') return null;
  if (t.stale) await db.system((q) => q.query('update api_tokens set last_used_at = now() where id = $1', [t.token_id]));
  return { tokenId: t.token_id, kind: t.kind, canWrite: t.can_write, user: t };
}
