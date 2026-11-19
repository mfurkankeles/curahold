// Import 2.0: reading the shapes other tools export, planning what comes in
// (dry run), and the import onto several boards with sub-tasks, comments,
// fields and "waits for" links — and its undo.
import { beforeAll, describe, expect, it } from 'vitest';
import { SECTION_COLUMN, columnsFromStatuses, departmentOf, guessImportMapping, inferField, planImport, shapeBoardJson, shapeMatrix, suggestTargets, type ImportRow } from '../shared/src/importPlan';
import { Client, login, setup, type Env } from './helpers';

const cols = [
  { key: 'todo', name: 'To do', done: false },
  { key: 'doing', name: 'In progress', done: false },
  { key: 'done', name: 'Done', done: true },
];
let n = 0;
const ctx = (over: any = {}) => ({
  boards: [{ key: 'b:one', id: 'one', name: 'CS — General', columns: cols, taskFields: [], canAddFields: true }],
  people: [{ id: 'p1', name: 'Ada Demir', email: 'ada@demo.example' }],
  accounts: [{ id: 'a1', name: 'Quillfield Retail' }],
  today: '2026-11-19',
  newId: () => `t${++n}`,
  fallbackColumns: cols,
  ...over,
});
const rows = (list: Record<string, string>[]): ImportRow[] => list.map((c, i) => ({ n: i + 2, c }));

describe('the shapes of exported files', () => {
  it('reads a grouped export: title line, groups with repeated headings, indented sub-items', () => {
    const s = shapeMatrix([
      ['Team plan'],
      [],
      ['This week'],
      ['Name', 'Person', 'Status', 'Date'],
      ['Renewal deck', 'Ada', 'Working on it', '2027-01-10'],
      ['', 'Subitems', 'Owner', 'Status'],
      ['', 'Pull usage numbers', 'Ada', 'Done'],
      ['', 'Draft the slides', '', 'Working on it'],
      ['Kick-off', 'Mert', 'Stuck', ''],
      ['Next week'],
      ['Name', 'Person', 'Status', 'Date'],
      ['QBR prep', '', '', '2027-01-20'],
    ]);
    expect(s.layout).toBe('nested');
    expect(s.title).toBe('Team plan');
    expect(s.sections).toBe(2);
    expect(s.nested).toBe(2);
    expect(s.headers).toEqual(['Name', 'Person', 'Status', 'Date', 'Owner', SECTION_COLUMN]);
    expect(s.rows.map((r) => [r.c.Name, r.c[SECTION_COLUMN], r.p])).toEqual([
      ['Renewal deck', 'This week', undefined],
      ['Pull usage numbers', 'This week', 0],
      ['Draft the slides', 'This week', 0],
      ['Kick-off', 'This week', undefined],
      ['QBR prep', 'Next week', undefined],
    ]);
    expect(s.rows[1].c).toMatchObject({ Owner: 'Ada', Status: 'Done' });
  });

  it('keeps a plain table plain, and a one-cell task row is a task', () => {
    const s = shapeMatrix([['Title', 'Status', 'Due'], ['Call Velto', 'To do', ''], ['Just a title', '', '']]);
    expect(s.layout).toBe('table');
    expect(s.rows.map((r) => r.c.Title)).toEqual(['Call Velto', 'Just a title']);
  });

  it('reads a kanban board export: lists are columns, checklist items sub-tasks, comments comments', () => {
    const s = shapeBoardJson({
      name: 'Onboarding',
      lists: [{ id: 'l1', name: 'Doing' }, { id: 'l2', name: 'Old', closed: true }],
      members: [{ id: 'm1', fullName: 'Ada Demir' }],
      cards: [
        { id: 'c1', name: 'Kick-off call', idList: 'l1', idMembers: ['m1'], labels: [{ name: 'Gold' }], due: '2027-02-01T10:00:00.000Z' },
        { id: 'c2', name: 'Archived', idList: 'l1', closed: true },
        { id: 'c3', name: 'In a closed list', idList: 'l2' },
      ],
      checklists: [{ idCard: 'c1', checkItems: [{ name: 'Send agenda', state: 'complete' }] }],
      actions: [{ type: 'commentCard', idMemberCreator: 'm1', data: { card: { id: 'c1' }, text: 'Booked for Monday' } }],
    })!;
    expect(s.rows).toHaveLength(2);
    expect(s.rows[0].c).toMatchObject({ Name: 'Kick-off call', List: 'Doing', Board: 'Onboarding', Members: 'Ada Demir', Labels: 'Gold', Due: '2027-02-01', Comments: 'Ada Demir: Booked for Monday' });
    expect(s.rows[1]).toMatchObject({ p: 0, c: { Name: 'Send agenda', Completed: 'yes' } });
    expect(shapeBoardJson({ hello: 1 })).toBeNull();
  });

  it('guesses where each column goes, telling a list from a status', () => {
    expect(guessImportMapping(['Task Name', 'List Name', 'Status', 'Task ID', 'Parent ID', 'Comments', 'Depends on', 'Story Points', 'Region'])).toEqual({
      'Task Name': 'title',
      'List Name': 'list',
      Status: 'status',
      'Task ID': 'ref',
      'Parent ID': 'parent',
      Comments: 'comments',
      'Depends on': 'dependsOn',
      'Story Points': 'points',
      Region: 'skip',
    });
    // A kanban CSV: the list IS the column.
    expect(guessImportMapping(['Card Name', 'List Name'])).toMatchObject({ 'List Name': 'status' });
    expect(guessImportMapping(['Name', 'Status', SECTION_COLUMN])[SECTION_COLUMN]).toBe('list');
    expect(guessImportMapping(['Name', SECTION_COLUMN])[SECTION_COLUMN]).toBe('status');
  });
});

