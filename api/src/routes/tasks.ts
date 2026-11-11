import { Hono } from 'hono';
import { z } from 'zod';
import { MAX_FILE_MB, MENTION_RE, type Column, type TaskDetail } from '../../../shared/src/model';
import { nowOf, requireWriter, run, type AppEnv } from '../context';
import { localDate, runTaskMoved } from '../lib/automations';
import { spawnNext } from '../lib/recurring';
import { saveUndo, UNDO_MINUTES } from '../lib/undo';
import { kick } from '../lib/notify';
import { isDone, onComment, onTaskCreated, onTaskUpdated } from '../lib/taskEvents';
import { kickSync, queueSync, taskKeys } from '../lib/records';
import type { Q, Row } from '../db';
import { audit } from '../lib/audit';
import { fail, HttpError } from '../lib/errors';
import { day, toComment, toFile, toTask } from '../lib/mappers';
import { body, isoDate, param, uuid } from '../lib/validate';
import { loadBoard } from './boards';

export const taskRoutes = new Hono<AppEnv>();

const COUNTS = `
  (select count(*) from tasks s where s.parent_id = t.id and s.archived_at is null) as subtask_count,
  (select count(*) from tasks s join boards b on b.id = s.board_id
     where s.parent_id = t.id and s.archived_at is null
       and exists (select 1 from jsonb_array_elements(b.columns) col
                   where col->>'key' = s.status and (col->>'done')::boolean)) as subtask_done,
  (select count(*) from comments cm where cm.task_id = t.id) as comment_count,
  (select ac.name from accounts ac where ac.id = t.account_id) as account_name`;

async function loadTask(q: Q, id: string): Promise<Row> {
  const [t] = await q.query('select * from tasks where id = $1 and archived_at is null', [id]);
  if (!t) fail('not_found');
  return t;
}

async function checkAssignees(q: Q, ids: string[]) {
  if (!ids.length) return;
  const rows = await q.query(
    `select id from users where id = any($1::uuid[]) and status in ('active', 'invited') and seat = 'full'`,
    [ids],
  );
  if (rows.length !== new Set(ids).size) fail('bad_assignee');
}

async function checkAccount(q: Q, id: string | null | undefined) {
  if (!id) return;
  const rows = await q.query('select 1 from accounts where id = $1', [id]);
  if (!rows.length) fail('validation', { fields: 'accountId' }, { fields: ['accountId'] });
}

function checkStatus(columns: Column[], status: string) {
  if (!columns.some((c) => c.key === status)) fail('bad_status');
}

taskRoutes.get('/boards/:id/tasks', async (c) => {
  const id = param(c, 'id');
  const rows = await run(c, async (q) => {
    await loadBoard(q, id);
    return q.query(
      `select t.*, ${COUNTS} from tasks t
        where t.board_id = $1 and t.parent_id is null and t.archived_at is null
        order by t.position, t.created_at`,
      [id],
    );
  });
  return c.json({ tasks: rows.map(toTask) });
});

// Across every board the person can see: "My tasks" and the calendar.
taskRoutes.get('/tasks', async (c) => {
  const auth = c.get('auth');
  const mine = c.req.query('assignee') === 'me';
  const from = c.req.query('from');
  const to = c.req.query('to');
  if ((from && !isoDate.safeParse(from).success) || (to && !isoDate.safeParse(to).success)) {
    fail('validation', { fields: 'from, to' });
  }
  const rows = await run(c, (q) =>
    q.query(
      `select t.*, ${COUNTS} from tasks t join boards b on b.id = t.board_id
        where t.archived_at is null and b.archived_at is null
          and ($1::uuid is null or $1::uuid = any(t.assignee_ids))
          and ($2::date is null or t.due_date >= $2::date)
          and ($3::date is null or t.due_date <= $3::date)
        order by t.due_date nulls last, t.position
        limit 2000`,
      [mine ? auth.userId : null, from ?? null, to ?? null],
    ),
  );
  return c.json({ tasks: rows.map(toTask) });
});

const fields = {
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20000),
  status: z.string().max(24),
  assigneeIds: z.array(uuid).max(10),
  accountId: uuid.nullable(),
  dueDate: isoDate.nullable(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  position: z.number().finite(),
  repeat: z.object({ every: z.number().int().min(1).max(365), unit: z.enum(['day', 'week', 'month']), from: z.enum(['due', 'done']) }).nullable(),
};

