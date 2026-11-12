import { INLINE_TYPES, readUpload } from '../lib/upload';
import { Hono } from 'hono';
import { z } from 'zod';
import { MENTION_RE, type Column, type TaskDetail } from '../../../shared/src/model';
import { defer, nowOf, requireWriter, run, todayOf, type AppEnv } from '../context';
import { portalOn, tellCustomer } from '../lib/portal';
import { runTaskMoved } from '../lib/automations';
import { spawnNext } from '../lib/recurring';
import { saveUndo, UNDO_MINUTES } from '../lib/undo';
import { toTrash } from '../lib/trash';
import { kick } from '../lib/notify';
import { isDone, onComment, onTaskCreated, onTaskUpdated } from '../lib/taskEvents';
import { kickSync, queueSync, taskKeys } from '../lib/records';
import { foldText } from '../../../shared/src/text';
import type { Q, Row } from '../db';
import { audit } from '../lib/audit';
import { fail, HttpError } from '../lib/errors';
import { day, iso, toComment, toFile, toTask } from '../lib/mappers';
import { body, isoDate, param, uuid } from '../lib/validate';
import { addEvent, recordChanges } from '../lib/history';
import { cleanTaskFields, missingForDone } from '../lib/taskFields';
import { loadBoard } from './boards';

export const taskRoutes = new Hono<AppEnv>();

const COUNTS = `
  (select count(*) from tasks s where s.parent_id = t.id and s.archived_at is null) as subtask_count,
  (select count(*) from tasks s where s.parent_id = t.id and s.archived_at is null and s.done_at is not null) as subtask_done,
  (select count(*) from comments cm where cm.task_id = t.id) as comment_count,
  (select ac.name from accounts ac where ac.id = t.account_id) as account_name,
  (select count(*) from task_links l
     where l.to_id = t.id and l.kind = 'blocks'
       -- Asked link by link, so the database starts from this task's few links and never from every task.
       and (select bt.archived_at is null and bt.done_at is null from tasks bt where bt.id = l.from_id)) as blocked_by`;

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
  // The archive: what was put away by hand, and finished work that aged out. Newest first, a page at a time.
  if (c.req.query('archived') === '1') {
    const search = (c.req.query('q') ?? '').trim().slice(0, 100).replace(/[%_]/g, '');
    const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0);
    const out = await run(c, async (q) => {
      await loadBoard(q, id);
      const rows = await q.query(
        `select t.*, ${COUNTS}, a.name as account_name from tasks t left join accounts a on a.id = t.account_id
          where t.board_id = $1 and t.parent_id is null and t.archived_at is not null and ($2 = '' or t.title_fold like '%' || fold_text($2) || '%')
          order by t.archived_at desc limit 101 offset $3`,
        [id, search, offset],
      );
      const [{ n }] = await q.query(`select count(*)::int as n from tasks t where t.board_id = $1 and t.parent_id is null and t.archived_at is not null`, [id]);
      return { rows, total: n as number };
    });
    return c.json({ tasks: out.rows.slice(0, 100).map((r) => ({ ...toTask(r), archivedAt: iso(r.archived_at), accountName: r.account_name ?? null })), total: out.total, more: out.rows.length > 100 });
  }
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

// Across every board the person can see: "My tasks", the calendar, the timeline, a colleague's work.
taskRoutes.get('/tasks', async (c) => {
  const auth = c.get('auth');
  const who = c.req.query('assignee');
  const assignee = who === 'me' ? auth.userId : who && uuid.safeParse(who).success ? who : null;
  const from = c.req.query('from');
  const to = c.req.query('to');
  // span=1: everything whose bar (start → due) touches the window, not only what is due inside it.
  const span = c.req.query('span') === '1';
  const board = c.req.query('board');
  if ((from && !isoDate.safeParse(from).success) || (to && !isoDate.safeParse(to).success)) {
    fail('validation', { fields: 'from, to' });
  }
  const rows = await run(c, (q) =>
    q.query(
      `select t.*, ${COUNTS} from tasks t join boards b on b.id = t.board_id
        where t.archived_at is null and b.archived_at is null
          and ($1::uuid is null or t.id = any(array(select app_tasks_of($1::uuid))))
          and ($2::date is null or t.due_date >= $2::date)
          and ($3::date is null or (case when $4 then coalesce(t.start_date, t.due_date) else t.due_date end) <= $3::date)
          and ($5::uuid is null or t.board_id = $5::uuid)
          and (not $4 or t.parent_id is null)
        order by t.due_date nulls last, t.position
        limit 2000`,
      [assignee, from ?? null, to ?? null, span, board && uuid.safeParse(board).success ? board : null],
    ),
  );
  return c.json({ tasks: rows.map(toTask) });
});

