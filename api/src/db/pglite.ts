// Embedded Postgres (PGlite) — the same SQL and RLS as production, used by
// the tests, local development and the single-machine demo.
import { PGlite } from '@electric-sql/pglite';
import { PORTAL_SETUP_SQL, SYSTEM_ROLE_SQL, TENANT_SETUP_SQL, type Db, type Q } from './index';

type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>; exec: (sql: string) => Promise<unknown> };

function wrap(tx: Tx): Q {
  return {
    async query(sql, params = []) {
      const r = await tx.query(sql, params as any[]);
      return r.rows as any;
    },
  };
}

/**
 * The Db over an in-process PGlite (tests, dev, the demo). Same contract as postgresDb: tenant() sets the
 * company, person, locale and day, then drops to the curahold_app role so row security applies exactly as in production;
 * system() drops to curahold_system, and only owner() (migrations) keeps the superuser PGlite starts as.
 */
export function pgliteDb(pg: PGlite): Db {
  return {
    tenant(ctx, fn) {
      return pg.transaction(async (tx) => {
        await tx.query(TENANT_SETUP_SQL, [ctx.orgId ?? '', ctx.userId ?? '', ctx.locale ?? '', ctx.today ?? '']);
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
      return pg.transaction(async (tx) => {
        // Not the owner (ADR 0023): the tests and the demo run every system() path the way production does.
        await tx.exec(SYSTEM_ROLE_SQL);
        return fn(wrap(tx as unknown as Tx));
      });
    },
    owner(fn) {
      return pg.transaction(async (tx) => fn(wrap(tx as unknown as Tx)));
    },
    async close() {
      await pg.close();
    },
  };
}

/** An in-memory Postgres: empty, or started from a copy made with dumpDataDir (much quicker than initialising one). */
export async function createMemoryPg(from?: Blob): Promise<PGlite> {
  const pg = from ? new PGlite({ loadDataDir: from }) : new PGlite();
  await pg.waitReady;
  return pg;
}
