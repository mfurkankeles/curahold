// The restore drill, end to end, on a throwaway Postgres: build a database
// (every migration, two sample companies), back it up (encrypted), WIPE it,
// restore into a new empty database, verify row counts and row-level
// security, and time every step. Repeat it quarterly and before go-live; the
// output (and DRILL_REPORT, a JSON file) is the evidence for the checklist.
//
//   DRILL_PG=postgres://postgres:postgres@127.0.0.1:5432/postgres npx tsx scripts/backup/restore-drill.ts
//
// DRILL_PG's user must be able to create databases. Only databases this script
// creates (drill_src_*, drill_restored_*) are touched; DRILL_KEEP=1 leaves the
// restored one in place. DRILL_DIR (scratch for the backup file).
// DRILL_TARGET_PG: restore onto ANOTHER server, one that has never seen the
// curahold_* roles — what a disaster recovery into a new project is. Roles are
// per server and not in the dump; restore.ts must make them (review B1).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { migrate } from '../../api/src/db/migrate';
import { loadMigrations } from '../../api/src/db/migrations-fs';
import { postgresDb } from '../../api/src/db/postgres';
import { seedDemo } from '../seed-demo';
import { backup } from './backup';
import { restore, verify } from './restore';

const base = process.env.DRILL_PG;
if (!base) {
  console.error('Set DRILL_PG to a throwaway Postgres server (its user must be able to create databases).');
  process.exit(2);
}
const id = Date.now().toString(36);
const src = `drill_src_${id}`;
const dst = `drill_restored_${id}`;
const target = process.env.DRILL_TARGET_PG || base;
const at = (name: string, server = base) => {
  const u = new URL(server);
  u.pathname = `/${name}`;
  return u.toString();
};
const admin = postgres(base, { max: 1, onnotice: () => undefined });
const targetAdmin = target === base ? admin : postgres(target, { max: 1, onnotice: () => undefined });
const steps: { step: string; ms: number }[] = [];
const time = async <T>(step: string, fn: () => Promise<T>): Promise<T> => {
  const t0 = Date.now();
  const r = await fn();
  steps.push({ step, ms: Date.now() - t0 });
  console.log(`${step.padEnd(34)} ${String(Date.now() - t0).padStart(7)} ms`);
  return r;
};
const dir = process.env.DRILL_DIR || mkdtempSync(join(tmpdir(), 'curahold-drill-'));
const passphrase = `drill-${crypto.randomUUID()}`;
let ok = false;
try {
  await time('1. build source (migrate + seed)', async () => {
    await admin.unsafe(`create database ${src}`);
    const db = postgresDb(at(src), { max: 2 });
    await migrate(db, loadMigrations());
    await seedDemo(db, { slug: 'acme', locale: 'en' });
    await seedDemo(db, { slug: 'beta', locale: 'tr' });
    await db.close();
  });
  const b = await time('2. backup (pg_dump + encrypt)', () => backup({ url: at(src), dir, passphrase }));
  await time('3. wipe (drop the source)', async () => {
    await admin.unsafe(`drop database ${src} with (force)`);
  });
  const m = await time('4. restore into an empty database', async () => {
    await targetAdmin.unsafe(`create database ${dst}`);
    return restore({ url: at(dst, target), file: b.file, passphrase });
  });
  const v = await time('5. verify counts + row-level security', () => verify(at(dst, target), m));
  const total = steps.reduce((n, s) => n + s.ms, 0);
  const rows = Object.values(m.rows).reduce((a, n) => a + n, 0);
  const mismatched = v.counts.filter((c) => c.expected !== c.found);
  console.log(`\n${v.counts.length} tables, ${rows} rows, backup ${(b.m.bytes / 1024).toFixed(0)} KiB (encrypted), last migration ${m.lastMigration}`);
  console.log(mismatched.length ? `COUNT MISMATCH: ${mismatched.map((c) => `${c.table} ${c.expected}→${c.found}`).join(', ')}` : 'row counts: every table equal');
  console.log(v.rls.length ? `ROW-LEVEL SECURITY: ${v.rls.join('; ')}` : 'row-level security: on everywhere, cross-company read refused');
  console.log(`drill ${v.ok ? 'PASSED' : 'FAILED'} in ${(total / 1000).toFixed(1)} s (backup → wipe → restore → verify)`);
  if (process.env.DRILL_REPORT)
    writeFileSync(process.env.DRILL_REPORT, JSON.stringify({ at: new Date().toISOString(), ok: v.ok, totalMs: total, steps, tables: v.counts.length, rows, backupBytes: b.m.bytes, lastMigration: m.lastMigration, mismatched, rls: v.rls }, null, 2));
  ok = v.ok;
} finally {
  if (!process.env.DRILL_KEEP) await targetAdmin.unsafe(`drop database if exists ${dst} with (force)`).catch(() => undefined);
  await admin.unsafe(`drop database if exists ${src} with (force)`).catch(() => undefined);
  await admin.end({ timeout: 2 });
  if (targetAdmin !== admin) await targetAdmin.end({ timeout: 2 });
  if (!process.env.DRILL_DIR) rmSync(dir, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
