// Product / project management on top of boards and tasks (migration 0035):
// sprints, the backlog, issue types, story points and epics. Every query runs
// on the request's own organisation connection, so row-level security decides
// what is visible — another company's sprint is simply "not found".
import { Hono } from 'hono';
import { z } from 'zod';
import { ISSUE_TYPES, SPRINT_STATES, type BurndownPoint, type Column, type IssueType, type SprintBurndown, type SprintSummary } from '../../../shared/src/model';
import { requireWriter, run, todayOf, type AppEnv } from '../context';
import type { Q, Row } from '../db';
import { audit } from '../lib/audit';
import { HttpError, fail } from '../lib/errors';
import { toSprint, toTask } from '../lib/mappers';
import { body, isoDate, param, uuid } from '../lib/validate';
import { canManageBoard, loadBoard } from './boards';

export const pmRoutes = new Hono<AppEnv>();

async function loadSprint(q: Q, id: string): Promise<Row> {
  const [s] = await q.query('select * from sprints where id = $1 and archived_at is null', [id]);
  if (!s) fail('not_found');
  return s;
}

async function loadTask(q: Q, id: string): Promise<Row> {
  const [t] = await q.query('select * from tasks where id = $1 and archived_at is null', [id]);
  if (!t) fail('not_found');
  return t;
}

// ----------------------------------------------------- product management on/off

/** A board carries the product-development stages (Backlog … QA): its sprints and backlog show by default. */
const hasPmStages = (columns: Column[]) => columns.some((c) => c.key === 'backlog') && columns.some((c) => c.key === 'qa');

/** The board's effective PM state: its own switch wins, else whether it has the PM stages. */
const pmEnabledFor = (board: Row): boolean => (board.pm_enabled == null ? hasPmStages(board.columns) : board.pm_enabled === true);

/**
 * When a board's owner has switched product management OFF (pm_enabled = false),
 * its PM endpoints answer "not found" — a non-product team never reaches them.
 * A board that was never switched (null) keeps its old behaviour, so this never
 * blocks a board that simply uses issue types without the product workflow.
 */
function requirePm(board: Row) {
  if (board.pm_enabled === false) fail('not_found');
}

/** Gate a sprint- or task-scoped endpoint by its board's PM switch, without loading the whole board. */
async function requireBoardPm(q: Q, boardId: string) {
  const [b] = await q.query('select pm_enabled from boards where id = $1', [boardId]);
  if (b && b.pm_enabled === false) fail('not_found');
}

function checkDates(start: string | null | undefined, end: string | null | undefined) {
  if (start && end && start > end) fail('validation', { fields: 'startsOn' }, { fields: ['startsOn'] });
}

const doneKeys = (columns: Column[]) => columns.filter((c) => c.done).map((c) => c.key);

// -------------------------------------------------------------- sprints

pmRoutes.get('/boards/:id/sprints', async (c) => {
  const id = param(c, 'id');
  const state = c.req.query('state');
  if (state && !(SPRINT_STATES as readonly string[]).includes(state)) fail('validation', { fields: 'state' }, { fields: ['state'] });
  const rows = await run(c, async (q) => {
    requirePm(await loadBoard(q, id));
    return q.query(
      `select * from sprints where board_id = $1 and archived_at is null and ($2::text is null or state = $2)
        order by position, created_at`,
      [id, state ?? null],
    );
  });
  return c.json({ sprints: rows.map(toSprint) });
});

// --------------------------------------------------- product management switch

// The board's own on/off switch for the PM features, and the effective answer.
pmRoutes.get('/boards/:id/pm', async (c) => {
  const id = param(c, 'id');
  const state = await run(c, async (q) => {
    const b = await loadBoard(q, id);
    return { pmEnabled: b.pm_enabled ?? null, enabled: pmEnabledFor(b) };
  });
  return c.json(state);
});

