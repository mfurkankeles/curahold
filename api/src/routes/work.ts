// Reusable pieces of work: saved views, checklists, plans for a customer,
// and a board's intake form.
import { Hono } from 'hono';
import { z } from 'zod';
import type { TaskBlueprint } from '../../../shared/src/automation';
import type { Column } from '../../../shared/src/model';
import { nowOf, requirePerm, requireWriter, run, type AppEnv } from '../context';
import type { Row } from '../db';
import { audit } from '../lib/audit';
import { localDate } from '../lib/automations';
import { fail } from '../lib/errors';
import { addEvent } from '../lib/history';
import { kick } from '../lib/notify';
import { cleanTaskFields } from '../lib/taskFields';
import { onTaskCreated } from '../lib/taskEvents';
import { toTask } from '../lib/mappers';
import { body, isoDate, param, uuid } from '../lib/validate';
import { loadBoard } from './boards';

export const workRoutes = new Hono<AppEnv>();

// ------------------------------------------------------------ saved views

const filters = z
  .object({
    q: z.string().max(200).optional(),
    assignees: z.array(z.string().max(40)).max(50).optional(),
    priority: z.array(z.enum(['low', 'normal', 'high', 'urgent'])).max(4).optional(),
    due: z.array(z.enum(['late', 'today', 'week', 'later', 'none'])).max(5).optional(),
    accounts: z.array(uuid).max(50).optional(),
    fields: z.record(z.string().max(40), z.array(z.string().max(40)).max(50)).optional(),
    view: z.enum(['board', 'list', 'timeline']).optional(),
  })
  .strict();

const toView = (r: Row, me: string) => ({ id: r.id, boardId: r.board_id ?? null, name: r.name, filters: r.filters ?? {}, shared: !!r.shared, mine: r.user_id === me });

workRoutes.get('/views', async (c) => {
  const board = c.req.query('board');
  const auth = c.get('auth');
  const rows = await run(c, (q) =>
    q.query('select * from saved_views where ($1::uuid is null and board_id is null) or board_id = $1::uuid order by shared desc, lower(name)', [uuid.safeParse(board).success ? board : null]),
  );
  return c.json({ views: rows.map((r) => toView(r, auth.userId)) });
});

workRoutes.post('/views', async (c) => {
  const input = await body(c, z.object({ boardId: uuid.nullable().optional(), name: z.string().trim().min(1).max(80), filters, shared: z.boolean().optional() }));
  const auth = c.get('auth');
  const org = c.get('org');
  const row = await run(c, async (q) => {
    if (input.boardId) await loadBoard(q, input.boardId);
    const [r] = await q.query('insert into saved_views (org_id, user_id, board_id, name, filters, shared) values ($1, $2, $3, $4, $5, $6) returning *', [
      org.id,
      auth.userId,
      input.boardId ?? null,
      input.name,
      JSON.stringify(input.filters),
      !!input.shared && auth.seat === 'full',
    ]);
    return r;
  });
  return c.json({ view: toView(row, auth.userId) }, 201);
});

workRoutes.patch('/views/:id', async (c) => {
  const id = param(c, 'id');
  const input = await body(c, z.object({ name: z.string().trim().min(1).max(80).optional(), filters: filters.optional(), shared: z.boolean().optional() }));
  const auth = c.get('auth');
  const [row] = await run(c, (q) =>
    q.query('update saved_views set name = coalesce($2, name), filters = coalesce($3::jsonb, filters), shared = coalesce($4, shared) where id = $1 and user_id = $5 returning *', [
      id,
      input.name ?? null,
      input.filters ? JSON.stringify(input.filters) : null,
      input.shared === undefined ? null : input.shared && auth.seat === 'full',
      auth.userId,
    ]),
  );
  if (!row) fail('not_found');
  return c.json({ view: toView(row, auth.userId) });
});

workRoutes.delete('/views/:id', async (c) => {
  const id = param(c, 'id');
  const auth = c.get('auth');
  const gone = await run(c, (q) => q.query('delete from saved_views where id = $1 and user_id = $2 returning id', [id, auth.userId]));
  if (!gone.length) fail('not_found');
  return c.json({ ok: true });
});

// ------------------------------------------------------------- checklists

const items = z.array(z.string().trim().min(1).max(300)).min(1).max(50);
const toChecklist = (r: Row, me: string) => ({ id: r.id, name: r.name, items: r.items ?? [], mine: r.created_by === me });

workRoutes.get('/checklists', async (c) => {
  const auth = c.get('auth');
  const rows = await run(c, (q) => q.query('select * from checklist_templates order by lower(name)'));
  return c.json({ checklists: rows.map((r) => toChecklist(r, auth.userId)) });
});

