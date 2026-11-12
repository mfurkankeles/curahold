// Quality measurements, server side: what the API does today in the situations
// QUALITY.md sets targets for. It measures and prints; it changes nothing.
//
//   npx tsx scripts/quality/server.mts
//
// Runs on the in-memory database, in a few seconds. Each line is one fact:
// what was tried, and what came back.
import { login, setup } from '../../tests/helpers';

const env = await setup();
const out: string[] = [];
const say = (topic: string, text: string) => out.push(`${topic.padEnd(14)} ${text}`);
const ada = await login(env, 'beta', 'ada@demo.example'); // the Turkish company
const mert = await login(env, 'beta', 'mert@demo.example');

// ---------------------------------------------------------------- Turkish
// "isik" finds "Işık", "istanbul" finds "İstanbul": search, customer list, and the order of names.
{
  const names = ['Işık Enerji', 'İstanbul Lojistik', 'Şeker Gıda', 'Çağrı Merkezi', 'Öztürk Yapı', 'Ünal Tekstil', 'Irmak Su', 'Cemre Ajans', 'Zeytin Tarım', 'Okyanus Deniz', 'Umut Vakfı', 'Sabah Medya'];
  for (const name of names) await ada.post('/api/accounts', { name });
  const asks: [string, string][] = [
    ['isik', 'Işık Enerji'], ['ISIK', 'Işık Enerji'], ['ışık', 'Işık Enerji'], ['istanbul', 'İstanbul Lojistik'], ['İSTANBUL', 'İstanbul Lojistik'], ['ISTANBUL', 'İstanbul Lojistik'],
    ['seker', 'Şeker Gıda'], ['cagri', 'Çağrı Merkezi'], ['ozturk', 'Öztürk Yapı'], ['unal', 'Ünal Tekstil'], ['irmak', 'Irmak Su'], ['IRMAK', 'Irmak Su'],
  ];
  for (const [label, path, pick] of [
    ['Ctrl K search', (q: string) => `/api/search?q=${encodeURIComponent(q)}`, (j: any) => JSON.stringify(j)],
    ['customer list', (q: string) => `/api/accounts?q=${encodeURIComponent(q)}&limit=50`, (j: any) => JSON.stringify(j.accounts?.map((a: any) => a.name))],
  ] as const) {
    const missed: string[] = [];
    for (const [q, want] of asks) if (!pick((await ada.get(path(q))).json).includes(want)) missed.push(q);
    say('turkish', `${label}: ${asks.length - missed.length}/${asks.length} searches find the name${missed.length ? ` (missed: ${missed.join(', ')})` : ''}`);
  }
  const listed: string[] = (await ada.get('/api/accounts?limit=200')).json.accounts.map((a: any) => a.name).filter((n: string) => names.includes(n));
  const right = [...names].sort(new Intl.Collator('tr').compare);
  const misplaced = listed.filter((n, i) => n !== right[i]).length;
  say('turkish', `order of names in the customer list: ${misplaced === 0 ? 'as a Turkish dictionary has it' : `${misplaced}/${names.length} names out of place (${listed.slice(0, 6).join(', ')}…)`}`);
}