// Turn product management on or off for one board (or clear it back to the default).
pmRoutes.put('/boards/:id/pm', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ enabled: z.boolean().nullable() }));
  const auth = c.get('auth');
  const org = c.get('org');
  const state = await run(c, async (q) => {
    const b = await loadBoard(q, id);
    if (!canManageBoard(auth, b)) fail('forbidden');
    const [u] = await q.query('update boards set pm_enabled = $2 where id = $1 returning *', [id, input.enabled]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'board.updated', entity: 'board', entityId: id, meta: { pmEnabled: input.enabled } });
    return { pmEnabled: u.pm_enabled ?? null, enabled: pmEnabledFor(u) };
  });
  return c.json(state);
});

const sprintFields = {
  name: z.string().trim().min(1).max(80),
  goal: z.string().max(2000),
  startsOn: isoDate.nullable(),
  endsOn: isoDate.nullable(),
};

pmRoutes.post('/boards/:id/sprints', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ name: sprintFields.name, goal: sprintFields.goal.optional(), startsOn: sprintFields.startsOn.optional(), endsOn: sprintFields.endsOn.optional() }));
  checkDates(input.startsOn, input.endsOn);
  const auth = c.get('auth');
  const org = c.get('org');
  const sprint = await run(c, async (q) => {
    requirePm(await loadBoard(q, id));
    const [m] = await q.query('select coalesce(max(position), 0) + 1024 as p from sprints where board_id = $1', [id]);
    const [s] = await q.query(
      `insert into sprints (org_id, board_id, name, goal, starts_on, ends_on, position, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [org.id, id, input.name, input.goal ?? '', input.startsOn ?? null, input.endsOn ?? null, Number(m.p), auth.userId],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'sprint.created', entity: 'sprint', entityId: s.id });
    return s;
  });
  return c.json({ sprint: toSprint(sprint) }, 201);
});

pmRoutes.get('/sprints/:id', async (c) => {
  const id = param(c, 'id');
  const s = await run(c, async (q) => {
    const s = await loadSprint(q, id);
    await requireBoardPm(q, s.board_id);
    return s;
  });
  return c.json({ sprint: toSprint(s) });
});

pmRoutes.patch('/sprints/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object(sprintFields).partial());
  const auth = c.get('auth');
  const org = c.get('org');
  const sprint = await run(c, async (q) => {
    const cur = await loadSprint(q, id);
    await requireBoardPm(q, cur.board_id);
    const day = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
    checkDates(input.startsOn !== undefined ? input.startsOn : day(cur.starts_on), input.endsOn !== undefined ? input.endsOn : day(cur.ends_on));
    const [s] = await q.query(
      `update sprints set name = coalesce($2, name), goal = coalesce($3, goal),
              starts_on = case when $4 then $5::date else starts_on end,
              ends_on = case when $6 then $7::date else ends_on end, updated_at = now()
        where id = $1 returning *`,
      [id, input.name ?? null, input.goal ?? null, input.startsOn !== undefined, input.startsOn ?? null, input.endsOn !== undefined, input.endsOn ?? null],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'sprint.updated', entity: 'sprint', entityId: id, meta: { fields: Object.keys(input) } });
    return s;
  });
  return c.json({ sprint: toSprint(sprint) });
});

// future -> active -> closed (and back to future). One active sprint per board.
// Closing may carry the unfinished items to the backlog (null) or to another sprint.
pmRoutes.put('/sprints/:id/state', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ state: z.enum(SPRINT_STATES), moveIncompleteTo: uuid.nullable().optional() }));
  const auth = c.get('auth');
  const org = c.get('org');
  const sprint = await run(c, async (q) => {
    const cur = await loadSprint(q, id);
    const board = await loadBoard(q, cur.board_id);
    requirePm(board);
    if (input.state === 'active' && cur.state !== 'active') {
      const [other] = await q.query(
        `select id from sprints where board_id = $1 and state = 'active' and archived_at is null and id <> $2`,
        [cur.board_id, id],
      );
      if (other) fail('conflict', {}, { reason: 'sprint_active', activeSprintId: other.id });
    }
    if (input.state === 'closed' && cur.state !== 'closed' && input.moveIncompleteTo !== undefined) {
      if (input.moveIncompleteTo === id) fail('validation', { fields: 'moveIncompleteTo' }, { fields: ['moveIncompleteTo'] });
      if (input.moveIncompleteTo) {
        const target = await loadSprint(q, input.moveIncompleteTo);
        if (target.board_id !== cur.board_id || target.state === 'closed') fail('validation', { fields: 'moveIncompleteTo' }, { fields: ['moveIncompleteTo'] });
      }
      await q.query(
        `update tasks set sprint_id = $2, version = version + 1, updated_at = now(), updated_by = $4
          where sprint_id = $1 and archived_at is null and not (status = any($3::text[]))`,
        [id, input.moveIncompleteTo, doneKeys(board.columns), auth.userId],
      );
    }
    let s: Row;
    try {
      [s] = await q.query('update sprints set state = $2, updated_at = now() where id = $1 returning *', [id, input.state]);
    } catch (e) {
      // The partial unique index is the backstop when two requests race.
      if (/sprints_one_active_idx|unique/i.test(String((e as Error).message))) fail('conflict', {}, { reason: 'sprint_active' });
      throw e;
    }
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'sprint.state', entity: 'sprint', entityId: id, meta: { from: cur.state, to: input.state } });
    return s;
  });
  return c.json({ sprint: toSprint(sprint) });
});

// Archive: the sprint goes away, its items return to the backlog.
pmRoutes.delete('/sprints/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  await run(c, async (q) => {
    const s = await loadSprint(q, id);
    await requireBoardPm(q, s.board_id);
    await q.query('update tasks set sprint_id = null, version = version + 1, updated_at = now(), updated_by = $2 where sprint_id = $1', [id, auth.userId]);
    await q.query(`update sprints set archived_at = now(), updated_at = now(), state = case when state = 'active' then 'closed' else state end where id = $1`, [id]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'sprint.archived', entity: 'sprint', entityId: id });
  });
  return c.json({ ok: true });
});

// ----------------------------------------------------- backlog & items

// The backlog: the board's top-level tasks that are in no sprint, in rank order.
pmRoutes.get('/boards/:id/backlog', async (c) => {
  const id = param(c, 'id');
  const openOnly = c.req.query('open') === '1';
  const rows = await run(c, async (q) => {
    const board = await loadBoard(q, id);
    requirePm(board);
    return q.query(
      `select t.* from tasks t
        where t.board_id = $1 and t.sprint_id is null and t.parent_id is null and t.archived_at is null
          and (not $2 or not (t.status = any($3::text[])))
        order by t.position, t.created_at`,
      [id, openOnly, doneKeys(board.columns)],
    );
  });
  return c.json({ tasks: rows.map(toTask) });
});

pmRoutes.get('/boards/:id/epics', async (c) => {
  const id = param(c, 'id');
  const rows = await run(c, async (q) => {
    requirePm(await loadBoard(q, id));
    return q.query(
      `select t.*, (select count(*) from tasks s where s.epic_id = t.id and s.archived_at is null) as child_count
         from tasks t where t.board_id = $1 and t.issue_type = 'epic' and t.archived_at is null order by t.position, t.created_at`,
      [id],
    );
  });
  return c.json({ epics: rows.map((r) => ({ ...toTask(r), childCount: Number(r.child_count) })) });
});

pmRoutes.get('/sprints/:id/items', async (c) => {
  const id = param(c, 'id');
  const rows = await run(c, async (q) => {
    const s = await loadSprint(q, id);
    await requireBoardPm(q, s.board_id);
    return q.query('select * from tasks where sprint_id = $1 and archived_at is null order by position, created_at', [id]);
  });
  return c.json({ tasks: rows.map(toTask) });
});

pmRoutes.put('/sprints/:id/items', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ taskIds: z.array(uuid).min(1).max(200) }));
  const ids = [...new Set(input.taskIds)];
  const auth = c.get('auth');
  const org = c.get('org');
  const rows = await run(c, async (q) => {
    const sprint = await loadSprint(q, id);
    await requireBoardPm(q, sprint.board_id);
    if (sprint.state === 'closed') fail('validation', { fields: 'sprint' }, { fields: ['sprint'] });
    const found = await q.query('select id, board_id from tasks where id = any($1::uuid[]) and archived_at is null', [ids]);
    if (found.length !== ids.length) fail('not_found');
    if (found.some((t) => t.board_id !== sprint.board_id)) fail('validation', { fields: 'taskIds' }, { fields: ['taskIds'] });
    const out = await q.query(
      `update tasks set sprint_id = $2, version = version + 1, updated_at = now(), updated_by = $3
        where id = any($1::uuid[]) and sprint_id is distinct from $2::uuid returning *`,
      [ids, id, auth.userId],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'sprint.items_added', entity: 'sprint', entityId: id, meta: { taskIds: ids } });
    return out;
  });
  return c.json({ tasks: rows.map(toTask) });
});

pmRoutes.delete('/sprints/:id/items/:taskId', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const taskId = param(c, 'taskId');
  const auth = c.get('auth');
  const org = c.get('org');
  const task = await run(c, async (q) => {
    const s = await loadSprint(q, id);
    await requireBoardPm(q, s.board_id);
    const [t] = await q.query(
      `update tasks set sprint_id = null, version = version + 1, updated_at = now(), updated_by = $3
        where id = $1 and sprint_id = $2 and archived_at is null returning *`,
      [taskId, id, auth.userId],
    );
    if (!t) fail('not_found');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'sprint.item_removed', entity: 'sprint', entityId: id, meta: { taskId } });
    return t;
  });
  return c.json({ task: toTask(task) });
});

// -------------------------------------------------------------- summary

// Current totals; done = the task's status is a column marked done on its board.
pmRoutes.get('/sprints/:id/summary', async (c) => {
  const id = param(c, 'id');
  const { board, rows } = await run(c, async (q) => {
    const sprint = await loadSprint(q, id);
    const board = await loadBoard(q, sprint.board_id);
    requirePm(board);
    const rows = await q.query(
      `select issue_type, count(*)::int as n,
              count(*) filter (where status = any($2::text[]))::int as done_n,
              coalesce(sum(story_points), 0) as points,
              coalesce(sum(story_points) filter (where status = any($2::text[])), 0) as done_points,
              count(*) filter (where story_points is null)::int as unestimated
         from tasks where sprint_id = $1 and archived_at is null group by issue_type`,
      [id, doneKeys(board.columns)],
    );
    return { board, rows };
  });
  void board;
  const byType = Object.fromEntries(ISSUE_TYPES.map((t) => [t, { count: 0, done: 0, points: 0 }])) as SprintSummary['byType'];
  const out: SprintSummary = { sprintId: id, totalPoints: 0, donePoints: 0, itemCount: 0, doneCount: 0, unestimated: 0, byType };
  for (const r of rows) {
    byType[r.issue_type as IssueType] = { count: r.n, done: r.done_n, points: Number(r.points) };
    out.totalPoints += Number(r.points);
    out.donePoints += Number(r.done_points);
    out.itemCount += r.n;
    out.doneCount += r.done_n;
    out.unestimated += r.unestimated;
  }
  return c.json({ summary: out });
});

// -------------------------------------------------------------- burndown

// The sprint's burndown series: the engine's daily snapshots (lib/burndown.ts),
// with a live point for today so the chart renders before the first snapshot and
// always ends on the current reading. The ideal line is drawn by the client from
// startPoints down to zero across the sprint's dates.
pmRoutes.get('/sprints/:id/burndown', async (c) => {
  const id = param(c, 'id');
  const today = todayOf(c);
  const { sprint, snaps, cur } = await run(c, async (q) => {
    const sprint = await loadSprint(q, id);
    const board = await loadBoard(q, sprint.board_id);
    requirePm(board);
    const snaps = await q.query(
      `select to_char(day, 'YYYY-MM-DD') as day, total_points, remaining_points, total_count, remaining_count
         from sprint_burndowns where sprint_id = $1 order by day`,
      [id],
    );
    const [cur] = await q.query(
      `select coalesce(sum(story_points), 0) as total_points, count(*)::int as total_count,
              coalesce(sum(story_points) filter (where status = any($2::text[])), 0) as done_points,
              count(*) filter (where status = any($2::text[]))::int as done_count
         from tasks where sprint_id = $1 and archived_at is null`,
      [id, doneKeys(board.columns)],
    );
    return { sprint, snaps, cur };
  });

  const points: BurndownPoint[] = snaps.map((r) => ({
    day: r.day as string,
    totalPoints: Number(r.total_points),
    remainingPoints: Number(r.remaining_points),
    totalCount: Number(r.total_count),
    remainingCount: Number(r.remaining_count),
  }));
  // Today's live reading, from the current task state. It replaces a stored point
  // for today, or is slotted in so the series stays in date order.
  const todayPoint: BurndownPoint = {
    day: today,
    totalPoints: Number(cur.total_points),
    remainingPoints: Number(cur.total_points) - Number(cur.done_points),
    totalCount: Number(cur.total_count),
    remainingCount: Number(cur.total_count) - Number(cur.done_count),
  };
  const at = points.findIndex((p) => p.day >= today);
  if (at >= 0 && points[at].day === today) points[at] = todayPoint;
  else if (at >= 0) points.splice(at, 0, todayPoint);
  else points.push(todayPoint);

  const sm = toSprint(sprint);
  const burndown: SprintBurndown = {
    sprintId: id,
    startsOn: sm.startsOn,
    endsOn: sm.endsOn,
    startPoints: points[0]?.totalPoints ?? 0,
    points,
  };
  return c.json({ burndown });
});

// ------------------------------------------------------- task PM fields

// Optimistic concurrency like PATCH /tasks/:id: baseVersion must match, else 409 with the current task.
pmRoutes.patch('/tasks/:id/pm', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(
    c,
    z.object({
      baseVersion: z.number().int().min(1),
      issueType: z.enum(ISSUE_TYPES).optional(),
      storyPoints: z.number().finite().min(0).max(1000).nullable().optional(),
      epicId: uuid.nullable().optional(),
    }),
  );
  const auth = c.get('auth');
  const org = c.get('org');
  const result = await run(c, async (q) => {
    const t = await loadTask(q, id);
    await requireBoardPm(q, t.board_id);
    if (Number(t.version) !== input.baseVersion) return { conflict: t };
    const type: IssueType = input.issueType ?? t.issue_type;
    let epicId: string | null = input.epicId !== undefined ? input.epicId : (t.epic_id ?? null);
    if (type === 'epic') {
      if (input.epicId) fail('validation', { fields: 'epicId' }, { fields: ['epicId'] }); // an epic does not sit in another epic
      epicId = null;
    }
    if (epicId && (input.epicId !== undefined || input.issueType !== undefined)) {
      if (epicId === id) fail('validation', { fields: 'epicId' }, { fields: ['epicId'] });
      const [e] = await q.query('select id, board_id, issue_type from tasks where id = $1 and archived_at is null', [epicId]);
      if (!e || e.board_id !== t.board_id || e.issue_type !== 'epic') fail('validation', { fields: 'epicId' }, { fields: ['epicId'] });
    }
    const [u] = await q.query(
      `update tasks set issue_type = $3, story_points = case when $4 then $5::numeric else story_points end, epic_id = $6,
              version = version + 1, updated_at = now(), updated_by = $7
        where id = $1 and version = $2 returning *`,
      [id, input.baseVersion, type, input.storyPoints !== undefined, input.storyPoints ?? null, epicId, auth.userId],
    );
    if (!u) return { conflict: await loadTask(q, id) };
    // Stories of an epic that stopped being one are let go.
    if (t.issue_type === 'epic' && type !== 'epic') await q.query('update tasks set epic_id = null, version = version + 1 where epic_id = $1', [id]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'task.pm', entity: 'task', entityId: id, meta: { fields: Object.keys(input).filter((k) => k !== 'baseVersion') } });
    return { task: u };
  });
  if ('conflict' in result) throw new HttpError('conflict', {}, { current: toTask(result.conflict!) });
  return c.json({ task: toTask(result.task) });
});
