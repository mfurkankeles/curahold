// Tasks from a file (moving in from another tool), and finished work that
// steps aside into the board's archive.
import { beforeAll, describe, expect, it } from 'vitest';
import { archiveFinished } from '../api/src/lib/scheduler';
import { columnFor, guessTaskMapping, matchPerson, parseDay, splitPeople } from '../shared/src/taskImport';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
let mert: Client;
let lena: Client;
let sofia: Client;
let board: string;

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  mert = await login(env, 'acme', 'mert@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  sofia = await login(env, 'acme', 'sofia@demo.example');
  board = env.a.boards.csBoard;
});

describe('reading a file from another tool', () => {
  it('guesses which column is what, in English and Turkish', () => {
    expect(guessTaskMapping(['Task Name', 'Notes', 'Section/Column', 'Assignee', 'Due Date', 'Start Date', 'Priority', 'Completed At', 'Tags'])).toEqual({
      title: 'Task Name',
      description: 'Notes',
      status: 'Section/Column',
      assignee: 'Assignee',
      dueDate: 'Due Date',
      startDate: 'Start Date',
      priority: 'Priority',
      doneAt: 'Completed At',
    });
    expect(guessTaskMapping(['BAŞLIK', 'Açıklama', 'Durum', 'Sorumlu', 'Son Tarih', 'Öncelik', 'Müşteri', 'İş'])).toEqual({
      title: 'BAŞLIK',
      description: 'Açıklama',
      status: 'Durum',
      assignee: 'Sorumlu',
      dueDate: 'Son Tarih',
      priority: 'Öncelik',
      account: 'Müşteri',
    });
  });

  it('reads the dates other tools write', () => {
    expect(parseDay('2027-01-15', 'en')).toBe('2027-01-15');
    expect(parseDay('2027-01-15T09:30:00.000Z', 'en')).toBe('2027-01-15');
    expect(parseDay('15.01.2027 14:30', 'tr')).toBe('2027-01-15');
    expect(parseDay('05/03/2027', 'tr')).toBe('2027-03-05');
    expect(parseDay('05/03/2027', 'en')).toBe('2027-05-03');
    expect(parseDay('31/12/2027', 'en')).toBe('2027-12-31');
    expect(parseDay('15 Jan 2027', 'en')).toBe('2027-01-15');
    expect(parseDay('January 15, 2027', 'en')).toBe('2027-01-15');
    expect(parseDay('Friday, January 15th 2027', 'en')).toBe('2027-01-15');
    expect(parseDay('15/Jan/27 3:04 PM', 'en')).toBe('2027-01-15');
    expect(parseDay('15 Ocak 2027', 'tr')).toBe('2027-01-15');
    expect(parseDay('3 Şubat 2027', 'tr')).toBe('2027-02-03');
    expect(parseDay('1800000000000', 'en')).toBe('2027-01-15');
    expect(parseDay('soon', 'en')).toBeNull();
    expect(parseDay('31.02.2027', 'tr')).toBeNull();
    expect(parseDay('', 'tr')).toBeNull();
  });

  it('finds the column, the people and what "done" means', () => {
    const columns = [
      { key: 'todo', name: 'To do' },
      { key: 'doing', name: 'In progress' },
      { key: 'done', name: 'Done', done: true },
    ];
    expect(columnFor('in progress', columns)).toBe('doing');
    expect(columnFor('TO DO', columns)).toBe('todo');
    expect(columnFor('Completed', columns)).toBe('done');
    expect(columnFor('Tamamlandı', columns)).toBe('done');
    expect(columnFor('Backlog', columns)).toBe('todo');
    expect(columnFor('Waiting for legal', columns)).toBeNull();
    // A board with its own names still knows what "in progress" means.
    const own = [
      { key: 'a', name: 'Sırada' },
      { key: 'b', name: 'Masada' },
      { key: 'c', name: 'Bitti', done: true },
    ];
    expect(columnFor('In Progress', own)).toBe('b');
    expect(columnFor('Devam ediyor', own)).toBe('b');
    expect(columnFor('Not started', own)).toBe('a');
    expect(columnFor('bitti', own)).toBe('c');
    expect(columnFor('', columns)).toBeNull();
    expect(splitPeople('Ada Demir; lena@demo.example & Mert')).toEqual(['Ada Demir', 'lena@demo.example', 'Mert']);
    const people = [
      { id: '1', name: 'Ada Demir', email: 'ada@demo.example' },
      { id: '2', name: 'Lena Fischer', email: 'lena@demo.example' },
      { id: '3', name: 'Lena Braun', email: 'lb@demo.example' },
    ];
    expect(matchPerson('ADA DEMİR', people)).toBe('1');
    expect(matchPerson('Lena@Demo.example', people)).toBe('2');
    expect(matchPerson('ada', people)).toBe('1');
    // Two Lenas: a first name alone is not enough.
    expect(matchPerson('Lena', people)).toBeNull();
    expect(matchPerson('Nobody', people)).toBeNull();
  });
});

