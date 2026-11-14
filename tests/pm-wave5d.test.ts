// Wave-5D PM polish: sprint burndown history, backlog reordering, and the
// per-board "enable product management" switch. Org isolation is checked
// alongside each feature, mirroring tests/pm.test.ts.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Sprint, SprintBurndown, Task } from '../shared/src/model';
import { pmColumns } from '../shared/src/templates';
import { snapshotActiveSprints } from '../api/src/lib/burndown';
import { login, setup, type Client, type Env } from './helpers';

let env: Env;
let ada: Client; // admin (full seat, manages the boards it creates)
let sofia: Client; // viewer seat
let stranger: Client; // another company's admin
let pmBoard: string; // a product board, PM stages, left on the default switch

const mk = (board: string, title: string) => ada.post('/api/tasks', { boardId: board, title }).then((r) => r.json.task as Task);
const mkSprint = (board: string, extra: Record<string, unknown> = {}) =>
  ada.post(`/api/boards/${board}/sprints`, { name: 'Sprint', ...extra }).then((r) => r.json.sprint as Sprint);
const setPoints = async (t: Task, storyPoints: number) => (await ada.patch(`/api/tasks/${t.id}/pm`, { baseVersion: t.version, issueType: 'story', storyPoints })).json.task as Task;
const freshBoard = async () => (await ada.post('/api/boards', { name: 'Product', visibility: 'org', columns: pmColumns('en') })).json.board.id as string;

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', env.a.adminEmail);
  sofia = await login(env, 'acme', 'sofia@demo.example');
  stranger = await login(env, 'beta', env.b.adminEmail);
  pmBoard = await freshBoard();
});

describe('burndown', () => {
  it('backfills from the current state, then records a daily history', async () => {
    const board = await freshBoard();
    env.clock.now = new Date('2026-12-01T10:00:00Z');
    const s = await mkSprint(board, { startsOn: '2026-12-01', endsOn: '2026-12-14' });
    const a = await setPoints(await mk(board, 'A'), 5);
    const b = await setPoints(await mk(board, 'B'), 3);
    const c = await setPoints(await mk(board, 'C'), 2);
    await ada.put(`/api/sprints/${s.id}/items`, { taskIds: [a.id, b.id, c.id] });
    expect((await ada.put(`/api/sprints/${s.id}/state`, { state: 'active' })).json.sprint.state).toBe('active');

    // Nothing has been snapshotted yet: the series is still non-empty — it carries
    // a live point for today, from the current scope of 10 points, none done.
    let bd = (await ada.get(`/api/sprints/${s.id}/burndown`)).json.burndown as SprintBurndown;
    expect(bd).toMatchObject({ sprintId: s.id, startsOn: '2026-12-01', endsOn: '2026-12-14', startPoints: 10 });
    expect(bd.points).toHaveLength(1);
    expect(bd.points[0]).toMatchObject({ totalPoints: 10, remainingPoints: 10, totalCount: 3, remainingCount: 3 });

    // Day one: record the point. Only active sprints are snapshotted.
    expect(await snapshotActiveSprints(env.deps, env.clock.now)).toBeGreaterThanOrEqual(1);

    // Day three: finish A (5 points), then record again.
    env.clock.now = new Date('2026-12-03T10:00:00Z');
    const cur = (await ada.get(`/api/tasks/${a.id}`)).json.task as Task;
    expect((await ada.patch(`/api/tasks/${a.id}`, { baseVersion: cur.version, status: 'done' })).status).toBe(200);
    await snapshotActiveSprints(env.deps, env.clock.now);

    bd = (await ada.get(`/api/sprints/${s.id}/burndown`)).json.burndown as SprintBurndown;
    // Two days of history: scope still 10, remaining went 10 → 5.
    expect(bd.points).toHaveLength(2);
    expect(bd.points[0].remainingPoints).toBe(10);
    expect(bd.points[1].remainingPoints).toBe(5);
    expect(bd.points[1].remainingCount).toBe(2);
    expect(bd.startPoints).toBe(10);
    expect(bd.points[0].day < bd.points[1].day).toBe(true);
    env.clock.now = null;
  });

  it('keeps one company’s burndown from another', async () => {
    const s = await mkSprint(pmBoard);
    await ada.put(`/api/sprints/${s.id}/state`, { state: 'active' });
    // A stranger sees neither the series nor the snapshot rows behind it.
    expect((await stranger.get(`/api/sprints/${s.id}/burndown`)).status).toBe(404);
    await snapshotActiveSprints(env.deps, new Date());
    const rows = await env.db.system((q) => q.query('select org_id from sprint_burndowns where sprint_id = $1', [s.id]));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.org_id === env.a.orgId)).toBe(true);
    await ada.put(`/api/sprints/${s.id}/state`, { state: 'closed' });
  });
});

