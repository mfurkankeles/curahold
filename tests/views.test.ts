// Who sees what, and how: customer reach per role, per-field access,
// pages of cards (each role's home) and "see it as them".
import { beforeAll, describe, expect, it } from 'vitest';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client; // admin
let mert: Client; // manager, leads Customer Success
let lena: Client; // member of Customer Success
let sofia: Client; // viewer
let roles: Record<string, any>;

const names = (list: any[]) => list.map((a) => a.name).sort();
const as = (who: string) => ({ 'x-tendwell-preview-as': who });

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  mert = await login(env, 'acme', 'mert@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  sofia = await login(env, 'acme', 'sofia@demo.example');
  roles = Object.fromEntries((await ada.get('/api/admin/roles')).json.roles.map((r: any) => [r.key, r]));
});

async function setScope(role: string, scope: 'all' | 'team' | 'own') {
  const r = roles[role];
  const perms = r.perms.filter((p: string) => p !== 'accounts.view_all' && p !== 'accounts.view_team');
  if (scope === 'all') perms.push('accounts.view_all');
  if (scope === 'team') perms.push('accounts.view_team');
  const res = await ada.patch(`/api/admin/roles/${r.id}`, { perms });
  expect(res.status).toBe(200);
  roles[role] = res.json.role;
}

describe('customer reach per role', () => {
  it('everyone sees every customer by default', async () => {
    expect((await lena.get('/api/accounts')).json.total).toBe(6);
    expect((await sofia.get('/api/accounts')).json.total).toBe(6);
  });

  it('"only their own" leaves the rest out everywhere', async () => {
    await setScope('member', 'own');
    const mine = (await lena.get('/api/accounts')).json;
    expect(names(mine.accounts)).toEqual(['Cedarmoor Health', 'Orchardly Foods']);
    const velto = (await ada.get('/api/accounts?q=Velto')).json.accounts[0];
    expect((await lena.get(`/api/accounts/${velto.id}`)).status).toBe(404);
    expect((await lena.patch(`/api/accounts/${velto.id}`, { name: 'x' })).status).toBe(404);
    // Records under a customer follow it.
    const type = (await ada.post('/api/record-types', { kind: 'contact' })).json.type;
    await ada.post('/api/records', { typeId: type.id, accountId: velto.id, fields: { first_name: 'Iris', last_name: 'Vale', stance: 'blocker' } });
    expect((await lena.get(`/api/records?type=contact&account=${velto.id}`)).json.total).toBe(0);
    expect((await mert.get(`/api/records?type=contact&account=${velto.id}`)).json.total).toBe(1);
  });

  it('"their team\'s" adds the customers of the teams they are in', async () => {
    await setScope('member', 'team');
    const list = (await lena.get('/api/accounts')).json;
    expect(names(list.accounts)).toEqual(['Cedarmoor Health', 'Orchardly Foods', 'Quillfield Retail', 'Velto Mobility']);
  });

  it('handing a customer to someone out of reach saves it and lets go', async () => {
    await setScope('member', 'own');
    const omar = env.a.ids.omar;
    const mine = (await lena.get('/api/accounts')).json.accounts[0];
    const r = await lena.patch(`/api/accounts/${mine.id}`, { ownerId: omar });
    expect(r.status).toBe(200);
    expect(r.json.account.ownerId).toBe(omar);
    expect((await lena.get(`/api/accounts/${mine.id}`)).status).toBe(404);
    await ada.patch(`/api/accounts/${mine.id}`, { ownerId: env.a.ids.lena });
    await setScope('member', 'all');
  });
});

