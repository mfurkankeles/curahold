// Saved views on every list (routes/work.ts, migration 0066): a view of the
// customer list, a records list, My tasks or the timeline is its maker's own
// until shared with the company; it opens by its id (the link); a board's view
// keeps the board's filter shape; nothing crosses to another company.
import { beforeAll, describe, expect, it } from 'vitest';
import { login, setup, type Client, type Env } from './helpers';

let env: Env;
let ada: Client;
let mert: Client;
let lena: Client;
let sofia: Client;

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  mert = await login(env, 'acme', 'mert@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  sofia = await login(env, 'acme', 'sofia@demo.example');
});

const names = async (who: Client, scope: string) => ((await who.get(`/api/views?scope=${encodeURIComponent(scope)}`)).json.views as { name: string }[]).map((v) => v.name);

describe('a saved view of a list', () => {
  it('is its maker’s own, opens by its link once shared, and a colleague sees it then', async () => {
    const state = { q: 'health', owner: 'me', archived: false, layout: 'table', sortKey: 'name', sortDir: -1, fields: ['arr', 'tier'] };
    const made = await lena.post('/api/views', { scope: 'accounts', name: 'My health customers', filters: state });
    expect(made.status).toBe(201);
    const view = made.json.view;
    expect(view).toMatchObject({ scope: 'accounts', boardId: null, shared: false, mine: true, filters: state });
    expect(await names(lena, 'accounts')).toEqual(['My health customers']);
    expect(await names(mert, 'accounts')).toEqual([]);
    expect((await mert.get(`/api/views/${view.id}`)).status).toBe(404);

    expect((await lena.patch(`/api/views/${view.id}`, { shared: true })).json.view.shared).toBe(true);
    expect(await names(mert, 'accounts')).toEqual(['My health customers']);
    const opened = await mert.get(`/api/views/${view.id}`);
    expect(opened.status).toBe(200);
    expect(opened.json.view).toMatchObject({ mine: false, shared: true, filters: state });
    // Only its maker changes or deletes it.
    expect((await mert.patch(`/api/views/${view.id}`, { name: 'Taken' })).status).toBe(404);
    expect((await mert.del(`/api/views/${view.id}`)).status).toBe(404);
    // Each list keeps its own views.
    expect(await names(lena, 'my_tasks')).toEqual([]);
    expect(await names(lena, 'records:opportunity')).toEqual([]);
  });

  it('keeps each list’s own state: records, My tasks, the timeline', async () => {
    for (const [scope, filters] of [
      ['records:opportunity', { q: '', owner: 'me', view: 'board', group: 'stage', period: 'quarter', from: '', to: '' }],
      ['my_tasks', { q: 'call', board: '', priority: 'high' }],
      ['timeline', { group: 'person', mine: true, board: '' }],
    ] as const) {
      const r = await mert.post('/api/views', { scope, name: `View of ${scope}`, filters });
      expect(r.status, scope).toBe(201);
      expect(await names(mert, scope)).toContain(`View of ${scope}`);
    }
  });

  it('refuses what is not a list or not a flat state, and a read-only seat keeps its views to itself', async () => {
    expect((await lena.post('/api/views', { scope: 'everything', name: 'x', filters: {} })).status).toBe(400);
    expect((await lena.post('/api/views', { scope: 'accounts', name: 'x', filters: { deep: { a: 1 } } })).status).toBe(400);
    expect((await lena.post('/api/views', { scope: 'accounts', name: 'x', filters: { 'bad key': 1 } })).status).toBe(400);
    expect((await lena.post('/api/views', { scope: 'accounts', boardId: env.a.boards.csBoard, name: 'x', filters: {} })).status).toBe(400);
    // A board's view keeps the board's filter shape.
    expect((await lena.post('/api/views', { boardId: env.a.boards.csBoard, name: 'x', filters: { layout: 'cards' } })).status).toBe(400);
    const own = await sofia.post('/api/views', { scope: 'accounts', name: 'Reader', filters: { q: 'x' }, shared: true });
    expect(own.status).toBe(201);
    expect(own.json.view.shared).toBe(false);
  });

  it('is never seen from another company, even with its id', async () => {
    const mine = (await ada.post('/api/views', { scope: 'accounts', name: 'Company wide', filters: { owner: 'all' }, shared: true })).json.view;
    const stranger = await login(env, 'beta', 'ada@demo.example');
    expect((await stranger.get(`/api/views/${mine.id}`)).status).toBe(404);
    expect(await names(stranger, 'accounts')).not.toContain('Company wide');
    expect((await stranger.patch(`/api/views/${mine.id}`, { name: 'x' })).status).toBe(404);
    expect((await stranger.del(`/api/views/${mine.id}`)).status).toBe(404);
  });

  it('a board’s views stay a board’s: not on the customer list', async () => {
    const r = await lena.post('/api/views', { boardId: env.a.boards.csBoard, name: 'Late', filters: { due: ['late'] } });
    expect(r.json.view).toMatchObject({ scope: 'board', boardId: env.a.boards.csBoard });
    expect(await names(lena, 'accounts')).not.toContain('Late');
    expect(((await lena.get(`/api/views?board=${env.a.boards.csBoard}`)).json.views as { name: string }[]).map((v) => v.name)).toContain('Late');
  });
});
