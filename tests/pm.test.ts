import { beforeAll, describe, expect, it } from 'vitest';
import { FIBONACCI, type Sprint, type SprintSummary, type Task } from '../shared/src/model';
import { pmColumns, PM_STAGE_KEYS } from '../shared/src/templates';
import { login, setup, type Client, type Env } from './helpers';

let env: Env;
let mert: Client;
let sofia: Client; // viewer seat
let stranger: Client; // other company's admin
let board: string;

const mk = async (title: string, extra: Record<string, unknown> = {}) => (await mert.post('/api/tasks', { boardId: board, title, ...extra })).json.task as Task;
const mkSprint = async (name: string, extra: Record<string, unknown> = {}) => (await mert.post(`/api/boards/${board}/sprints`, { name, ...extra })).json.sprint as Sprint;
const pm = (t: Task, body: Record<string, unknown>) => mert.patch(`/api/tasks/${t.id}/pm`, { baseVersion: t.version, ...body });

beforeAll(async () => {
  env = await setup();
  mert = await login(env, 'acme', 'mert@demo.example');
  sofia = await login(env, 'acme', 'sofia@demo.example');
  stranger = await login(env, 'beta', env.b.adminEmail);
  // A product board with the PM stages.
  const r = await mert.post('/api/boards', { name: 'Product', visibility: 'org', columns: pmColumns('en') });
  expect(r.status).toBe(403); // org-wide boards need boards.manage_all; a team board then
  board = env.a.boards.csBoard;
  const pmBoard = await login(env, 'acme', env.a.adminEmail);
  const b = await pmBoard.post('/api/boards', { name: 'Product', visibility: 'org', columns: pmColumns('en') });
  expect(b.status).toBe(201);
  board = b.json.board.id;
});

describe('presets', () => {
  it('has the nine PM stages with only done finished, and the Fibonacci scale', () => {
    const cols = pmColumns('tr');
    expect(cols.map((c) => c.key)).toEqual([...PM_STAGE_KEYS]);
    expect(cols).toHaveLength(9);
    expect(cols.filter((c) => c.done).map((c) => c.key)).toEqual(['done']);
    expect(cols.every((c) => c.name.length > 0)).toBe(true);
    expect([...FIBONACCI]).toEqual([1, 2, 3, 5, 8, 13, 21]);
  });
});

describe('sprints', () => {
  it('creates, lists, updates and archives a sprint', async () => {
    const s = await mkSprint('Sprint 1', { goal: 'Ship it', startsOn: '2026-12-01', endsOn: '2026-12-14' });
    expect(s).toMatchObject({ name: 'Sprint 1', state: 'future', goal: 'Ship it', startsOn: '2026-12-01', endsOn: '2026-12-14', boardId: board });
    const upd = await mert.patch(`/api/sprints/${s.id}`, { name: 'Sprint One', endsOn: '2026-12-15' });
    expect(upd.json.sprint).toMatchObject({ name: 'Sprint One', endsOn: '2026-12-15', startsOn: '2026-12-01' });
    expect((await mert.patch(`/api/sprints/${s.id}`, { endsOn: '2026-11-01' })).status).toBe(400);
    expect((await mert.post(`/api/boards/${board}/sprints`, { name: '' })).status).toBe(400);
    const list = (await mert.get(`/api/boards/${board}/sprints`)).json.sprints as Sprint[];
    expect(list.map((x) => x.id)).toContain(s.id);
    expect((await mert.del(`/api/sprints/${s.id}`)).status).toBe(200);
    expect(((await mert.get(`/api/boards/${board}/sprints`)).json.sprints as Sprint[]).map((x) => x.id)).not.toContain(s.id);
    expect((await mert.get(`/api/sprints/${s.id}`)).status).toBe(404);
  });

  it('lets only one sprint be active on a board', async () => {
    const a = await mkSprint('A');
    const b = await mkSprint('B');
    expect((await mert.put(`/api/sprints/${a.id}/state`, { state: 'active' })).json.sprint.state).toBe('active');
    const second = await mert.put(`/api/sprints/${b.id}/state`, { state: 'active' });
    expect(second.status).toBe(409);
    expect(second.json.reason).toBe('sprint_active');
    // Closing the first frees the slot.
    expect((await mert.put(`/api/sprints/${a.id}/state`, { state: 'closed' })).json.sprint.state).toBe('closed');
    expect((await mert.put(`/api/sprints/${b.id}/state`, { state: 'active' })).status).toBe(200);
    expect((await mert.put(`/api/sprints/${b.id}/state`, { state: 'closed' })).status).toBe(200);
  });

  it('keeps viewers read-only', async () => {
    const r = await sofia.post(`/api/boards/${board}/sprints`, { name: 'Nope' });
    expect(r.status).toBe(403);
  });
});