workRoutes.post('/checklists', async (c) => {
  requireWriter(c);
  const input = await body(c, z.object({ name: z.string().trim().min(1).max(120), items }));
  const auth = c.get('auth');
  const org = c.get('org');
  const row = await run(c, async (q) => {
    const [taken] = await q.query('select 1 from checklist_templates where lower(name) = lower($1)', [input.name]);
    if (taken) fail('validation', { fields: 'name' }, { fields: ['name'] });
    const [r] = await q.query('insert into checklist_templates (org_id, name, items, created_by) values ($1, $2, $3, $4) returning *', [org.id, input.name, JSON.stringify(input.items), auth.userId]);
    return r;
  });
  return c.json({ checklist: toChecklist(row, auth.userId) }, 201);
});

workRoutes.delete('/checklists/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const gone = await run(c, (q) => q.query('delete from checklist_templates where id = $1 returning id', [id]));
  if (!gone.length) fail('not_found');
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ plans

const blueprint = z.object({
  title: z.string().trim().min(1).max(300),
  dueInDays: z.number().int().min(0).max(730),
  assignee: z.string().regex(/^(account_owner|none|user:[0-9a-f-]{36})$/),
  subtasks: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
});
const planInput = z.object({ name: z.string().trim().min(1).max(120), boardId: uuid, column: z.string().max(24).nullable().optional(), tasks: z.array(blueprint).min(1).max(40) });
const toPlan = (r: Row) => ({ id: r.id, name: r.name, boardId: r.board_id, column: r.column_key ?? null, tasks: r.tasks ?? [] });

workRoutes.get('/plans', async (c) => {
  const rows = await run(c, (q) => q.query('select p.* from plan_templates p join boards b on b.id = p.board_id where b.archived_at is null order by lower(p.name)'));
  return c.json({ plans: rows.map(toPlan) });
});

workRoutes.post('/plans', async (c) => {
  requirePerm(c, 'org.manage');
  const input = await body(c, planInput);
  const auth = c.get('auth');
  const org = c.get('org');
  const row = await run(c, async (q) => {
    await loadBoard(q, input.boardId);
    const [taken] = await q.query('select 1 from plan_templates where lower(name) = lower($1)', [input.name]);
    if (taken) fail('validation', { fields: 'name' }, { fields: ['name'] });
    const [r] = await q.query('insert into plan_templates (org_id, name, board_id, column_key, tasks, created_by) values ($1, $2, $3, $4, $5, $6) returning *', [
      org.id,
      input.name,
      input.boardId,
      input.column ?? null,
      JSON.stringify(input.tasks),
      auth.userId,
    ]);
    return r;
  });
  return c.json({ plan: toPlan(row) }, 201);
});

workRoutes.patch('/plans/:id', async (c) => {
  requirePerm(c, 'org.manage');
  const id = param(c, 'id');
  const input = await body(c, planInput);
  const row = await run(c, async (q) => {
    await loadBoard(q, input.boardId);
    const [r] = await q.query('update plan_templates set name = $2, board_id = $3, column_key = $4, tasks = $5, updated_at = now() where id = $1 returning *', [
      id,
      input.name,
      input.boardId,
      input.column ?? null,
      JSON.stringify(input.tasks),
    ]);
    return r;
  });
  if (!row) fail('not_found');
  return c.json({ plan: toPlan(row) });
});

workRoutes.delete('/plans/:id', async (c) => {
  requirePerm(c, 'org.manage');
  const id = param(c, 'id');
  const gone = await run(c, (q) => q.query('delete from plan_templates where id = $1 returning id', [id]));
  if (!gone.length) fail('not_found');
  return c.json({ ok: true });
});

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Puts a plan on a customer: every task of the plan, dated from the start day. */
workRoutes.post('/accounts/:id/plans', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ planId: uuid, start: isoDate.optional() }));
  const auth = c.get('auth');
  const org = c.get('org');
  const deps = c.get('deps');
  const start = input.start ?? localDate(nowOf(deps), org.timezone || 'UTC');
  const made = await run(c, async (q) => {
    const [account] = await q.query('select id, name, owner_id from accounts where id = $1', [id]);
    if (!account) fail('not_found');
    const [plan] = await q.query('select * from plan_templates where id = $1', [input.planId]);
    if (!plan) fail('not_found');
    const board = await loadBoard(q, plan.board_id);
    const columns = board.columns as Column[];
    const status = plan.column_key && columns.some((col) => col.key === plan.column_key) ? plan.column_key : columns[0].key;
    const fill = (s: string) => s.replace(/\{account_name\}/g, account.name);
    const out: Row[] = [];
    for (const bp of plan.tasks as TaskBlueprint[]) {
      let assignees: string[] = [];
      if (bp.assignee === 'account_owner' && account.owner_id) assignees = [account.owner_id];
      else if (bp.assignee.startsWith('user:')) assignees = [bp.assignee.slice(5)];
      if (assignees.length) {
        const ok = await q.query(`select id from users where id = any($1::uuid[]) and status in ('active', 'invited') and seat = 'full'`, [assignees]);
        assignees = ok.map((u) => u.id);
      }
      const [{ p }] = await q.query('select coalesce(max(position), 0) + 1024 as p from tasks where board_id = $1 and status = $2', [board.id, status]);
      const [t] = await q.query(
        `insert into tasks (org_id, board_id, title, status, assignee_ids, account_id, due_date, position, created_by, updated_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) returning *, $10::text as account_name`,
        [org.id, board.id, fill(bp.title), status, assignees, account.id, addDays(start, bp.dueInDays), Number(p), auth.userId, account.name],
      );
      let pos = 0;
      for (const sub of bp.subtasks ?? []) {
        pos += 1024;
        await q.query(`insert into tasks (org_id, board_id, parent_id, title, status, assignee_ids, account_id, position, created_by, updated_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`, [
          org.id,
          board.id,
          t.id,
          fill(sub),
          columns[0].key,
          assignees,
          account.id,
          pos,
          auth.userId,
        ]);
      }
      await addEvent(q, org.id, t.id, auth.userId, 'created', { plan: plan.name });
      await onTaskCreated(q, org.id, auth.userId, t, board);
      out.push(t);
    }
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'plan.applied', entity: 'account', entityId: account.id, meta: { plan: plan.name, tasks: out.length } });
    return out;
  });
  kick(deps);
  return c.json({ tasks: made.map(toTask) }, 201);
});

