// Where accounts, records and tasks live in connected CRMs, for "open in …" links.
import type { LinkInfo } from '../../../shared/src/records';
import type { Q } from '../db';
import { recordUrl } from '../sync/adapters';

/** Where each item lives in a connected CRM, with a link to open it there. */
export async function linksFor(q: Q, entity: 'account' | 'record' | 'task', ids: string[]): Promise<Map<string, LinkInfo[]>> {
  const out = new Map<string, LinkInfo[]>();
  if (!ids.length) return out;
  const rows = await q.query(
    `select l.entity_id, l.object, l.remote_id, c.id as connection_id, c.provider, c.config
       from sync_links l join connections c on c.id = l.connection_id
      where l.entity = $1 and l.entity_id = any($2::uuid[]) and not l.ignored`,
    [entity, ids],
  );
  for (const r of rows) {
    const list = out.get(r.entity_id) ?? [];
    list.push({ connectionId: r.connection_id, provider: r.provider, remoteId: r.remote_id, url: recordUrl(r.provider, r.config ?? {}, r.object, r.remote_id) });
    out.set(r.entity_id, list);
  }
  return out;
}