/** "Today" where the company is — repeating tasks count from it. */
const todayOf = (c: { get: (k: any) => any }) => localDate(nowOf(c.get('deps')), c.get('org').timezone || 'UTC');

taskRoutes.post('/tasks', async (c) => {
  requireWriter(c);
  const input = await body(
    c,
    z.object({
      boardId: uuid,
      parentId: uuid.nullable().optional(),
      title: fields.title,
      description: fields.description.optional(),
      status: fields.status.optional(),
      assigneeIds: fields.assigneeIds.optional(),
      accountId: fields.accountId.optional(),
      dueDate: fields.dueDate.optional(),
      priority: fields.priority.optional(),
      position: fields.position.optional(),
      repeat: fields.repeat.optional(),
    }),
  );
  const auth = c.get('auth');
  const org = c.get('org');
  const task = await run(c, async (q) => {
    const board = await loadBoard(q, input.boardId);
    const columns = board.columns as Column[];
    const status = input.status ?? columns[0].key;
    checkStatus(columns, status);
    if (input.parentId) {
      const parent = await loadTask(q, input.parentId);
      if (parent.board_id !== input.boardId || parent.parent_id) fail('validation', { fields: 'parentId' });
    }
    await checkAssignees(q, input.assigneeIds ?? []);
    await checkAccount(q, input.accountId);
    let position = input.position;
    if (position === undefined) {
      const [m] = await q.query(
        'select coalesce(max(position), 0) + 1024 as p from tasks where board_id = $1 and status = $2',
        [input.boardId, status],
      );
      position = Number(m.p);
    }
    const [t] = await q.query(
      `insert into tasks (org_id, board_id, parent_id, title, description, status, assignee_ids,
                          account_id, due_date, priority, position, created_by, updated_by, repeat)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13)
       returning *, (select name from accounts a where a.id = account_id) as account_name`,
      [
        org.id,
        input.boardId,
        input.parentId ?? null,
        input.title,
        input.description ?? '',
        status,
        [...new Set(input.assigneeIds ?? [])],
        input.accountId ?? null,
        input.dueDate ?? null,
        input.priority ?? 'normal',
        position,
        auth.userId,
        input.repeat && !input.parentId ? JSON.stringify(input.repeat) : null,
      ],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'task.created', entity: 'task', entityId: t.id });
    await onTaskCreated(q, org.id, auth.userId, t, board);
    if (!t.parent_id) await queueSync(q, org.id, 'task', [t.id], null, { created: true, boardId: t.board_id });
    return t;
  });
  kick(c.get('deps'));
  kickSync(c.get('deps'), org.id);
  return c.json({ task: toTask(task) }, 201);
});

taskRoutes.get('/tasks/:id', async (c) => {
  const id = param(c, 'id');
  const detail = await run(c, async (q) => {
    const t = await loadTask(q, id);
    const [counted] = await q.query(`select t.*, ${COUNTS} from tasks t where t.id = $1`, [id]);
    const subtasks = await q.query(
      'select * from tasks where parent_id = $1 and archived_at is null order by position, created_at',
      [id],
    );
    const comments = await q.query('select * from comments where task_id = $1 order by created_at', [id]);
    const files = await q.query('select * from files where task_id = $1 order by created_at', [id]);
    const [mute] = await q.query('select 1 from task_mutes where task_id = $1', [id]);
    return { t: counted ?? t, subtasks, comments, files, muted: !!mute };
  });
  const out: TaskDetail = {
    ...toTask(detail.t),
    subtasks: detail.subtasks.map(toTask),
    comments: detail.comments.map(toComment),
    files: detail.files.map(toFile),
    muted: detail.muted,
  };
  return c.json({ task: out });
});

const patchSchema = z.object({
  baseVersion: z.number().int().min(1),
  title: fields.title.optional(),
  description: fields.description.optional(),
  status: fields.status.optional(),
  assigneeIds: fields.assigneeIds.optional(),
  accountId: fields.accountId.optional(),
  dueDate: fields.dueDate.optional(),
  priority: fields.priority.optional(),
  position: fields.position.optional(),
  repeat: fields.repeat.optional(),
});