// The little number next to "My tasks": open tasks of mine that are late or due today (where the company is).
taskRoutes.get('/tasks/counts', async (c) => {
  const auth = c.get('auth');
  const today = todayOf(c);
  const [r] = await run(c, (q) =>
    q.query(
      `select count(*) filter (where t.due_date < $2::date) as late, count(*) filter (where t.due_date = $2::date) as today
         from tasks t join boards b on b.id = t.board_id
        where t.archived_at is null and b.archived_at is null and t.id = any(array(select app_tasks_of($1::uuid)))
          and t.done_at is null`,
      [auth.userId, today],
    ),
  );
  return c.json({ late: Number(r?.late ?? 0), today: Number(r?.today ?? 0) });
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
  fields: z.record(z.string().max(40), z.unknown()),
  startDate: isoDate.nullable(),
  recordId: uuid.nullable(),
};

/** A record a task is about: it must be one this person can see. Its customer comes with it. */
async function checkRecord(q: Q, recordId: string | null | undefined): Promise<Row | null> {
  if (!recordId) return null;
  const [r] = await q.query('select id, account_id from records where id = $1', [recordId]);
  if (!r) fail('validation', { fields: 'recordId' }, { fields: ['recordId'] });
  return r;
}

/** A start after the due date is a typo, not a plan. */
function checkDates(start: string | null | undefined, due: string | null | undefined) {
  if (start && due && start > due) fail('validation', { fields: 'startDate' }, { fields: ['startDate'] });
}

/** The fields that block finishing, said in a way the person can act on. */
function requireForDone(board: Row, values: Record<string, unknown> | null | undefined, locale: string) {
  const missing = missingForDone(board.task_fields ?? [], values);
  if (!missing.length) return;
  const names = missing.map((k) => {
    const def = (board.task_fields ?? []).find((f: { key: string }) => f.key === k);
    return def?.label?.[locale] ?? def?.label?.en ?? def?.label?.tr ?? k;
  });
  fail('required_fields', { fields: names.join(', ') }, { fields: missing.map((k) => `fields.${k}`) });
}

/** "Today" where the company is — repeating tasks count from it. */

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
      fields: fields.fields.optional(),
      startDate: fields.startDate.optional(),
      recordId: fields.recordId.optional(),
    }),
  );
  const auth = c.get('auth');
  const org = c.get('org');
  checkDates(input.startDate, input.dueDate);
  const task = await run(c, async (q) => {
    const board = await loadBoard(q, input.boardId);
    const columns = board.columns as Column[];
    const status = input.status ?? columns[0].key;
    checkStatus(columns, status);
    const values = input.fields ? await cleanTaskFields(q, board.task_fields ?? [], input.fields, org.locale) : {};
    if (isDone(columns, status) && !input.parentId) requireForDone(board, values, auth.locale ?? org.locale);
    if (input.parentId) {
      const parent = await loadTask(q, input.parentId);
      if (parent.board_id !== input.boardId || parent.parent_id) fail('validation', { fields: 'parentId' });
    }
    await checkAssignees(q, input.assigneeIds ?? []);
    await checkAccount(q, input.accountId);
    const record = await checkRecord(q, input.recordId);
    const accountId = input.accountId !== undefined ? input.accountId : (record?.account_id ?? null);
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
                          account_id, due_date, priority, position, created_by, updated_by, repeat, fields, start_date, record_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13, $14, $15, $16)
       returning *, (select name from accounts a where a.id = account_id) as account_name`,
      [
        org.id,
        input.boardId,
        input.parentId ?? null,
        input.title,
        input.description ?? '',
        status,
        [...new Set(input.assigneeIds ?? [])],
        accountId,
        input.dueDate ?? null,
        input.priority ?? 'normal',
        position,
        auth.userId,
        input.repeat && !input.parentId ? JSON.stringify(input.repeat) : null,
        JSON.stringify(values),
        input.startDate ?? null,
        record?.id ?? null,
      ],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'task.created', entity: 'task', entityId: t.id });
    if (!t.parent_id) await addEvent(q, org.id, t.id, auth.userId, 'created');
    await onTaskCreated(q, org.id, auth.userId, t, board);
    if (!t.parent_id) await queueSync(q, org.id, 'task', [t.id], null, { created: true, boardId: t.board_id });
    return t;
  });
  kick(c.get('deps'));
  kickSync(c.get('deps'), org.id);
  return c.json({ task: toTask(task) }, 201);
});

// ----------------------------------------------------------- look-alikes

const words = (s: string) =>
  foldText(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);

/** Open tasks that look like the one about to be added (same words, same customer or board). */
taskRoutes.get('/tasks/similar', async (c) => {
  const title = (c.req.query('title') ?? '').slice(0, 300);
  const boardId = c.req.query('boardId');
  const accountId = c.req.query('accountId');
  const mine = words(title);
  if (mine.length < 2) return c.json({ tasks: [] });
  const rows = await run(c, (q) =>
    q.query(
      `select t.id, t.title, t.board_id, t.due_date, t.assignee_ids, b.name as board_name from tasks t join boards b on b.id = t.board_id
        where t.archived_at is null and t.parent_id is null and b.archived_at is null
          and ($1::uuid is null or t.board_id = $1::uuid or t.account_id = $2::uuid)
          and ($2::uuid is null or t.account_id = $2::uuid or t.board_id = $1::uuid)
          and t.created_at > now() - interval '180 days'
          and t.done_at is null
          and t.title_fold like any($3::text[])
        order by t.created_at desc limit 50`,
      [uuid.safeParse(boardId).success ? boardId : null, uuid.safeParse(accountId).success ? accountId : null, mine.map((w) => `%${w}%`)],
    ),
  );
  const a = new Set(mine);
  const scored = rows
    .map((r) => {
      const b = new Set(words(r.title));
      const both = [...a].filter((w) => b.has(w)).length;
      return { r, score: both / new Set([...a, ...b]).size };
    })
    .filter((x) => x.score >= 0.5)
    .sort((x, y) => y.score - x.score)
    .slice(0, 3);
  return c.json({ tasks: scored.map(({ r }) => ({ id: r.id, title: r.title, boardId: r.board_id, boardName: r.board_name, dueDate: day(r.due_date), assigneeIds: r.assignee_ids ?? [] })) });
});

taskRoutes.get('/tasks/:id', async (c) => {
  const id = param(c, 'id');
  const detail = await run(c, async (q) => {
    const t = await loadTask(q, id);
    const [counted] = await q.query(
      `select t.*, ${COUNTS}, (select pu.name from portal_users pu where pu.id = t.portal_author_id) as portal_author_name,
              r.name as record_name, rt.key as record_type
         from tasks t left join records r on r.id = t.record_id left join record_types rt on rt.id = r.type_id where t.id = $1`,
      [id],
    );
    const subtasks = await q.query(
      'select * from tasks where parent_id = $1 and archived_at is null order by position, created_at',
      [id],
    );
    const comments = await q.query(
      'select c.*, pu.name as portal_author_name from comments c left join portal_users pu on pu.id = c.portal_author_id where c.task_id = $1 order by c.created_at',
      [id],
    );
    const files = await q.query('select * from files where task_id = $1 order by created_at', [id]);
    const [mute] = await q.query('select 1 from task_mutes where task_id = $1', [id]);
    const events = await q.query('select * from task_events where task_id = $1 order by created_at desc limit 200', [id]);
    const watchers = await q.query('select user_id from task_watchers where task_id = $1 order by created_at', [id]);
    // Both directions of every link, seen from this task; tasks on boards the person cannot open are left out.
    const links = await q.query(
      `select o.id, o.title, o.board_id, b.name as board_name, l.kind, (l.from_id = $1) as outgoing,
              o.done_at is not null as done
         from task_links l
         join tasks o on o.id = case when l.from_id = $1 then l.to_id else l.from_id end
         join boards b on b.id = o.board_id
        where (l.from_id = $1 or l.to_id = $1) and o.archived_at is null
        order by l.created_at`,
      [id],
    );
    const time = await q.query('select * from time_entries where task_id = $1 order by day desc, created_at desc limit 200', [id]);
    return { t: counted ?? t, subtasks, comments, files, muted: !!mute, events, watchers, links, time };
  });
  const files = detail.files.map(toFile);
  const out: TaskDetail = {
    ...toTask(detail.t),
    subtasks: detail.subtasks.map(toTask),
    comments: detail.comments.map((cm) => ({ ...toComment(cm), files: files.filter((f) => f.commentId === cm.id) })),
    files,
    muted: detail.muted,
    events: detail.events.map((e) => ({ id: e.id, actorId: e.actor_id ?? null, kind: e.kind, data: e.data ?? {}, createdAt: iso(e.created_at)! })),
    watchers: detail.watchers.map((w) => w.user_id),
    links: detail.links.map((l) => ({
      taskId: l.id,
      title: l.title,
      boardId: l.board_id,
      boardName: l.board_name,
      kind: l.kind === 'relates' ? 'relates' : l.outgoing ? 'blocks' : 'blocked_by',
      done: !!l.done,
    })),
    time: {
      total: detail.time.reduce((n, e) => n + Number(e.minutes), 0),
      entries: detail.time.map((e) => ({ id: e.id, userId: e.user_id, minutes: Number(e.minutes), day: day(e.day)!, note: e.note ?? '', createdAt: iso(e.created_at)! })),
    },
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
  fields: fields.fields.optional(),
  startDate: fields.startDate.optional(),
  recordId: fields.recordId.optional(),
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
    if (input.recordId) await checkRecord(q, input.recordId);
    checkDates(input.startDate !== undefined ? input.startDate : day(t.start_date), input.dueDate !== undefined ? input.dueDate : day(t.due_date));
    const values = input.fields ? { ...(t.fields ?? {}), ...(await cleanTaskFields(q, board.task_fields ?? [], input.fields, org.locale)) } : (t.fields ?? {});
    const nextStatus = input.status ?? t.status;
    if (!t.parent_id && isDone(board.columns, nextStatus) && (!isDone(board.columns, t.status) || input.fields)) requireForDone(board, values, auth.locale ?? org.locale);
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
    if (input.fields) set('fields', JSON.stringify(values));
    if (input.startDate !== undefined) set('start_date', input.startDate);
    if (input.recordId !== undefined) set('record_id', input.recordId);
    set('updated_by', auth.userId);
    vals.push(id, input.baseVersion);
    const [u] = await q.query(
      `update tasks set ${sets.join(', ')}, version = version + 1, updated_at = now()
        where id = $${vals.length - 1} and version = $${vals.length}
        returning *, (select name from accounts a where a.id = account_id) as account_name`,
      vals,
    );
    if (!u) return { conflict: await loadTask(q, id) };
    if (!u.parent_id) await recordChanges(q, org.id, auth.userId, t, u);
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

// ------------------------------------------------------------------ follow

taskRoutes.put('/tasks/:id/watch', async (c) => {
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  await run(c, async (q) => {
    await loadTask(q, id);
    await q.query('insert into task_watchers (org_id, task_id, user_id) values ($1, $2, $3) on conflict do nothing', [org.id, id, auth.userId]);
  });
  return c.json({ watching: true });
});

taskRoutes.delete('/tasks/:id/watch', async (c) => {
  const id = param(c, 'id');
  const auth = c.get('auth');
  await run(c, async (q) => {
    const gone = await q.query('delete from task_watchers where task_id = $1 and user_id = $2 returning 1', [id, auth.userId]);
    // Not following it: then it must at least be a task this person can see (else "not found").
    if (!gone.length) await loadTask(q, id);
  });
  return c.json({ watching: false });
});

// ------------------------------------------------------------------- links

const linkInput = z.object({ otherId: uuid, kind: z.enum(['blocks', 'blocked_by', 'relates']) });

/** "This task waits for that one" is stored as "that one blocks this one". */
const orient = (id: string, other: string, kind: 'blocks' | 'blocked_by' | 'relates') =>
  kind === 'blocked_by' ? { from: other, to: id, kind: 'blocks' } : kind === 'relates' ? { from: id < other ? id : other, to: id < other ? other : id, kind: 'relates' } : { from: id, to: other, kind: 'blocks' };

taskRoutes.post('/tasks/:id/links', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, linkInput);
  const auth = c.get('auth');
  const org = c.get('org');
  if (input.otherId === id) fail('link_loop');
  await run(c, async (q) => {
    const t = await loadTask(q, id);
    const o = await loadTask(q, input.otherId);
    const l = orient(id, input.otherId, input.kind);
    if (l.kind === 'blocks') {
      // Waiting in a circle would mean nothing can start.
      const [loop] = await q.query(
        `with recursive chain(id) as (select to_id from task_links where from_id = $1 and kind = 'blocks'
           union select l.to_id from task_links l join chain on l.from_id = chain.id where l.kind = 'blocks')
         select 1 from chain where id = $2 limit 1`,
        [l.to, l.from],
      );
      if (loop) fail('link_loop');
    }
    await q.query('insert into task_links (org_id, from_id, to_id, kind, created_by) values ($1, $2, $3, $4, $5) on conflict do nothing', [org.id, l.from, l.to, l.kind, auth.userId]);
    await addEvent(q, org.id, t.id, auth.userId, 'linked', { kind: input.kind, taskId: o.id, title: o.title });
    const back = input.kind === 'blocks' ? 'blocked_by' : input.kind === 'blocked_by' ? 'blocks' : 'relates';
    await addEvent(q, org.id, o.id, auth.userId, 'linked', { kind: back, taskId: t.id, title: t.title });
  });
  return c.json({ ok: true }, 201);
});

taskRoutes.delete('/tasks/:id/links/:other', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const other = param(c, 'other');
  const kind = z.enum(['blocks', 'blocked_by', 'relates']).safeParse(c.req.query('kind'));
  if (!kind.success) fail('validation', { fields: 'kind' }, { fields: ['kind'] });
  const auth = c.get('auth');
  const org = c.get('org');
  await run(c, async (q) => {
    await loadTask(q, id);
    const l = orient(id, other, kind.data!);
    const gone = await q.query('delete from task_links where from_id = $1 and to_id = $2 and kind = $3 returning from_id', [l.from, l.to, l.kind]);
    if (gone.length) {
      const [o] = await q.query('select title from tasks where id = $1', [other]);
      await addEvent(q, org.id, id, auth.userId, 'unlinked', { kind: kind.data, taskId: other, title: o?.title ?? '' });
    }
  });
  return c.json({ ok: true });
});

// -------------------------------------------------------------------- time

taskRoutes.post('/tasks/:id/time', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ minutes: z.number().int().min(1).max(1440), day: isoDate.optional(), note: z.string().trim().max(500).optional() }));
  const auth = c.get('auth');
  const org = c.get('org');
  const entry = await run(c, async (q) => {
    await loadTask(q, id);
    const [e] = await q.query('insert into time_entries (org_id, task_id, user_id, minutes, day, note) values ($1, $2, $3, $4, $5, $6) returning *', [
      org.id,
      id,
      auth.userId,
      input.minutes,
      input.day ?? todayOf(c),
      input.note ?? '',
    ]);
    await addEvent(q, org.id, id, auth.userId, 'time', { minutes: input.minutes });
    return e;
  });
  return c.json({ entry: { id: entry.id, userId: entry.user_id, minutes: entry.minutes, day: day(entry.day), note: entry.note, createdAt: iso(entry.created_at) } }, 201);
});

taskRoutes.delete('/time/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const gone = await run(c, (q) => q.query('delete from time_entries where id = $1 returning id', [id]));
  if (!gone.length) fail('not_found');
  return c.json({ ok: true });
});

// -------------------------------------------------------------- checklists

/** Steps become subtasks, in order, after the ones already there. */
taskRoutes.post('/tasks/:id/checklist', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ templateId: uuid.optional(), items: z.array(z.string().trim().min(1).max(300)).max(50).optional() }));
  const auth = c.get('auth');
  const org = c.get('org');
  const n = await run(c, async (q) => {
    const t = await loadTask(q, id);
    if (t.parent_id) fail('validation', { fields: 'parentId' });
    let items = input.items ?? [];
    let name = '';
    if (input.templateId) {
      const [tpl] = await q.query('select name, items from checklist_templates where id = $1', [input.templateId]);
      if (!tpl) fail('not_found');
      items = (tpl.items as string[]).filter((x) => typeof x === 'string' && x.trim()).slice(0, 50);
      name = tpl.name;
    }
    if (!items.length) fail('validation', { fields: 'items' });
    const board = await loadBoard(q, t.board_id);
    const first = (board.columns as Column[])[0].key;
    const [{ p }] = await q.query('select coalesce(max(position), 0) as p from tasks where parent_id = $1', [id]);
    let pos = Number(p);
    for (const title of items) {
      pos += 1024;
      await q.query(
        `insert into tasks (org_id, board_id, parent_id, title, status, assignee_ids, account_id, position, created_by, updated_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
        [org.id, t.board_id, id, title, first, t.assignee_ids ?? [], t.account_id, pos, auth.userId],
      );
    }
    await addEvent(q, org.id, id, auth.userId, 'checklist', { name, n: items.length });
    return items.length;
  });
  return c.json({ added: n }, 201);
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
    let skipped = 0;
    for (const t of tasks) {
      const board = boards.get(t.board_id) ?? (await loadBoard(q, t.board_id));
      boards.set(t.board_id, board);
      // A status that this board does not have is left alone for that task, and so is
      // finishing one whose must-fill fields are empty (it is counted as skipped).
      let status = input.status && (board.columns as Column[]).some((col) => col.key === input.status) ? input.status : t.status;
      if (status !== t.status && isDone(board.columns, status) && !isDone(board.columns, t.status) && missingForDone(board.task_fields ?? [], t.fields).length) {
        status = t.status;
        skipped++;
        if (input.addAssignee === undefined && input.removeAssignee === undefined && input.dueDate === undefined && input.priority === undefined && input.archived === undefined) continue;
      }
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
      await recordChanges(q, org.id, auth.userId, t, u);
      if (input.archived !== undefined && !!t.archived_at !== input.archived) await addEvent(q, org.id, t.id, auth.userId, input.archived ? 'archived' : 'restored');
      await onTaskUpdated(q, org.id, auth.userId, t, u, board);
      if (u.repeat && isDone(board.columns, u.status) && !isDone(board.columns, t.status)) await spawnNext(q, org.id, auth.userId, u, board, todayOf(c));
      if (status !== t.status) moved.push({ id: t.id, status });
      const synced = taskKeys(t, u, board.columns);
      if (synced.length) await queueSync(q, org.id, 'task', [t.id], synced);
    }
    const undoId = await saveUndo(q, org.id, auth.userId, 'tasks', before);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'task.bulk_updated', entity: 'task', meta: { count: n, fields: Object.keys(input).filter((k) => k !== 'ids') } });
    return { n, undoId, moved, skipped };
  });
  for (const m of out.moved) await runTaskMoved(deps, org.id, m.id, m.status, nowOf(deps)).catch(() => 0);
  kick(deps);
  kickSync(deps, org.id);
  return c.json({ updated: out.n, undoId: out.undoId, skipped: out.skipped });
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
  const trashId = await run(c, async (q) => {
    const t = await loadTask(q, id);
    if (t.created_by !== auth.userId && !auth.perms.includes('tasks.delete_any')) fail('forbidden');
    const [w] = await q.query<{ board: string; account: string | null }>(
      'select b.name as board, (select a.name from accounts a where a.id = $2) as account from boards b where b.id = $1',
      [t.board_id, t.account_id],
    );
    // It stays in the trash for 30 days with its subtasks, comments, time and files; the files leave
    // storage only when the trash lets go of them.
    const trashId = await toTrash(q, 'task', [id], t.title, { boardId: t.board_id, board: w?.board, ...(t.account_id && w?.account ? { accountId: t.account_id, account: w.account } : {}) });
    const gone = await q.query('delete from tasks where id = $1 returning id', [id]);
    if (!gone.length) fail('forbidden');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'task.deleted', entity: 'task', entityId: id, meta: { title: t.title, trashId } });
    return trashId;
  });
  return c.json({ ok: true, trashId });
});

