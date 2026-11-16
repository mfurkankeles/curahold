// The whole "blocks" chain, both ways (GET /tasks/:id/chain and the counts on board cards): every step
// back and on, a finished task shown but not looked past, a loop refused however long it would be, and a
// task this person may not see never in it — not in the chain, not in the counts.
import { beforeAll, describe, expect, it } from 'vitest';
import { pmColumns } from '../shared/src/templates';
import { login, setup, type Client, type Env } from './helpers';

describe('the blocks chain', () => {
  let env: Env;
  let ada: Client;
  let lena: Client;
  let board: string;
  const id: Record<string, string> = {};

  beforeAll(async () => {
    env = await setup();
    ada = await login(env, 'acme', env.a.adminEmail);
    lena = await login(env, 'acme', 'lena@demo.example');
    board = (await ada.post('/api/boards', { name: 'Chain', visibility: 'org', columns: pmColumns('en') })).json.board.id;
    for (const [k, status] of [['A', 'ready'], ['B', 'in_progress'], ['C', 'ready'], ['D', 'backlog'], ['E', 'in_progress'], ['X', 'done'], ['Y', 'ready']] as const) {
      id[k] = (await ada.post('/api/tasks', { boardId: board, title: `Task ${k}`, status })).json.task.id;
    }
    const secret = (await ada.post('/api/boards', { name: 'Private', visibility: 'private' })).json.board.id;
    id.P = (await ada.post('/api/tasks', { boardId: secret, title: 'Task P' })).json.task.id;
    // Y → X → A → B → C → D, E → B, P → A (P on a board only ada sees; X is finished).
    for (const [from, to] of [['A', 'B'], ['B', 'C'], ['C', 'D'], ['E', 'B'], ['X', 'A'], ['Y', 'X'], ['P', 'A']]) {
      const r = await ada.post(`/api/tasks/${id[from]}/links`, { otherId: id[to], kind: 'blocks' });
      expect(r.status, `${from} blocks ${to}`).toBe(201);
    }
  });

  const brief = (nodes: any[]) => nodes.map((n) => `${n.title.slice(5)}${n.depth}${n.done ? '✓' : ''}`).sort();

  it('reads every step back and on; a finished task is shown but not looked past', async () => {
    const r = await ada.get(`/api/tasks/${id.C}/chain`);
    expect(r.status).toBe(200);
    expect(brief(r.json.chain.up)).toEqual(['A2', 'B1', 'E2', 'P3', 'X3✓']);
    expect(brief(r.json.chain.down)).toEqual(['D1']);
    expect(r.json.chain.up.find((n: any) => n.title === 'Task A')).toMatchObject({ via: id.B, statusName: 'Ready', boardId: board });
    expect(brief((await ada.get(`/api/tasks/${id.A}/chain`)).json.chain.down)).toEqual(['B1', 'C2', 'D3']);
  });

  it('refuses a loop however many steps it would take', async () => {
    expect((await ada.post(`/api/tasks/${id.D}/links`, { otherId: id.A, kind: 'blocks' })).json.error).toBe('link_loop');
    expect((await ada.post(`/api/tasks/${id.A}/links`, { otherId: id.D, kind: 'blocked_by' })).json.error).toBe('link_loop');
  });

  it('counts the whole chain on the cards, unfinished tasks only', async () => {
    const cards = Object.fromEntries((await ada.get(`/api/boards/${board}/tasks`)).json.tasks.map((t: any) => [t.title.slice(5), t]));
    expect(cards.C).toMatchObject({ blockedBy: 1, waitsFor: 4, holdsUp: 1 });
    expect(cards.A).toMatchObject({ blockedBy: 1, waitsFor: 1, holdsUp: 3 });
    expect(cards.D.holdsUp).toBeUndefined();
    expect(cards.X.waitsFor).toBeUndefined();
    const windowed = (await ada.get(`/api/boards/${board}/tasks?per=20`)).json.tasks.find((t: any) => t.id === id.C);
    expect(windowed).toMatchObject({ waitsFor: 4, holdsUp: 1 });
  });

  it('never shows or counts a task this person may not see', async () => {
    const r = await lena.get(`/api/tasks/${id.C}/chain`);
    expect(r.status).toBe(200);
    expect(brief(r.json.chain.up)).toEqual(['A2', 'B1', 'E2', 'X3✓']);
    const c = (await lena.get(`/api/boards/${board}/tasks`)).json.tasks.find((t: any) => t.id === id.C);
    expect(c).toMatchObject({ waitsFor: 3, holdsUp: 1 });
    expect((await lena.get(`/api/tasks/${id.P}/chain`)).status).toBe(404);
  });
});
