// Bringing work over from another tool, from a file: a dry run that says
// what will come in and what will not, then the import itself onto one or
// more boards — tasks, sub-tasks, comments, the board's own fields and
// "waits for" links — and an undo for 30 days. Nobody is notified and no
// rules run: this is moving house, not new work.
import type { BoardsRow, TasksRow } from '../db/rows.gen';
import { Hono } from 'hono';
import { z } from 'zod';
import { IMPORT_FIELDS, planImport, type PlanBoard, type Target } from '../../../shared/src/importPlan';
import type { Column, TaskField } from '../../../shared/src/model';
import { requireWriter, run, todayOf, type AppEnv } from '../context';
import { audit } from '../lib/audit';
import { fail } from '../lib/errors';
import { defaultColumns } from '../lib/orgs';
import { kickSync, queueSync } from '../lib/records';
import { taskFieldsSchema } from '../lib/taskFields';
import { toTrash } from '../lib/trash';
import { body, localeField, param, uuid } from '../lib/validate';
import { canManageBoard, loadBoard } from './boards';

export const importRoutes = new Hono<AppEnv>();

const MAX_ROWS = 5000;
const UNDO_DAYS = 30;

const target = z.union([z.object({ board: uuid }), z.object({ create: z.string().trim().min(1).max(80) })]);
const planSchema = z.object({
  fileName: z.string().max(200).optional(),
  rows: z
    .array(
      z.object({
        n: z.number().int().min(0).max(1_000_000),
        c: z.record(z.string().max(300), z.string().max(20000)),
        p: z.number().int().min(0).max(MAX_ROWS).optional(),
      }),
    )
    .min(1)
    .max(MAX_ROWS),
  mapping: z.record(z.string().max(300), z.enum([...IMPORT_FIELDS, 'skip'])),
  targets: z.record(z.string().max(80), target).refine((t) => Object.keys(t).length > 0 && Object.keys(t).length <= 200),
  locale: localeField.optional(),
  includeDone: z.boolean().optional(),
  /** Only work out what would happen. */
  dryRun: z.boolean().optional(),
  /** Boards the person made for this import just before it: put away again by an undo that empties them. */
  createdBoards: z.array(uuid).max(50).optional(),
});

/**
 * Imports tasks from a spreadsheet (up to 16 MB) with a column mapping that names exactly one title column.
 * A dry run may name boards that do not exist yet; the real import only goes onto existing ones. Writers only.
 */
