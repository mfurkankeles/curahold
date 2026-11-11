// Production driver: Supabase Postgres (EU region) reached from Cloudflare
// Workers through Hyperdrive, or any Postgres 15+ for a self-hosted install.
// The login role must be allowed to `set role tendwell_app` (see README).
import postgres from 'postgres';
import { TENANT_SETUP_SQL, type Db, type Q } from './index';

export function postgresDb(url: string, opts: { max?: number } = {}): Db {
  const sql = postgres(url, { prepare: false, max: opts.max ?? 5, fetch_types: false });
  const wrap = (tx: postgres.TransactionSql): Q => ({
    async query(text, params = []) {
      return (await tx.unsafe(text, params as any[])) as any;
    },
  });
  return {
    async tenant(ctx, fn) {
      return (await sql.begin(async (tx) => {
        await tx.unsafe(TENANT_SETUP_SQL, [ctx.orgId ?? '', ctx.userId ?? '']);
        await tx.unsafe('set local role tendwell_app');
        return fn(wrap(tx));
      })) as any;
    },
    async system(fn) {
      return (await sql.begin(async (tx) => fn(wrap(tx)))) as any;
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}
