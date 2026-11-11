// Applies db/migrations/*.sql in name order, once each.
import type { Db } from './index';

export interface Migration {
  name: string;
  sql: string;
}

export async function migrate(db: Db, migrations: Migration[]): Promise<string[]> {
  const applied: string[] = [];
  await db.system(async (q) => {
    await q.query(
      'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
    );
  });
  const done = new Set(
    (await db.system((q) => q.query<{ name: string }>('select name from schema_migrations'))).map((r) => r.name),
  );
  for (const m of [...migrations].sort((a, b) => a.name.localeCompare(b.name))) {
    if (done.has(m.name)) continue;
    await db.system(async (q) => {
      // Migration files hold many statements; run them as one script.
      for (const stmt of splitSql(m.sql)) await q.query(stmt);
      await q.query('insert into schema_migrations (name) values ($1)', [m.name]);
    });
    applied.push(m.name);
  }
  return applied;
}

// Splits on semicolons outside quotes, $$ bodies and comments.
export function splitSql(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let i = 0;
  let inSingle = false;
  let dollar: string | null = null;
  while (i < sql.length) {
    const ch = sql[i];
    if (!inSingle && !dollar && ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    if (!inSingle && ch === '$') {
      const m = /^\$[a-zA-Z_]*\$/.exec(sql.slice(i));
      if (m) {
        if (dollar === null) dollar = m[0];
        else if (dollar === m[0]) dollar = null;
        cur += m[0];
        i += m[0].length;
        continue;
      }
    }
    if (!dollar && ch === "'") inSingle = !inSingle;
    if (!inSingle && !dollar && ch === ';') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
