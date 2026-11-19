// The analytics feed (api/src/routes/analytics.ts): analytics keys, the OData v4
// face and its JSON/CSV twin. It must read exactly what its key's owner may read
// (company, reach, fields), never write, page through everything without gaps or
// repeats, understand the OData options BI tools send, and write every pull down.
import { beforeAll, describe, expect, it } from 'vitest';
import { BASE, login, setup, type Client, type Env } from './helpers';

let env: Env;
let ada: Client; // admin
let mert: Client; // manager: may export
let lena: Client; // member: may not export
let adaKey = '';

type Auth = 'basic' | 'bearer' | 'query';
function call(token: string, path: string, opts: { auth?: Auth; slug?: string; method?: string; headers?: Record<string, string> } = {}) {
  const auth = opts.auth ?? 'basic';
  const url = new URL(`https://${opts.slug ?? 'acme'}.${BASE}${path}`);
  if (auth === 'query') url.searchParams.set('key', token);
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (auth === 'basic') headers.authorization = `Basic ${btoa(`powerbi:${token}`)}`;
  if (auth === 'bearer') headers.authorization = `Bearer ${token}`;
  return env.app.request(url.toString(), { method: opts.method ?? 'GET', headers });
}
const json = async (token: string, path: string, opts?: Parameters<typeof call>[2]) => {
  const res = await call(token, path, opts);
  return { status: res.status, body: (await res.json()) as any, headers: res.headers };
};
/** Follows @odata.nextLink to the end; returns every row and the number of pages. */
async function all(token: string, first: string, headers?: Record<string, string>) {
  const rows: any[] = [];
  let next: string | undefined = first;
  let pages = 0;
  let last: any = null;
  while (next && pages < 200) {
    const u = new URL(next, `https://acme.${BASE}`);
    const r = await json(token, `${u.pathname}${u.search}`, { headers });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    rows.push(...r.body.value);
    last = r.body;
    next = r.body['@odata.nextLink'];
    pages++;
  }
  return { rows, pages, last };
}
const newKey = async (who: Client, body: Record<string, unknown> = {}) => {
  const r = await who.post('/api/dev/analytics/keys', { name: 'BI', ...body });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json.token as string;
};

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  mert = await login(env, 'acme', 'mert@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  adaKey = await newKey(ada);
});

describe('analytics keys', () => {
  it('are made by people who may export, shown once, read only and good for the feed alone', async () => {
    expect(adaKey).toMatch(/^chb_/);
    expect((await lena.post('/api/dev/analytics/keys', { name: 'x' })).status).toBe(403);
    // Not anywhere else in the API, not for the AI connector, not to make more keys.
    expect((await call(adaKey, '/api/accounts', { auth: 'bearer' })).status).toBe(401);
    expect((await call(adaKey, '/api/dev/analytics/keys', { auth: 'bearer' })).status).toBe(401);
    const mcp = await env.app.request(`https://acme.${BASE}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${adaKey}`, 'content-type': 'application/json' }, body: '{}' });
    expect(mcp.status).toBe(401);
    // Never a write, even to the feed's own addresses.
    expect((await call(adaKey, '/api/analytics/odata/Customers', { method: 'POST' })).status).toBe(403);
    // The list shows the key without its secret.
    const list = (await ada.get('/api/dev/analytics/keys')).json.keys;
    expect(list.length).toBeGreaterThan(0);
    expect(JSON.stringify(list)).not.toContain(adaKey);
  });

  it('asks for a key with a Basic challenge, and turns away a wrong or foreign one', async () => {
    const none = await env.app.request(`https://acme.${BASE}/api/analytics/odata/`);
    expect(none.status).toBe(401);
    expect(none.headers.get('www-authenticate')).toMatch(/^Basic /);
    expect((await call('chb_not-a-real-key', '/api/analytics/odata/')).status).toBe(401);
    // One company's key does not open another company's feed.
    expect((await call(adaKey, '/api/analytics/odata/', { slug: 'beta' })).status).toBe(401);
  });

  it('works as Basic, Bearer and ?key=, and a next-page link never carries the key', async () => {
    for (const auth of ['basic', 'bearer', 'query'] as Auth[]) {
      const r = await json(adaKey, '/api/analytics/odata/Customers?$top=1', { auth });
      expect(r.status).toBe(200);
      expect(r.body.value).toHaveLength(1);
    }
    const paged = await json(adaKey, '/api/analytics/odata/Customers', { auth: 'query', headers: { prefer: 'odata.maxpagesize=2' } });
    expect(paged.body['@odata.nextLink']).toBeTruthy();
    expect(paged.body['@odata.nextLink']).not.toContain(adaKey);
  });

  it('rotate gives a new secret and ends the old one; revoke ends it', async () => {
    const token = await newKey(ada, { name: 'Rotate me' });
    const id = (await ada.get('/api/dev/analytics/keys')).json.keys.find((k: any) => k.name === 'Rotate me').id;
    const r = await ada.post(`/api/dev/analytics/keys/${id}/rotate`);
    expect(r.status).toBe(200);
    expect((await call(token, '/api/analytics/odata/')).status).toBe(401);
    expect((await call(r.json.token, '/api/analytics/odata/')).status).toBe(200);
    // Someone else cannot rotate it (that would hand them a key acting as its owner).
    expect((await mert.post(`/api/dev/analytics/keys/${id}/rotate`)).status).toBe(404);
    expect((await ada.del(`/api/dev/analytics/keys/${id}`)).status).toBe(200);
    expect((await call(r.json.token, '/api/analytics/odata/')).status).toBe(401);
  });

  it('stops when its owner may no longer export', async () => {
    await env.db.system((q) => q.query(`update roles set perms = perms || '{data.export}' where org_id = $1 and key = 'member'`, [env.a.orgId]));
    const token = await newKey(lena);
    expect((await call(token, '/api/analytics/odata/')).status).toBe(200);
    await env.db.system((q) => q.query(`update roles set perms = array_remove(perms, 'data.export') where org_id = $1 and key = 'member'`, [env.a.orgId]));
    expect((await call(token, '/api/analytics/odata/')).status).toBe(403);
  });
});