// Optimistic concurrency: the write only lands if nobody saved the task
// since the version the editor started from. Otherwise 409 with the
// current task, and the app merges the person's changes on top of it
// (shared/src/merge.ts) instead of silently overwriting someone else.
taskRoutes.patch('/tasks/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, patchSchema);
  const auth = c.get('auth');
  const org = c.get('org');
  const result = await run(c, async (q) => {
    const t = await loadTask(q, id);
    if (t.version !== input.baseVersion) return { conflict: t };
    const board = await loadBoard(q, t.board_id);
    if (input.status !== undefined) checkStatus(board.columns, input.status);
    if (input.assigneeIds !== undefined) await checkAssignees(q, input.assigneeIds);
    if (input.accountId !== undefined) await checkAccount(q, input.accountId);
    const sets: string[] = [];
    const vals: unknown[] = [];
    const set = (col: string, v: unknown) => {
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    };
    if (input.title !== undefined) set('title', input.title);
    if (input.description !== undefined) set('description', input.description);
    if (input.status !== undefined) set('status', input.status);
    if (input.assigneeIds !== undefined) set('assignee_ids', [...new Set(input.assigneeIds)]);
    if (input.accountId !== undefined) set('account_id', input.accountId);
    if (input.dueDate !== undefined) set('due_date', input.dueDate);
    if (input.priority !== undefined) set('priority', input.priority);
    if (input.position !== undefined) set('position', input.position);
    if (input.repeat !== undefined) set('repeat', input.repeat && !t.parent_id ? JSON.stringify(input.repeat) : null);
    set('updated_by', auth.userId);
    vals.push(id, input.baseVersion);
    const [u] = await q.query(
      `update tasks set ${sets.join(', ')}, version = version + 1, updated_at = now()
        where id = $${vals.length - 1} and version = $${vals.length}
        returning *, (select name from accounts a where a.id = account_id) as account_name`,
      vals,
    );
    if (!u) return { conflict: await loadTask(q, id) };
    await onTaskUpdated(q, org.id, auth.userId, t, u, board);
    let next: Row | null = null;
    if (u.repeat && isDone(board.columns, u.status) && !isDone(board.columns, t.status)) {
      next = await spawnNext(q, org.id, auth.userId, u, board, todayOf(c));
      if (next) u.repeat = null;
    }
    const synced = taskKeys(t, u, board.columns);
    if (synced.length) await queueSync(q, org.id, 'task', [id], synced);
    const changed = Object.keys(input).filter((k) => k !== 'baseVersion' && k !== 'position');
    if (changed.length) {
      await audit(q, { orgId: org.id, actorId: auth.userId, action: 'task.updated', entity: 'task', entityId: id, meta: { fields: changed } });
    }
    return { task: u, next };
  });
  if ('conflict' in result) throw new HttpError('conflict', {}, { current: toTask(result.conflict!) });
  const deps = c.get('deps');
  if (input.status !== undefined) await runTaskMoved(deps, org.id, id, input.status, nowOf(deps)).catch(() => 0);
  kick(deps);
  kickSync(deps, org.id);
  return c.json({ task: toTask(result.task), ...(result.next ? { next: toTask(result.next) } : {}) });
});

