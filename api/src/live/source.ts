// The numbered changes, read from the database under the company's own scope
// (row-level security on live_changes: org_id = app_org()).
import type { Db } from '../db';
import type { Change } from './protocol';
import type { Source } from './room';

export function dbSource(db: Db): Source {
  return {
    async head(orgId) {
      const [r] = await db.tenant({ orgId, userId: null }, (q) => q.query<{ seq: string }>('select seq from live_seq where org_id = $1', [orgId]));
      return r ? Number(r.seq) : 0;
    },
    async changes(orgId, after, limit) {
      const rows = await db.tenant({ orgId, userId: null }, (q) =>
        q.query<{ seq: string; kind: Change['kind']; boards: string[] | string; accounts: string[] | string; users: string[] | string }>(
          `select seq, kind, boards, accounts, users from live_changes
            where org_id = $1 and seq > $2 order by seq limit $3`,
          [orgId, after, limit],
        ),
      );
      return rows.map((r) => ({ seq: Number(r.seq), kind: r.kind, boards: arr(r.boards), accounts: arr(r.accounts), users: arr(r.users) }));
    },
  };
}

/** uuid[] arrives as an array from one driver and as '{a,b}' text from another. */
function arr(v: string[] | string | null): string[] {
  if (Array.isArray(v)) return v;
  if (!v || v === '{}') return [];
  return v
    .replace(/^\{|\}$/g, '')
    .split(',')
    .filter(Boolean);
}