// ----------------------------------------------------------------- comments

taskRoutes.post('/tasks/:id/comments', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ body: z.string().trim().max(10000), visibility: z.enum(['internal', 'customer']).default('internal'), fileIds: z.array(uuid).max(10).optional() }));
  if (!input.body && !input.fileIds?.length) fail('validation', { fields: 'body' }, { fields: ['body'] });
  const auth = c.get('auth');
  const org = c.get('org');
  const comment = await run(c, async (q) => {
    const task = await loadTask(q, id);
    // A reply for the customer only where the customer can read it.
    if (input.visibility === 'customer') {
      const [b] = await q.query(`select coalesce((portal->>'enabled')::boolean, false) as open from boards where id = $1`, [task.board_id]);
      if (!task.portal_shared || !b?.open || !portalOn(org)) fail('portal_not_shared');
    }
    const mentioned = [...new Set([...input.body.matchAll(MENTION_RE)].map((m) => m[2]))];
    const valid = mentioned.length
      ? (await q.query<{ id: string }>(`select id from users where id = any($1::uuid[]) and status <> 'deleted'`, [mentioned])).map(
          (r) => r.id,
        )
      : [];
    const [cm] = await q.query(
      `insert into comments (org_id, task_id, author_id, body, mentions, visibility) values ($1, $2, $3, $4, $5, $6) returning *`,
      [org.id, id, auth.userId, input.body, valid, input.visibility],
    );
    // Files uploaded for this comment, by its author, onto this task.
    cm.files = input.fileIds?.length
      ? await q.query('update files set comment_id = $1 where id = any($2::uuid[]) and task_id = $3 and uploaded_by = $4 and comment_id is null returning *', [cm.id, input.fileIds, id, auth.userId])
      : [];
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'comment.created', entity: 'comment', entityId: cm.id });
    await onComment(q, org.id, auth.userId, task, input.body || (cm.files[0]?.name ?? ''), valid);
    return cm;
  });
  kick(c.get('deps'));
  if (comment.visibility === 'customer') defer(c.get('deps'), tellCustomer(c.get('deps'), org, id, auth.name, input.body));
  return c.json({ comment: { ...toComment(comment), files: (comment.files as Row[]).map(toFile) } }, 201);
});