/** Change many tasks at once; the answer carries an undo id. */
taskRoutes.post('/tasks/bulk', async (c) => {
  requireWriter(c);
  const input = await body(
    c,
    z.object({
      ids: z.array(uuid).min(1).max(500),
      status: fields.status.optional(),
      addAssignee: uuid.optional(),
      removeAssignee: uuid.optional(),
      dueDate: fields.dueDate.optional(),
      priority: fields.priority.optional(),
      archived: z.boolean().optional(),
    }),
  );
  const auth = c.get('auth');
  const org = c.get('org');
  const deps = c.get('deps');
  const out = await run(c, async (q) => {
    const tasks = await q.query('select * from tasks where id = any($1::uuid[]) and parent_id is null and (archived_at is null or $2)', [input.ids, input.archived === false]);
    if (input.addAssignee) await checkAssignees(q, [input.addAssignee]);
    const boards = new Map<string, Row>();
    const before: Row[] = [];
    const moved: { id: string; status: string }[] = [];
    let n = 0;
    for (const t of tasks) {
      const board = boards.get(t.board_id) ?? (await loadBoard(q, t.board_id));
      boards.set(t.board_id, board);
      // A status that this board does not have is left alone for that task.
      const status = input.status && (board.columns as Column[]).some((col) => col.key === input.status) ? input.status : t.status;
      let assignees: string[] = t.assignee_ids ?? [];
      if (input.addAssignee && !assignees.includes(input.addAssignee)) assignees = [...assignees, input.addAssignee].slice(0, 10);
      if (input.removeAssignee) assignees = assignees.filter((a) => a !== input.removeAssignee);
      const [u] = await q.query(
        `update tasks set status = $2, assignee_ids = $3, due_date = $4, priority = $5,
                archived_at = case when $6::boolean is null then archived_at when $6 then coalesce(archived_at, now()) else null end,
                version = version + 1, updated_by = $7, updated_at = now()
          where id = $1 returning *`,
        [t.id, status, assignees, input.dueDate !== undefined ? input.dueDate : t.due_date, input.priority ?? t.priority, input.archived ?? null, auth.userId],
      );
      if (!u) continue;
      n++;
      before.push({ id: t.id, status: t.status, assignee_ids: t.assignee_ids, due_date: day(t.due_date), priority: t.priority, archived_at: t.archived_at, repeat: t.repeat });
      await onTaskUpdated(q, org.id, auth.userId, t, u, board);
      if (u.repeat && isDone(board.columns, u.status) && !isDone(board.columns, t.status)) await spawnNext(q, org.id, auth.userId, u, board, todayOf(c));
      if (status !== t.status) moved.push({ id: t.id, status });
      const synced = taskKeys(t, u, board.columns);
      if (synced.length) await queueSync(q, org.id, 'task', [t.id], synced);
    }
    const undoId = await saveUndo(q, org.id, auth.userId, 'tasks', before);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'task.bulk_updated', entity: 'task', meta: { count: n, fields: Object.keys(input).filter((k) => k !== 'ids') } });
    return { n, undoId, moved };
  });
  for (const m of out.moved) await runTaskMoved(deps, org.id, m.id, m.status, nowOf(deps)).catch(() => 0);
  kick(deps);
  kickSync(deps, org.id);
  return c.json({ updated: out.n, undoId: out.undoId });
});

/** Put back what a change to many things replaced (tasks or accounts). */
taskRoutes.post('/undo/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  const n = await run(c, async (q) => {
    const [u] = await q.query(`select * from undo_log where id = $1 and used_at is null and created_at > now() - make_interval(mins => $2)`, [id, UNDO_MINUTES]);
    if (!u) fail('not_found');
    let restored = 0;
    for (const p of u.payload as Row[]) {
      if (u.kind === 'tasks') {
        const r = await q.query(
          `update tasks set status = $2, assignee_ids = $3, due_date = $4, priority = $5, archived_at = $6, repeat = $7,
                  version = version + 1, updated_by = $8, updated_at = now() where id = $1 returning id`,
          [p.id, p.status, p.assignee_ids ?? [], p.due_date, p.priority, p.archived_at, p.repeat ? JSON.stringify(p.repeat) : null, auth.userId],
        );
        restored += r.length;
      } else {
        await q.query('update accounts set archived_at = $2, updated_at = now() where id = $1', [p.id, p.archived_at]);
        await q.query('select app_reassign_accounts($1::uuid[], true, $2::uuid, true, $3::uuid)', [[p.id], p.owner_id, p.team_id]);
        restored++;
      }
    }
    await q.query('update undo_log set used_at = now() where id = $1', [id]);
    if (u.kind === 'tasks') await queueSync(q, org.id, 'task', (u.payload as Row[]).map((p) => p.id), null);
    else await queueSync(q, org.id, 'account', (u.payload as Row[]).map((p) => p.id), ['owner']);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'undo.used', entity: u.kind === 'tasks' ? 'task' : 'account', meta: { count: restored } });
    return restored;
  });
  kickSync(c.get('deps'), org.id);
  return c.json({ restored: n });
});

/** Stop (or restart) comment notices for one task. */
taskRoutes.post('/tasks/:id/mute', async (c) => {
  const id = param(c, 'id');
  const input = await body(c, z.object({ muted: z.boolean() }));
  const auth = c.get('auth');
  const org = c.get('org');
  await run(c, async (q) => {
    await loadTask(q, id);
    if (input.muted) await q.query('insert into task_mutes (org_id, task_id, user_id) values ($1, $2, $3) on conflict do nothing', [org.id, id, auth.userId]);
    else await q.query('delete from task_mutes where task_id = $1', [id]);
  });
  return c.json({ muted: input.muted });
});