describe('product management switch', () => {
  it('reports the state and gates the PM endpoints when turned off', async () => {
    const board = await freshBoard();
    expect((await ada.get(`/api/boards/${board}/pm`)).json).toMatchObject({ pmEnabled: null, enabled: true });
    const s = await mkSprint(board);
    await ada.put(`/api/sprints/${s.id}/state`, { state: 'active' });
    const task = await mk(board, 'Clutter');

    // Turn it off: the PM endpoints now answer "not found".
    expect((await ada.put(`/api/boards/${board}/pm`, { enabled: false })).json).toMatchObject({ pmEnabled: false, enabled: false });
    const whenOff = [
      ada.get(`/api/boards/${board}/sprints`),
      ada.get(`/api/boards/${board}/backlog`),
      ada.get(`/api/boards/${board}/epics`),
      ada.post(`/api/boards/${board}/sprints`, { name: 'Nope' }),
      ada.get(`/api/sprints/${s.id}`),
      ada.get(`/api/sprints/${s.id}/summary`),
      ada.get(`/api/sprints/${s.id}/burndown`),
      ada.put(`/api/sprints/${s.id}/items`, { taskIds: [task.id] }),
      ada.patch(`/api/tasks/${task.id}/pm`, { baseVersion: task.version, issueType: 'bug' }),
    ];
    for (const r of await Promise.all(whenOff)) expect(r.status).toBe(404);

    // A disabled board is also skipped by the daily snapshot.
    const before = await env.db.system((q) => q.query('select 1 from sprint_burndowns where sprint_id = $1', [s.id]));
    await snapshotActiveSprints(env.deps, new Date());
    const after = await env.db.system((q) => q.query('select 1 from sprint_burndowns where sprint_id = $1', [s.id]));
    expect(after.length).toBe(before.length);

    // Turn it back on: the endpoints work again.
    expect((await ada.put(`/api/boards/${board}/pm`, { enabled: true })).json).toMatchObject({ pmEnabled: true, enabled: true });
    expect((await ada.get(`/api/boards/${board}/sprints`)).status).toBe(200);
    expect((await ada.get(`/api/sprints/${s.id}/burndown`)).status).toBe(200);
  });

  it('a board that was never switched is off by default without being blocked', async () => {
    // The CS board has no PM stages and no switch: effectively off, but its PM
    // endpoints stay open (the switch only blocks when explicitly set to false).
    const cs = env.a.boards.csBoard;
    expect((await ada.get(`/api/boards/${cs}/pm`)).json).toMatchObject({ pmEnabled: null, enabled: false });
    expect((await ada.get(`/api/boards/${cs}/sprints`)).status).toBe(200);
  });

  it('needs a full seat and board management to flip, and stays within the company', async () => {
    expect((await sofia.put(`/api/boards/${pmBoard}/pm`, { enabled: false })).status).toBe(403);
    expect((await stranger.put(`/api/boards/${pmBoard}/pm`, { enabled: false })).status).toBe(404);
    expect((await stranger.get(`/api/boards/${pmBoard}/pm`)).status).toBe(404);
  });
});

describe('backlog order', () => {
  it('persists reordering and dragging an item into a sprint', async () => {
    const board = await freshBoard();
    const t1 = await mk(board, 'First');
    const t2 = await mk(board, 'Second');
    const t3 = await mk(board, 'Third');
    const ids = async () => ((await ada.get(`/api/boards/${board}/backlog`)).json.tasks as Task[]).map((t) => t.id);
    expect(await ids()).toEqual([t1.id, t2.id, t3.id]);

    // Reorder: move Third to sit between First and Second (the fractional
    // position the drag computes), through the ordinary task PATCH.
    const list = (await ada.get(`/api/boards/${board}/backlog`)).json.tasks as Task[];
    const [p1, p2, third] = [list[0].position, list[1].position, list[2]];
    const moved = await ada.patch(`/api/tasks/${t3.id}`, { baseVersion: third.version, position: (p1 + p2) / 2 });
    expect(moved.status).toBe(200);
    expect(await ids()).toEqual([t1.id, t3.id, t2.id]);

    // Drag into a sprint: the item leaves the backlog and joins the sprint.
    const s = await mkSprint(board);
    expect((await ada.put(`/api/sprints/${s.id}/items`, { taskIds: [t1.id] })).json.tasks[0].sprintId).toBe(s.id);
    expect(await ids()).toEqual([t3.id, t2.id]);
    expect(((await ada.get(`/api/sprints/${s.id}/items`)).json.tasks as Task[]).map((t) => t.id)).toEqual([t1.id]);
  });

  it('reordering stays within the company', async () => {
    const t = await mk(pmBoard, 'Mine');
    const fresh = (await ada.get(`/api/tasks/${t.id}`)).json.task as Task;
    expect((await stranger.patch(`/api/tasks/${t.id}`, { baseVersion: fresh.version, position: 9999 })).status).toBe(404);
  });
});
