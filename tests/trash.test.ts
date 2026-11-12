// The trash: what is deleted stays for 30 days and comes back whole.
//
// "Whole" is checked the hard way: every row the company has, in every table,
// is read before the delete and again after the restore, and the two must be
// the same. A table a later migration hangs under a customer or a task is
// therefore covered the day it is added, or the guard at the end says so.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { cleanUp } from '../api/src/lib/scheduler';
import { blankDef } from '../shared/src/reports';
import { Client, login, picture as pictureOf, setup, type Env } from './helpers';

const picture = (orgId = env.a.orgId) => pictureOf(env, orgId);

let env: Env;
let ada: Client; // administrator
let mert: Client; // manager: may delete customers and anyone's tasks
let zeynep: Client; // member, owns Velto
let lena: Client; // member
let sofia: Client; // viewer
let velto: string;
let board: string;

const count = (p: Record<string, unknown[]>) => Object.values(p).reduce((n, rows) => n + rows.length, 0);
const upload = (who: Client, path: string, name: string, text: string) => {
  const form = new FormData();
  form.append('file', new File([text], name, { type: 'text/plain' }));
  return who.req('POST', path, form);
};
const trashOf = async (who: Client, query = '') => (await who.get(`/api/trash${query}`)).json.items as any[];
const sys = <T extends Record<string, any> = any>(sql: string, params: unknown[] = []) => env.db.system((q) => q.query<T>(sql, params));