describe('field access', () => {
  let fields: any[];
  it('hides a field from some roles and keeps it read-only for others', async () => {
    fields = (await ada.get('/api/me')).json.org.accountFields;
    const next = fields.map((f: any) =>
      f.key === 'arr' ? { ...f, access: { view: ['admin', 'manager'] } } : f.key === 'health' ? { ...f, access: { edit: ['admin', 'manager'] } } : f,
    );
    expect((await ada.put('/api/account-fields', { fields: next })).status).toBe(200);

    const me = (await lena.get('/api/me')).json;
    const keys = me.org.accountFields.map((f: any) => f.key);
    expect(keys).not.toContain('arr');
    expect(me.org.accountFields.find((f: any) => f.key === 'health').locked).toBe(true);
    expect(me.org.accountFields.some((f: any) => f.access)).toBe(false);

    const list = (await lena.get('/api/accounts')).json.accounts;
    expect(list.every((a: any) => !('arr' in a.fields))).toBe(true);
    expect(list.some((a: any) => 'health' in a.fields)).toBe(true);
    const one = list[0];
    expect((await lena.get(`/api/accounts/${one.id}`)).json.account.fields.arr).toBeUndefined();
    expect((await lena.patch(`/api/accounts/${one.id}`, { fields: { health: 'risk' } })).status).toBe(403);
    expect((await lena.patch(`/api/accounts/${one.id}`, { fields: { arr: 1 } })).status).toBe(400);
    expect((await lena.patch(`/api/accounts/${one.id}`, { fields: { tier: 'smb' } })).status).toBe(200);
    // Managers can see and change both.
    expect((await mert.get(`/api/accounts/${one.id}`)).json.account.fields.arr).toBeTypeOf('number');
    expect((await mert.patch(`/api/accounts/${one.id}`, { fields: { health: 'watch' } })).status).toBe(200);
  });

  it('only administrators change access; others saving the list keep what they cannot see', async () => {
    fields = (await ada.get('/api/me')).json.org.accountFields;
    const next = fields.map((f: any) => (f.key === 'arr' ? { ...f, access: { view: ['admin'] } } : f));
    await ada.put('/api/account-fields', { fields: next });
    const seen = (await mert.get('/api/me')).json.org.accountFields;
    expect(seen.map((f: any) => f.key)).not.toContain('arr');
    // A manager renames a field and tries to open "health" to everyone.
    const edited = seen.map((f: any) => (f.key === 'tier' ? { ...f, label: { en: 'Segment' } } : f.key === 'health' ? { ...f, access: {} } : f));
    expect((await mert.put('/api/account-fields', { fields: edited })).status).toBe(200);
    const all = (await ada.get('/api/me')).json.org.accountFields;
    expect(all.find((f: any) => f.key === 'arr').access).toEqual({ view: ['admin'] });
    expect(all.find((f: any) => f.key === 'health').access).toEqual({ edit: ['admin', 'manager'] });
    expect(all.find((f: any) => f.key === 'tier').label.en).toBe('Segment');
    // Option colours are kept.
    const colored = all.map((f: any) => (f.key === 'health' ? { ...f, options: f.options.map((o: any, i: number) => ({ ...o, color: ['leaf', 'honey', 'coral'][i] })) } : f));
    expect((await ada.put('/api/account-fields', { fields: colored })).status).toBe(200);
    expect((await lena.get('/api/me')).json.org.accountFields.find((f: any) => f.key === 'health').options[2].color).toBe('coral');
    expect((await ada.put('/api/account-fields', { fields: [{ ...colored[0], options: [{ key: 'a', label: { en: 'A' }, color: 'neon' }] }] })).status).toBe(400);
  });
});

