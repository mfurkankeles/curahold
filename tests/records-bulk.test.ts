// A change to many records at once (POST /records/bulk): owner, a field, put away;
// at most 500; each one the person may change, every field one they may edit; and
// Undo puts back only what the change touched.
import { beforeAll, describe, expect, it } from 'vitest';
import { login, setup, type Client, type Env } from './helpers';

let env: Env;
let ada: Client;
let lena: Client;
let sofia: Client;
let deals: { id: string; key: string; fields: { key: string; type: string; options?: { key: string }[] }[] };
const ids: string[] = [];

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  sofia = await login(env, 'acme', 'sofia@demo.example');
  deals = (await ada.post('/api/record-types', { kind: 'opportunity' })).json.type;
  for (const name of ['North expansion', 'South renewal', 'East pilot']) ids.push((await ada.post('/api/records', { typeId: deals.id, name })).json.record.id);
});

const one = async (id: string) => (await ada.get(`/api/records/${id}`)).json.record;

describe('records changed many at once', () => {
  it('get a new owner and a stage together, and Undo puts back only those', async () => {
    const stage = deals.fields.find((f) => f.key === 'stage')!;
    const to = stage.options![stage.options!.length - 1].key;
    // A later edit of another field must survive the Undo.
    const r = await ada.post('/api/records/bulk', { ids, ownerId: env.a.ids.lena, fields: { stage: to } });
    expect(r.status).toBe(200);
    expect(r.json.updated).toBe(3);
    for (const id of ids) expect(await one(id)).toMatchObject({ ownerId: env.a.ids.lena, fields: { stage: to } });
    expect((await ada.patch(`/api/records/${ids[0]}`, { name: 'North expansion (renamed)' })).status).toBe(200);
    expect((await ada.post(`/api/undo/${r.json.undoId}`)).json.restored).toBe(3);
    const back = await one(ids[0]);
    expect(back.ownerId).not.toBe(env.a.ids.lena);
    expect(back.fields.stage ?? null).not.toBe(to);
    expect(back.name).toBe('North expansion (renamed)');
    const [log] = await env.db.system((q) => q.query(`select meta from audit_log where action = 'record.bulk_updated' order by at desc limit 1`));
    expect(log.meta).toMatchObject({ count: 3, keys: ['stage'] });
  });

  it('are put away and back', async () => {
    const r = await ada.post('/api/records/bulk', { ids: ids.slice(0, 2), archived: true });
    expect(r.json.updated).toBe(2);
    expect((await one(ids[0])).archivedAt).not.toBeNull();
    await ada.post(`/api/undo/${r.json.undoId}`);
    expect((await one(ids[0])).archivedAt).toBeNull();
  });

  it('refuse more than 500, nothing to change, a read-only seat, a field closed to the role, and another company', async () => {
    const many = Array.from({ length: 501 }, () => ids[0]);
    expect((await ada.post('/api/records/bulk', { ids: many, archived: true })).status).toBe(400);
    expect((await ada.post('/api/records/bulk', { ids })).status).toBe(400);
    expect((await sofia.post('/api/records/bulk', { ids, archived: true })).status).toBe(403);
    await ada.patch(`/api/record-types/${deals.id}`, { fields: deals.fields.map((f) => (f.key === 'stage' ? { ...f, access: { edit: ['admin'] } } : f)) });
    const stage = deals.fields.find((f) => f.key === 'stage')!.options![0].key;
    expect((await lena.post('/api/records/bulk', { ids, fields: { stage } })).status).toBe(403);
    const stranger = await login(env, 'beta', 'ada@demo.example');
    expect((await stranger.post('/api/records/bulk', { ids, archived: true })).status).toBe(404);
    expect((await one(ids[0])).archivedAt).toBeNull();
  });

  it('customers: at most 500 at once as well', async () => {
    expect((await ada.post('/api/accounts/bulk', { ids: Array.from({ length: 501 }, () => env.a.accounts['Cedarmoor Health']), archived: true })).status).toBe(400);
  });
});
