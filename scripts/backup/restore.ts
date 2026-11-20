// Restore a backup into an EMPTY database, then prove it: every table's row
// count against the manifest, and the row-level security that keeps one
// company out of another's rows (the same gates as tests/rls.test.ts, plus a
// cross-company read as the request role).
//
//   RESTORE_DATABASE_URL='<empty target>' [BACKUP_PASSPHRASE=…] \
//   npx tsx scripts/backup/restore.ts backups/curahold-<stamp>.dump[.enc]
//
// Never point it at the live database: it refuses a target that has tables.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import { postgresDb } from '../../api/src/db/postgres';
import { rowCounts, sha256, type Manifest } from './backup';

const run = (cmd: string, args: string[], env: Record<string, string> = {}) => {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env }, maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr?.toString().trim().slice(0, 800) || r.error?.message}`);
  return r.stdout.toString();
};

/**
 * Restores a backup into an empty database and checks it against its manifest (checksum, row counts, last migration).
 * Creates the request roles first, because they belong to the server, not to the dump.
 */
export async function restore(opts: { url: string; file: string; passphrase?: string }): Promise<Manifest> {
  const manifestPath = opts.file.replace(/\.dump(\.enc)?$/, '.manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`no manifest beside the backup (${manifestPath})`);
  const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  if (sha256(opts.file) !== m.sha256) throw new Error('checksum does not match the manifest: the file is damaged or not this backup');
  const sql = postgres(opts.url, { max: 1, onnotice: () => undefined });
  try {
    const [t] = await sql`select count(*)::int as n from pg_tables where schemaname = 'public'`;
    if (t.n > 0) throw new Error('the target database already has tables: restore only into an empty database');
    // The request roles are per server, not in the dump: create them as the migrations would.
    for (const role of ['curahold_app', 'curahold_portal']) await sql.unsafe(`do $$ begin if not exists (select 1 from pg_roles where rolname = '${role}') then create role ${role} nologin; end if; end $$`);
    await sql.unsafe('grant curahold_app to current_user; grant curahold_portal to current_user;').catch(() => undefined);
    for (const ext of m.extensions ?? []) {
      if (!/^[a-z0-9_]+$/.test(ext)) throw new Error(`unexpected extension name in the manifest: ${ext}`);
      await sql.unsafe(`create extension if not exists ${ext} with schema public`);
    }
  } finally {
    await sql.end({ timeout: 2 });
  }
  let dump = opts.file;
  if (m.encrypted) {
    if (!opts.passphrase) throw new Error('the backup is encrypted: set BACKUP_PASSPHRASE');
    dump = opts.file.replace(/\.enc$/, '.restore-tmp');
    run('openssl', ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-in', opts.file, '-out', dump, '-pass', 'env:BACKUP_PASSPHRASE'], { BACKUP_PASSPHRASE: opts.passphrase });
  }
  try {
    // Every entry but the "public" schema itself, which an empty database already has.
    const list = run('pg_restore', ['--list', dump]).split('\n').filter((l) => !/^\d+;\s+\d+\s+\d+\s+SCHEMA\s+-\s+public\b/.test(l)).join('\n');
    writeFileSync(`${dump}.list`, list);
    run('pg_restore', ['--no-owner', '--exit-on-error', '--single-transaction', `--use-list=${dump}.list`, `--dbname=${opts.url}`, dump]);
  } finally {
    rmSync(`${dump}.list`, { force: true });
    if (dump !== opts.file) rmSync(dump, { force: true });
  }
  return m;
}

export interface Verification {
  counts: { table: string; expected: number; found: number }[];
  rls: string[];
  ok: boolean;
}

/** Row counts against the manifest, and the row-level security gates on the restored copy. */
export async function verify(url: string, m: Manifest): Promise<Verification> {
  const { rows } = await rowCounts(url);
  const counts = Object.entries(m.rows).map(([table, expected]) => ({ table, expected, found: rows[table] ?? -1 }));
  const rls: string[] = [];
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    const tables = await sql<{ name: string; rls: boolean; has_org: boolean; policies: number }[]>`
      select c.relname as name, c.relrowsecurity as rls,
             exists (select 1 from information_schema.columns k where k.table_schema = 'public' and k.table_name = c.relname and k.column_name = 'org_id') as has_org,
             (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
        from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`;
    for (const t of tables) {
      if (t.name === 'schema_migrations') continue;
      if (!t.rls) rls.push(`${t.name}: row-level security is off`);
      if (!t.policies) {
        const [p] = await sql<{ ok: boolean }[]>`select has_table_privilege('curahold_app', ${'public.' + t.name}, 'select,insert,update,delete') or has_table_privilege('curahold_portal', ${'public.' + t.name}, 'select,insert,update,delete') as ok`;
        if (p.ok) rls.push(`${t.name}: no policy, yet a request role holds privileges`);
      }
    }
    const definers = await sql<{ name: string; cfg: string[] | null }[]>`select p.proname as name, p.proconfig as cfg from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef`;
    for (const f of definers) if (!(f.cfg ?? []).some((c) => /^search_path=.*pg_temp$/.test(c))) rls.push(`${f.name}: SECURITY DEFINER without a pinned search_path`);
  } finally {
    await sql.end({ timeout: 2 });
  }
  // As the request role: a company sees its own tasks and none of another's.
  const db = postgresDb(url, { max: 2 });
  try {
    const orgs = await db.system((q) => q.query<{ id: string; n: number }>(`select o.id, (select count(*)::int from tasks t where t.org_id = o.id) as n from orgs o order by n desc limit 2`));
    if (orgs.length === 2 && orgs[0].n > 0 && orgs[1].n > 0) {
      const [a, b] = orgs;
      // As one of the company's administrators (board visibility is per person).
      const [who] = await db.system((q) => q.query<{ id: string }>(`select u.id from users u where u.org_id = $1 and u.status = 'active' order by u.created_at limit 1`, [a.id]));
      const seen = await db.tenant({ orgId: a.id, userId: who?.id ?? null }, (q) => q.query<{ own: number; other: number }>(`select count(*) filter (where org_id = $1)::int as own, count(*) filter (where org_id = $2)::int as other from tasks`, [a.id, b.id]));
      if (seen[0].own !== a.n) rls.push(`a company sees ${seen[0].own} of its ${a.n} tasks`);
      if (seen[0].other !== 0) rls.push(`a company sees ${seen[0].other} tasks of another company`);
    } else rls.push('fewer than two companies with tasks: the cross-company read was not tried');
  } finally {
    await db.close();
  }
  return { counts, rls, ok: counts.every((c) => c.expected === c.found) && rls.length === 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.RESTORE_DATABASE_URL;
  const file = process.argv[2];
  if (!url || !file) {
    console.error('Set RESTORE_DATABASE_URL (an empty database) and give the backup file.');
    process.exit(2);
  }
  const m = await restore({ url, file, passphrase: process.env.BACKUP_PASSPHRASE || undefined });
  const v = await verify(url, m);
  for (const c of v.counts.filter((x) => x.expected !== x.found)) console.log(`count mismatch ${c.table}: expected ${c.expected}, found ${c.found}`);
  for (const r of v.rls) console.log(`row-level security: ${r}`);
  console.log(v.ok ? `restored and verified: ${v.counts.length} tables, row counts equal, row-level security in place` : 'restore NOT verified');
  process.exit(v.ok ? 0 : 1);
}
