// Database backup: one pg_dump (custom format), its row counts and checksum in
// a manifest, optionally encrypted with a passphrase (openssl AES-256, free).
// The off-site copy is a separate step (docs/go-live/README.tr.md → Yedekler).
//
//   BACKUP_DATABASE_URL='<owner connection>' BACKUP_DIR=./backups \
//   [BACKUP_PASSPHRASE=…] npx tsx scripts/backup/backup.ts
//
// Needs pg_dump of the server's major version (16) or newer on PATH. Read-only
// on the database. Prints the files it wrote; exit 1 on any failure.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';

export interface Manifest {
  createdAt: string;
  file: string;
  bytes: number;
  sha256: string;
  encrypted: boolean;
  lastMigration: string | null;
  /** Extensions the schema uses (a schema-only dump leaves them out; restore creates them first). */
  extensions: string[];
  /** Exact row count of every table in the public schema. */
  rows: Record<string, number>;
}

const run = (cmd: string, args: string[], env: Record<string, string> = {}) => {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env }, maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr?.toString().trim().slice(0, 500) || r.error?.message}`);
  return r.stdout.toString();
};

export async function rowCounts(url: string): Promise<{ rows: Record<string, number>; lastMigration: string | null }> {
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    const tables = await sql<{ name: string }[]>`select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`;
    const rows: Record<string, number> = {};
    for (const t of tables) rows[t.name] = Number((await sql.unsafe(`select count(*)::bigint as n from public."${t.name}"`))[0].n);
    const [m] = await sql<{ name: string }[]>`select name from schema_migrations order by name desc limit 1`.catch(() => [] as { name: string }[]);
    return { rows, lastMigration: m?.name ?? null };
  } finally {
    await sql.end({ timeout: 2 });
  }
}

export const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

export async function backup(opts: { url: string; dir: string; passphrase?: string; now?: Date }): Promise<{ file: string; manifest: string; m: Manifest }> {
  mkdirSync(opts.dir, { recursive: true });
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\..*/, 'Z');
  const dump = resolve(join(opts.dir, `curahold-${stamp}.dump`));
  // Counts first, then the dump: on a live database the dump may hold a few rows more, never fewer.
  const { rows, lastMigration } = await rowCounts(opts.url);
  const sql = postgres(opts.url, { max: 1, onnotice: () => undefined });
  const extensions = (await sql<{ extname: string }[]>`select extname from pg_extension where extname <> 'plpgsql' order by 1`.finally(() => sql.end({ timeout: 2 }))).map((e) => e.extname);
  run('pg_dump', ['--format=custom', '--compress=6', '--no-owner', '--schema=public', `--file=${dump}`, `--dbname=${opts.url}`]);
  let file = dump;
  if (opts.passphrase) {
    file = `${dump}.enc`;
    run('openssl', ['enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-salt', '-in', dump, '-out', file, '-pass', 'env:BACKUP_PASSPHRASE'], { BACKUP_PASSPHRASE: opts.passphrase });
    rmSync(dump);
  }
  const m: Manifest = { createdAt: new Date().toISOString(), file: file.split('/').pop() ?? file, bytes: statSync(file).size, sha256: sha256(file), encrypted: !!opts.passphrase, lastMigration, extensions, rows };
  const manifest = file.replace(/\.dump(\.enc)?$/, '.manifest.json');
  writeFileSync(manifest, JSON.stringify(m, null, 2));
  return { file, manifest, m };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.BACKUP_DATABASE_URL;
  if (!url) {
    console.error('Set BACKUP_DATABASE_URL (the owner connection string).');
    process.exit(2);
  }
  const r = await backup({ url, dir: process.env.BACKUP_DIR || './backups', passphrase: process.env.BACKUP_PASSPHRASE || undefined });
  const total = Object.values(r.m.rows).reduce((a, b) => a + b, 0);
  console.log(`backup ${r.file} (${(r.m.bytes / 1024 / 1024).toFixed(1)} MB, ${Object.keys(r.m.rows).length} tables, ${total} rows, last migration ${r.m.lastMigration})`);
  console.log(`manifest ${r.manifest}`);
}
