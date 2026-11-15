// Version checks on customers (accounts) and records (migration 0051, lib/versions.ts):
// two people editing the same one at once. Different fields merge; the same field
// changed by someone else since is refused with 409 and the current value; every
// other writer (CRM sync, imports, automations, the public API) keeps working and
// moves the version too.
import { beforeAll, describe, expect, it } from 'vitest';
import { login, setup, type Client, type Env } from './helpers';

let env: Env;
let ada: Client;
let mert: Client;

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  mert = await login(env, 'acme', 'mert@demo.example');
});

const newAccount = async (name: string) => (await ada.post('/api/accounts', { name })).json.account;

describe('customers', () => {
  it('carry a version that goes up with each change', async () => {
    const a = await newAccount('Versioned Customer');
    expect(a.version).toBe(1);
    const r = await ada.patch(`/api/accounts/${a.id}`, { baseVersion: 1, name: 'Versioned Customer Ltd' });
    expect(r.status).toBe(200);
    expect(r.json.account.version).toBe(2);
    // A save that changes nothing tracked leaves it.
    expect((await ada.patch(`/api/accounts/${a.id}`, { baseVersion: 2, name: 'Versioned Customer Ltd' })).json.account.version).toBe(2);
  });

  it('two people changing different fields from the same version: both are kept', async () => {
    const a = await newAccount('Merge Customer');
    const one = await ada.patch(`/api/accounts/${a.id}`, { baseVersion: a.version, fields: { arr: 1000 } });
    const two = await mert.patch(`/api/accounts/${a.id}`, { baseVersion: a.version, fields: { renewal_date: '2027-03-01' } });
    const three = await mert.patch(`/api/accounts/${a.id}`, { baseVersion: a.version, name: 'Merge Customer Renamed' });
    expect([one.status, two.status, three.status]).toEqual([200, 200, 200]);
    const now = (await ada.get(`/api/accounts/${a.id}`)).json.account;
    expect(now).toMatchObject({ name: 'Merge Customer Renamed', fields: { arr: 1000, renewal_date: '2027-03-01' }, version: 4 });
  });

  it('the same field: the second is refused with the current value, and nothing is written', async () => {
    const a = await newAccount('Clash Customer');
    expect((await ada.patch(`/api/accounts/${a.id}`, { baseVersion: a.version, name: 'Ada wrote' })).status).toBe(200);
    const late = await mert.patch(`/api/accounts/${a.id}`, { baseVersion: a.version, name: 'Mert wrote', fields: { arr: 5 } });
    expect(late.status).toBe(409);
    expect(late.json.error).toBe('conflict');
    expect(late.json.fields).toEqual(['name']);
    expect(late.json.current).toMatchObject({ name: 'Ada wrote', version: 2 });
    const now = (await ada.get(`/api/accounts/${a.id}`)).json.account;
    expect(now.name).toBe('Ada wrote');
    expect(now.fields.arr ?? null).toBeNull();
    // Told, the person saves again from the version they were shown: theirs stands.
    expect((await mert.patch(`/api/accounts/${a.id}`, { baseVersion: late.json.current.version, name: 'Mert wrote' })).json.account.name).toBe('Mert wrote');
  });

  it('writing the same value someone else just wrote is not a clash', async () => {
    const a = await newAccount('Same Value');
    await ada.patch(`/api/accounts/${a.id}`, { baseVersion: 1, fields: { arr: 700 } });
    expect((await mert.patch(`/api/accounts/${a.id}`, { baseVersion: 1, fields: { arr: 700 } })).status).toBe(200);
  });

  it('a CRM sync or import writing the row moves the version, and an edit from before it is checked against it', async () => {
    const a = await newAccount('Synced Customer');
    // What the sync engine, an import and an automation do: write the row directly.
    await env.db.system((q) => q.query(`update accounts set fields = fields || '{"arr": 9000}'::jsonb where id = $1`, [a.id]));
    expect((await ada.get(`/api/accounts/${a.id}`)).json.account.version).toBe(2);
    const clash = await ada.patch(`/api/accounts/${a.id}`, { baseVersion: 1, fields: { arr: 10 } });
    expect(clash.status).toBe(409);
    expect(clash.json.current.fields.arr).toBe(9000);
    // Another field from the same old version merges.
    expect((await ada.patch(`/api/accounts/${a.id}`, { baseVersion: 1, fields: { renewal_date: '2027-06-01' } })).status).toBe(200);
  });

  it('a client that sends no version (public API, AI connector, older apps) still writes, as before', async () => {
    const a = await newAccount('Unversioned Write');
    await ada.patch(`/api/accounts/${a.id}`, { name: 'First' });
    const r = await mert.patch(`/api/accounts/${a.id}`, { name: 'Second' });
    expect(r.status).toBe(200);
    expect(r.json.account).toMatchObject({ name: 'Second', version: 3 });
  });

  it('bulk changes and the trash keep the version moving', async () => {
    const a = await newAccount('Bulk Customer');
    const bulk = await ada.post('/api/accounts/bulk', { ids: [a.id], archived: true });
    expect(bulk.status).toBeLessThan(300);
    const [row] = await env.db.system((q) => q.query('select version from accounts where id = $1', [a.id]));
    expect(row.version).toBeGreaterThan(1);
  });
});

describe('records', () => {
  const contact = async (name: string) => {
    const types = (await ada.get('/api/record-types')).json.types;
    const type = types.find((t: any) => t.kind === 'opportunity') ?? (await ada.post('/api/record-types', { kind: 'opportunity' })).json.type;
    const acc = await newAccount(`${name} Co`);
    const r = await ada.post('/api/records', { typeId: type.id, name, accountId: acc.id, fields: {} });
    expect(r.status).toBe(201);
    return r.json.record;
  };

  it('different fields merge; the same field is refused with the current record', async () => {
    const r = await contact('Versioned Deal');
    expect(r.version).toBe(1);
    expect((await ada.patch(`/api/records/${r.id}`, { baseVersion: 1, name: 'Deal by Ada' })).status).toBe(200);
    const other = await mert.patch(`/api/records/${r.id}`, { baseVersion: 1, fields: { amount: 500 } });
    expect(other.status).toBe(200);
    expect(other.json.record).toMatchObject({ name: 'Deal by Ada', fields: { amount: 500 }, version: 3 });
    const same = await mert.patch(`/api/records/${r.id}`, { baseVersion: 1, name: 'Deal by Mert' });
    expect(same.status).toBe(409);
    expect(same.json.fields).toEqual(['name']);
    expect(same.json.current).toMatchObject({ id: r.id, name: 'Deal by Ada', version: 3 });
  });

  it('without a version a record is written as before', async () => {
    const r = await contact('Plain Deal');
    await ada.patch(`/api/records/${r.id}`, { name: 'A' });
    expect((await mert.patch(`/api/records/${r.id}`, { name: 'B' })).json.record.name).toBe('B');
  });
});
