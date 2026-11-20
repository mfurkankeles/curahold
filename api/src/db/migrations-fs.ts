// Node-only: reads db/migrations from disk (scripts, tests, local server).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Migration } from './migrate';

export const MIGRATIONS_DIR = join(import.meta.dirname, '..', '..', '..', 'db', 'migrations');

/** Reads db/migrations/*.sql from disk, sorted by name (Node and tests; the Worker build bundles them instead). */
export function loadMigrations(dir = MIGRATIONS_DIR): Migration[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));
}
