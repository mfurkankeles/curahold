// The database is the last line between one company and another's rows. These
// are GATES, not reports: a new table or function that skips the rules fails
// the build.
//
//  1. Every table that holds a company's rows (has an org_id column) has row-level
//     security ON, and either a policy or — for the tables only the server's own
//     (owner) connection may touch — no privileges at all for the request roles.
//  2. Every table without org_id is on a short, explained list.
//  3. Every SECURITY DEFINER function pins its search_path, pg_temp last.
//  4. (static, best effort) A db.system() query that reads or writes a company's
//     rows names org_id — system() runs as the owner, with row-level security
//     out of the picture, so the query itself must say whose rows. Queries that
//     are right without it (looked up by a key that already names one row, or
//     deliberately across companies, like the hourly clean-up) are in the
//     reviewed baseline below; the list may only shrink.
//
// Role separation (FORCE ROW LEVEL SECURITY and a login role that does not own
// the tables) is deployment, not schema: see db/OPS-SECURITY.md.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { setup, type Env } from './helpers';

let env: Env;
beforeAll(async () => {
  env = await setup();
});

/** Tables without an org_id column, and why that is fine. */
const NO_ORG_ID: Record<string, string> = {
  orgs: 'the company row itself (policy on id)',
  schema_migrations: 'migration bookkeeping, no company data',
  desk_claims: "Curahold's own support desk, not a company's (no privileges for the request roles)",
  desk_codes: "Curahold's own support desk sign-in codes (no privileges for the request roles)",
  oauth_clients: 'registered apps, global by design (no privileges for the request roles)',
  trash_rows: 'reached only through the SECURITY DEFINER trash functions, which filter on app_org()',
  trash_links: 'reached only through the SECURITY DEFINER trash functions, which filter on app_org()',
};

const REQUEST_ROLES = ['curahold_app', 'curahold_portal'];

async function tables() {
  return env.db.system((q) =>
    q.query<{ name: string; rls: boolean; has_org: boolean; policies: number }>(
      `select c.relname as name, c.relrowsecurity as rls,
              exists (select 1 from information_schema.columns k where k.table_schema = 'public' and k.table_name = c.relname and k.column_name = 'org_id') as has_org,
              (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' order by 1`,
    ),
  );
}

/** Which of the request roles may read or write this table at all. */
async function privileged(table: string) {
  const out: string[] = [];
  for (const role of REQUEST_ROLES) {
    const [r] = await env.db.system((q) =>
      q.query<{ ok: boolean }>(`select has_table_privilege($1, $2, 'select,insert,update,delete') or has_any_column_privilege($1, $2, 'select,insert,update') as ok`, [role, `public.${table}`]),
    );
    if (r.ok) out.push(role);
  }
  return out;
}