describe('where lists go', () => {
  it('reads a department from a list name, whole words only', () => {
    expect(departmentOf('Renewals Q1')).toBe('success');
    expect(departmentOf('Bug backlog')).toBe('product');
    expect(departmentOf('Faturalar 2027')).toBe('finance');
    expect(departmentOf('Onboarding - Velto')).toBe('onboarding');
    expect(departmentOf('Inside sales leads')).toBe('inside');
    expect(departmentOf('Wholesale partners')).toBeNull();
  });

  it('merges many lists into a handful of department boards', () => {
    const lists = ['Renewals', 'Support escalations', 'QBRs', 'Bugs', 'Roadmap', 'Invoices', 'Misc'].map((name) => ({ name, rows: 3 }));
    const t = suggestTargets(lists, [{ id: 'cs', name: 'Customer Success' }], { from: 'here', fileTitle: 'export.csv', locale: 'en' });
    expect(t.Renewals).toEqual({ board: 'cs' });
    expect(t['Support escalations']).toEqual({ board: 'cs' });
    expect(t.QBRs).toEqual({ board: 'cs' });
    expect(t.Bugs).toEqual({ create: 'Product' });
    expect(t.Roadmap).toEqual({ create: 'Product' });
    expect(t.Invoices).toEqual({ create: 'Finance' });
    expect(t.Misc).toEqual({ board: 'here' });
    expect(suggestTargets(lists, [], { from: null, fileTitle: 'x', locale: 'en', keepEach: true }).Misc).toEqual({ create: 'Misc' });
  });

  it('builds a new board’s columns from the file’s statuses', () => {
    expect(columnsFromStatuses(['Doing', 'Backlog', 'Done', 'Parked', 'Review', 'doing'], cols).map((c) => [c.name, c.done])).toEqual([
      ['Backlog', false],
      ['Doing', false],
      ['Review', false],
      ['Parked', false],
      ['Done', true],
    ]);
    expect(columnsFromStatuses(['Open'], cols)).toBe(cols);
  });

  it('types a custom column from its values', () => {
    const taken = new Set<string>();
    expect(inferField('Effort', ['3', '5', '', '8'], 'en', taken).type).toBe('number');
    expect(inferField('Region', ['EU', 'EU', 'US', 'US', 'EU'], 'en', taken)).toMatchObject({ type: 'select', options: [{ key: 'eu' }, { key: 'us' }] });
    expect(inferField('Go-live', ['2027-01-05', '15 Jan 2027'], 'en', taken).type).toBe('date');
    expect(inferField('Notes 2', ['free words', 'more words'], 'en', taken).type).toBe('text');
    expect(inferField('Effort', ['1'], 'en', taken).key).toBe('effort_2');
  });
});