taskRoutes.delete('/tasks/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  const keys = await run(c, async (q) => {
    const t = await loadTask(q, id);
    if (t.created_by !== auth.userId && !auth.perms.includes('tasks.delete_any')) fail('forbidden');
    const files = await q.query<{ storage_key: string }>(
      'select storage_key from files where task_id = $1 or task_id in (select id from tasks where parent_id = $1)',
      [id],
    );
    await q.query('delete from tasks where id = $1', [id]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'task.deleted', entity: 'task', entityId: id, meta: { title: t.title } });
    return files.map((f) => f.storage_key);
  });
  const storage = c.get('deps').storage;
  for (const k of keys) await storage.delete(k);
  return c.json({ ok: true });
});

// ----------------------------------------------------------------- comments

taskRoutes.post('/tasks/:id/comments', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ body: z.string().trim().min(1).max(10000) }));
  const auth = c.get('auth');
  const org = c.get('org');
  const comment = await run(c, async (q) => {
    const task = await loadTask(q, id);
    const mentioned = [...new Set([...input.body.matchAll(MENTION_RE)].map((m) => m[2]))];
    const valid = mentioned.length
      ? (await q.query<{ id: string }>(`select id from users where id = any($1::uuid[]) and status <> 'deleted'`, [mentioned])).map(
          (r) => r.id,
        )
      : [];
    const [cm] = await q.query(
      `insert into comments (org_id, task_id, author_id, body, mentions) values ($1, $2, $3, $4, $5) returning *`,
      [org.id, id, auth.userId, input.body, valid],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'comment.created', entity: 'comment', entityId: cm.id });
    await onComment(q, org.id, auth.userId, task, input.body, valid);
    return cm;
  });
  kick(c.get('deps'));
  return c.json({ comment: toComment(comment) }, 201);
});

taskRoutes.delete('/comments/:id', async (c) => {
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  const n = await run(c, async (q) => {
    const rows = await q.query('delete from comments where id = $1 returning id', [id]);
    if (rows.length) await audit(q, { orgId: org.id, actorId: auth.userId, action: 'comment.deleted', entity: 'comment', entityId: id });
    return rows.length;
  });
  if (!n) fail('not_found');
  return c.json({ ok: true });
});

// -------------------------------------------------------------------- files

taskRoutes.post('/tasks/:id/files', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  const deps = c.get('deps');
  const limit = MAX_FILE_MB * 1024 * 1024;
  if (Number(c.req.header('content-length') ?? 0) > limit + 64 * 1024) fail('file_too_large', { mb: MAX_FILE_MB });
  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File)) fail('validation', { fields: 'file' });
  const f = file as File;
  if (f.size > limit) fail('file_too_large', { mb: MAX_FILE_MB });
  const name = f.name.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200) || 'file';
  const key = `${org.id}/${id}/${crypto.randomUUID()}`;
  const row = await run(c, async (q) => {
    await loadTask(q, id);
    await deps.storage.put(key, await f.arrayBuffer(), f.type || 'application/octet-stream');
    const [r] = await q.query(
      `insert into files (org_id, task_id, name, size, mime, storage_key, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [org.id, id, name, f.size, f.type || 'application/octet-stream', key, auth.userId],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'file.uploaded', entity: 'file', entityId: r.id, meta: { name } });
    return r;
  });
  return c.json({ file: toFile(row) }, 201);
});

taskRoutes.get('/files/:id', async (c) => {
  const id = param(c, 'id');
  const row = await run(c, async (q) => {
    const [r] = await q.query('select * from files where id = $1', [id]);
    if (!r) fail('not_found');
    return r;
  });
  const obj = await c.get('deps').storage.get(row.storage_key);
  if (!obj) fail('not_found');
  return c.body(obj!.data, 200, {
    'content-type': row.mime,
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  });
});

taskRoutes.delete('/files/:id', async (c) => {
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  const key = await run(c, async (q) => {
    const rows = await q.query<{ storage_key: string }>('delete from files where id = $1 returning storage_key', [id]);
    if (!rows.length) fail('not_found');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'file.deleted', entity: 'file', entityId: id });
    return rows[0].storage_key;
  });
  await c.get('deps').storage.delete(key);
  return c.json({ ok: true });
});
