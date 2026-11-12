// What the trash costs on a large company: deleting a customer or a task with
// a copy kept, against deleting it outright, and putting it back.
//
//   PERF_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres PERF_KEEP=app_perf_… npx tsx scripts/quality/trash.mts
//
// PERF_KEEP is the database scripts/perf.ts built (6,000 customers, 210,000
// tasks, 300,000 comments). The outright deletes are rolled back; the ones
// through the trash are put back again, so the company is left as it was.
import postgres from 'postgres';
import { postgresDb } from '../../api/src/db/postgres';

const base = process.env.PERF_DATABASE_URL;
const name = process.env.PERF_KEEP;
if (!base || !name) {
  console.error('Set PERF_DATABASE_URL and PERF_KEEP (the database scripts/perf.ts left in place).');
  process.exit(2);
}
const url = new URL(base);
url.pathname = `/${name}`;
const db = postgresDb(url.toString(), { max: 2 });
const raw = postgres(url.toString(), { max: 1, onnotice: () => undefined });

const [org] = await raw`select id from orgs where slug = 'big'`;
const [admin] = await raw`select id from users where org_id = ${org.id} and email = 'ada@demo.example'`;
const as = { orgId: org.id as string, userId: admin.id as string };
const undo = new Error('undo');
const ms = async (fn: () => Promise<unknown>) => {
  const at = performance.now();
  await fn();
  return performance.now() - at;
};
const mid = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const show = (xs: number[]) => `${mid(xs).toFixed(0).padStart(5)} ms   (${Math.min(...xs).toFixed(0)}–${Math.max(...xs).toFixed(0)})`;

async function measure(kind: 'account' | 'task', table: string, ids: string[]) {
  const plain: number[] = [];
  const kept: number[] = [];
  const back: number[] = [];
  const rows: number[] = [];
  for (const id of ids) {
    // Outright, as it was before the trash; rolled back.
    plain.push(
      await ms(() =>
        db
          .tenant(as, async (q) => {
            await q.query(`delete from ${table} where id = $1`, [id]);
            throw undo;
          })
          .catch((e) => {
            if (e !== undo) throw e;
          }),
      ),
    );
    let trashId = '';
    kept.push(
      await ms(() =>
        db.tenant(as, async (q) => {
          [{ id: trashId }] = await q.query<{ id: string }>('select app_trash_put($1, $2::uuid[], $3, $4::jsonb) as id', [kind, [id], 'measured', '{}']);
          await q.query(`delete from ${table} where id = $1`, [id]);
        }),
      ),
    );
    rows.push(Number((await raw`select row_count from trash where id = ${trashId}`)[0].row_count));
    back.push(await ms(() => db.tenant(as, (q) => q.query('select app_trash_restore($1)', [trashId]))));
  }
  return { plain, kept, back, rows };
}

// The customers with the most under them, and the tasks with the most comments.
const customers = await raw`
  select a.id from accounts a where a.org_id = ${org.id}
   order by (select count(*) from records r where r.account_id = a.id) + (select count(*) from activities v where v.account_id = a.id)
          + (select count(*) from tasks t where t.account_id = a.id) desc limit 7`;
const tasks = await raw`
  select t.id from tasks t where t.org_id = ${org.id} and t.parent_id is null
   order by (select count(*) from comments c where c.task_id = t.id) + (select count(*) from tasks s where s.parent_id = t.id) desc limit 7`;

for (const [label, kind, table, list] of [
  ['A customer', 'account', 'accounts', customers],
  ['A task', 'task', 'tasks', tasks],
] as const) {
  const r = await measure(kind, table, list.map((x) => x.id as string));
  console.log(`${label}: ${mid(r.rows)} rows in the copy (${Math.min(...r.rows)}–${Math.max(...r.rows)}), ${list.length} of them measured`);
  console.log(`  deleted outright (before)      ${show(r.plain)}`);
  console.log(`  deleted with a copy kept       ${show(r.kept)}`);
  console.log(`  put back                       ${show(r.back)}`);
}
const [left] = await raw`select count(*)::int as n from trash`;
console.log(`Left in the trash afterwards: ${left.n}`);
await raw.end({ timeout: 2 });
await db.close();