describe('the plan (dry run)', () => {
  it('brings sub-tasks, comments, fields and dependencies, and says what stays behind', () => {
    const r = rows([
      { ID: '1', Name: 'Renewal deck', Status: 'In progress', List: 'Renewals', Owner: 'Ada', Region: 'EU', Comments: 'First note\n\nSecond note', Pts: '5' },
      { ID: '2', Name: 'Pull usage', Parent: '1', Status: 'Done', List: 'Renewals' },
      { ID: '3', Name: 'Send deck', Status: 'To do', List: 'Renewals', Waits: '1, 99', Region: 'US' },
      { ID: '4', Name: 'Fix login bug', Status: 'Done', List: 'Bugs', Pts: 'lots' },
      { ID: '5', Name: '', Status: 'To do', List: 'Bugs' },
      { ID: '6', Name: 'Loop A', List: 'Bugs', Waits: '7' },
      { ID: '7', Name: 'Loop B', List: 'Bugs', Waits: '6', Customer: 'Quillfield retail' },
    ]);
    const mapping = { ID: 'ref', Name: 'title', Status: 'status', List: 'list', Owner: 'assignee', Region: 'custom', Comments: 'comments', Pts: 'points', Parent: 'parent', Waits: 'dependsOn', Customer: 'account' } as const;
    const plan = planImport({ rows: r, mapping, targets: { Renewals: { board: 'one' }, Bugs: { create: 'Product' } }, locale: 'en', includeDone: false }, ctx());
    expect(plan.report.totals).toEqual({ tasks: 4, subtasks: 0, comments: 2, links: 2, fields: 1 });
    expect(plan.report.left).toEqual(
      expect.arrayContaining([
        { reason: 'finished', n: 2, rows: [5, 3] },
        { reason: 'title', n: 1, rows: [6] },
        { reason: 'depends', n: 1, rows: [4] },
        { reason: 'loop', n: 1, rows: [8] },
      ]),
    );
    const deck = plan.tasks.find((t) => t.title === 'Renewal deck')!;
    expect(deck).toMatchObject({ board: 'b:one', status: 'doing', assignees: ['p1'], points: 5, fields: { region: 'EU' } });
    const send = plan.tasks.find((t) => t.title === 'Send deck')!;
    expect(plan.links).toContainEqual({ from: deck.id, to: send.id });
    expect(plan.tasks.find((t) => t.title === 'Loop B')).toMatchObject({ accountId: 'a1', board: 'n:product' });
    expect(plan.report.boards.find((b) => b.isNew)).toMatchObject({ name: 'Product', tasks: 2, columns: ['To do', 'Done'] });

    // With finished work: the sub-task comes in under its parent, on the parent's board.
    const all = planImport({ rows: r, mapping, targets: { Renewals: { board: 'one' }, Bugs: { board: 'one' } }, locale: 'en', includeDone: true }, ctx());
    const sub = all.tasks.find((t) => t.title === 'Pull usage')!;
    expect(sub).toMatchObject({ parentId: all.tasks.find((t) => t.title === 'Renewal deck')!.id, status: 'done', board: 'b:one' });
    expect(all.tasks.indexOf(sub)).toBeGreaterThan(all.tasks.findIndex((t) => t.id === sub.parentId));
    // Two lists on one board: the list each came from is kept in a choice field.
    expect(all.fields['b:one'].map((f) => f.key)).toEqual(['from_list', 'region']);
    expect(all.tasks.find((t) => t.title === 'Fix login bug')!.fields).toMatchObject({ from_list: 'bugs' });
    expect(all.report.notes).toContainEqual({ reason: 'points', n: 1, rows: [5] });
  });

  it('keeps values a board has no room for in the description', () => {
    const full = Array.from({ length: 20 }, (_, i) => ({ key: `f${i}`, label: { en: `F${i}` }, type: 'text' as const }));
    const plan = planImport(
      { rows: rows([{ T: 'One', Size: 'XL' }]), mapping: { T: 'title', Size: 'custom' }, targets: { '': { board: 'one' } }, locale: 'en', includeDone: false },
      ctx({ boards: [{ key: 'b:one', id: 'one', name: 'X', columns: cols, taskFields: full, canAddFields: true }] }),
    );
    expect(plan.tasks[0].description).toBe('Size: XL');
    expect(plan.report.notes).toContainEqual({ reason: 'fieldsFull', n: 1, rows: [2] });
  });
});

