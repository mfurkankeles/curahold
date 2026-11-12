// One database is built for the whole test run: every migration applied and
// the two sample companies added. Each test file then starts from a copy of
// it instead of building its own. A fresh in-memory Postgres takes about 2.6
// seconds to initialise and another 0.8 to migrate and fill; a copy loads in
// half a second, which across the test files is most of a minute.
//
// With TEST_DATABASE_URL (a real Postgres) nothing is built here: every setup
// creates its own database there, as before.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../api/src/db/migrate';
import { loadMigrations } from '../api/src/db/migrations-fs';
import { createMemoryPg, pgliteDb } from '../api/src/db/pglite';
import { seedDemo } from '../scripts/seed-demo';

let dir: string | null = null;

export async function setup() {
  if (process.env.TEST_DATABASE_URL) return;
  const pg = await createMemoryPg();
  const db = pgliteDb(pg);
  await migrate(db, loadMigrations());
  const a = await seedDemo(db, { slug: 'acme', locale: 'en' });
  const b = await seedDemo(db, { slug: 'beta', locale: 'tr' });
  dir = mkdtempSync(join(tmpdir(), 'curahold-tests-'));
  const copy = await pg.dumpDataDir('none');
  writeFileSync(join(dir, 'template.tar'), Buffer.from(await copy.arrayBuffer()));
  writeFileSync(join(dir, 'seed.json'), JSON.stringify({ a, b }));
  await pg.close();
  // The test processes are started after this, so they inherit it.
  process.env.APP_TEST_TEMPLATE = dir;
}

export function teardown() {
  if (dir) rmSync(dir, { recursive: true, force: true });
}
