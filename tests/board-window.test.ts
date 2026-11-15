// A big board read a window at a time must say the same thing as the board read whole:
// the same cards, in the same order, with true counts, under every filter — and nothing
// for someone who cannot see the board.
import { beforeAll, describe, expect, it } from 'vitest';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
let lena: Client;
let board: string;

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  board = env.a.boards.csBoard;
  // Enough cards that a small window has to page.
  for (let i = 0; i < 14; i++) {
    await ada.post('/api/tasks', {
      boardId: board,
      title: `Window card ${i} ${i % 2 ? 'renewal' : 'onboarding'}`,
      priority: i % 3 ? 'normal' : 'high',
      assigneeIds: i % 4 ? [env.a.ids.lena] : [],
      dueDate: i % 5 ? `2020-01-0${1 + (i % 8)}` : null,
    });
  }
});

const q = (f?: object) => (f ? `&filters=${encodeURIComponent(JSON.stringify(f))}` : '');

async function wholeByColumn(who: Client, keep: (t: any) => boolean) {
  const all = (await who.get(`/api/boards/${board}/tasks`)).json.tasks.filter(keep);
  const b = (await who.get('/api/boards')).json.boards.find((x: any) => x.id === board);
  return { all, b };
}

describe('a board in windows', () => {
  const cases: [string, object | undefined, (t: any) => boolean][] = [
    ['no filter', undefined, () => true],
    ['search', { q: 'RENEWAL' }, (t) => t.title.toLowerCase().includes('renewal') || (t.accountName ?? '').toLowerCase().includes('renewal')],
    ['priority', { priority: ['high'] }, (t) => t.priority === 'high'],
    ['nobody', { assignees: ['none'] }, (t) => t.assigneeIds.length === 0],
    ['me', { assignees: ['me'] }, (t) => t.assigneeIds.includes(env.a.ids.lena)],
  ];
  for (const [name, f, keep] of cases) {
    it(`per column agrees with the whole board: ${name}`, async () => {
      const { all, b } = await wholeByColumn(lena, keep);
      for (const col of b.columns) {
        const want = all.filter((t: any) => t.status === col.key);
        want.sort((x: any, y: any) => (col.done ? y.updatedAt.localeCompare(x.updatedAt) : x.position - y.position));
        // Walk the column three cards at a time.
        const got: any[] = [];
        for (let off = 0; ; off += 3) {
          const r = (await lena.get(`/api/boards/${board}/tasks?per=3&status=${col.key}&offset=${off}${q(f)}`)).json;
          expect(r.columns[0].total).toBe(want.length);
          got.push(...r.tasks);
          if (!r.columns[0].more) break;
        }
        expect(new Set(got.map((t) => t.id))).toEqual(new Set(want.map((t: any) => t.id)));
        if (!col.done) expect(got.map((t) => t.id)).toEqual(want.map((t: any) => t.id));
      }
      const first = (await lena.get(`/api/boards/${board}/tasks?per=3${q(f)}`)).json;
      expect(first.columns.map((c: any) => c.key)).toEqual(b.columns.map((c: any) => c.key));
      expect(first.columns.reduce((n: number, c: any) => n + c.total, 0)).toBe(all.length);
      // The list order, two pages.
      const p1 = (await lena.get(`/api/boards/${board}/tasks?limit=5${q(f)}`)).json;
      const p2 = (await lena.get(`/api/boards/${board}/tasks?limit=500&offset=5${q(f)}`)).json;
      expect(p1.total).toBe(all.length);
      expect([...p1.tasks, ...p2.tasks].map((t: any) => t.id)).toEqual(all.map((t: any) => t.id));
    });
  }

  it('refuses a filter it cannot read and shows nothing to someone outside', async () => {
    expect((await lena.get(`/api/boards/${board}/tasks?per=3&filters=nope`)).status).toBe(400);
    expect((await lena.get(`/api/boards/${board}/tasks?per=3${q({ priority: ['huge'] })}`)).status).toBe(400);
    const other = await login(env, 'beta', 'mert@demo.example');
    expect((await other.get(`/api/boards/${board}/tasks?per=3`)).status).toBe(404);
    expect((await other.get(`/api/boards/${board}/tasks?limit=3`)).status).toBe(404);
  });
});