describe('pages and homes', () => {
  let pages: any[];
  it('each role starts on its own home', async () => {
    const l = (await lena.get('/api/pages')).json;
    pages = l.pages;
    expect(pages.map((p: any) => p.name)).toEqual(['My day', 'Team view', 'Leadership summary']);
    expect(l.pages.find((p: any) => p.id === l.homeId).name).toBe('My day');
    const mHome = (await mert.get('/api/pages')).json.homeId;
    const sHome = (await sofia.get('/api/pages')).json.homeId;
    expect(pages.find((p: any) => p.id === mHome).name).toBe('Team view');
    expect(pages.find((p: any) => p.id === sHome).name).toBe('Leadership summary');
  });

  it('fills a page with what the viewer may see', async () => {
    const team = pages.find((p: any) => p.name === 'Team view');
    const m = (await mert.get(`/api/pages/${team.id}/data`)).json.data;
    expect(m.c1).toEqual({ kind: 'number', value: 6, unit: 'count' });
    expect(m.c2.kind).toBe('hidden'); // annual value is admin-only now
    expect(m.c3.value).toBe(1); // one customer at risk
    expect(m.c6.rows.map((r: any) => r.title)).toEqual(['Velto Mobility']);
    expect(m.c6.rows[0].chip).toEqual({ label: 'At risk', color: 'coral' });
    expect(m.c7.bars.map((b: any) => [b.key, b.value])).toEqual([
      ['good', 2],
      ['watch', 3],
      ['risk', 1],
    ]);
    expect(m.c8.bars.reduce((s: number, b: any) => s + b.value, 0)).toBe(6);
    expect(m.c9.kind).toBe('hidden'); // managers do not run connections
    const load = m.c4.rows.find((r: any) => r.name === 'Lena Fischer');
    expect(load.accounts).toBe(2);
    expect(m.c4.unit).toBeNull();
    const a = (await ada.get(`/api/pages/${team.id}/data`)).json.data;
    expect(a.c2.kind).toBe('number');
    expect(a.c2.value).toBeGreaterThan(0);
    expect(a.c9.kind).toBe('sync');

    const day = pages.find((p: any) => p.name === 'My day');
    const l = (await lena.get(`/api/pages/${day.id}/data`)).json.data;
    expect(l.c1.kind).toBe('list');
    expect(l.c1.rows.every((r: any) => r.title)).toBe(true);
    expect(l.c5.extra).toBe(2); // neither of her customers has a champion
    const z = (await mert.get(`/api/pages/${day.id}/data`)).json.data;
    expect(z.c5.rows).toEqual([]); // the blocker sits on Zeynep's customer, not Mert's
  });

  it('administrators build pages; giving a role a new home moves it', async () => {
    expect((await lena.post('/api/pages', { name: 'Mine' })).status).toBe(403);
    const made = await ada.post('/api/pages', {
      name: 'Renewal desk',
      homeFor: ['member'],
      sharedWith: ['member', 'manager'],
      cards: [
        { id: 'r1', type: 'renewals', size: 'full', scope: 'all', days: 120, field: 'renewal_date' },
        { id: 'n1', type: 'note', size: 'full', text: 'Renewals first this quarter.' },
      ],
    });
    expect(made.status).toBe(201);
    const l = (await lena.get('/api/pages')).json;
    expect(l.homeId).toBe(made.json.page.id);
    expect(l.pages.find((p: any) => p.name === 'My day').homeFor).toEqual([]);
    expect((await sofia.get('/api/pages')).json.pages.map((p: any) => p.name)).not.toContain('Renewal desk');
    expect((await sofia.get(`/api/pages/${made.json.page.id}/data`)).status).toBe(404);
    const d = (await lena.get(`/api/pages/${made.json.page.id}/data`)).json.data;
    expect(d.r1.rows.map((r: any) => r.title)).toContain('Harborline Bank');
    expect(d.r1.rows.every((r: any) => r.days >= 0 && r.days <= 120)).toBe(true);
    expect(d.n1).toEqual({ kind: 'note', text: 'Renewals first this quarter.' });
    const prev = await ada.post('/api/pages/preview', { cards: [{ id: 'x', type: 'metric', size: 'third', metric: 'renewals', days: 50 }] });
    expect(prev.json.data.x.value).toBe(1);
    expect((await ada.post('/api/pages', { name: 'Bad', cards: [{ id: 'x', type: 'nope', size: 'half' }] })).status).toBe(400);
    expect((await ada.del(`/api/pages/${made.json.page.id}`)).status).toBe(200);
  });
});

describe('see it as them', () => {
  it('shows Tendwell with their role, read only, and leaves a trace', async () => {
    await setScope('member', 'own');
    const me = (await ada.req('GET', '/api/me', undefined, as(env.a.ids.lena))).json;
    expect(me.user.id).toBe(env.a.ids.lena);
    expect(me.user.roleKey).toBe('member');
    expect(me.previewBy.name).toBe('Ada Demir');
    expect(me.org.accountFields.map((f: any) => f.key)).not.toContain('arr');
    const list = (await ada.req('GET', '/api/accounts', undefined, as(env.a.ids.lena))).json;
    expect(names(list.accounts)).toEqual(['Cedarmoor Health', 'Orchardly Foods']);
    const pages = (await ada.req('GET', '/api/pages', undefined, as(env.a.ids.lena))).json;
    expect(pages.pages.find((p: any) => p.id === pages.homeId)).toBeTruthy();

    const write = await ada.req('POST', '/api/accounts', { name: 'Nope' }, as(env.a.ids.lena));
    expect(write.status).toBe(403);
    expect(write.json.error).toBe('preview_read_only');
    expect((await lena.req('GET', '/api/me', undefined, as(env.a.ids.ada))).status).toBe(403);
    expect((await ada.req('GET', '/api/me/sessions', undefined, as(env.a.ids.lena))).status).toBe(403);
    const log = (await ada.get('/api/admin/audit?action=user.previewed')).json;
    expect(JSON.stringify(log)).toContain('user.previewed');
    await setScope('member', 'all');
  });
});

