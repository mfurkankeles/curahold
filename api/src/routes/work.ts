// Reusable pieces of work: saved views, checklists, plans for a customer,
// and a board's intake form.
import { Hono } from 'hono';
import { z } from 'zod';
import type { Column } from '../../../shared/src/model';
import { columnFor, fold, matchPerson, parseDay, priorityFor, splitPeople, type TaskImportResult } from '../../../shared/src/taskImport';
import { nowOf, requirePerm, requirePlan, requireWriter, run, todayOf, type AppEnv } from '../context';
import type { Row } from '../db';
import { audit } from '../lib/audit';
import { localDate } from '../lib/automations';
import { fail } from '../lib/errors';
import { addEvent } from '../lib/history';
import { kick } from '../lib/notify';
import { anchorDay, applyPlan } from '../lib/playbooks';
import { cleanTaskFields } from '../lib/taskFields';
import { onTaskCreated } from '../lib/taskEvents';
import { iso, toTask } from '../lib/mappers';
import { kickSync, queueSync } from '../lib/records';
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
    q.query('select * from saved_views where ($1::uuid is null and board_id is null) or board_id = $1::uuid order by shared desc, sort_text(name)', [uuid.safeParse(board).success ? board : null]),
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
  const rows = await run(c, (q) => q.query('select * from checklist_templates order by sort_text(name)'));
  return c.json({ checklists: rows.map((r) => toChecklist(r, auth.userId)) });
});