describe('what a key reads', () => {
  it('describes its datasets in the service document and $metadata (XML, OData 4.0)', async () => {
    const doc = await json(adaKey, '/api/analytics/odata/');
    const names = doc.body.value.map((v: any) => v.name);
    for (const n of ['Customers', 'Renewals', 'People', 'Boards', 'Tasks', 'TaskAssignees', 'Sprints', 'SprintBurndown']) expect(names).toContain(n);
    const meta = await call(adaKey, '/api/analytics/odata/$metadata');
    expect(meta.headers.get('content-type')).toMatch(/xml/);
    expect(meta.headers.get('odata-version')).toBe('4.0');
    const xml = await meta.text();
    expect(xml).toContain('Version="4.0"');
    expect(xml).toContain('<EntitySet Name="Customers" EntityType="Curahold.Customer"/>');
    expect(xml).toMatch(/<Property Name="ModifiedAt" Type="Edm.DateTimeOffset"/);
    expect(xml).toContain('<Property Name="Arr" Type="Edm.Decimal"');
    expect(xml).toContain('<Property Name="RenewalDate" Type="Edm.Date"');
  });

  it('only the rows its owner may see: a private board stays out for someone not on it', async () => {
    const privateBoard = env.a.boards.privateBoard;
    const adaRows = await json(adaKey, `/api/analytics/odata/Tasks?$filter=BoardId eq ${privateBoard}`);
    expect(adaRows.body.value.length).toBeGreaterThan(0);
    await env.db.system((q) => q.query(`update roles set perms = perms || '{data.export}' where org_id = $1 and key = 'member'`, [env.a.orgId]));
    const lenaKey = await newKey(lena);
    const lenaRows = await json(lenaKey, `/api/analytics/odata/Tasks?$filter=BoardId eq ${privateBoard}`);
    expect(lenaRows.status).toBe(200);
    expect(lenaRows.body.value).toEqual([]);
    const boards = await json(lenaKey, '/api/analytics/odata/Boards?$select=Id');
    expect(boards.body.value.map((b: any) => b.Id)).not.toContain(privateBoard);
    await env.db.system((q) => q.query(`update roles set perms = array_remove(perms, 'data.export') where org_id = $1 and key = 'member'`, [env.a.orgId]));
  });

  it('a key limited to datasets reads only those', async () => {
    const token = await newKey(ada, { datasets: ['Customers'] });
    const doc = await json(token, '/api/analytics/odata/');
    expect(doc.body.value.map((v: any) => v.name)).toEqual(['Customers']);
    expect((await call(token, '/api/analytics/odata/Tasks')).status).toBe(404);
    expect((await call(token, '/api/analytics/v1/Tasks.json')).status).toBe(404);
    expect(await (await call(token, '/api/analytics/odata/$metadata')).text()).not.toContain('Curahold.Task"');
    // A dataset that does not exist is refused when the key is made.
    expect((await ada.post('/api/dev/analytics/keys', { name: 'x', datasets: ['Nope'] })).status).toBe(400);
  });

  it('a key limited to departments reads only their datasets (board ones closed until boards have departments)', async () => {
    const token = await newKey(ada, { departments: ['product'] });
    const names = (await json(token, '/api/analytics/odata/')).body.value.map((v: any) => v.name);
    expect(names).toContain('Customers');
    expect(names).not.toContain('Renewals');
    expect(names).not.toContain('Opportunities');
    const [{ ok }] = await env.db.system((q) => q.query(`select exists (select 1 from information_schema.columns where table_name = 'boards' and column_name = 'department_id') as ok`));
    if (!ok) expect(names).not.toContain('Tasks');
    const sales = await newKey(ada, { departments: ['sales'] });
    expect((await json(sales, '/api/analytics/odata/')).body.value.map((v: any) => v.name)).toContain('Renewals');
    // The departments model's six: a key for Inside Sales is taken, and reads the customers but not the renewals.
    const inside = (await json(await newKey(ada, { departments: ['inside_sales'] }), '/api/analytics/odata/')).body.value.map((v: any) => v.name);
    expect(inside).toContain('Customers');
    expect(inside).not.toContain('Renewals');
  });
});

