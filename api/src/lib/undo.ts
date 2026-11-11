// Undo for changes made to many things at once: what was replaced is kept
// for a short while, for the person who made the change only.
import type { Q } from '../db';

export const UNDO_MINUTES = 30;

export async function saveUndo(q: Q, orgId: string, userId: string, kind: 'tasks' | 'accounts', payload: unknown[]): Promise<string | null> {
  if (!payload.length) return null;
  const [r] = await q.query<{ id: string }>('insert into undo_log (org_id, user_id, kind, payload) values ($1, $2, $3, $4) returning id', [
    orgId,
    userId,
    kind,
    JSON.stringify(payload),
  ]);
  return r.id;
}