describe('importing tasks onto a board', () => {
  const rows = [
    { Name: 'Send the renewal offer', Notes: 'Start from last year', Section: 'In progress', Owner: 'lena@demo.example', Due: '15.01.2027', Prio: 'High', Customer: 'quillfield retail' },
    { Name: 'Prepare the usage report', Notes: '', Section: 'Parked', Owner: 'Mert; Someone Else', Due: 'whenever', Prio: '', Customer: 'Unknown Co' },
    { Name: 'Kick-off call', Notes: '', Section: 'Done', Owner: 'Ada', Due: '10.12.2026', Prio: 'urgent', Customer: '' },
    { Name: '', Notes: 'a row with no title', Section: '', Owner: '', Due: '', Prio: '', Customer: '' },
    { Name: '', Notes: '', Section: '', Owner: '', Due: '', Prio: '', Customer: '' },
  ];
  const mapping = { title: 'Name', description: 'Notes', status: 'Section', assignee: 'Owner', dueDate: 'Due', priority: 'Prio', account: 'Customer' };

  it('creates them quietly, says what did not fit, and can be undone', async () => {
    const unreadBefore = (await lena.get('/api/pulse')).json.unread;
    const r = await lena.post(`/api/boards/${board}/import`, { fileName: 'old-tool.csv', rows, mapping, locale: 'tr' });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ created: 2, skipped: 2, finished: 1 });
    expect(r.json.errors).toEqual([
      { row: 3, reason: 'date' },
      { row: 5, reason: 'title' },
    ]);
    expect(r.json.unmatched).toEqual({
      people: [{ name: 'Someone Else', count: 1 }],
      accounts: [{ name: 'Unknown Co', count: 1 }],
      statuses: [{ name: 'Parked', count: 1 }],
    });
    const tasks = (await lena.get(`/api/boards/${board}/tasks`)).json.tasks;
    const offer = tasks.find((t: any) => t.title === 'Send the renewal offer');
    expect(offer).toMatchObject({ status: 'doing', dueDate: '2027-01-15', priority: 'high', assigneeIds: [env.a.ids.lena], accountId: env.a.accounts['Quillfield Retail'], description: 'Start from last year' });
    const report = tasks.find((t: any) => t.title === 'Prepare the usage report');
    expect(report).toMatchObject({ status: 'todo', dueDate: null, priority: 'normal', assigneeIds: [env.a.ids.mert], accountId: null });
    expect(tasks.some((t: any) => t.title === 'Kick-off call')).toBe(false);
    // Moving house is not news: nobody was notified, and the history says where it came from.
    await env.settle();
    const told = await env.db.system((q) => q.query(`select 1 from notifications where task_id = any($1::uuid[])`, [[offer.id, report.id]]));
    expect(told.length).toBe(0);
    expect((await lena.get('/api/pulse')).json.unread).toBe(unreadBefore);
    expect((await lena.get(`/api/tasks/${offer.id}`)).json.task.events[0]).toMatchObject({ kind: 'created', data: { import: true } });

    // Someone works on one of them; then the import is undone.
    await mert.post(`/api/tasks/${report.id}/comments`, { body: 'I have the numbers.' });
    const mine = (await lena.get(`/api/boards/${board}/imports`)).json.imports;
    expect(mine[0]).toMatchObject({ id: r.json.batch, fileName: 'old-tool.csv', created: 2, undoable: true });
    // It is the importer's to undo, not anyone's.
    expect((await mert.post(`/api/task-imports/${r.json.batch}/undo`)).status).toBe(404);
    const undo = await lena.post(`/api/task-imports/${r.json.batch}/undo`);
    expect(undo.json).toMatchObject({ removed: 1, archived: 1 });
    const after = (await lena.get(`/api/boards/${board}/tasks`)).json.tasks;
    expect(after.some((t: any) => t.id === offer.id || t.id === report.id)).toBe(false);
    const archive = (await lena.get(`/api/boards/${board}/tasks?archived=1`)).json;
    expect(archive.tasks.map((t: any) => t.id)).toContain(report.id);
    expect((await lena.post(`/api/task-imports/${r.json.batch}/undo`)).status).toBe(404);
    expect((await lena.get(`/api/boards/${board}/imports`)).json.imports[0].undoable).toBe(false);
  });

  it('brings finished tasks when asked, finished when the file says', async () => {
    const r = await lena.post(`/api/boards/${board}/import`, {
      rows: [
        { T: 'Old onboarding', S: 'Completed', D: '2026-09-01', C: '2026-09-03' },
        { T: 'Closed by a date alone', S: '', D: '', C: '12 Aug 2026' },
        { T: 'Starts after it ends', S: '', D: '2027-01-10', B: '2027-02-01' },
      ],
      mapping: { title: 'T', status: 'S', dueDate: 'D', doneAt: 'C', startDate: 'B' },
      includeDone: true,
    });
    expect(r.json).toMatchObject({ created: 3, finished: 0 });
    expect(r.json.errors).toEqual([{ row: 4, reason: 'dates' }]);
    const rowsDb = await env.db.system((q) => q.query(`select title, status, done_at, start_date from tasks where id = any(select unnest(created_ids) from import_batches where id = $1) order by title`, [r.json.batch]));
    expect(rowsDb.map((x) => [x.title, x.status, x.done_at ? new Date(x.done_at).toISOString().slice(0, 10) : null])).toEqual([
      ['Closed by a date alone', 'done', '2026-08-12'],
      ['Old onboarding', 'done', '2026-09-03'],
      ['Starts after it ends', 'todo', null],
    ]);
    expect(rowsDb[2].start_date).toBeNull();
  });

  it('needs a seat that can write, a title column, and a board the person can see', async () => {
    expect((await sofia.post(`/api/boards/${board}/import`, { rows: [{ T: 'x' }], mapping: { title: 'T' } })).status).toBe(403);
    expect((await lena.post(`/api/boards/${board}/import`, { rows: [{ T: 'x' }], mapping: {} })).status).toBe(400);
    expect((await lena.post(`/api/boards/${env.a.boards.privateBoard}/import`, { rows: [{ T: 'x' }], mapping: { title: 'T' } })).status).toBe(404);
    expect((await lena.post(`/api/boards/${env.b.boards.csBoard}/import`, { rows: [{ T: 'x' }], mapping: { title: 'T' } })).status).toBe(404);
  });

  it('takes a few thousand rows in one go, in the file’s order', async () => {
    const many = Array.from({ length: 1200 }, (_, i) => ({ T: `Bulk ${String(i).padStart(4, '0')}` }));
    const b = (await ada.post('/api/boards', { name: 'Migration', visibility: 'org' })).json.board;
    const r = await ada.post(`/api/boards/${b.id}/import`, { rows: many, mapping: { title: 'T' } });
    expect(r.json.created).toBe(1200);
    const tasks = (await ada.get(`/api/boards/${b.id}/tasks`)).json.tasks;
    expect(tasks.length).toBe(1200);
    expect(tasks[0].title).toBe('Bulk 0000');
    expect(tasks[1199].title).toBe('Bulk 1199');
    expect((await ada.post(`/api/task-imports/${r.json.batch}/undo`)).json).toMatchObject({ removed: 1200, archived: 0 });
  });
});

