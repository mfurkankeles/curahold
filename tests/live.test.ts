// Live refresh and installing: the pulse moves only for what a person can
// see, and the install manifest needs no session.
import { beforeAll, describe, expect, it } from 'vitest';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
let mert: Client;
let lena: Client;
type PulseBody = { tasks: number; records: number; unread: number; boards?: Record<string, number>; accounts?: Record<string, number> };
const pulse = async (who: Client) => (await who.get('/api/pulse')).json as PulseBody;
const scoped = async (who: Client, q: string) => (await who.get(`/api/pulse${q}`)).json as PulseBody;
const tick = () => new Promise((r) => setTimeout(r, 15));

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  mert = await login(env, 'acme', 'mert@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
});

describe('the pulse', () => {
  it('moves when something a person can see changes, and only then', async () => {
    const start = await pulse(lena);
    expect(start.tasks).toBeGreaterThan(0);
    expect(await pulse(lena)).toEqual(start);
    await tick();
    // A task on a board Lena can see.
    const t = (await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Seen by the team' })).json.task;
    const afterTask = await pulse(lena);
    expect(afterTask.tasks).toBeGreaterThan(start.tasks);
    expect(afterTask.unread).toBe(start.unread);
    await tick();
    // A comment is a change too, though the task itself did not move.
    await mert.post(`/api/tasks/${t.id}/comments`, { body: 'A first note' });
    const afterComment = await pulse(lena);
    expect(afterComment.tasks).toBeGreaterThan(afterTask.tasks);
    await tick();
    // Ada's private board: Lena's number stays where it was; Ada's own moves.
    const adaBefore = await pulse(ada);
    await ada.post('/api/tasks', { boardId: env.a.boards.privateBoard, title: 'Only Ada sees this' });
    expect((await pulse(lena)).tasks).toBe(afterComment.tasks);
    expect((await pulse(ada)).tasks).toBeGreaterThan(adaBefore.tasks);
    // Given a task: the bell's number comes with the same answer.
    await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'For Lena', assigneeIds: [env.a.ids.lena] });
    expect((await pulse(lena)).unread).toBe(start.unread + 1);
    // The other company never moves it.
    const other = await login(env, 'beta', 'mert@demo.example');
    const otherBefore = await pulse(other);
    await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Acme only' });
    expect(await pulse(other)).toEqual(otherBefore);
    expect((await new Client(env, 'acme').get('/api/pulse')).status).toBe(401);
  });

  it('a board follows only its own cards; a company only its own changes', async () => {
    const cs = env.a.boards.csBoard;
    const priv = env.a.boards.privateBoard;
    const base = await scoped(ada, `?boards=${cs},${priv}`);
    expect(base.boards![cs]).toBeGreaterThan(0);
    await tick();
    await mert.post('/api/tasks', { boardId: cs, title: 'A card on CS' });
    const after = await scoped(ada, `?boards=${cs},${priv}`);
    expect(after.boards![cs]).toBeGreaterThan(base.boards![cs]);
    // The other board did not move, and neither did the global record stamp.
    expect(after.boards![priv]).toBe(base.boards![priv]);
    // A board you cannot see gives you no stamp.
    expect((await scoped(lena, `?boards=${priv}`)).boards?.[priv]).toBeUndefined();

    // A company follows anything under it, and only it.
    const acc = env.a.accounts['Fjordnet Telecom'];
    const other = env.a.accounts['Quillfield Retail'];
    const aBase = await scoped(ada, `?accounts=${acc},${other}`);
    expect(aBase.accounts![acc]).toBeGreaterThan(0);
    await tick();
    await mert.post(`/api/accounts/${acc}/activities`, { kind: 'note', body: 'Called their lead' });
    const aAfter = await scoped(ada, `?accounts=${acc},${other}`);
    expect(aAfter.accounts![acc]).toBeGreaterThan(aBase.accounts![acc]);
    expect(aAfter.accounts![other]).toBe(aBase.accounts![other]);
  });

  it('follows records too (a deal someone moved)', async () => {
    const { type } = (await ada.post('/api/record-types', { kind: 'opportunity' })).json;
    const before = await pulse(lena);
    await tick();
    await ada.post('/api/records', { typeId: type.id, accountId: env.a.accounts['Quillfield Retail'], name: 'Add-on seats', fields: { amount: 12000, stage: 'proposal', status: 'open' } });
    const after = await pulse(lena);
    expect(after.records).toBeGreaterThan(before.records);
    expect(after.tasks).toBe(before.tasks);
  });
});

describe('installing', () => {
  it('the manifest carries the company’s name and language, with no session', async () => {
    const res = await env.app.request('https://acme.curahold.test/api/manifest.webmanifest');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/manifest+json');
    const m = (await res.json()) as any;
    expect(m).toMatchObject({ short_name: 'Curahold', display: 'standalone', start_url: '/home', lang: 'en' });
    expect(m.name).toBe('Demo Company · Curahold');
    expect(m.icons.map((i: any) => i.sizes)).toEqual(['192x192', '512x512', '512x512']);
    const tr = (await (await env.app.request('https://beta.curahold.test/api/manifest.webmanifest')).json()) as any;
    expect(tr.shortcuts[0].name).toBe('Görevlerim');
    expect((await env.app.request('https://nobody.curahold.test/api/manifest.webmanifest')).status).toBe(404);
  });
});
