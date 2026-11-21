// Production driver: Supabase Postgres (EU region) reached from Cloudflare
// Workers through Hyperdrive, or any Postgres 15+ for a self-hosted install.
// The login role must be allowed to `set role curahold_app`, `curahold_portal`
// and `curahold_system`, and should not own the tables (ADR 0023,
// docs/ENVIRONMENT.md "Database roles"). Migrations use their own login.
import postgres from 'postgres';
import { PORTAL_SETUP_SQL, SYSTEM_ROLE_SQL, TENANT_SETUP_SQL, type Db, type Q } from './index';

// The code hands JSON to the database already written out (JSON.stringify),
// which is what the in-memory database used by the tests expects. This driver
// would write a string out a second time — storing the text of the JSON as one
// JSON string — so text passes through as it is and only real values are
// written out here. Both databases then store exactly the same thing.
const json = (x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x));

// Postgres can compile a query to machine code before running it. For reports over
// millions of rows that pays; here every query is small and the compiling took twenty
// times longer than the query (300 ms on a 15 ms count, measured). Off for each
// transaction, in the statement that already sets who is asking — no extra round trip.
const NO_JIT = ", set_config('jit', 'off', true)";

/**
 * The Db over a real Postgres (production and self-host). tenant() and portal() set the session variables row
 * security reads and switch to the restricted role; system() switches to curahold_system, whose own policy lets it
 * across companies without owning anything; owner() is for migrations alone (ADR 0004, ADR 0023).
 * Prepared statements are off because pooled connections (Hyperdrive) cannot rely on them.
 */
export function postgresDb(url: string, opts: { max?: number; idleTimeout?: number } = {}): Db {
  const sql = postgres(url, {
    prepare: false,
    max: opts.max ?? 5,
    fetch_types: false,
    onnotice: () => undefined,
    ...(opts.idleTimeout ? { idle_timeout: opts.idleTimeout } : {}),
    types: { json: { to: 114, from: [114, 3802], serialize: json, parse: (x: string) => JSON.parse(x) } },
  });
  const wrap = (tx: postgres.TransactionSql): Q => ({
    async query(text, params = []) {
      return (await tx.unsafe(text, params as any[])) as any;
    },
  });
  return {
    async tenant(ctx, fn) {
      return (await sql.begin(async (tx) => {
        await tx.unsafe(TENANT_SETUP_SQL + NO_JIT, [ctx.orgId ?? '', ctx.userId ?? '', ctx.locale ?? '', ctx.today ?? '']);
        await tx.unsafe('set local role curahold_app');
        return fn(wrap(tx));
      })) as any;
    },
    async portal(ctx, fn) {
      return (await sql.begin(async (tx) => {
        await tx.unsafe(PORTAL_SETUP_SQL + NO_JIT, [ctx.orgId, ctx.portalUserId ?? '']);
        await tx.unsafe('set local role curahold_portal');
        return fn(wrap(tx));
      })) as any;
    },
    async system(fn) {
      return (await sql.begin(async (tx) => {
        // Never the owner (ADR 0023): this role can read and write rows but not alter tables, policies or triggers.
        await tx.unsafe(SYSTEM_ROLE_SQL);
        return fn(wrap(tx));
      })) as any;
    },
    async owner(fn) {
      return (await sql.begin(async (tx) => fn(wrap(tx)))) as any;
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}