describe('the archive', () => {
  const NIGHT = new Date('2030-06-01T03:00:00Z');
  const ago = (id: string, days: number) =>
    env.db.system((q) => q.query(`update tasks set done_at = $2::timestamptz - make_interval(days => $3::int), updated_at = $2::timestamptz - make_interval(days => $3::int) where id = $1`, [id, NIGHT.toISOString(), days]));
  const mk = async (title: string, status = 'done') => (await mert.post('/api/tasks', { boardId: board, title, status, assigneeIds: [env.a.ids.lena] })).json.task;

  it('finished tasks leave the board after the days it keeps them, and still count', async () => {
    expect((await mert.get('/api/boards')).json.boards.find((b: any) => b.id === board).archiveDays).toBe(90);
    expect((await mert.patch(`/api/boards/${board}`, { archiveDays: 30 })).json.board.archiveDays).toBe(30);
    expect((await mert.patch(`/api/boards/${board}`, { archiveDays: 3 })).status).toBe(400);
    const old = await mk('Finished long ago');
    const recent = await mk('Finished last week');
    const open = await mk('Still open', 'todo');
    await ago(old.id, 40);
    await ago(recent.id, 7);
    await env.db.system((q) => q.query(`update tasks set updated_at = $2::timestamptz - interval '200 days' where id = $1`, [open.id, NIGHT.toISOString()]));
    env.clock.now = NIGHT;
    const n = await archiveFinished(env.deps, NIGHT);
    expect(n).toBeGreaterThan(0);
    const onBoard = (await mert.get(`/api/boards/${board}/tasks`)).json.tasks.map((t: any) => t.id);
    expect(onBoard).not.toContain(old.id);
    expect(onBoard).toContain(recent.id);
    expect(onBoard).toContain(open.id);
    const archive = (await mert.get(`/api/boards/${board}/tasks?archived=1&q=long ago`)).json;
    expect(archive.tasks.map((t: any) => t.id)).toEqual([old.id]);
    expect(archive.tasks[0].archivedAt).toBeTruthy();
    // A second night changes nothing.
    expect(await archiveFinished(env.deps, NIGHT)).toBe(0);

    // Brought back, it stays (it was touched today), and its history tells the story.
    const back = await mert.post('/api/tasks/bulk', { ids: [old.id], archived: false });
    expect(back.json.updated).toBe(1);
    expect((await mert.get(`/api/boards/${board}/tasks`)).json.tasks.map((t: any) => t.id)).toContain(old.id);
    const kinds = (await mert.get(`/api/tasks/${old.id}`)).json.task.events.map((e: any) => e.kind);
    expect(kinds).toContain('archived');
    expect(kinds).toContain('restored');
    env.clock.now = null;
  });

  it('a board that keeps everything is left alone, and archived finished work still counts in reports', async () => {
    const b = (await ada.post('/api/boards', { name: 'Keeps all', visibility: 'org', archiveDays: null })).json.board;
    expect(b.archiveDays).toBeNull();
    const t = (await ada.post('/api/tasks', { boardId: b.id, title: 'Ancient', status: 'done', assigneeIds: [env.a.ids.ada] })).json.task;
    await ago(t.id, 400);
    await archiveFinished(env.deps, NIGHT);
    expect((await ada.get(`/api/boards/${b.id}/tasks`)).json.tasks.map((x: any) => x.id)).toContain(t.id);

    // Finished ten days ago and put away by hand: still one of the last 30 days' finished tasks.
    const c = (await ada.post('/api/boards', { name: 'Counting', visibility: 'org' })).json.board;
    const d = (await ada.post('/api/tasks', { boardId: c.id, title: 'Done and archived', status: 'done', assigneeIds: [env.a.ids.ada] })).json.task;
    const stray = (await ada.post('/api/tasks', { boardId: c.id, title: 'Open and archived' })).json.task;
    await env.db.system((q) => q.query(`update tasks set done_at = now() - interval '10 days' where id = $1`, [d.id]));
    await ada.post('/api/tasks/bulk', { ids: [d.id, stray.id], archived: true });
    const report = (await ada.get(`/api/reports/work?board=${c.id}`)).json;
    expect(report.totals).toMatchObject({ done30: 1, open: 0 });
  });
});
