import { beforeAll, describe, expect, it } from 'vitest';
import { guessFieldType, normalizeValue, parseDate, parseNumber } from '../shared/src/fields';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
let lena: Client;
let sofia: Client;
beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  sofia = await login(env, 'acme', 'sofia@demo.example');
});

describe('reading values the way people write them', () => {
  it('numbers in Turkish and English formats', () => {
    expect(parseNumber('1.250,50 ₺', 'tr')).toBe(1250.5);
    expect(parseNumber('1,250.50', 'en')).toBe(1250.5);
    expect(parseNumber('1.250', 'tr')).toBe(1250);
    expect(parseNumber('1.25', 'en')).toBe(1.25);
    expect(parseNumber('$ 84 000', 'en')).toBe(84000);
    expect(parseNumber('abc', 'en')).toBeNull();
  });
  it('dates: ISO, day-first with dots, slashes by locale', () => {
    expect(parseDate('2027-03-05', 'en')).toBe('2027-03-05');
    expect(parseDate('05.03.2027', 'en')).toBe('2027-03-05');
    expect(parseDate('05/03/2027', 'tr')).toBe('2027-03-05');
    expect(parseDate('03/05/2027', 'en')).toBe('2027-03-05');
    expect(parseDate('31/12/2027', 'en')).toBe('2027-12-31');
    expect(parseDate('31.02.2027', 'tr')).toBeNull();
  });
  it('choices by key or by label in any language', () => {
    const f = { key: 'health', label: { en: 'Health' }, type: 'select' as const, options: [{ key: 'risk', label: { en: 'At risk', tr: 'Riskli' } }] };
    expect(normalizeValue(f, 'RİSKLİ', 'tr')).toEqual({ value: 'risk' });
    expect(normalizeValue(f, 'at risk', 'en')).toEqual({ value: 'risk' });
    expect(normalizeValue(f, 'unknown', 'en')).toEqual({ error: 'option' });
  });
  it('guesses a column type from its values', () => {
    expect(guessFieldType(['2027-01-01', '05.03.2027'], 'tr')).toBe('date');
    expect(guessFieldType(['₺1.200', '₺3.400,50'], 'tr')).toBe('money');
    expect(guessFieldType(['a@b.example', 'c@d.example'], 'en')).toBe('email');
    expect(guessFieldType(['Gold', 'Silver', 'Gold', 'Gold'], 'en')).toBe('select');
  });
});

describe('accounts', () => {
  it('lists the demo accounts with open tasks', async () => {
    const r = (await lena.get('/api/accounts')).json;
    expect(r.total).toBe(6);
    const q = r.accounts.find((a: any) => a.name === 'Quillfield Retail');
    expect(q.fields).toMatchObject({ arr: 84000, health: 'good', tier: 'enterprise' });
    expect(q.openTasks).toBeGreaterThanOrEqual(1);
    expect((await lena.get('/api/accounts?q=harbor')).json.accounts.map((a: any) => a.name)).toEqual(['Harborline Bank']);
    expect((await lena.get('/api/accounts?owner=me')).json.accounts.every((a: any) => a.ownerId === env.a.ids.lena)).toBe(true);
  });

  it('creates and edits with field validation; viewers cannot write', async () => {
    const r = await lena.post('/api/accounts', { name: 'Brightlane Studio', ownerId: env.a.ids.lena, fields: { arr: '12.500', health: 'İzlenmeli', renewal_date: '01.06.2027' } });
    expect(r.status).toBe(201);
    expect(r.json.account.fields).toEqual({ arr: 12.5, health: 'watch', renewal_date: '2027-06-01' });
    const bad = await lena.patch(`/api/accounts/${r.json.account.id}`, { fields: { renewal_date: 'soon' } });
    expect(bad.status).toBe(400);
    expect(bad.json.fields).toEqual(['fields.renewal_date']);
    expect((await sofia.post('/api/accounts', { name: 'Nope' })).status).toBe(403);
    expect((await lena.del(`/api/accounts/${r.json.account.id}`)).status).toBe(403);
    expect((await ada.del(`/api/accounts/${r.json.account.id}`)).status).toBe(200);
  });

  it('tasks point at an account and the account page lists them', async () => {
    const acc = env.a.accounts['Velto Mobility'];
    const t = await lena.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Usage review', accountId: acc });
    expect(t.json.task).toMatchObject({ accountId: acc, accountName: 'Velto Mobility' });
    const detail = (await lena.get(`/api/accounts/${acc}`)).json;
    expect(detail.tasks.map((x: any) => x.title)).toContain('Usage review');
    expect((await lena.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'x', accountId: env.b.accounts['Velto Mobility'] })).status).toBe(400);
  });

  it('accounts never cross companies', async () => {
    const otherId = env.b.accounts['Harborline Bank'];
    expect((await lena.get(`/api/accounts/${otherId}`)).status).toBe(404);
    expect((await lena.patch(`/api/accounts/${otherId}`, { name: 'hacked' })).status).toBe(404);
    const rows = await env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.lena }, (q) => q.query('select org_id from accounts'));
    expect(rows.every((r) => r.org_id === env.a.orgId)).toBe(true);
  });
});

