// API keys and OAuth tokens: random, shown once, stored as hashes. A token
// always acts as the person it belongs to (their role, reach and fields);
// a read-only token cannot change anything even if the person could.
import type { Db } from '../db';
import { randomToken, sha256Hex } from './crypto';

export const KEY_PREFIX = 'chk_';
export const ACCESS_PREFIX = 'cha_';
export const REFRESH_PREFIX = 'chr_';
/** Analytics keys: read only, for the analytics feed and nothing else (routes/analytics.ts). */
export const ANALYTICS_PREFIX = 'chb_';
export const ACCESS_TTL_S = 3600;
export const REFRESH_TTL_DAYS = 90;

export async function newSecret(prefix: string) {
  const token = `${prefix}${randomToken(32)}`;
  return { token, hash: await sha256Hex(token), shown: `${token.slice(0, prefix.length + 4)}…` };
}

export interface TokenUser {
  tokenId: string;
  kind: 'key' | 'oauth' | 'analytics';
  canWrite: boolean;
  /** Analytics keys only: the datasets and departments the key is limited to (null = no limit). */
  scope?: { datasets: string[] | null; departments: string[] | null };
  user: Record<string, any>;
}

/**
 * Who a bearer token speaks for, or null (unknown, revoked, expired, or the person left).
 * An analytics key is accepted only where the caller says so (the analytics feed).
 */
export async function resolveToken(db: Db, orgId: string, token: string, opts: { analytics?: boolean } = {}): Promise<TokenUser | null> {
  const analytics = !!opts.analytics && token.startsWith(ANALYTICS_PREFIX);
  if (!token.startsWith(KEY_PREFIX) && !token.startsWith(ACCESS_PREFIX) && !analytics) return null;
  const hash = await sha256Hex(token);
  const rows = await db.system((q) =>
    q.query(
      `select t.id as token_id, t.kind, t.can_write, t.datasets, t.departments, t.last_used_at < now() - interval '5 minutes' or t.last_used_at is null as stale,
              u.id as user_id, u.name, u.email, u.seat, u.status, u.locale, r.id as role_id, r.key as role_key, r.perms
         from api_tokens t join users u on u.id = t.user_id and u.org_id = t.org_id join roles r on r.id = u.role_id
        where t.token_hash = $1 and t.org_id = $2 and t.revoked_at is null and (t.expires_at is null or t.expires_at > now())`,
      [hash, orgId],
    ),
  );
  const t = rows[0];
  if (!t || t.status !== 'active') return null;
  // The prefix and the stored kind agree, or the token is not what it claims to be.
  if ((t.kind === 'analytics') !== token.startsWith(ANALYTICS_PREFIX)) return null;
  if (t.stale) await db.system((q) => q.query('update api_tokens set last_used_at = now() where id = $1', [t.token_id]));
  const scope = t.kind === 'analytics' ? { datasets: t.datasets ?? null, departments: t.departments ?? null } : undefined;
  return { tokenId: t.token_id, kind: t.kind, canWrite: t.kind === 'analytics' ? false : t.can_write, scope, user: t };
}
