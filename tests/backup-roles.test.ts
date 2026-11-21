// A backup restores onto a server that has never seen Curahold (review B1): the restore script must create every
// role the migrations create, because roles are per server and the dump's policies and grants name them.
// The restore itself is proven by scripts/backup/restore-drill.ts with DRILL_TARGET_PG (a second, fresh server).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadMigrations } from '../api/src/db/migrations-fs';
import { SERVER_ROLES } from '../scripts/backup/restore';

describe('the restore script and the migrations agree on the roles', () => {
  it('every role a migration creates is created before pg_restore', () => {
    const made = new Set<string>();
    for (const m of loadMigrations()) for (const x of m.sql.matchAll(/\bcreate role (\w+)/gi)) made.add(x[1].toLowerCase());
    expect(made.size).toBeGreaterThanOrEqual(3);
    expect([...SERVER_ROLES].sort()).toEqual([...made].sort());
    // The roles are made, and granted to the restoring login, before the dump goes in.
    const src = readFileSync(new URL('../scripts/backup/restore.ts', import.meta.url), 'utf8');
    expect(src.indexOf('for (const role of SERVER_ROLES)')).toBeGreaterThan(0);
    expect(src.indexOf('for (const role of SERVER_ROLES)')).toBeLessThan(src.indexOf("run('pg_restore', ['--no-owner'"));
  });
});