describe('items, backlog, epics and points', () => {
  it('assigns and removes items, and the backlog follows', async () => {
    const t1 = await mk('Backlog item one');
    const t2 = await mk('Backlog item two');
    const s = await mkSprint('Items sprint');
    const ids = (r: { json: { tasks: Task[] } }) => r.json.tasks.map((t) => t.id);
    let backlog = ids(await mert.get(`/api/boards/${board}/backlog`));
    expect(backlog).toEqual(expect.arrayContaining([t1.id, t2.id]));
    const add = await mert.put(`/api/sprints/${s.id}/items`, { taskIds: [t1.id] });
    expect(add.json.tasks[0]).toMatchObject({ id: t1.id, sprintId: s.id, version: t1.version + 1 });
    backlog = ids(await mert.get(`/api/boards/${board}/backlog`));
    expect(backlog).toContain(t2.id);
    expect(backlog).not.toContain(t1.id);
    expect(ids(await mert.get(`/api/sprints/${s.id}/items`))).toEqual([t1.id]);
    // A task from another board cannot be added.
    const other = (await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Elsewhere' })).json.task as Task;
    expect((await mert.put(`/api/sprints/${s.id}/items`, { taskIds: [other.id] })).status).toBe(400);
    expect((await mert.del(`/api/sprints/${s.id}/items/${t1.id}`)).json.task.sprintId).toBeNull();
    expect(ids(await mert.get(`/api/sprints/${s.id}/items`))).toEqual([]);
    expect(ids(await mert.get(`/api/boards/${board}/backlog`))).toContain(t1.id);
    // Archiving a sprint returns its items to the backlog.
    await mert.put(`/api/sprints/${s.id}/items`, { taskIds: [t2.id] });
    await mert.del(`/api/sprints/${s.id}`);
    expect(ids(await mert.get(`/api/boards/${board}/backlog`))).toContain(t2.id);
  });

  it('sets issue type and points with optimistic concurrency, and validates epic links', async () => {
    const epic = await mk('Checkout revamp');
    const story = await mk('Pay with card');
    const e = await pm(epic, { issueType: 'epic' });
    expect(e.json.task).toMatchObject({ issueType: 'epic', version: epic.version + 1 });
    const s = await pm(story, { issueType: 'story', storyPoints: 5, epicId: epic.id });
    expect(s.json.task).toMatchObject({ issueType: 'story', storyPoints: 5, epicId: epic.id });
    expect((await mert.get(`/api/boards/${board}/epics`)).json.epics.find((x: Task & { childCount: number }) => x.id === epic.id).childCount).toBe(1);
    // Stale version: 409 with the current task.
    const stale = await pm(story, { storyPoints: 8 });
    expect(stale.status).toBe(409);
    expect(stale.json.current.storyPoints).toBe(5);
    // Epic must be an epic, on the same board.
    const plain = await mk('Not an epic');
    expect((await pm(s.json.task, { epicId: plain.id })).status).toBe(400);
    const elsewhere = (await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Epic elsewhere' })).json.task as Task;
    const ee = await mert.patch(`/api/tasks/${elsewhere.id}/pm`, { baseVersion: elsewhere.version, issueType: 'epic' });
    expect((await pm(s.json.task, { epicId: ee.json.task.id })).status).toBe(400);
    expect((await pm(s.json.task, { epicId: s.json.task.id })).status).toBe(400);
    expect((await pm(s.json.task, { storyPoints: -1 })).status).toBe(400);
    expect((await pm(s.json.task, { issueType: 'saga' })).status).toBe(400);
    // Unlinking, and demoting an epic lets its stories go.
    const un = await pm(s.json.task, { epicId: null, storyPoints: null });
    expect(un.json.task).toMatchObject({ epicId: null, storyPoints: null });
    const re = await pm(un.json.task, { epicId: epic.id });
    expect(re.json.task.epicId).toBe(epic.id);
    await pm(e.json.task, { issueType: 'task' });
    expect(((await mert.get(`/api/tasks/${story.id}`)).json.task as Task).epicId).toBeNull();
  });

  it('summarises points done versus total, and counts by issue type', async () => {
    const s = await mkSprint('Summary sprint');
    const a = await mk('A');
    const b = await mk('B');
    const c = await mk('C');
    const aa = (await pm(a, { issueType: 'story', storyPoints: 5 })).json.task as Task;
    const bb = (await pm(b, { issueType: 'bug', storyPoints: 3 })).json.task as Task;
    const cc = (await pm(c, { issueType: 'story' })).json.task as Task;
    await mert.put(`/api/sprints/${s.id}/items`, { taskIds: [a.id, b.id, c.id] });
    // Move A to the done column (version moved on when it joined the sprint).
    const cur = (await mert.get(`/api/tasks/${aa.id}`)).json.task as Task;
    expect((await mert.patch(`/api/tasks/${aa.id}`, { baseVersion: cur.version, status: 'done' })).status).toBe(200);
    void bb;
    void cc;
    const sum = (await mert.get(`/api/sprints/${s.id}/summary`)).json.summary as SprintSummary;
    expect(sum).toMatchObject({ totalPoints: 8, donePoints: 5, itemCount: 3, doneCount: 1, unestimated: 1 });
    expect(sum.byType.story).toEqual({ count: 2, done: 1, points: 5 });
    expect(sum.byType.bug).toEqual({ count: 1, done: 0, points: 3 });
    expect(sum.byType.epic.count).toBe(0);
  });
});

describe('another company', () => {
  it('cannot read or change this company’s sprints, items or tasks', async () => {
    const s = await mkSprint('Private sprint');
    const t = await mk('Private item');
    await mert.put(`/api/sprints/${s.id}/items`, { taskIds: [t.id] });
    const fresh = (await mert.get(`/api/tasks/${t.id}`)).json.task as Task;
    const calls = [
      stranger.get(`/api/sprints/${s.id}`),
      stranger.patch(`/api/sprints/${s.id}`, { name: 'Hijacked' }),
      stranger.put(`/api/sprints/${s.id}/state`, { state: 'active' }),
      stranger.get(`/api/sprints/${s.id}/items`),
      stranger.get(`/api/sprints/${s.id}/summary`),
      stranger.put(`/api/sprints/${s.id}/items`, { taskIds: [t.id] }),
      stranger.del(`/api/sprints/${s.id}/items/${t.id}`),
      stranger.del(`/api/sprints/${s.id}`),
      stranger.get(`/api/boards/${board}/sprints`),
      stranger.get(`/api/boards/${board}/backlog`),
      stranger.post(`/api/boards/${board}/sprints`, { name: 'Intruder' }),
      stranger.patch(`/api/tasks/${t.id}/pm`, { baseVersion: fresh.version, storyPoints: 99 }),
    ];
    for (const r of await Promise.all(calls)) expect(r.status).toBe(404);
    const after = (await mert.get(`/api/sprints/${s.id}`)).json.sprint as Sprint;
    expect(after.name).toBe('Private sprint');
    expect(after.state).toBe('future');
    expect(((await mert.get(`/api/tasks/${t.id}`)).json.task as Task).storyPoints).toBeNull();
  });
});
