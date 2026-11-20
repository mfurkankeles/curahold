// The company audit trail (audit_log): one append-only line per sensitive change, written in the same transaction as
// the change. Read by GET /api/admin/audit and the trust page. Tests: tests/audit*.test.ts.
import type { Q } from '../db';

/**
 * Writes one audit line (who, what action, on which entity, extra facts) in the caller's transaction, so the change
 * and its line are saved together or not at all.
 */
export async function audit(
  q: Q,
  e: { orgId: string; actorId: string | null; action: string; entity: string; entityId?: string | null; meta?: object },
) {
  await q.query(
    'insert into audit_log (org_id, actor_id, action, entity, entity_id, meta) values ($1, $2, $3, $4, $5, $6)',
    [e.orgId, e.actorId, e.action, e.entity, e.entityId ?? null, JSON.stringify(e.meta ?? {})],
  );
}