describe('row-level security on every table', () => {
  it('every table with an org_id has row-level security on, and a policy or no access for the request roles', async () => {
    const all = (await tables()).filter((t) => t.has_org);
    expect(all.length).toBeGreaterThan(30); // the query found the schema
    const problems: string[] = [];
    for (const t of all) {
      if (!t.rls) problems.push(`${t.name}: row-level security is off`);
      if (!t.policies && (await privileged(t.name)).length) problems.push(`${t.name}: no policy, yet a request role holds privileges on it`);
    }
    expect(problems).toEqual([]);
  });

  it('every table without an org_id is known, and protected', async () => {
    const without = (await tables()).filter((t) => !t.has_org);
    const unknown = without.filter((t) => !(t.name in NO_ORG_ID)).map((t) => t.name);
    expect(unknown, 'a table without org_id must be added to NO_ORG_ID with a reason, or given an org_id').toEqual([]);
    for (const t of without) {
      if (t.name === 'schema_migrations') continue;
      expect(t.rls, `${t.name} needs row-level security`).toBe(true);
      if (!t.policies) expect(await privileged(t.name), `${t.name} has no policy, so no request role may hold privileges`).toEqual([]);
    }
  });

  it('a policy of a company table reads the company the request is for', async () => {
    const pol = await env.db.system((q) =>
      q.query<{ tablename: string; qual: string | null; with_check: string | null }>(`select tablename, qual, with_check from pg_policies where schemaname = 'public'`),
    );
    const own = new Set((await tables()).filter((t) => t.has_org).map((t) => t.name));
    const weak = pol
      .filter((p) => own.has(p.tablename))
      // app_org(), a function built on it (app_can_see_board, app_sees_account…), or the portal's own scope.
      .filter((p) => !/app_org\(\)|app_[a-z_]+\(|portal_[a-z_]+\(|current_setting/.test(`${p.qual ?? ''} ${p.with_check ?? ''}`))
      .map((p) => p.tablename);
    expect(weak).toEqual([]);
  });

  it('every SECURITY DEFINER function pins its search_path with pg_temp last', async () => {
    const fns = await env.db.system((q) =>
      q.query<{ name: string; cfg: string[] | null }>(
        `select p.proname as name, p.proconfig as cfg from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef`,
      ),
    );
    expect(fns.length).toBeGreaterThan(10);
    const bad = fns.filter((f) => !(f.cfg ?? []).some((c) => /^search_path=.*pg_temp\s*$/.test(c))).map((f) => f.name);
    expect(bad).toEqual([]);
  });
});

// ---------------------------------------------------------------- db.system() queries

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/**
 * Reviewed: these db.system() statements touch a company table without naming
 * org_id, each on purpose — a primary key found a moment before (so the row is
 * already one company's), a hook keyed by an external id, a hand-over to the
 * owner role for the platform's own metrics, or the hourly clean-up across all.
 * Keyed "file :: start of statement". New entries need a reason in review; the
 * list may only get shorter (a stale entry fails below).
 */
const REVIEWED = new Set<string>(JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'system-sql-reviewed.json'), 'utf8')));

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 70);

function unscoped(tenantTables: string[]): string[] {
  const root = join(import.meta.dirname, '..', 'api', 'src');
  const found: string[] = [];
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8');
    const rel = file.slice(root.length - 'api/src'.length).replace(/\\/g, '/');
    let i = -1;
    while ((i = src.indexOf('.system(', i + 1)) >= 0) {
      let depth = 0;
      let j = i + 7;
      for (; j < src.length; j++) {
        if (src[j] === '(') depth++;
        else if (src[j] === ')' && --depth === 0) break;
      }
      const body = src.slice(i, j + 1);
      for (const m of body.matchAll(/`([^`]*)`|'([^'\n]*)'/g)) {
        const sql = m[1] ?? m[2];
        if (!/^\s*(select|insert|update|delete|with)\b/i.test(sql)) continue;
        const table = tenantTables.find((t) => new RegExp(`\\b(from|join|update|into)\\s+${t}\\b`, 'i').test(sql));
        if (table && !/org_id|\borg\.id\b|\bo\.id\b|\bfrom orgs\b|\bjoin orgs\b/i.test(sql)) found.push(`${rel} :: ${norm(sql)}`);
      }
    }
  }
  return [...new Set(found)];
}

describe('db.system() queries on company tables name org_id (best effort)', () => {
  it('no new unscoped statement, and no stale entry in the reviewed list', async () => {
    const tenant = (await tables()).filter((t) => t.has_org && t.name !== 'orgs').map((t) => t.name);
    const now = unscoped(tenant);
    const added = now.filter((x) => !REVIEWED.has(x));
    const stale = [...REVIEWED].filter((x) => !now.includes(x));
    expect(added, 'a db.system() statement on a company table without org_id: scope it, or review it into tests/fixtures/system-sql-reviewed.json').toEqual([]);
    expect(stale, 'fixed or removed: delete from tests/fixtures/system-sql-reviewed.json').toEqual([]);
  });
});