describe('everyday work', () => {
  it('finds things by name, within what the person may see', async () => {
    await setScope('member', 'own');
    const a = (await ada.get('/api/search?q=vel')).json;
    expect(a.accounts.map((x: any) => x.name)).toContain('Velto Mobility');
    expect((await lena.get('/api/search?q=vel')).json.accounts).toEqual([]);
    expect((await lena.get('/api/search?q=%25%25')).json.accounts).toEqual([]);
    expect((await ada.get('/api/search?q=lena')).json.people[0].name).toBe('Lena Fischer');
    await setScope('member', 'all');
  });

  it('changes many tasks at once and puts them back', async () => {
    const tasks = (await ada.get('/api/tasks')).json.tasks.filter((t: any) => !t.parentId).slice(0, 3);
    const ids = tasks.map((t: any) => t.id);
    const r = await ada.post('/api/tasks/bulk', { ids, priority: 'urgent', addAssignee: env.a.ids.omar });
    expect(r.json.updated).toBe(3);
    let now = (await ada.get('/api/tasks')).json.tasks.filter((t: any) => ids.includes(t.id));
    expect(now.every((t: any) => t.priority === 'urgent' && t.assigneeIds.includes(env.a.ids.omar))).toBe(true);
    expect((await lena.post(`/api/undo/${r.json.undoId}`)).status).toBe(404); // only the person who made the change
    expect((await ada.post(`/api/undo/${r.json.undoId}`)).json.restored).toBe(3);
    now = (await ada.get('/api/tasks')).json.tasks.filter((t: any) => ids.includes(t.id));
    for (const t of tasks) expect(now.find((x: any) => x.id === t.id).priority).toBe(t.priority);
    expect((await ada.post(`/api/undo/${r.json.undoId}`)).status).toBe(404); // once
    const arch = await ada.post('/api/tasks/bulk', { ids: [ids[0]], archived: true });
    expect((await ada.get('/api/tasks')).json.tasks.some((t: any) => t.id === ids[0])).toBe(false);
    await ada.post(`/api/undo/${arch.json.undoId}`);
    expect((await ada.get('/api/tasks')).json.tasks.some((t: any) => t.id === ids[0])).toBe(true);
  });

  it('a repeating task comes back with the next date when it is done', async () => {
    const board = (await ada.get('/api/boards')).json.boards[0];
    const done = board.columns.find((c: any) => c.done).key;
    const made = (await ada.post('/api/tasks', { boardId: board.id, title: 'Weekly check-in', dueDate: '2030-01-07', repeat: { every: 1, unit: 'week', from: 'due' } })).json.task;
    await ada.post('/api/tasks', { boardId: board.id, parentId: made.id, title: 'Send notes' });
    const r = await ada.patch(`/api/tasks/${made.id}`, { baseVersion: made.version, status: done });
    expect(r.json.task.repeat).toBeNull();
    expect(r.json.next.dueDate).toBe('2030-01-14');
    expect(r.json.next.repeat).toEqual({ every: 1, unit: 'week', from: 'due' });
    const next = (await ada.get(`/api/tasks/${r.json.next.id}`)).json.task;
    expect(next.subtasks.map((s: any) => s.title)).toEqual(['Send notes']);
    // Back and forth does not make a second copy.
    const back = await ada.patch(`/api/tasks/${made.id}`, { baseVersion: r.json.task.version, status: board.columns[0].key });
    const again = await ada.patch(`/api/tasks/${made.id}`, { baseVersion: back.json.task.version, status: done });
    expect(again.json.next).toBeUndefined();
  });

  it('quiet hours hold notices; a muted task stops comment notices', async () => {
    const board = (await ada.get('/api/boards')).json.boards[0];
    const task = (await ada.post('/api/tasks', { boardId: board.id, title: 'Quiet test', assigneeIds: [env.a.ids.mert] })).json.task;
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    expect((await mert.patch('/api/me', { prefs: { quiet: { from: hour, to: (hour + 2) % 24 } } })).status).toBe(200);
    await ada.post(`/api/tasks/${task.id}/comments`, { body: 'Ping during quiet hours' });
    await env.settle();
    const held = await env.db.system((q) => q.query(`select state, not_before from notifications where task_id = $1 and user_id = $2 and kind = 'comment'`, [task.id, env.a.ids.mert]));
    expect(held[0].state).toBe('pending');
    expect(held[0].not_before).not.toBeNull();
    await mert.patch('/api/me', { prefs: { quiet: null } });
    expect((await mert.post(`/api/tasks/${task.id}/mute`, { muted: true })).json.muted).toBe(true);
    expect((await mert.get(`/api/tasks/${task.id}`)).json.task.muted).toBe(true);
    await ada.post(`/api/tasks/${task.id}/comments`, { body: 'Second comment' });
    const n = await env.db.system((q) => q.query(`select count(*)::int as n from notifications where task_id = $1 and user_id = $2 and kind = 'comment'`, [task.id, env.a.ids.mert]));
    expect(n[0].n).toBe(1);
  });
});