importRoutes.post('/task-imports', async (c) => {
  requireWriter(c);
  if (Number(c.req.header('content-length') ?? 0) > 16 * 1024 * 1024) fail('import_too_large', { max: MAX_ROWS });
  const input = await body(c, planSchema);
  const auth = c.get('auth');
  const org = c.get('org');
  const locale = input.locale ?? org.locale;
  if (Object.values(input.mapping).filter((f) => f === 'title').length !== 1) fail('validation', { fields: 'mapping' }, { fields: ['mapping'] });
  // Only a dry run may name boards that do not exist yet: the import itself goes onto real ones.
  if (!input.dryRun && Object.values(input.targets).some((t) => 'create' in t)) fail('validation', { fields: 'targets' }, { fields: ['targets'] });
  for (const r of input.rows) if (r.p !== undefined && r.p >= input.rows.length) fail('validation', { fields: 'rows' }, { fields: ['rows'] });
  const today = todayOf(c);
  const out = await run(c, async (q) => {
    const boards: PlanBoard[] = [];
    const rowsOf = new Map<string, any>();
    for (const t of Object.values(input.targets)) {
      if (!('board' in t) || rowsOf.has(t.board)) continue;
      const b = await loadBoard(q, t.board);
      rowsOf.set(t.board, b);
      boards.push({ key: `b:${b.id}`, id: b.id, name: b.name, columns: b.columns as Column[], taskFields: (b.task_fields ?? []) as TaskField[], canAddFields: canManageBoard(auth, b) });
    }
    const people = await q.query<{ id: string; name: string; email: string }>(`select id, name, email from users where status in ('active', 'invited')`);
    const accounts = Object.values(input.mapping).includes('account') ? await q.query<{ id: string; name: string }>(`select id, name from accounts where archived_at is null`) : [];
    const plan = planImport(
      { rows: input.rows, mapping: input.mapping, targets: input.targets as Record<string, Target>, locale, includeDone: !!input.includeDone },
      { boards, people, accounts, today, newId: () => crypto.randomUUID(), fallbackColumns: defaultColumns(locale) },
    );
    if (input.dryRun) {
      return {
        dryRun: true as const,
        report: plan.report,
        // What a new board is made with, so the client makes exactly the board the dry run showed.
        newBoards: plan.boards.filter((b) => b.id === null).map((b) => ({ key: b.key, name: b.name, columns: b.columns, taskFields: b.taskFields })),
      };
    }

    // The fields the import adds to existing boards (new boards were made with theirs).
    for (const [key, add] of Object.entries(plan.fields)) {
      const b = boards.find((x) => x.key === key);
      if (!b?.id || !b.canAddFields || !add.length) continue;
      const all = taskFieldsSchema.parse([...((rowsOf.get(b.id).task_fields ?? []) as TaskField[]), ...add]);
      await q.query('update boards set task_fields = $2::jsonb where id = $1', [b.id, JSON.stringify(all)]);
    }
    const boardId = new Map(boards.map((b) => [b.key, b.id!]));
    const tops = await q.query<{ board_id: string; status: string; p: number }>(`select board_id, status, max(position) as p from tasks where board_id = any($1::uuid[]) group by board_id, status`, [[...rowsOf.keys()]]);
    const top = new Map(tops.map((r) => [`${r.board_id}:${r.status}`, Number(r.p) || 0]));
    const ready = plan.tasks.map((t) => {
      const bid = boardId.get(t.board)!;
      const k = `${bid}:${t.status}`;
      const position = (top.get(k) ?? 0) + 1024;
      top.set(k, position);
      return {
        id: t.id,
        board_id: bid,
        title: t.title,
        description: t.description,
        status: t.status,
        assignees: t.assignees,
        account_id: t.accountId,
        due_date: t.due,
        start_date: t.start,
        priority: t.priority,
        position,
        done_at: t.doneAt,
        parent_id: t.parentId,
        story_points: t.points,
        fields: t.fields,
      };
    });
    // Parents come first in the plan, so a sub-task's parent is always in the same or an earlier statement.
    for (let i = 0; i < ready.length; i += 400) {
      await q.query(
        `insert into tasks (id, org_id, board_id, title, description, status, assignee_ids, account_id, due_date, start_date, priority, position, created_by, updated_by, done_at, parent_id, story_points, fields)
         select x.id, $1, x.board_id, x.title, x.description, x.status,
                coalesce((select array_agg(v::uuid) from jsonb_array_elements_text(x.assignees) v), '{}'),
                x.account_id, x.due_date, x.start_date, x.priority, x.position, $2, $2, x.done_at, x.parent_id, x.story_points, coalesce(x.fields, '{}'::jsonb)
           from jsonb_to_recordset($3::jsonb) as x(id uuid, board_id uuid, title text, description text, status text, assignees jsonb, account_id uuid,
                                                    due_date date, start_date date, priority text, position float8, done_at timestamptz,
                                                    parent_id uuid, story_points numeric, fields jsonb)`,
        [org.id, auth.userId, JSON.stringify(ready.slice(i, i + 400))],
      );
    }
    for (let i = 0; i < plan.comments.length; i += 400) {
      await q.query(
        `insert into comments (org_id, task_id, author_id, body) select $1, x.task_id, $2, x.body from jsonb_to_recordset($3::jsonb) as x(task_id uuid, body text)`,
        [org.id, auth.userId, JSON.stringify(plan.comments.slice(i, i + 400).map((x) => ({ task_id: x.taskId, body: x.body })))],
      );
    }
    for (let i = 0; i < plan.links.length; i += 400) {
      await q.query(
        `insert into task_links (org_id, from_id, to_id, kind, created_by) select $1, x.f, x.t, 'blocks', $2 from jsonb_to_recordset($3::jsonb) as x(f uuid, t uuid) on conflict do nothing`,
        [org.id, auth.userId, JSON.stringify(plan.links.slice(i, i + 400).map((l) => ({ f: l.from, t: l.to })))],
      );
    }
    const ids = ready.map((r) => r.id);
    if (ids.length) {
      await q.query(`insert into task_events (org_id, task_id, actor_id, kind, data) select $1, id, $2, 'created', '{"import": true}'::jsonb from unnest($3::uuid[]) as id`, [org.id, auth.userId, ids]);
      for (const bid of new Set(ready.map((r) => r.board_id))) {
        const mine = ready.filter((r) => r.board_id === bid).map((r) => r.id);
        await queueSync(q, org.id, 'task', mine, null, { created: true, boardId: bid });
      }
    }
    // Boards made for this import are remembered only if this person made them, and just now.
    const made = input.createdBoards?.length
      ? (await q.query<{ id: string }>(`select id from boards where id = any($1::uuid[]) and created_by = $2 and created_at > now() - interval '1 hour'`, [input.createdBoards, auth.userId])).map((r) => r.id)
      : [];
    const batch = crypto.randomUUID();
    const first = ready[0]?.board_id ?? boards[0]?.id ?? null;
    const t = plan.report.totals;
    await q.query(
      `insert into import_batches (id, org_id, kind, board_id, file_name, created_ids, summary, created_by) values ($1, $2, 'tasks', $3, $4, $5, $6, $7)`,
      [batch, org.id, first, input.fileName ?? null, ids, JSON.stringify({ v: 2, created: t.tasks + t.subtasks, subtasks: t.subtasks, comments: t.comments, links: t.links, fields: t.fields, boards: [...new Set(ready.map((r) => r.board_id))], createdBoards: made }), auth.userId],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'task.imported', entity: 'import', entityId: batch, meta: { created: ids.length, boards: new Set(ready.map((r) => r.board_id)).size, file: input.fileName ?? null } });
    return { dryRun: false as const, batch, report: plan.report };
  });
  if (!out.dryRun) kickSync(c.get('deps'), org.id);
  return c.json(out, out.dryRun ? 200 : 201);
});