// ---------------------------------------------------------------- two people, one record
{
  const board = env.b.boards.csBoard;
  const { task } = (await ada.post('/api/tasks', { boardId: board, title: 'Aynı anda düzenleme' })).json;
  const first = await ada.patch(`/api/tasks/${task.id}`, { baseVersion: task.version, title: 'Başlık değişti' });
  const other = await mert.patch(`/api/tasks/${task.id}`, { baseVersion: task.version, priority: 'high' });
  const same = await mert.patch(`/api/tasks/${task.id}`, { baseVersion: task.version, title: 'Başka bir başlık' });
  const now = (await ada.get(`/api/tasks/${task.id}`)).json.task;
  say('concurrency', `task, different fields from the same starting version: first ${first.status}, second ${other.status}${other.status === 200 ? ' (merged by the server)' : ` (${other.json?.error}; the app merges and sends again)`}; now title="${now?.title}", priority=${now?.priority}`);
  say('concurrency', `task, the same field: second write ${same.status} ${same.json?.error ?? ''} (${same.status === 409 ? 'refused, the person is told' : 'accepted'})`);

  const acc = (await ada.post('/api/accounts', { name: 'Eşzamanlı Müşteri' })).json.account;
  const a1 = await ada.patch(`/api/accounts/${acc.id}`, { fields: { arr: 1000 } });
  const a2 = await mert.patch(`/api/accounts/${acc.id}`, { fields: { renewal_date: '2027-03-01' } });
  const after = (await ada.get(`/api/accounts/${acc.id}`)).json.account;
  say('concurrency', `customer, different fields one after the other: ${a1.status}, ${a2.status}; both kept: ${after?.fields?.arr === 1000 && after?.fields?.renewal_date === '2027-03-01' ? 'yes' : `NO (${JSON.stringify(after?.fields)})`}`);
  const n1 = await ada.patch(`/api/accounts/${acc.id}`, { name: 'Ada yazdı' });
  const n2 = await mert.patch(`/api/accounts/${acc.id}`, { name: 'Mert yazdı' });
  say('concurrency', `customer, the same field from two people: ${n1.status}, ${n2.status}; ${n2.status === 200 ? 'the second silently replaces the first (no version, no warning)' : 'the second is refused'}`);
  const versioned = await env.db.system((q) => q.query(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'version' order by 1`));
  say('concurrency', `tables with a version number: ${versioned.map((r: any) => r.table_name).join(', ') || 'none'}`);
}

// ---------------------------------------------------------------- the same request twice
{
  const board = env.b.boards.csBoard;
  const key = { 'idempotency-key': 'quality-probe-1' };
  const one = await ada.req('POST', '/api/tasks', { boardId: board, title: 'Çift tıklama' }, key);
  const two = await ada.req('POST', '/api/tasks', { boardId: board, title: 'Çift tıklama' }, key);
  const [{ n }] = await env.db.system((q) => q.query(`select count(*)::int as n from tasks where title = 'Çift tıklama'`));
  say('repeats', `the same "add task" sent twice with one Idempotency-Key: ${one.status}, ${two.status} → ${n} task(s) ${n === 1 ? '(the repeat is recognised)' : '(a copy is made)'}`);
}

// ---------------------------------------------------------------- deleting
// What is deleted goes to the trash and comes back from it, with what hung under it.
{
  const board = env.b.boards.csBoard;
  const { task } = (await ada.post('/api/tasks', { boardId: board, title: 'Silinecek görev' })).json;
  await ada.post(`/api/tasks/${task.id}/comments`, { body: 'Bir yorum' });
  const gone = await ada.del(`/api/tasks/${task.id}`);
  const list = (await ada.get('/api/trash')).json;
  const kept = (list.items ?? []).some((i: any) => i.id === gone.json?.trashId);
  const back = gone.json?.trashId ? await ada.post(`/api/trash/${gone.json.trashId}/restore`) : { status: 0 };
  const [{ n }] = await env.db.system((q) => q.query(`select (select count(*) from tasks where id = $1)::int + (select count(*) from comments where task_id = $1)::int as n`, [task.id]));
  say('deleting', `a deleted task: ${gone.status}; in the trash${kept ? ` for ${list.days} days` : ': no'}; put back: ${back.status}; back with its comment: ${n === 2 ? 'yes' : 'no'}`);
  const acc = (await ada.post('/api/accounts', { name: 'Silinecek Müşteri' })).json.account;
  await ada.post(`/api/accounts/${acc.id}/activities`, { kind: 'note', body: 'Bir not' });
  const gone2 = await ada.del(`/api/accounts/${acc.id}`);
  const back2 = gone2.json?.trashId ? await ada.post(`/api/trash/${gone2.json.trashId}/restore`) : { status: 0 };
  const [{ n: n2 }] = await env.db.system((q) => q.query(`select (select count(*) from accounts where id = $1)::int + (select count(*) from activities where account_id = $1)::int as n`, [acc.id]));
  say('deleting', `a deleted customer: ${gone2.status}; put back: ${back2.status}; back with its timeline: ${n2 === 2 ? 'yes' : 'no'}`);
}

// ---------------------------------------------------------------- headers, limits
{
  const res = await ada.get('/api/me');
  const want = ['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'cache-control'];
  say('security', `headers on an API answer: ${want.map((h) => `${h}=${res.headers.get(h) ? 'yes' : 'no'}`).join(', ')}`);
  let limited = 0;
  const t0 = performance.now();
  for (let i = 0; i < 400; i++) if ((await ada.get('/api/boards')).status === 429) limited++;
  say('security', `400 requests in ${((performance.now() - t0) / 1000).toFixed(1)} s from one person: ${limited ? `${limited} refused (429)` : 'none refused (no general request limit)'}`);
}

// ---------------------------------------------------------------- companies apart
{
  const tables = await env.db.system((q) =>
    q.query(
      `select c.relname as name, c.relrowsecurity as rls,
              exists (select 1 from information_schema.columns k where k.table_schema = 'public' and k.table_name = c.relname and k.column_name = 'org_id') as has_org
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' order by 1`,
    ),
  );
  const withOrg = tables.filter((t: any) => t.has_org);
  const open = withOrg.filter((t: any) => !t.rls).map((t: any) => t.name);
  say('isolation', `tables that hold a company's rows: ${withOrg.length}; with row-level security switched on: ${withOrg.length - open.length}${open.length ? ` (without: ${open.join(', ')})` : ''}`);
  const noOrg = tables.filter((t: any) => !t.has_org).map((t: any) => `${t.name}${t.rls ? '' : '*'}`);
  say('isolation', `tables without a company column (* = no row-level security): ${noOrg.join(', ')}`);
  const routes = (env.app as any).routes.filter((r: any) => r.method !== 'ALL' && r.path.startsWith('/api/'));
  const unique = new Set<string>(routes.map((r: any) => `${r.method} ${r.path}`));
  const withId = [...unique].filter((r) => r.includes(':'));
  say('isolation', `API addresses: ${unique.size}, of which ${withId.length} name a record by id (the ones another company could try)`);
}

console.log(out.join('\n'));
process.exit(0);