beforeAll(async () => {
  env = await setup({ portalDomain: 'portal.curahold.test' });
  ada = await login(env, 'acme', 'ada@demo.example');
  mert = await login(env, 'acme', 'mert@demo.example');
  zeynep = await login(env, 'acme', 'zeynep@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  sofia = await login(env, 'acme', 'sofia@demo.example');
  velto = env.a.accounts['Velto Mobility'];
  board = env.a.boards.csBoard;
});

describe('a deleted customer', () => {
  let deal: any;
  let trashId: string;
  let before: Record<string, unknown[]>;
  let sharedTask: string;
  let fileId: string;

  it('goes to the trash with everything under it', async () => {
    // Something in every table that hangs under a customer.
    const type = (await mert.post('/api/record-types', { kind: 'opportunity' })).json.type;
    deal = (await zeynep.post('/api/records', { typeId: type.id, accountId: velto, name: 'Velto renewal', fields: { amount: 52000, close_date: '2027-01-15', status: 'open' } })).json.record;
    const child = (await zeynep.post('/api/records', { typeId: type.id, accountId: velto, name: 'Velto add-on', fields: { amount: 8000, close_date: '2027-02-01', status: 'open' } })).json.record;
    await sys('update records set parent_id = $2 where id = $1', [child.id, deal.id]);
    expect((await zeynep.post(`/api/records/${deal.id}/comments`, { body: 'Legal has the draft.' })).status).toBe(201);
    const up = await upload(zeynep, `/api/records/${deal.id}/files`, 'order form.txt', 'signed order form');
    expect(up.status).toBe(201);
    fileId = up.json.file.id;
    expect((await zeynep.post(`/api/accounts/${velto}/activities`, { kind: 'note', body: 'Kick-off went well; next review in March.' })).status).toBe(201);
    expect((await ada.put('/api/portal/settings', { enabled: true })).status).toBe(200);
    const person = await zeynep.post('/api/portal/users', { accountId: velto, email: 'mila@velto.example', name: 'Mila Novak' });
    expect(person.status).toBe(201);
    const mila = person.json.person.id;
    await sys(`insert into portal_passwords (org_id, portal_user_id, hash) values ($1, $2, 'not-a-real-hash')`, [env.a.orgId, mila]);
    await sys(`insert into portal_identities (org_id, portal_user_id, provider, subject, email) values ($1, $2, 'google', 'sub-1', 'mila@velto.example')`, [env.a.orgId, mila]);
    await sys(`insert into portal_passkeys (org_id, portal_user_id, credential_id, public_key, counter, transports, name) values ($1, $2, 'cred-1', 'pk', 7, '{internal}', 'Laptop')`, [env.a.orgId, mila]);
    await sys(`insert into health_history (org_id, account_id, day, score) values ($1, $2, current_date - 1, 71), ($1, $2, current_date, 64)`, [env.a.orgId, velto]);
    await sys(`insert into playbook_runs (org_id, account_id, anchor_day, record_id, tasks) values ($1, $2, current_date, $3, 4)`, [env.a.orgId, velto, deal.id]);
    // Tasks that point at the customer, at its record and at its portal person: they stay, the links go.
    const t = (await zeynep.post('/api/tasks', { boardId: board, title: 'Prepare the Velto renewal', accountId: velto })).json.task;
    sharedTask = t.id;
    await sys('update tasks set portal_shared = true, record_id = $2, portal_author_id = $3 where id = $1', [t.id, deal.id, mila]);
    await env.settle();

    before = await picture();
    const linked = (before.tasks as any[]).filter((k) => k.account_id === velto).length;
    expect(linked).toBeGreaterThan(1);

    expect((await lena.del(`/api/accounts/${velto}`)).status).toBe(403);
    const gone = await mert.del(`/api/accounts/${velto}`);
    expect(gone.status).toBe(200);
    trashId = gone.json.trashId;
    expect(trashId).toMatch(/^[0-9a-f-]{36}$/);

    // It really is gone: nothing that lists, counts or searches has to leave it out.
    expect((await ada.get(`/api/accounts/${velto}`)).status).toBe(404);
    expect((await ada.get(`/api/records/${deal.id}`)).status).toBe(404);
    const during = await picture();
    for (const table of ['accounts', 'records', 'record_comments', 'files', 'activities', 'portal_users', 'portal_passwords', 'portal_identities', 'portal_passkeys', 'health_history', 'playbook_runs']) {
      expect(during[table].length, table).toBeLessThan(before[table].length);
    }
    expect((during.tasks as any[]).some((k) => k.account_id === velto || k.record_id === deal.id)).toBe(false);
    expect((during.tasks as any[]).find((k) => k.id === sharedTask)).toMatchObject({ account_id: null, record_id: null, portal_author_id: null, portal_shared: false });
    expect(during.tasks.length).toBe(before.tasks.length);

    // The list says what it is, what went with it and how long it stays.
    const [item] = await trashOf(mert);
    expect(item).toMatchObject({ id: trashId, kind: 'account', label: 'Velto Mobility', count: 1, ids: [velto], deletedBy: env.a.ids.mert });
    expect(item.contents).toMatchObject({ records: 2, comments: 1, files: 1, entries: 1, portalPeople: 1, tasksLinked: linked });
    const days = (Date.parse(item.purgeAt) - Date.parse(item.deletedAt)) / 86_400_000;
    expect(Math.round(days)).toBe(30);
    // The file itself is still in storage: it has to be there when the customer comes back.
    expect(await env.storage.get((before.files as any[]).find((f) => f.id === fileId).storage_key)).not.toBeNull();
  });

  it('comes back exactly as it was', async () => {
    const hooksBefore = (await sys('select count(*)::int as n from webhook_events'))[0].n;
    const r = await mert.post(`/api/trash/${trashId}/restore`);
    expect(r.status).toBe(200);
    expect(r.json.restored).toMatchObject({ kind: 'account', ids: [velto], label: 'Velto Mobility', already: false, dropped: {}, unlinked: [] });
    await env.settle();

    const after = await picture();
    expect(count(after)).toBe(count(before));
    for (const table of Object.keys(before)) expect(after[table], table).toEqual(before[table]);

    // And it works: the page opens, the file downloads, the tasks point at it again.
    expect((await zeynep.get(`/api/accounts/${velto}`)).json.account.name).toBe('Velto Mobility');
    expect((await zeynep.get(`/api/files/${fileId}`)).json).toBe('signed order form');
    expect((await zeynep.get(`/api/tasks/${sharedTask}`)).json.task.accountId).toBe(velto);
    expect(await trashOf(mert)).toEqual([]);
    // Coming back is not announced as something new.
    expect((await sys('select count(*)::int as n from webhook_events'))[0].n).toBe(hooksBefore);
    const log = await sys<{ action: string; meta: any }>(`select action, meta from audit_log where org_id = $1 and action in ('account.deleted', 'trash.restored') order by at`, [env.a.orgId]);
    expect(log.map((l) => l.action)).toEqual(['account.deleted', 'trash.restored']);
    expect(log[0].meta.trashId).toBe(trashId);
    // Putting it back twice is refused, not repeated.
    expect((await mert.post(`/api/trash/${trashId}/restore`)).status).toBe(404);
  });

  it('a link someone has since pointed elsewhere is left alone', async () => {
    const other = env.a.accounts['Orchardly Foods'];
    const gone = await mert.del(`/api/accounts/${velto}`);
    await ada.patch(`/api/tasks/${sharedTask}`, { baseVersion: (await ada.get(`/api/tasks/${sharedTask}`)).json.task.version, accountId: other });
    expect((await mert.post(`/api/trash/${gone.json.trashId}/restore`)).status).toBe(200);
    expect((await ada.get(`/api/tasks/${sharedTask}`)).json.task.accountId).toBe(other);
    const back = (await sys<{ n: number }>('select count(*)::int as n from tasks where account_id = $1', [velto]))[0].n;
    expect(back).toBeGreaterThan(0);
  });
});

describe('a deleted task', () => {
  it('comes back with its subtasks, comments, time, followers, links and files', async () => {
    const t = (await lena.post('/api/tasks', { boardId: board, title: 'Plan the onboarding', accountId: env.a.accounts['Cedarmoor Health'], assigneeIds: [env.a.ids.lena], dueDate: '2026-12-10' })).json.task;
    const sub = (await lena.post('/api/tasks', { boardId: board, title: 'Book the kick-off', parentId: t.id })).json.task;
    const other = (await lena.post('/api/tasks', { boardId: board, title: 'Security questionnaire' })).json.task;
    await lena.post(`/api/tasks/${t.id}/comments`, { body: `Waiting on @[Mert](${env.a.ids.mert})` });
    await lena.post(`/api/tasks/${sub.id}/comments`, { body: 'Tuesday works.' });
    await lena.post(`/api/tasks/${t.id}/time`, { minutes: 45, note: 'Prep' });
    await mert.put(`/api/tasks/${t.id}/watch`, {});
    await mert.post(`/api/tasks/${t.id}/mute`, { muted: true });
    expect((await lena.post(`/api/tasks/${t.id}/links`, { otherId: other.id, kind: 'blocked_by' })).status).toBeLessThan(300);
    const up = await upload(lena, `/api/tasks/${sub.id}/files`, 'agenda.txt', 'agenda v1');
    const key = (await sys<{ storage_key: string }>('select storage_key from files where id = $1', [up.json.file.id]))[0].storage_key;
    await env.settle();
    const before = await picture();

    // Someone else's task: only its maker, or whoever may delete any task.
    expect((await zeynep.del(`/api/tasks/${t.id}`)).status).toBe(403);
    expect(await trashOf(zeynep)).toEqual([]);
    const gone = await lena.del(`/api/tasks/${t.id}`);
    expect(gone.status).toBe(200);
    expect((await lena.get(`/api/tasks/${sub.id}`)).status).toBe(404);
    const [item] = await trashOf(lena);
    expect(item).toMatchObject({ kind: 'task', label: 'Plan the onboarding', where: { boardId: board, account: 'Cedarmoor Health' } });
    expect(item.contents).toMatchObject({ subtasks: 1, comments: 2, files: 1, timeEntries: 1 });
    expect(await env.storage.get(key)).not.toBeNull();

    const r = await lena.post(`/api/trash/${gone.json.trashId}/restore`);
    expect(r.status).toBe(200);
    await env.settle();
    const after = await picture();
    for (const table of Object.keys(before)) expect(after[table], table).toEqual(before[table]);
    expect((await lena.get(`/api/files/${up.json.file.id}`)).json).toBe('agenda v1');
  });

  it('a subtask waits for its parent; a column removed meanwhile is no obstacle', async () => {
    const cols = [
      { key: 'todo', name: 'To do', done: false },
      { key: 'review', name: 'In review', done: false },
      { key: 'done', name: 'Done', done: true },
    ];
    const own = (await ada.post('/api/boards', { name: 'Launch plan', visibility: 'org', columns: cols })).json.board;
    const parent = (await lena.post('/api/tasks', { boardId: own.id, title: 'Parent', status: 'review' })).json.task;
    const sub = (await lena.post('/api/tasks', { boardId: own.id, title: 'Child', parentId: parent.id })).json.task;
    expect(parent.status).toBe('review');
    const first = await lena.del(`/api/tasks/${sub.id}`);
    const second = await lena.del(`/api/tasks/${parent.id}`);
    const refused = await lena.post(`/api/trash/${first.json.trashId}/restore`);
    expect(refused.status).toBe(409);
    expect(refused.json).toMatchObject({ error: 'trash_parent_first', parent: 'task', parentLabel: 'Parent' });
    expect(refused.json.message).toContain('Parent');
    // Nothing was changed by the refusal: both are still there to put back, parent first.
    expect((await trashOf(lena)).map((i) => i.label).sort()).toEqual(['Child', 'Parent']);
    // Meanwhile the board loses the column the parent was in.
    expect((await ada.patch(`/api/boards/${own.id}`, { columns: [cols[0], cols[2]] })).status).toBe(200);
    expect((await lena.post(`/api/trash/${second.json.trashId}/restore`)).status).toBe(200);
    expect((await lena.get(`/api/tasks/${parent.id}`)).json.task.status).toBe('todo');
    expect((await lena.post(`/api/trash/${first.json.trashId}/restore`)).status).toBe(200);
    expect((await lena.get(`/api/tasks/${sub.id}`)).json.task.parentId).toBe(parent.id);
  });

  it('what has gone for good in the meantime is left out, and said', async () => {
    const a = (await lena.post('/api/tasks', { boardId: board, title: 'Task A' })).json.task;
    const b = (await lena.post('/api/tasks', { boardId: board, title: 'Task B' })).json.task;
    await lena.post(`/api/tasks/${a.id}/links`, { otherId: b.id, kind: 'relates' });
    const first = await lena.del(`/api/tasks/${a.id}`); // its copy holds the link to B
    const second = await lena.del(`/api/tasks/${b.id}`);
    expect((await ada.del(`/api/trash/${second.json.trashId}`)).status).toBe(200); // B is gone for good
    const r = await lena.post(`/api/trash/${first.json.trashId}/restore`);
    expect(r.status).toBe(200);
    expect(r.json.restored.dropped).toEqual({ task_links: 1 });
    expect((await lena.get(`/api/tasks/${a.id}`)).json.task.title).toBe('Task A');
  });
});

describe('the other things that can be deleted', () => {
  it('a record comes back once its customer is there; its sums are worked out again', async () => {
    const acc = env.a.accounts['Orchardly Foods'];
    const type = (await mert.post('/api/record-types', { kind: 'opportunity' })).json.type;
    // A number the customer adds up from its records.
    const fields = (await ada.get('/api/me')).json.org.accountFields;
    const sum = { key: 'open_pipeline', label: { en: 'Open pipeline' }, type: 'money', rollup: { type: 'opportunity', fn: 'sum', field: 'amount', where: { field: 'status', option: 'open' } } };
    expect((await ada.req('PUT', '/api/account-fields', { fields: [...fields, sum] })).status).toBe(200);
    const rec = (await lena.post('/api/records', { typeId: type.id, accountId: acc, name: 'Orchardly expansion', fields: { amount: 12000, close_date: '2027-03-01', status: 'open' } })).json.record;
    const pipeline = async () => (await ada.get(`/api/accounts/${acc}`)).json.account.fields.open_pipeline;
    const withIt = await pipeline();
    expect(withIt).toBe(12000);
    const gone = await mert.del(`/api/records/${rec.id}`);
    expect(gone.status).toBe(200);
    expect(await pipeline()).not.toBe(withIt);
    const [item] = await trashOf(mert, '?kind=record');
    expect(item).toMatchObject({ kind: 'record', label: 'Orchardly expansion', where: { account: 'Orchardly Foods', accountId: acc } });
    expect(item.where.type.en).toBeTruthy();

    // Its customer is deleted too: the record cannot come back before the customer does.
    const account = await mert.del(`/api/accounts/${acc}`);
    const refused = await mert.post(`/api/trash/${gone.json.trashId}/restore`);
    expect(refused.status).toBe(409);
    expect(refused.json).toMatchObject({ error: 'trash_parent_first', parent: 'account', parentLabel: 'Orchardly Foods' });
    expect((await mert.post(`/api/trash/${account.json.trashId}/restore`)).status).toBe(200);
    expect((await mert.post(`/api/trash/${gone.json.trashId}/restore`)).status).toBe(200);
    expect(await pipeline()).toBe(withIt);
  });

  it('a timeline entry, a page, a saved report and an automation', async () => {
    const acc = env.a.accounts['Cedarmoor Health'];
    const note = (await lena.post(`/api/accounts/${acc}/activities`, { kind: 'call', body: 'Talked through the rollout plan with their IT lead.' })).json.activity;
    const report = (await lena.post('/api/reports/saved', { name: 'Open work by board', def: { ...blankDef('tasks'), groups: [{ field: 'board' }], chart: 'bar' } })).json.report;
    const page = (await ada.get('/api/pages')).json.pages[0];
    const rule = (await ada.get('/api/automations')).json.automations[0];
    await sys(`insert into automation_runs (org_id, automation_id, run_key) values ($1, $2, 'once-already')`, [env.a.orgId, rule.id]);
    const before = await picture();

    const made = [
      await lena.del(`/api/activities/${note.id}`),
      await lena.del(`/api/reports/saved/${report.id}`),
      await ada.del(`/api/pages/${page.id}`),
      await ada.del(`/api/automations/${rule.id}`),
    ];
    expect(made.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    const mine = await trashOf(lena);
    expect(mine.map((i) => i.kind).sort()).toEqual(['activity', 'report']);
    expect(mine.find((i) => i.kind === 'activity')).toMatchObject({ label: 'Talked through the rollout plan with their IT lead.', where: { entry: 'call', account: 'Cedarmoor Health' } });
    expect((await trashOf(ada)).map((i) => i.kind).sort()).toEqual(['activity', 'automation', 'page', 'report']);
    expect((await trashOf(ada, '?q=ROLLOUT')).map((i) => i.kind)).toEqual(['activity']);

    for (const r of made) expect((await ada.post(`/api/trash/${r.json.trashId}/restore`)).status).toBe(200);
    const after = await picture();
    for (const table of Object.keys(before)) expect(after[table], table).toEqual(before[table]);
  });
});

describe('who sees and restores what', () => {
  it('your own deletions; all of them for administrators; nothing across companies or for read-only seats', async () => {
    const t = (await zeynep.post('/api/tasks', { boardId: board, title: 'Zeynep’s own task' })).json.task;
    const gone = await zeynep.del(`/api/tasks/${t.id}`);
    const id = gone.json.trashId;
    expect((await trashOf(zeynep)).map((i) => i.id)).toEqual([id]);
    expect((await zeynep.get('/api/trash')).json).toMatchObject({ manage: false, days: 30, more: false });
    expect(await trashOf(lena)).toEqual([]);
    expect(await trashOf(sofia)).toEqual([]);
    expect((await trashOf(ada)).map((i) => i.id)).toContain(id);
    expect((await ada.get('/api/trash')).json.manage).toBe(true);

    // Another member cannot put it back or even learn it is there; a viewer cannot change anything.
    expect((await lena.post(`/api/trash/${id}/restore`)).status).toBe(403);
    expect((await sofia.post(`/api/trash/${id}/restore`)).status).toBe(403);
    expect((await zeynep.del(`/api/trash/${id}`)).status).toBe(403);
    // The other company: not in its list, not restorable, not deletable — and its own trash is untouched.
    const beta = await login(env, 'beta', 'ada@demo.example');
    expect(await trashOf(beta)).toEqual([]);
    expect((await beta.post(`/api/trash/${id}/restore`)).status).toBe(404);
    expect((await beta.del(`/api/trash/${id}`)).status).toBe(404);
    // Under the app's own database role nobody reads the copies, whatever they ask for.
    for (const who of [env.a.ids.ada, env.a.ids.zeynep]) {
      const as = { orgId: env.a.orgId, userId: who };
      expect((await env.db.tenant(as, (q) => q.query('select 1 from trash'))).length).toBeGreaterThan(0);
      for (const table of ['trash_rows', 'trash_links']) {
        const copies = await env.db.tenant(as, (q) => q.query(`select 1 from ${table}`)).then(
          (rows) => rows.length,
          () => 'refused',
        );
        expect(copies, table).toBe('refused');
      }
    }
    const stranger = { orgId: env.b.orgId, userId: env.b.ids.ada };
    expect(await env.db.tenant(stranger, (q) => q.query('select 1 from trash'))).toEqual([]);
    // The functions that do the copying keep to the caller's company and rights, even when called directly.
    const raw = (as: { orgId: string; userId: string }, sql: string, params: unknown[]) =>
      env.db.tenant(as, (q) => q.query(sql, params)).then(
        (rows) => Object.values(rows[0] ?? {})[0],
        (e) => e.code as string,
      );
    expect(await raw(stranger, `select app_trash_put('task', $1::uuid[], 'x', '{}'::jsonb)`, [[t.id]])).toBeNull();
    expect(await raw(stranger, 'select app_trash_restore($1)', [id])).toBe('TR404');
    expect(await raw(stranger, 'select app_trash_expire($1)', [id])).toBe(false);
    const viewer = { orgId: env.a.orgId, userId: env.a.ids.sofia };
    expect(await raw(viewer, `select app_trash_put('account', $1::uuid[], 'x', '{}'::jsonb)`, [[velto]])).toBe('TR403');
    expect(await raw(viewer, 'select app_trash_restore($1)', [id])).toBe('TR403');
    expect(await raw({ orgId: env.a.orgId, userId: env.a.ids.lena }, 'select app_trash_expire($1)', [id])).toBe('TR403');
    expect((await trashOf(zeynep)).map((i) => i.id)).toEqual([id]);

    expect((await ada.post(`/api/trash/${id}/restore`)).status).toBe(200);
    expect((await zeynep.get(`/api/tasks/${t.id}`)).status).toBe(200);
  });
});

describe('letting go for good', () => {
  it('after 30 days the copy and its files are removed; an administrator can do it sooner', async () => {
    const t = (await lena.post('/api/tasks', { boardId: board, title: 'With a file' })).json.task;
    const up = await upload(lena, `/api/tasks/${t.id}/files`, 'notes.txt', 'private notes');
    const key = (await sys<{ storage_key: string }>('select storage_key from files where id = $1', [up.json.file.id]))[0].storage_key;
    const gone = await lena.del(`/api/tasks/${t.id}`);
    const keep = (await lena.post('/api/tasks', { boardId: board, title: 'Deleted yesterday' })).json.task;
    const recent = await lena.del(`/api/tasks/${keep.id}`);

    // Day 29: still there. Day 31: gone, and the file with it.
    await sys(`update trash set purge_at = now() + interval '1 day' where id = $1`, [gone.json.trashId]);
    await cleanUp(env.deps);
    expect((await trashOf(lena)).map((i) => i.id).sort()).toEqual([gone.json.trashId, recent.json.trashId].sort());
    await sys(`update trash set purge_at = now() - interval '1 day' where id = $1`, [gone.json.trashId]);
    // Past its time it can no longer be put back, even before the clean-up has run.
    expect(await trashOf(lena)).toHaveLength(1);
    expect((await lena.post(`/api/trash/${gone.json.trashId}/restore`)).status).toBe(404);
    expect(await env.storage.get(key)).not.toBeNull();
    await cleanUp(env.deps);
    expect(await env.storage.get(key)).toBeNull();
    expect((await sys('select count(*)::int as n from trash_rows where trash_id = $1', [gone.json.trashId]))[0].n).toBe(0);
    expect((await trashOf(lena)).map((i) => i.id)).toEqual([recent.json.trashId]);

    // By hand: whoever runs the company or looks after privacy.
    expect((await lena.del(`/api/trash/${recent.json.trashId}`)).status).toBe(403);
    expect((await ada.del(`/api/trash/${recent.json.trashId}`)).status).toBe(200);
    expect((await ada.del(`/api/trash/${recent.json.trashId}`)).status).toBe(404);
    // A record's file as well. Before the trash, deleting a record or its customer removed the row and
    // left the file in storage for ever; now it leaves when the copy does.
    const type = (await mert.post('/api/record-types', { kind: 'opportunity' })).json.type;
    const rec = (await lena.post('/api/records', { typeId: type.id, accountId: env.a.accounts['Cedarmoor Health'], name: 'With a contract', fields: { status: 'open' } })).json.record;
    const paper = await upload(lena, `/api/records/${rec.id}/files`, 'contract.txt', 'the contract');
    const paperKey = (await sys<{ storage_key: string }>('select storage_key from files where id = $1', [paper.json.file.id]))[0].storage_key;
    const thrown = await mert.del(`/api/records/${rec.id}`);
    expect(await env.storage.get(paperKey)).not.toBeNull();
    expect((await ada.del(`/api/trash/${thrown.json.trashId}`)).status).toBe(200);
    expect(await env.storage.get(paperKey)).toBeNull();
    expect(await trashOf(ada)).toEqual([]);
    expect((await sys('select count(*)::int as n from trash'))[0].n).toBe(0);
    const log = await sys<{ meta: any }>(`select meta from audit_log where org_id = $1 and action = 'trash.purged'`, [env.a.orgId]);
    expect(log.map((l) => l.meta.name)).toContain('Deleted yesterday');
  });
});

describe('something else took its place', () => {
  it('is refused with the reason, and nothing is changed', async () => {
    const made = (await ada.post('/api/accounts', { name: 'Northwind Trading' })).json.account;
    await sys(`update accounts set source = 'crm', external_id = 'X-1' where id = $1`, [made.id]);
    const gone = await ada.del(`/api/accounts/${made.id}`);
    const twin = (await ada.post('/api/accounts', { name: 'Northwind Trading (new)' })).json.account;
    await sys(`update accounts set source = 'crm', external_id = 'X-1' where id = $1`, [twin.id]);
    const before = await picture();
    const r = await ada.post(`/api/trash/${gone.json.trashId}/restore`);
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ error: 'trash_conflict', table: 'accounts' });
    expect(await picture()).toEqual(before);
    expect((await trashOf(ada)).map((i) => i.id)).toEqual([gone.json.trashId]);
    // Once the place is free it comes back.
    await sys(`update accounts set external_id = 'X-2' where id = $1`, [twin.id]);
    expect((await ada.post(`/api/trash/${gone.json.trashId}/restore`)).status).toBe(200);
  });
});