describe('paging, OData options and incremental refresh', () => {
  it('pages through every row once, by modified time, and $count agrees', async () => {
    const whole = await json(adaKey, '/api/analytics/odata/Tasks?$count=true&$top=5000');
    const n = whole.body['@odata.count'];
    expect(n).toBeGreaterThan(4);
    expect(whole.body.value).toHaveLength(n);
    const paged = await all(adaKey, '/api/analytics/odata/Tasks', { prefer: 'odata.maxpagesize=3' });
    expect(paged.pages).toBeGreaterThan(1);
    const ids = paged.rows.map((r) => r.Id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(whole.body.value.map((r: any) => r.Id).sort());
    // In modified order, each page after the last row of the one before.
    const mods = paged.rows.map((r) => r.ModifiedAt);
    expect([...mods].sort()).toEqual(mods);
    const plain = await call(adaKey, '/api/analytics/odata/Tasks/$count');
    expect(await plain.text()).toBe(String(n));
  });

  it('$select, $filter, $orderby and $top', async () => {
    const sel = await json(adaKey, '/api/analytics/odata/Customers?$select=Id,Name');
    expect(Object.keys(sel.body.value[0]).sort()).toEqual(['Id', 'Name']);
    expect(sel.body['@odata.context']).toContain('#Customers(Id,Name)');
    const eq = await json(adaKey, `/api/analytics/odata/Customers?$filter=Name eq 'Cedarmoor Health'`);
    expect(eq.body.value.map((r: any) => r.Name)).toEqual(['Cedarmoor Health']);
    const fn = await json(adaKey, `/api/analytics/odata/Customers?$filter=contains(Name,'bank') or startswith(Name,'Velto')&$orderby=Name desc`);
    expect(fn.body.value.map((r: any) => r.Name)).toEqual(['Velto Mobility', 'Harborline Bank']);
    const range = await json(adaKey, `/api/analytics/odata/Customers?$filter=ModifiedAt ge 2000-01-01T00:00:00Z and ModifiedAt lt 2999-01-01T00:00:00.000Z and IsDeleted eq false and (OwnerId ne null)`);
    expect(range.body.value.length).toBeGreaterThan(3);
    // Power BI's older typed form of a date literal.
    expect((await json(adaKey, `/api/analytics/odata/Customers?$filter=ModifiedAt ge datetimeoffset'2000-01-01T00:00:00Z'`)).body.value.length).toBeGreaterThan(3);
    // $top across pages: 2 + 1, then no further link.
    const p1 = await json(adaKey, '/api/analytics/odata/Customers?$top=3', { headers: { prefer: 'odata.maxpagesize=2' } });
    expect(p1.body.value).toHaveLength(2);
    const u = new URL(p1.body['@odata.nextLink']);
    const p2 = await json(adaKey, `${u.pathname}${u.search}`);
    expect(p2.body.value).toHaveLength(1);
    expect(p2.body['@odata.nextLink']).toBeUndefined();
    // $orderby pages too, with $skip.
    const sorted = await json(adaKey, '/api/analytics/odata/Customers?$orderby=Name&$skip=1&$top=2');
    const names = (await json(adaKey, '/api/analytics/odata/Customers?$orderby=Name')).body.value.map((r: any) => r.Name);
    expect(sorted.body.value.map((r: any) => r.Name)).toEqual(names.slice(1, 3));
  });

  it('says clearly what it does not understand, in the OData error shape', async () => {
    for (const [q, word] of [
      ['$expand=Owner', '$expand'],
      [`$filter=Nope eq 1`, 'Nope'],
      [`$filter=Id eq 'x'`, 'Id'],
      [`$filter=Arr gt 5`, 'Arr'],
      [`$filter=Name eq`, 'early'],
      ['$skiptoken=garbage', 'token'],
      ['$orderby=Name sideways', 'orderby'],
    ]) {
      const r = await json(adaKey, `/api/analytics/odata/Customers?${q}`);
      expect(r.status, q).toBe(400);
      expect(r.body.error.code).toBe('analytics_query');
      expect(r.body.error.message, q).toContain(word);
    }
  });

  it('a delta link returns what changed since the read began', async () => {
    const read = await all(adaKey, '/api/analytics/odata/Customers?$select=Id,Name,ModifiedAt', { prefer: 'odata.track-changes, odata.maxpagesize=4' });
    const delta = read.last['@odata.deltaLink'];
    expect(delta).toContain('$deltatoken=');
    const id = env.a.accounts['Orchardly Foods'];
    expect((await ada.patch(`/api/accounts/${id}`, { name: 'Orchardly Foods Group' })).status).toBe(200);
    const u = new URL(delta);
    const changed = await all(adaKey, `${u.pathname}${u.search}`);
    expect(changed.rows.find((r) => r.Id === id)?.Name).toBe('Orchardly Foods Group');
    // "Changed since" a moment in the future is nothing.
    expect((await json(adaKey, '/api/analytics/v1/Customers.json?since=2999-01-01')).body.rows).toEqual([]);
    await ada.patch(`/api/accounts/${id}`, { name: 'Orchardly Foods' });
  });

  it('the JSON and CSV faces page with a cursor or page numbers', async () => {
    const list = await json(adaKey, '/api/analytics/v1/');
    expect(list.body.datasets.find((d: any) => d.name === 'Tasks').columns.length).toBeGreaterThan(5);
    const first = await json(adaKey, '/api/analytics/v1/Tasks.json?limit=2&count=1');
    expect(first.body.rows).toHaveLength(2);
    expect(first.body.count).toBeGreaterThan(2);
    const u = new URL(first.body.next);
    const second = await json(adaKey, `${u.pathname}${u.search}`);
    expect(second.body.rows.map((r: any) => r.Id)).not.toContain(first.body.rows[0].Id);
    const page2 = await json(adaKey, '/api/analytics/v1/Tasks.json?limit=2&page=2');
    expect(page2.body.rows).toHaveLength(2);
    const csv = await call(adaKey, '/api/analytics/v1/Customers.csv?limit=2&fields=Id,Name,Arr');
    expect(csv.headers.get('content-type')).toMatch(/text\/csv/);
    expect(csv.headers.get('link')).toMatch(/rel="next"/);
    const lines = (await csv.text()).trim().split('\r\n');
    expect(lines[0]).toBe('Id,Name,Arr');
    expect(lines).toHaveLength(3);
  });
});

describe('limits and the record of every pull', () => {
  it('writes each pull down; the activity log gets one line per key, dataset and hour', async () => {
    const token = await newKey(mert, { name: 'Audit me' });
    for (let i = 0; i < 3; i++) await call(token, '/api/analytics/odata/People', { headers: { 'user-agent': 'Microsoft.Data.Mashup (test)' } });
    const pulls = (await mert.get('/api/dev/analytics/pulls')).json.pulls.filter((p: any) => p.dataset === 'People');
    expect(pulls.length).toBe(3);
    expect(pulls[0].tool).toBe('powerquery');
    expect(pulls[0].rows).toBeGreaterThan(0);
    const keys = (await mert.get('/api/dev/analytics/keys')).json.keys;
    expect(keys.find((k: any) => k.name === 'Audit me')).toMatchObject({ pulls: 3, lastTool: 'powerquery' });
    const [{ n }] = await env.db.system((q) =>
      q.query(`select count(*)::int as n from audit_log where org_id = $1 and action = 'analytics.pull' and meta->>'dataset' = 'People' and actor_id = $2`, [env.a.orgId, env.a.ids.mert]),
    );
    expect(n).toBe(1);
    // The key is never in the stored query.
    await call(token, '/api/analytics/odata/People?$top=1', { auth: 'query' });
    const [row] = await env.db.system((q) => q.query(`select query from analytics_pulls where org_id = $1 order by id desc limit 1`, [env.a.orgId]));
    expect(row.query).not.toContain(token);
  });

  it('stops for the day when the company has pulled its budget of rows', async () => {
    await env.db.system((q) => q.query(`update orgs set settings = settings || '{"analytics": {"dailyRows": 1}}' where id = $1`, [env.a.orgId]));
    const r = await json(adaKey, '/api/analytics/odata/Customers');
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('analytics_budget');
    expect(r.headers.get('retry-after')).toBe('3600');
    await env.db.system((q) => q.query(`update orgs set settings = settings - 'analytics' where id = $1`, [env.a.orgId]));
    expect((await call(adaKey, '/api/analytics/odata/Customers')).status).toBe(200);
  });
});