taskRoutes.delete('/comments/:id', async (c) => {
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  const keys = await run(c, async (q) => {
    const files = await q.query<{ id: string; storage_key: string }>('select id, storage_key from files where comment_id = $1', [id]);
    const rows = await q.query('delete from comments where id = $1 returning id', [id]);
    if (!rows.length) return null;
    // Its pictures and files go with it.
    if (files.length) await q.query('delete from files where id = any($1::uuid[])', [files.map((f) => f.id)]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'comment.deleted', entity: 'comment', entityId: id });
    return files.map((f) => f.storage_key);
  });
  if (!keys) fail('not_found');
  for (const k of keys!) await c.get('deps').storage.delete(k);
  return c.json({ ok: true });
});

// -------------------------------------------------------------------- files

taskRoutes.post('/tasks/:id/files', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  const deps = c.get('deps');
  const f = await readUpload(c);
  const name = f.name;
  const key = `${org.id}/${id}/${crypto.randomUUID()}`;
  const row = await run(c, async (q) => {
    await loadTask(q, id);
    await deps.storage.put(key, f.data, f.mime);
    const [r] = await q.query(
      `insert into files (org_id, task_id, name, size, mime, storage_key, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [org.id, id, name, f.size, f.mime, key, auth.userId],
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
  // A picture may be shown in the page (a pasted screenshot); everything else is a download.
  const inline = c.req.query('inline') === '1' && INLINE_TYPES.has(row.mime);
  return c.body(obj!.data, 200, {
    'content-type': row.mime,
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
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