workRoutes.post('/checklists', async (c) => {
  requireWriter(c);
  const input = await body(c, z.object({ name: z.string().trim().min(1).max(120), items }));
  const auth = c.get('auth');
  const org = c.get('org');
  const row = await run(c, async (q) => {
    const [taken] = await q.query('select 1 from checklist_templates where fold_text(name) = fold_text($1)', [input.name]);
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
const planInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  boardId: uuid,
  column: z.string().max(24).nullable().optional(),
  /** What the days count from: the day it is put on, the renewal date, or a deal's close date. */
  anchor: z.enum(['start', 'renewal', 'close']).optional(),
  tasks: z.array(blueprint).min(1).max(40),
});
const toPlan = (r: Row) => ({ id: r.id, name: r.name, description: r.description ?? '', boardId: r.board_id, column: r.column_key ?? null, anchor: r.anchor ?? 'start', tasks: r.tasks ?? [] });

workRoutes.get('/plans', async (c) => {
  const rows = await run(c, (q) => q.query('select p.* from plan_templates p join boards b on b.id = p.board_id where b.archived_at is null order by sort_text(p.name)'));
  return c.json({ plans: rows.map(toPlan) });
});

workRoutes.post('/plans', async (c) => {
  requirePerm(c, 'org.manage');
  // Playbooks are part of the Business plan.
  requirePlan(c, 'playbooks');
  const input = await body(c, planInput);
  const auth = c.get('auth');
  const org = c.get('org');
  const row = await run(c, async (q) => {
    await loadBoard(q, input.boardId);
    const [taken] = await q.query('select 1 from plan_templates where fold_text(name) = fold_text($1)', [input.name]);
    if (taken) fail('validation', { fields: 'name' }, { fields: ['name'] });
    const [r] = await q.query(
      'insert into plan_templates (org_id, name, board_id, column_key, tasks, created_by, anchor, description) values ($1, $2, $3, $4, $5, $6, $7, $8) returning *',
      [org.id, input.name, input.boardId, input.column ?? null, JSON.stringify(input.tasks), auth.userId, input.anchor ?? 'start', input.description ?? ''],
    );
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
    const [r] = await q.query(
      `update plan_templates set name = $2, board_id = $3, column_key = $4, tasks = $5, anchor = coalesce($6, anchor), description = coalesce($7, description), updated_at = now()
        where id = $1 returning *`,
      [id, input.name, input.boardId, input.column ?? null, JSON.stringify(input.tasks), input.anchor ?? null, input.description ?? null],
    );
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

/** Puts a playbook on a customer: every step, dated from the start day (or before the renewal date). */
workRoutes.post('/accounts/:id/plans', async (c) => {
  requireWriter(c);
  requirePlan(c, 'playbooks');
  const id = param(c, 'id');
  const input = await body(c, z.object({ planId: uuid, start: isoDate.optional() }));
  const auth = c.get('auth');
  const org = c.get('org');
  const deps = c.get('deps');
  const today = localDate(nowOf(deps), org.timezone || 'UTC');
  const made = await run(c, async (q) => {
    const [account] = await q.query('select id, name, owner_id, fields from accounts where id = $1', [id]);
    if (!account) fail('not_found');
    const [plan] = await q.query('select * from plan_templates where id = $1', [input.planId]);
    if (!plan) fail('not_found');
    const from = anchorDay(plan, input.start ?? today, account, null, org.account_fields ?? []);
    return applyPlan(q, { orgId: org.id, actorId: auth.userId, plan, account, from, today });
  });
  kick(deps);
  return c.json({ tasks: made.map(toTask) }, 201);
});

/** Puts a playbook on a deal (or any record): its tasks belong to the record and its customer. */
workRoutes.post('/records/:id/plans', async (c) => {
  requireWriter(c);
  requirePlan(c, 'playbooks');
  const id = param(c, 'id');
  const input = await body(c, z.object({ planId: uuid, start: isoDate.optional() }));
  const auth = c.get('auth');
  const org = c.get('org');
  const deps = c.get('deps');
  const today = localDate(nowOf(deps), org.timezone || 'UTC');
  const made = await run(c, async (q) => {
    const [record] = await q.query('select id, name, owner_id, fields, account_id from records where id = $1', [id]);
    if (!record) fail('not_found');
    if (!record.account_id) fail('validation', { fields: 'accountId' }, { fields: ['accountId'] });
    const [account] = await q.query('select id, name, owner_id, fields from accounts where id = $1', [record.account_id]);
    if (!account) fail('not_found');
    const [plan] = await q.query('select * from plan_templates where id = $1', [input.planId]);
    if (!plan) fail('not_found');
    const from = anchorDay(plan, input.start ?? today, account, record, org.account_fields ?? []);
    return applyPlan(q, { orgId: org.id, actorId: auth.userId, plan, account, record, from, today });
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
      `select e.user_id, sum(e.minutes)::int as minutes, coalesce(sum(e.minutes) filter (where e.day > app_today() - 30), 0)::int as recent
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

// ------------------------------------------------------- tasks from a file

const MAX_TASK_ROWS = 5000;
const col = z.string().min(1).max(200);
const taskImportSchema = z.object({
  fileName: z.string().max(200).optional(),
  rows: z.array(z.record(z.string().max(200), z.union([z.string().max(20000), z.number(), z.null()]))).min(1).max(MAX_TASK_ROWS),
  mapping: z.object({
    title: col,
    description: col.optional(),
    status: col.optional(),
    assignee: col.optional(),
    dueDate: col.optional(),
    startDate: col.optional(),
    priority: col.optional(),
    account: col.optional(),
    doneAt: col.optional(),
  }),
  /** How the file writes dates that could be read two ways (05/03/2027). */
  locale: z.enum(['en', 'tr']).optional(),
  /** Bring finished tasks too (they land in the board's first "done" column). */
  includeDone: z.boolean().optional(),
});

/**
 * Tasks from a CSV or Excel export, onto one board. Nobody is notified and no
 * rules run: this is moving house, not new work. Whoever ran it can undo it
 * for 30 days.
 */
workRoutes.post('/boards/:id/import', async (c) => {
  requireWriter(c);
  if (Number(c.req.header('content-length') ?? 0) > 12 * 1024 * 1024) fail('import_too_large', { max: MAX_TASK_ROWS });
  const boardId = param(c, 'id');
  const input = await body(c, taskImportSchema);
  const auth = c.get('auth');
  const org = c.get('org');
  const locale = input.locale ?? org.locale;
  const m = input.mapping;
  const out = await run(c, async (q) => {
    const board = await loadBoard(q, boardId);
    const columns = board.columns as Column[];
    const first = columns[0].key;
    const doneKeys = new Set(columns.filter((x) => x.done).map((x) => x.key));
    const people = await q.query<{ id: string; name: string; email: string }>(`select id, name, email from users where status in ('active', 'invited')`);
    const accounts = m.account ? await q.query<{ id: string; name: string }>(`select id, name from accounts where archived_at is null`) : [];
    const accountByName = new Map(accounts.map((a) => [fold(a.name), a.id]));
    const tops = await q.query<{ status: string; p: number }>(`select status, max(position) as p from tasks where board_id = $1 group by status`, [boardId]);
    const top = new Map(tops.map((r) => [r.status, Number(r.p) || 0]));
    const miss = { people: new Map<string, number>(), accounts: new Map<string, number>(), statuses: new Map<string, number>() };
    const note = (map: Map<string, number>, name: string) => map.set(name, (map.get(name) ?? 0) + 1);
    const result: TaskImportResult = { batch: crypto.randomUUID(), created: 0, skipped: 0, finished: 0, errors: [], unmatched: { people: [], accounts: [], statuses: [] } };
    const text = (row: Record<string, unknown>, column: string | undefined) => (column && row[column] !== null && row[column] !== undefined ? String(row[column]).trim() : '');
    const ready: Record<string, unknown>[] = [];
    for (const [i, row] of input.rows.entries()) {
      const n = i + 2; // the file's own row number: the header is row 1
      const title = text(row, m.title).slice(0, 300);
      if (!title) {
        result.skipped++;
        if (Object.values(row).some((v) => v !== null && String(v).trim() !== '')) result.errors.push({ row: n, reason: 'title' });
        continue;
      }
      const rawStatus = text(row, m.status);
      let status = first;
      if (rawStatus) {
        const hit = columnFor(rawStatus, columns);
        if (hit) status = hit;
        else note(miss.statuses, rawStatus.slice(0, 60));
      }
      // A "completed on" date means finished, whatever the status column says.
      const doneOn = m.doneAt ? parseDay(text(row, m.doneAt), locale) : null;
      if (doneOn && !doneKeys.has(status) && doneKeys.size) status = [...doneKeys][0];
      const finished = doneKeys.has(status);
      if (finished && !input.includeDone) {
        result.finished++;
        continue;
      }
      const dueRaw = text(row, m.dueDate);
      const startRaw = text(row, m.startDate);
      const due = dueRaw ? parseDay(dueRaw, locale) : null;
      let start = startRaw ? parseDay(startRaw, locale) : null;
      if ((dueRaw && !due) || (startRaw && !start)) result.errors.push({ row: n, reason: 'date' });
      if (start && due && start > due) {
        start = null;
        result.errors.push({ row: n, reason: 'dates' });
      }
      const assignees: string[] = [];
      for (const name of splitPeople(text(row, m.assignee))) {
        const id = matchPerson(name, people);
        if (id) assignees.push(id);
        else note(miss.people, name.slice(0, 80));
      }
      const accountName = text(row, m.account);
      const accountId = accountName ? accountByName.get(fold(accountName)) ?? null : null;
      if (accountName && !accountId) note(miss.accounts, accountName.slice(0, 80));
      const position = (top.get(status) ?? 0) + 1024;
      top.set(status, position);
      // When it was finished: the file's date, else its due date if that has passed, else today.
      const today = todayOf(c);
      const doneAt = finished ? `${doneOn ?? (due && due < today ? due : today)}T12:00:00Z` : null;
      ready.push({
        id: crypto.randomUUID(),
        title,
        description: text(row, m.description).slice(0, 20000),
        status,
        assignees: [...new Set(assignees)].slice(0, 10),
        account_id: accountId,
        due_date: due,
        start_date: start,
        priority: m.priority ? priorityFor(text(row, m.priority)) : 'normal',
        position,
        done_at: doneAt,
      });
    }
    const ids = ready.map((r) => r.id as string);
    for (let i = 0; i < ready.length; i += 400) {
      await q.query(
        `insert into tasks (id, org_id, board_id, title, description, status, assignee_ids, account_id, due_date, start_date, priority, position, created_by, updated_by, done_at)
         select x.id, $1, $2, x.title, x.description, x.status,
                coalesce((select array_agg(v::uuid) from jsonb_array_elements_text(x.assignees) v), '{}'),
                x.account_id, x.due_date, x.start_date, x.priority, x.position, $3, $3, x.done_at
           from jsonb_to_recordset($4::jsonb) as x(id uuid, title text, description text, status text, assignees jsonb, account_id uuid,
                                                    due_date date, start_date date, priority text, position float8, done_at timestamptz)`,
        [org.id, boardId, auth.userId, JSON.stringify(ready.slice(i, i + 400))],
      );
    }
    if (ids.length) {
      await q.query(`insert into task_events (org_id, task_id, actor_id, kind, data) select $1, id, $2, 'created', '{"import": true}'::jsonb from unnest($3::uuid[]) as id`, [org.id, auth.userId, ids]);
      await queueSync(q, org.id, 'task', ids, null, { created: true, boardId });
    }
    result.created = ids.length;
    const top5 = (map: Map<string, number>) => [...map].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, count]) => ({ name, count }));
    result.unmatched = { people: top5(miss.people), accounts: top5(miss.accounts), statuses: top5(miss.statuses) };
    result.errors = result.errors.slice(0, 200);
    await q.query(
      `insert into import_batches (id, org_id, kind, board_id, file_name, created_ids, summary, created_by) values ($1, $2, 'tasks', $3, $4, $5, $6, $7)`,
      [result.batch, org.id, boardId, input.fileName ?? null, ids, JSON.stringify({ created: result.created, skipped: result.skipped, finished: result.finished }), auth.userId],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'task.imported', entity: 'board', entityId: boardId, meta: { created: result.created, file: input.fileName ?? null } });
    return result;
  });
  kickSync(c.get('deps'), org.id);
  return c.json(out, 201);
});

/** This person's recent imports onto a board, newest first. */
workRoutes.get('/boards/:id/imports', async (c) => {
  const boardId = param(c, 'id');
  const rows = await run(c, (q) =>
    q.query(`select id, file_name, summary, created_at, undone_at from import_batches where kind = 'tasks' and board_id = $1 order by created_at desc limit 5`, [boardId]),
  );
  return c.json({
    imports: rows.map((r) => ({
      id: r.id,
      fileName: r.file_name,
      created: Number(r.summary?.created ?? 0),
      createdAt: iso(r.created_at),
      undoneAt: iso(r.undone_at),
      undoable: !r.undone_at && Date.now() - new Date(r.created_at).getTime() < 30 * 86400_000,
    })),
  });
});

/**
 * Undo an import of tasks: what nobody has touched since is removed; a task
 * someone has since changed or written on is kept, in the board's archive.
 */
workRoutes.post('/task-imports/:id/undo', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  const out = await run(c, async (q) => {
    const [b] = await q.query(`select * from import_batches where id = $1 and kind = 'tasks' for update`, [id]);
    if (!b || b.undone_at || Date.now() - new Date(b.created_at).getTime() > 30 * 86400_000) fail('not_found');
    const ids = (b.created_ids ?? []) as string[];
    const kept = await q.query(
      `update tasks t set archived_at = coalesce(archived_at, now())
        where t.id = any($1::uuid[]) and (t.version > 1 or exists (select 1 from comments cm where cm.task_id = t.id)) returning t.id`,
      [ids],
    );
    const keep = kept.map((r) => r.id as string);
    const removed = await q.query(`delete from tasks where id = any($1::uuid[]) and not (id = any($2::uuid[])) returning id`, [ids, keep]);
    await q.query(`update import_batches set undone_at = now() where id = $1`, [id]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'task.import_undone', entity: 'import', entityId: id, meta: { removed: removed.length, archived: keep.length } });
    return { removed: removed.length, archived: keep.length };
  });
  return c.json(out);
});