describe('the import itself', () => {
  let env: Env;
  let lena: Client;
  let sofia: Client;
  let board: string;
  beforeAll(async () => {
    env = await setup();
    lena = await login(env, 'acme', 'lena@demo.example');
    sofia = await login(env, 'acme', 'sofia@demo.example');
    board = env.a.boards.csBoard;
  });
  const file = [
    { n: 2, c: { ID: 'A', Name: 'Plan the kick-off', List: 'Onboarding', Region: 'EU', Comments: 'Booked\n\nAgenda sent' } },
    { n: 3, c: { ID: 'B', Name: 'Send the agenda', List: 'Onboarding' }, p: 0 },
    { n: 4, c: { ID: 'C', Name: 'Run the kick-off', List: 'Onboarding', Waits: 'A', Region: 'EU' } },
    { n: 5, c: { ID: 'D', Name: 'Renewal call', List: 'Renewals' } },
  ];
  const mapping = { ID: 'ref', Name: 'title', List: 'list', Region: 'custom', Comments: 'comments', Waits: 'dependsOn' };

  it('a dry run writes nothing and says what a new board will look like', async () => {
    const before = (await lena.get(`/api/boards/${board}/tasks`)).json.tasks.length;
    const r = await lena.post('/api/task-imports', { fileName: 'old.csv', rows: file, mapping, targets: { Onboarding: { create: 'Onboarding' }, Renewals: { board } }, dryRun: true });
    expect(r.status).toBe(200);
    expect(r.json.report.totals).toEqual({ tasks: 3, subtasks: 1, comments: 2, links: 1, fields: 1 });
    expect(r.json.newBoards).toEqual([expect.objectContaining({ name: 'Onboarding', taskFields: [expect.objectContaining({ key: 'region', type: 'select' })] })]);
    expect((await lena.get(`/api/boards/${board}/tasks`)).json.tasks.length).toBe(before);
    // The import itself only goes onto boards that exist.
    expect((await lena.post('/api/task-imports', { rows: file, mapping, targets: { Onboarding: { create: 'Onboarding' } } })).status).toBe(400);
  });

  it('imports onto two boards, then undoes it and puts the new board away', async () => {
    const dry = await lena.post('/api/task-imports', { rows: file, mapping, targets: { Onboarding: { create: 'Onboarding' }, Renewals: { board } }, dryRun: true });
    const nb = dry.json.newBoards[0];
    const made = await lena.post('/api/boards', { name: nb.name, visibility: 'private', columns: nb.columns, taskFields: nb.taskFields });
    expect(made.status).toBe(201);
    const id = made.json.board.id;
    const r = await lena.post('/api/task-imports', { fileName: 'old.csv', rows: file, mapping, targets: { Onboarding: { board: id }, Renewals: { board } }, createdBoards: [id] });
    expect(r.status).toBe(201);
    const tasks = (await lena.get(`/api/boards/${id}/tasks`)).json.tasks;
    const kick = tasks.find((t: any) => t.title === 'Plan the kick-off');
    expect(kick).toMatchObject({ fields: { region: 'eu' }, subtaskCount: 1 });
    const run = tasks.find((t: any) => t.title === 'Run the kick-off');
    const detail = (await lena.get(`/api/tasks/${run.id}`)).json;
    expect(JSON.stringify(detail)).toContain('Plan the kick-off');
    expect((await lena.get(`/api/tasks/${kick.id}`)).json.task.comments.map((c: any) => c.body)).toEqual(expect.arrayContaining(['Booked', 'Agenda sent']));
    expect((await lena.get(`/api/boards/${board}/tasks`)).json.tasks.some((t: any) => t.title === 'Renewal call')).toBe(true);
    const list = (await lena.get('/api/task-imports')).json.imports;
    expect(list[0]).toMatchObject({ id: r.json.batch, created: 4, boards: 2, undoable: true });
    // Someone else cannot undo it; a viewer cannot import.
    expect((await sofia.post(`/api/task-imports/${r.json.batch}/undo`)).status).toBeGreaterThanOrEqual(403);
    expect((await sofia.post('/api/task-imports', { rows: file, mapping, targets: { '': { board } }, dryRun: true })).status).toBe(403);
    const u = await lena.post(`/api/task-imports/${r.json.batch}/undo`);
    expect(u.status).toBe(200);
    expect(u.json).toMatchObject({ removed: 4, archived: 0, boards: 1 });
    expect((await lena.get(`/api/boards/${id}`)).status).toBe(404);
    expect((await lena.get(`/api/boards/${board}/tasks`)).json.tasks.some((t: any) => t.title === 'Renewal call')).toBe(false);
  });
});
