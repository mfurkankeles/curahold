import type { Q } from '../db';

export async function audit(
  q: Q,
  e: { orgId: string; actorId: string | null; action: string; entity: string; entityId?: string | null; meta?: object },
) {
  await q.query(
    'insert into audit_log (org_id, actor_id, action, entity, entity_id, meta) values ($1, $2, $3, $4, $5, $6)',
    [e.orgId, e.actorId, e.action, e.entity, e.entityId ?? null, JSON.stringify(e.meta ?? {})],
  );
}
