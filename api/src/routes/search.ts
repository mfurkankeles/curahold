// One search box for everything a person may see: customers, tasks,
// contacts and other records, boards and people. Runs in the database the
// company already has (no search service to pay for), inside the person's
// own access rules, a handful of rows per kind.
import { Hono } from 'hono';
import { run, type AppEnv } from '../context';

export const searchRoutes = new Hono<AppEnv>();

const PER_KIND = 6;

searchRoutes.get('/search', async (c) => {
  const raw = (c.req.query('q') ?? '').trim().slice(0, 80);
  if (raw.length < 2) return c.json({ accounts: [], tasks: [], records: [], boards: [], people: [] });
  // Plain text only: the wildcard characters of LIKE are taken literally.
  const like = `%${raw.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const prefix = `${raw.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const out = await run(c, async (q) => {
    const accounts = await q.query(
      `select id, name, owner_id from accounts where archived_at is null and name ilike $1
        order by (name ilike $2) desc, lower(name) limit ${PER_KIND}`,
      [like, prefix],
    );
    const tasks = await q.query(
      `select t.id, t.title, t.due_date::text as due, t.board_id, b.name as board_name, a.name as account_name
         from tasks t join boards b on b.id = t.board_id left join accounts a on a.id = t.account_id
        where t.archived_at is null and b.archived_at is null and (t.title ilike $1 or a.name ilike $1)
        order by (t.title ilike $2) desc, t.updated_at desc limit ${PER_KIND}`,
      [like, prefix],
    );
    const records = await q.query(
      `select r.id, r.name, r.account_id, a.name as account_name, rt.key as type_key, rt.name as type_name
         from records r join record_types rt on rt.id = r.type_id left join accounts a on a.id = r.account_id
        where r.archived_at is null and r.name ilike $1
        order by (r.name ilike $2) desc, lower(r.name) limit ${PER_KIND}`,
      [like, prefix],
    );
    const boards = await q.query(`select id, name from boards where archived_at is null and name ilike $1 order by lower(name) limit ${PER_KIND}`, [like]);
    const people = await q.query(
      `select id, name, email from users where status in ('active', 'invited') and (name ilike $1 or email ilike $1)
        order by (name ilike $2) desc, lower(name) limit ${PER_KIND}`,
      [like, prefix],
    );
    return { accounts, tasks, records, boards, people };
  });
  return c.json({
    accounts: out.accounts.map((r) => ({ id: r.id, name: r.name, ownerId: r.owner_id })),
    tasks: out.tasks.map((r) => ({ id: r.id, title: r.title, dueDate: r.due, boardId: r.board_id, boardName: r.board_name, accountName: r.account_name })),
    records: out.records.map((r) => ({ id: r.id, name: r.name, accountId: r.account_id, accountName: r.account_name, typeKey: r.type_key, typeName: r.type_name })),
    boards: out.boards.map((r) => ({ id: r.id, name: r.name })),
    people: out.people.map((r) => ({ id: r.id, name: r.name, email: r.email })),
  });
});