// ------------------------------------------------------------ intake form

/** A request through the board's form: lands in the form's column, unassigned, for the board's people to pick up. */
workRoutes.post('/boards/:id/requests', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(
    c,
    z.object({
      title: z.string().trim().min(1).max(300),
      description: z.string().max(20000).optional(),
      accountId: uuid.nullable().optional(),
      dueDate: isoDate.nullable().optional(),
      fields: z.record(z.string().max(40), z.unknown()).optional(),
    }),
  );
  const auth = c.get('auth');
  const org = c.get('org');
  const task = await run(c, async (q) => {
    const board = await loadBoard(q, id);
    const form = board.form as { on?: boolean; fields?: string[]; column?: string | null } | null;
    if (!form?.on) fail('form_off');
    const asked = new Set(form!.fields ?? []);
    const columns = board.columns as Column[];
    const status = form!.column && columns.some((col) => col.key === form!.column) ? form!.column! : columns[0].key;
    const allowed = Object.fromEntries(Object.entries(input.fields ?? {}).filter(([k]) => asked.has(`f:${k}`)));
    const values = await cleanTaskFields(q, board.task_fields ?? [], allowed, org.locale);
    if (input.accountId && asked.has('account')) {
      const ok = await q.query('select 1 from accounts where id = $1', [input.accountId]);
      if (!ok.length) fail('validation', { fields: 'accountId' }, { fields: ['accountId'] });
    }
    const [{ p }] = await q.query('select coalesce(max(position), 0) + 1024 as p from tasks where board_id = $1 and status = $2', [id, status]);
    const [t] = await q.query(
      `insert into tasks (org_id, board_id, title, description, status, account_id, due_date, position, created_by, updated_by, fields)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10)
       returning *, (select name from accounts a where a.id = account_id) as account_name`,
      [org.id, id, input.title, asked.has('description') ? (input.description ?? '') : '', status, asked.has('account') ? (input.accountId ?? null) : null, asked.has('due') ? (input.dueDate ?? null) : null, Number(p), auth.userId, JSON.stringify(values)],
    );
    await addEvent(q, org.id, t.id, auth.userId, 'created', { form: true });
    // Whoever asked follows what happens to it.
    await q.query('insert into task_watchers (org_id, task_id, user_id) values ($1, $2, $3) on conflict do nothing', [org.id, t.id, auth.userId]);
    await onTaskCreated(q, org.id, auth.userId, t, board);
    return t;
  });
  kick(c.get('deps'));
  return c.json({ task: toTask(task) }, 201);
});

// ------------------------------------------------------------------ hours

/** Time logged on a customer's tasks: in all, in the last 30 days, and by person. */
workRoutes.get('/accounts/:id/time', async (c) => {
  const id = param(c, 'id');
  const rows = await run(c, (q) =>
    q.query(
      `select e.user_id, sum(e.minutes)::int as minutes, coalesce(sum(e.minutes) filter (where e.day > current_date - 30), 0)::int as recent
         from time_entries e join tasks t on t.id = e.task_id where t.account_id = $1 group by e.user_id order by 2 desc`,
      [id],
    ),
  );
  return c.json({
    total: rows.reduce((n, r) => n + Number(r.minutes), 0),
    recent: rows.reduce((n, r) => n + Number(r.recent), 0),
    people: rows.map((r) => ({ userId: r.user_id, minutes: Number(r.minutes) })),
  });
});
