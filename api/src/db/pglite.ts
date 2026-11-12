// Embedded Postgres (PGlite) — the same SQL and RLS as production, used by
// the tests, local development and the single-machine demo.
import { PGlite } from '@electric-sql/pglite';
import { PORTAL_SETUP_SQL, TENANT_SETUP_SQL, type Db, type Q } from './index';

type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>; exec: (sql: string) => Promise<unknown> };

function wrap(tx: Tx): Q {
  return {
    async query(sql, params = []) {
      const r = await tx.query(sql, params as any[]);
      return r.rows as any;
    },
  };
}

export function pgliteDb(pg: PGlite): Db {
  return {
    tenant(ctx, fn) {
      return pg.transaction(async (tx) => {
        await tx.query(TENANT_SETUP_SQL, [ctx.orgId ?? '', ctx.userId ?? '', ctx.locale ?? '']);
        await tx.exec('set local role curahold_app');
        return fn(wrap(tx as unknown as Tx));
      });
    },
    portal(ctx, fn) {
      return pg.transaction(async (tx) => {
        await tx.query(PORTAL_SETUP_SQL, [ctx.orgId, ctx.portalUserId ?? '']);
        await tx.exec('set local role curahold_portal');
        return fn(wrap(tx as unknown as Tx));
      });
    },
    system(fn) {
      return pg.transaction(async (tx) => fn(wrap(tx as unknown as Tx)));
    },
    async close() {
      await pg.close();
    },
  };
}

export async function createMemoryPg(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.waitReady;
  return pg;
}