describe('undoing an import', () => {
  it('puts what the import added in the trash as one item', async () => {
    const rows = [{ Name: 'Pinecrest Logistics' }, { Name: 'Saltmarsh Studio' }, { Name: 'Tidewater Labs' }];
    const done = await ada.post('/api/accounts/import', { fileName: 'new customers.csv', rows, mapping: { name: 'Name' } });
    expect(done.status, JSON.stringify(done.json)).toBeLessThan(300);
    const batch = (await ada.get('/api/imports')).json.imports[0];
    const pine = (await ada.get('/api/accounts?q=Pinecrest')).json.accounts[0];
    await ada.post(`/api/accounts/${pine.id}/activities`, { kind: 'note', body: 'Called them the same afternoon.' });
    const before = await picture();

    const undone = await ada.post(`/api/imports/${batch.id}/undo`);
    expect(undone.json).toMatchObject({ removed: 3 });
    expect((await ada.get('/api/accounts?q=Pinecrest')).json.accounts).toEqual([]);
    const [item] = await trashOf(ada);
    expect(item).toMatchObject({ id: undone.json.trashId, kind: 'account', count: 3, where: { via: 'import' }, contents: { entries: 1 } });
    expect((await ada.post(`/api/trash/${item.id}/restore`)).status).toBe(200);
    const after = await picture();
    for (const table of Object.keys(before)) if (table !== 'import_batches') expect(after[table], table).toEqual(before[table]);
  });
});

