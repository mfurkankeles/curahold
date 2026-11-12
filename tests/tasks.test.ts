import { beforeAll, describe, expect, it } from 'vitest';
import { mergeTaskEdit } from '../shared/src/merge';
import type { Task } from '../shared/src/model';
import { login, setup, type Client, type Env } from './helpers';

let env: Env;
let mert: Client;
let zeynep: Client;
beforeAll(async () => {
  env = await setup();
  mert = await login(env, 'acme', 'mert@demo.example');
  zeynep = await login(env, 'acme', 'zeynep@demo.example');
});

describe('tasks', () => {
  it('creates a task in the first column by default', async () => {
    const r = await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Call the champion', assigneeIds: [env.a.ids.lena], dueDate: '2026-12-01', accountId: env.a.accounts['Quillfield Retail'] });
    expect(r.status).toBe(201);
    expect(r.json.task).toMatchObject({ status: 'todo', version: 1, dueDate: '2026-12-01', accountId: env.a.accounts['Quillfield Retail'], accountName: 'Quillfield Retail', assigneeIds: [env.a.ids.lena] });
  });

  it('refuses a column that is not on the board', async () => {
    const r = await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'x', status: 'nope' });
    expect(r.json.error).toBe('bad_status');
  });

  it('refuses assignees from another company, viewers and strangers', async () => {
    for (const id of [env.b.ids.mert, env.a.ids.sofia, '00000000-0000-0000-0000-000000000000']) {
      const r = await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'x', assigneeIds: [id] });
      expect(r.json.error).toBe('bad_assignee');
    }
  });

  it('validates input and names the bad fields', async () => {
    const r = await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: '', dueDate: '01/12/2026' });
    expect(r.status).toBe(400);
    expect(r.json.fields).toEqual(expect.arrayContaining(['title', 'dueDate']));
  });

  it('lists a board with subtask and comment counts', async () => {
    const list = (await mert.get(`/api/boards/${env.a.boards.csBoard}/tasks`)).json.tasks as Task[];
    const qbr = list.find((t) => t.title.startsWith('Prepare the quarterly'))!;
    expect(qbr.subtaskCount).toBe(3);
    expect(qbr.subtaskDone).toBe(1);
    expect(qbr.commentCount).toBe(1);
    expect(list.every((t) => t.parentId === null)).toBe(true);
  });

  it('opens a task with subtasks, comments and files', async () => {
    const list = (await mert.get(`/api/boards/${env.a.boards.csBoard}/tasks`)).json.tasks as Task[];
    const qbr = list.find((t) => t.title.startsWith('Prepare the quarterly'))!;
    const d = (await zeynep.get(`/api/tasks/${qbr.id}`)).json.task;
    expect(d.subtasks).toHaveLength(3);
    expect(d.comments[0].mentions).toEqual([env.a.ids.zeynep]);
  });

  it("my tasks and the calendar only return what I may see", async () => {
    const mine = (await zeynep.get('/api/tasks?assignee=me')).json.tasks as Task[];
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((t) => t.assigneeIds.includes(env.a.ids.zeynep))).toBe(true);
    const omar = await login(env, 'acme', 'omar@demo.example');
    const cal = (await omar.get('/api/tasks?from=2000-01-01&to=2100-01-01')).json.tasks as Task[];
    expect(cal.every((t) => t.boardId === env.a.boards.renewals)).toBe(true);
  });
});