describe('import with undo', () => {
  const rows = [
    { Firma: 'Quillfield Retail', Sorumlu: 'zeynep@demo.example', 'Yıllık': '90.000', Segment: 'Kurumsal', Yenileme: '15.09.2027' },
    { Firma: 'Pinecrest Logistics', Sorumlu: 'Lena Fischer', 'Yıllık': '45.000', Segment: 'Orta ölçek', Yenileme: '01.02.2028' },
    { Firma: 'Marlow Outdoor', Sorumlu: 'yeni.kisi@demo.example', 'Yıllık': 'yok', Segment: 'Franchise', Yenileme: '' },
    { Firma: '', Sorumlu: 'x', 'Yıllık': '1', Segment: '', Yenileme: '' },
  ];
  let batch = '';

  it('matches by name, maps columns, grows choices, reports problems and unknown owners', async () => {
    expect((await lena.post('/api/accounts/import', { rows, mapping: { name: 'Firma' } })).status).toBe(403);
    const r = await ada.post('/api/accounts/import', {
      fileName: 'musteriler.xlsx',
      locale: 'tr',
      rows,
      mapping: { name: 'Firma', owner: 'Sorumlu', fields: { arr: 'Yıllık', tier: 'Segment', renewal_date: 'Yenileme' } },
    });
    expect(r.status).toBe(200);
    batch = r.json.batch;
    expect(r.json).toMatchObject({ created: 2, updated: 1, skipped: 1 });
    expect(r.json.errors).toEqual([
      { row: 4, reason: 'fields:arr' },
      { row: 5, reason: 'name' },
    ]);
    expect(r.json.unmatchedOwners).toEqual([{ email: 'yeni.kisi@demo.example', name: null, count: 1 }]);
    const list = (await ada.get('/api/accounts')).json.accounts;
    const q = list.find((a: any) => a.name === 'Quillfield Retail');
    expect(q.fields).toMatchObject({ arr: 90000, tier: 'enterprise', renewal_date: '2027-09-15', health: 'good' });
    expect(q.ownerId).toBe(env.a.ids.zeynep);
    expect(list.find((a: any) => a.name === 'Pinecrest Logistics').ownerId).toBe(env.a.ids.lena);
    const tier = (await ada.get('/api/me')).json.org.accountFields.find((f: any) => f.key === 'tier');
    expect(tier.options.map((o: any) => o.key)).toContain('franchise');
  });

  it('an owner who joins later gets their accounts', async () => {
    await ada.post('/api/setup/people', { people: [{ email: 'yeni.kisi@demo.example', name: 'Yeni Kişi', role: 'member', teams: [] }], teams: [] });
    const marlow = (await ada.get('/api/accounts?q=Marlow')).json.accounts[0];
    const [u] = await env.db.system((q) => q.query(`select id from users where email = 'yeni.kisi@demo.example'`));
    expect(marlow.ownerId).toBe(u.id);
  });

  it('can be undone: new rows go, changed rows come back, new choices are removed', async () => {
    const imports = (await ada.get('/api/imports')).json.imports;
    expect(imports[0]).toMatchObject({ id: batch, fileName: 'musteriler.xlsx', undoable: true });
    const u = await ada.post(`/api/imports/${batch}/undo`, {});
    expect(u.json).toEqual({ removed: 2, restored: 1 });
    const list = (await ada.get('/api/accounts')).json.accounts;
    expect(list.map((a: any) => a.name)).not.toContain('Pinecrest Logistics');
    expect(list.find((a: any) => a.name === 'Quillfield Retail')).toMatchObject({ ownerId: env.a.ids.zeynep, fields: { arr: 84000 } });
    const tier = (await ada.get('/api/me')).json.org.accountFields.find((f: any) => f.key === 'tier');
    expect(tier.options.map((o: any) => o.key)).not.toContain('franchise');
    expect((await ada.post(`/api/imports/${batch}/undo`, {})).status).toBe(404);
  });

  it('keeps new columns as new fields when asked', async () => {
    const r = await ada.post('/api/accounts/import', {
      rows: [{ Name: 'Tidewater Co', Region: 'North' }],
      mapping: { name: 'Name' },
      newFields: [{ column: 'Region', field: { key: 'region', label: { en: 'Region' }, type: 'text' } }],
    });
    expect(r.json.created).toBe(1);
    const t = (await ada.get('/api/accounts?q=Tidewater')).json.accounts[0];
    expect(t.fields).toEqual({ region: 'North' });
  });
});

describe('bulk changes and hand-over', () => {
  it('moves many accounts to a new owner at once', async () => {
    const ids = (await ada.get('/api/accounts?owner=' + env.a.ids.lena)).json.accounts.map((a: any) => a.id);
    expect(ids.length).toBeGreaterThan(0);
    const r = await ada.post('/api/accounts/bulk', { ids, ownerId: env.a.ids.zeynep });
    expect(r.json.updated).toBe(ids.length);
    await ada.post('/api/accounts/bulk', { ids, ownerId: env.a.ids.lena });
  });

  it('hands over someone’s accounts and open tasks — including boards the admin cannot open', async () => {
    const before = await env.db.system((q) =>
      q.query(`select count(*)::int as n from tasks where org_id = $1 and $2 = any(assignee_ids)`, [env.a.orgId, env.a.ids.omar]),
    );
    expect(before[0].n).toBeGreaterThan(0);
    const r = await ada.post(`/api/admin/users/${env.a.ids.omar}/handover`, { toUserId: env.a.ids.lena });
    expect(r.json.accounts).toBe(2);
    expect(r.json.tasks).toBeGreaterThanOrEqual(1);
    const left = await env.db.system((q) =>
      q.query(
        `select count(*)::int as n from tasks t join boards b on b.id = t.board_id where t.org_id = $1 and $2 = any(t.assignee_ids)
           and not exists (select 1 from jsonb_array_elements(b.columns) c where c->>'key' = t.status and (c->>'done')::boolean)`,
        [env.a.orgId, env.a.ids.omar],
      ),
    );
    expect(left[0].n).toBe(0);
    // Finished work keeps its history.
    const done = await env.db.system((q) => q.query(`select count(*)::int as n from tasks where org_id = $1 and $2 = any(assignee_ids)`, [env.a.orgId, env.a.ids.omar]));
    expect(done[0].n).toBeGreaterThan(0);
  });
});