describe('nothing slips past the trash', () => {
  it('every place the server deletes one of these keeps a copy first', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(dir, e.name));
        else if (e.name.endsWith('.ts')) files.push(join(dir, e.name));
      }
    };
    walk(join(import.meta.dirname, '..', 'api', 'src'));
    let deletes = 0;
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const outright = (text.match(/delete from\s+(accounts|records|tasks|activities|pages|reports|automations)\b/g) ?? []).length;
      const copies = (text.match(/await toTrash\(/g) ?? []).length;
      expect(copies, `${file}: ${outright} deletes, ${copies} copies`).toBeGreaterThanOrEqual(outright);
      deletes += outright;
    }
    // The seven kinds, and the two imports that can be undone.
    expect(deletes).toBe(9);
  });
});

describe('the schema stays restorable', () => {
  it('every table a delete reaches has what copying and putting back need', async () => {
    const reached = await sys<{ t: string; has_org: boolean; pk: string | null }>(
      `with recursive fk as (
         select child, parent from app_trash_fks() where rule = 'c' and child <> all (array['notifications', 'portal_sessions', 'portal_tokens'])
       ), walk(t) as (
         select unnest(array['accounts', 'records', 'tasks', 'activities', 'pages', 'reports', 'automations'])
         union
         select fk.child from walk w join fk on fk.parent = w.t
       )
       select w.t, exists (select 1 from pg_attribute a where a.attrelid = ('public.' || w.t)::regclass and a.attname = 'org_id') as has_org,
              array_to_string(app_trash_pk(w.t), ',') as pk
         from walk w order by 1`,
    );
    expect(reached.length).toBeGreaterThan(15);
    for (const r of reached) {
      expect(r.has_org, `${r.t} has no org_id`).toBe(true);
      expect(r.pk, `${r.t} has no primary key`).toBeTruthy();
    }
    // A link cleared by a delete is put back by the row's id.
    const cleared = await sys<{ child: string; has_id: boolean }>(
      `select distinct f.child, exists (select 1 from pg_attribute a where a.attrelid = ('public.' || f.child)::regclass and a.attname = 'id') as has_id
         from app_trash_fks() f where f.rule = 'n' and f.parent = any ($1::text[])`,
      [reached.map((r) => r.t)],
    );
    for (const c of cleared) expect(c.has_id, `${c.child} has no id`).toBe(true);
    // Each foreign key is "one column (besides the company) points at one column".
    const wide = await sys(
      `select con.conname from pg_constraint con
        where con.contype = 'f' and con.connamespace = 'public'::regnamespace
          and (select count(*) from unnest(con.conkey) k join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k where a.attname <> 'org_id') > 1`,
    );
    expect(wide).toEqual([]);
    // Nothing that reaches these tables forbids the delete in a way the copy would not know about.
    const blocking = await sys(`select child, parent from app_trash_fks() where rule in ('a', 'r') and parent = any ($1::text[])`, [reached.map((r) => r.t)]);
    expect(blocking).toEqual([]);
    // What the tests above put a row in: a table reached by a delete but never filled here would not be proven.
    const proven = new Set(['accounts', 'records', 'record_comments', 'files', 'activities', 'portal_users', 'portal_passwords', 'portal_identities', 'portal_passkeys', 'health_history', 'playbook_runs', 'tasks', 'comments', 'task_events', 'task_links', 'task_mutes', 'task_watchers', 'time_entries', 'pages', 'reports', 'automations', 'automation_runs']);
    expect(reached.map((r) => r.t).filter((t) => !proven.has(t))).toEqual([]);
  });
});