/** This person's recent imports of tasks (any board), newest first. */
importRoutes.get('/task-imports', async (c) => {
  const rows = await run(c, (q) =>
    q.query(
      `select i.id, i.file_name, i.summary, i.created_at, i.undone_at, i.board_id, b.name as board_name
         from import_batches i left join boards b on b.id = i.board_id
        where i.kind = 'tasks' and i.created_by = app_user() order by i.created_at desc limit 10`,
    ),
  );
  return c.json({
    imports: rows.map((r) => ({
      id: r.id as string,
      fileName: r.file_name as string | null,
      created: Number(r.summary?.created ?? 0),
      boards: Array.isArray(r.summary?.boards) ? r.summary.boards.length : 1,
      boardId: r.board_id as string | null,
      boardName: r.board_name as string | null,
      createdAt: new Date(r.created_at).toISOString(),
      undoneAt: r.undone_at ? new Date(r.undone_at).toISOString() : null,
      undoable: !r.undone_at && Date.now() - new Date(r.created_at).getTime() < UNDO_DAYS * 86400_000,
    })),
  });
});

/**
 * Undo an import: what nobody has touched since goes to the trash (as one
 * item, for 30 days); a task someone has since changed or written on is
 * kept, in its board's archive. A board made for the import and left empty
 * is put away too.
 */
importRoutes.post('/task-imports/:id/undo', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  const out = await run(c, async (q) => {
    const [b] = await q.query(`select * from import_batches where id = $1 and kind = 'tasks' for update`, [id]);
    if (!b || b.undone_at || Date.now() - new Date(b.created_at).getTime() > UNDO_DAYS * 86400_000) fail('not_found');
    const ids = (b.created_ids ?? []) as string[];
    // Comments written by the import carry its own moment; only later ones mean someone worked on it.
    const kept = await q.query(
      `update tasks t set archived_at = coalesce(archived_at, now())
        where t.id = any($1::uuid[]) and (t.version > 1 or exists (select 1 from comments cm where cm.task_id = t.id and cm.created_at > $2))
        returning t.id`,
      [ids, b.created_at],
    );
    const keep = new Set(kept.map((r) => r.id as string));
    // Sub-tasks of kept tasks stay with them.
    const there = await q.query<{ id: string; title: string; board_id: string; parent_id: string | null }>(
      `select id, title, board_id, parent_id from tasks where id = any($1::uuid[]) order by parent_id nulls first, created_at`,
      [ids],
    );
    const go = there.filter((r) => !keep.has(r.id) && !(r.parent_id && keep.has(r.parent_id)));
    const roots = go.filter((r) => !r.parent_id || !go.some((x) => x.id === r.parent_id));
    const [bd] = await q.query<{ name: string }>('select name from boards where id = $1', [b.board_id]);
    const trashId = await toTrash(q, 'task', roots.map((r) => r.id), roots[0]?.title ?? '', { boardId: b.board_id, board: bd?.name, via: 'import' });
    // Sub-tasks go with their parent (the foreign key cascades).
    const removed = await q.query<Pick<TasksRow, 'id'>>(`delete from tasks where id = any($1::uuid[]) returning id`, [roots.map((r) => r.id)]);
    if (removed.length !== roots.length) fail('forbidden');
    const made = (b.summary?.createdBoards ?? []) as string[];
    const putAway = made.length
      ? await q.query<Pick<BoardsRow, 'id'>>(
          `update boards set archived_at = now() where id = any($1::uuid[]) and created_by = $2 and archived_at is null
              and not exists (select 1 from tasks t where t.board_id = boards.id and t.archived_at is null) returning id`,
          [made, auth.userId],
        )
      : [];
    await q.query(`update import_batches set undone_at = now() where id = $1`, [id]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'task.import_undone', entity: 'import', entityId: id, meta: { removed: go.length, archived: keep.size, boards: putAway.length, trashId } });
    return { removed: go.length, archived: keep.size, boards: putAway.length, trashId };
  });
  return c.json(out);
});