describe('two people editing at once', () => {
  it('never overwrites silently: the second save gets 409 with the current task', async () => {
    const t = (await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Shared task' })).json.task;
    const a = await mert.patch(`/api/tasks/${t.id}`, { baseVersion: 1, title: 'Mert title' });
    expect(a.status).toBe(200);
    expect(a.json.task.version).toBe(2);
    const b = await zeynep.patch(`/api/tasks/${t.id}`, { baseVersion: 1, priority: 'high' });
    expect(b.status).toBe(409);
    expect(b.json.error).toBe('conflict');
    expect(b.json.current.title).toBe('Mert title');

    // The app merges: Zeynep's priority goes on top of Mert's title.
    const { reapply, conflicts } = mergeTaskEdit(t, { priority: 'high' }, b.json.current);
    expect(conflicts).toEqual([]);
    const c = await zeynep.patch(`/api/tasks/${t.id}`, { baseVersion: b.json.current.version, ...reapply });
    expect(c.json.task).toMatchObject({ title: 'Mert title', priority: 'high', version: 3 });
  });

  it('reports a real conflict when both changed the same field', () => {
    const base = { title: 'A', priority: 'normal' } as Task;
    const current = { title: 'B', priority: 'normal' } as Task;
    expect(mergeTaskEdit(base, { title: 'C' }, current).conflicts).toEqual(['title']);
    expect(mergeTaskEdit(base, { title: 'B' }, current).conflicts).toEqual([]);
  });

  it('keeps every comment when two people comment at once', async () => {
    const t = (await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Busy thread' })).json.task;
    await Promise.all([
      mert.post(`/api/tasks/${t.id}/comments`, { body: 'one' }),
      zeynep.post(`/api/tasks/${t.id}/comments`, { body: 'two' }),
      mert.post(`/api/tasks/${t.id}/comments`, { body: 'three' }),
    ]);
    const d = (await mert.get(`/api/tasks/${t.id}`)).json.task;
    expect(d.comments.map((c: any) => c.body).sort()).toEqual(['one', 'three', 'two']);
  });
});

describe('subtasks, comments, files, deleting', () => {
  it('adds subtasks under a task on the same board only', async () => {
    const parent = (await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Parent' })).json.task;
    const sub = await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, parentId: parent.id, title: 'Child' });
    expect(sub.status).toBe(201);
    // A subtask says which task it is a step of (the panel's way back); a task on its own has none.
    expect((await mert.get(`/api/tasks/${sub.json.task.id}`)).json.task.parent).toEqual({ id: parent.id, title: 'Parent' });
    expect((await mert.get(`/api/tasks/${parent.id}`)).json.task.parent).toBeNull();
    const wrong = await mert.post('/api/tasks', { boardId: env.a.boards.renewals, parentId: parent.id, title: 'Child' });
    expect(wrong.json.error).toBe('validation');
  });

  it('keeps only valid mentions from this company', async () => {
    const t = (await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Mentions' })).json.task;
    const body = `hi @[Lena](${env.a.ids.lena}) and @[Other](${env.b.ids.lena})`;
    const r = await mert.post(`/api/tasks/${t.id}/comments`, { body });
    expect(r.json.comment.mentions).toEqual([env.a.ids.lena]);
  });

  it('uploads, downloads and protects files', async () => {
    const t = (await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'With file' })).json.task;
    const form = new FormData();
    form.append('file', new File(['hello curahold'], 'notes ü.txt', { type: 'text/plain' }));
    const up = await mert.req('POST', `/api/tasks/${t.id}/files`, form);
    expect(up.status).toBe(201);
    const down = await zeynep.get(`/api/files/${up.json.file.id}`);
    expect(down.json).toBe('hello curahold');
    expect(down.headers.get('content-disposition')).toContain("filename*=UTF-8''notes%20%C3%BC.txt");
    const omar = await login(env, 'acme', 'omar@demo.example'); // not on the CS board
    expect((await omar.get(`/api/files/${up.json.file.id}`)).status).toBe(404);
    const other = await login(env, 'beta', 'ada@demo.example');
    expect((await other.get(`/api/files/${up.json.file.id}`)).status).toBe(404);
  });

  it('refuses a file over the limit', async () => {
    const t = (await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Big' })).json.task;
    const form = new FormData();
    form.append('file', new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.bin'));
    const r = await mert.req('POST', `/api/tasks/${t.id}/files`, form);
    expect(r.status).toBe(413);
  });

  it("only the creator or a permitted role deletes a task; its files leave storage when the trash lets go of it", async () => {
    const t = (await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'To delete' })).json.task;
    const form = new FormData();
    form.append('file', new File(['x'], 'x.txt'));
    const up = await mert.req('POST', `/api/tasks/${t.id}/files`, form);
    const key = (await env.db.system((q) => q.query('select storage_key from files where id = $1', [up.json.file.id])))[0].storage_key;
    expect((await zeynep.del(`/api/tasks/${t.id}`)).status).toBe(403);
    const gone = await mert.del(`/api/tasks/${t.id}`);
    expect(gone.status).toBe(200);
    expect((await mert.get(`/api/tasks/${t.id}`)).status).toBe(404);
    // In the trash for 30 days: the file is kept so the task can come back whole (tests/trash.test.ts).
    expect(env.storage.has(key)).toBe(true);
    const ada = await login(env, 'acme', 'ada@demo.example');
    expect((await ada.del(`/api/trash/${gone.json.trashId}`)).status).toBe(200);
    expect(env.storage.has(key)).toBe(false);
  });
});

describe('boards', () => {
  it('removing a column moves its tasks to the first column', async () => {
    const b = (await mert.post('/api/boards', { name: 'Temp', visibility: 'private' })).json.board;
    const t = (await mert.post('/api/tasks', { boardId: b.id, title: 'x', status: 'doing' })).json.task;
    const cols = b.columns.filter((c: any) => c.key !== 'doing');
    const r = await mert.patch(`/api/boards/${b.id}`, { columns: cols });
    expect(r.status).toBe(200);
    expect((await mert.get(`/api/tasks/${t.id}`)).json.task.status).toBe('todo');
  });

  it('only administrators may create company-wide boards', async () => {
    expect((await zeynep.post('/api/boards', { name: 'All', visibility: 'org' })).status).toBe(403);
    const ada = await login(env, 'acme', 'ada@demo.example');
    expect((await ada.post('/api/boards', { name: 'All hands', visibility: 'org' })).status).toBe(201);
  });

  it('a team board needs a team you belong to', async () => {
    const teams = (await zeynep.get('/api/people')).json.teams;
    const am = teams.find((t: any) => t.name === 'Account Management');
    expect((await zeynep.post('/api/boards', { name: 'X', visibility: 'team', teamId: am.id })).status).toBe(403);
    const cs = teams.find((t: any) => t.name === 'Customer Success');
    expect((await zeynep.post('/api/boards', { name: 'CS side board', visibility: 'team', teamId: cs.id })).status).toBe(201);
  });

  it('a member cannot change a board they did not create', async () => {
    expect((await zeynep.patch(`/api/boards/${env.a.boards.csBoard}`, { name: 'Mine now' })).status).toBe(403);
    expect((await mert.patch(`/api/boards/${env.a.boards.csBoard}`, { name: 'CS — General' })).status).toBe(200);
  });
});
