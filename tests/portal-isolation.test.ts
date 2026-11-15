// The customer portal, address by address: someone at a customer reaches only
// what their own company opened to their own customer. Every /papi address is
// listed below with how it is probed; an address added without a probe fails
// the first test. Also: the sign-in link is single-use and time-limited, and a
// session from one company means nothing on another company's portal.
import { beforeAll, describe, expect, it } from 'vitest';
import { createPortalApp } from '../api/src/portal';
import { login, setup, type Env } from './helpers';

const PORTAL = 'curahold-portal.test';
let env: Env;
let portal: ReturnType<typeof createPortalApp>;

class P {
  cookie = '';
  constructor(public slug = 'acme') {}
  async req(method: string, path: string, body?: unknown) {
    const h: Record<string, string> = { 'x-curahold-portal': '1' };
    if (this.cookie) h.cookie = this.cookie;
    if (body !== undefined) h['content-type'] = 'application/json';
    const res = await portal.request(`https://${this.slug}.${PORTAL}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const m = /app_portal=([^;]*)/.exec(res.headers.get('set-cookie') ?? '');
    if (m) this.cookie = m[1] ? `app_portal=${m[1]}` : '';
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, json };
  }
}

const tokenIn = (text: string) => /#token=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? '';
async function enter(slug: string, email: string) {
  const p = new P(slug);
  await p.req('POST', '/papi/auth/start', { email });
  await env.settle();
  expect((await p.req('POST', '/papi/auth/verify', { token: tokenIn(env.email.last(email).text) })).status).toBe(200);
  return p;
}

// What another customer, an unshared task, a closed board and another company hold.
const foreign = { tasks: [] as string[], boards: [] as string[], files: [] as string[] };
let own = '';
let ownFile = '';
let selin: P;

beforeAll(async () => {
  env = await setup({ portalDomain: PORTAL });
  portal = createPortalApp(env.deps);
  const ada = await login(env, 'acme', 'ada@demo.example');
  const mert = await login(env, 'acme', 'mert@demo.example');
  const betaAdmin = await login(env, 'beta', 'ada@demo.example').catch(() => null);
  const quill = env.a.accounts['Quillfield Retail'];
  const velto = env.a.accounts['Velto Mobility'];

  expect((await ada.put('/api/portal/settings', { enabled: true })).status).toBe(200);
  const cols = (await ada.get('/api/boards')).json.boards.find((b: any) => b.id === env.a.boards.csBoard).columns;
  const open = { enabled: true, intake: cols[0].key, labels: {}, fields: ['due', 'assignee', 'priority'] };
  expect((await ada.put(`/api/boards/${env.a.boards.csBoard}/portal`, open)).status).toBe(200);
  await ada.post('/api/portal/users', { accountId: quill, email: 'selin@quillfield.example', name: 'Selin Kaya' });
  await ada.post('/api/portal/users', { accountId: velto, email: 'mila@velto.example', name: 'Mila' });
  await env.settle();
  selin = await enter('acme', 'selin@quillfield.example');
  const mila = await enter('acme', 'mila@velto.example');

  // Selin's own request, with a file.
  const form = new FormData();
  form.set('data', JSON.stringify({ title: 'Our own request' }));
  form.append('files', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], 'own.pdf'));
  const made = await portal.request(`https://acme.${PORTAL}/papi/boards/${env.a.boards.csBoard}/tasks`, { method: 'POST', headers: { 'x-curahold-portal': '1', cookie: selin.cookie }, body: form });
  const mine = (await made.json()).task;
  own = mine.id;
  ownFile = mine.files[0].id;

  // Another customer's request with a file (Mila at Velto).
  const f2 = new FormData();
  f2.set('data', JSON.stringify({ title: 'Velto’s own request' }));
  f2.append('files', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], 'velto.pdf'));
  const theirs = await (await portal.request(`https://acme.${PORTAL}/papi/boards/${env.a.boards.csBoard}/tasks`, { method: 'POST', headers: { 'x-curahold-portal': '1', cookie: mila.cookie }, body: f2 })).json();
  foreign.tasks.push(theirs.task.id);
  foreign.files.push(theirs.task.files[0].id);

  // Quillfield's, but never shared; and a file added inside the company to Selin's own request.
  foreign.tasks.push((await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Quillfield churn risk', accountId: quill })).json.task.id);
  const inside = new FormData();
  inside.set('file', new File(['internal'], 'inside.txt', { type: 'text/plain' }));
  foreign.files.push((await mert.req('POST', `/api/tasks/${own}/files`, inside)).json.file.id);
  // A board never opened to customers.
  foreign.boards.push(env.a.boards.renewals);

  // Another company, with its own portal, board and customer request.
  await env.db.system((q) => q.query(`update orgs set settings = settings || '{"portal":{"enabled":true}}' where slug = 'beta'`));
  const [bb] = await env.db.system((q) => q.query(`select b.id, b.columns, b.org_id from boards b join orgs o on o.id = b.org_id where o.slug = 'beta' order by b.created_at limit 1`));
  await env.db.system((q) => q.query(`update boards set portal = $2 where id = $1`, [bb.id, JSON.stringify({ enabled: true, intake: bb.columns[0].key, labels: {}, fields: [] })]));
  const [acct] = await env.db.system((q) => q.query(`select id from accounts where org_id = $1 limit 1`, [bb.org_id]));
  const [pu] = await env.db.system((q) => q.query(`insert into portal_users (org_id, account_id, email, name, status) values ($1, $2, 'otto@beta-customer.example', 'Otto', 'active') returning id`, [bb.org_id, acct.id]));
  const [bt] = await env.db.system((q) =>
    q.query(`insert into tasks (org_id, board_id, title, status, account_id, position, portal_shared, portal_author_id) values ($1, $2, 'Beta secret', $3, $4, 1, true, $5) returning id`, [bb.org_id, bb.id, bb.columns[0].key, acct.id, pu.id]),
  );
  const [bf] = await env.db.system((q) => q.query(`insert into files (org_id, task_id, name, size, mime, storage_key, portal_author_id) values ($1, $2, 'beta.pdf', 6, 'application/pdf', 'x/y', $3) returning id`, [bb.org_id, bt.id, pu.id]));
  foreign.tasks.push(bt.id);
  foreign.boards.push(bb.id);
  foreign.files.push(bf.id);
  void betaAdmin;
});

type Probe = (p: P) => Promise<void>;
const none = (statuses: number[]) => (s: number) => expect(statuses, `got ${s}`).toContain(s);
const notFound = none([404]);

/** Every portal address, and how it is held to the person's own company and customer. */
const PROBES: Record<string, Probe> = {
  'GET /papi/org': async (p) => expect((await p.req('GET', '/papi/org')).json.name).toBe('Demo Company'),
  'GET /papi/logo': async (p) => none([404, 200])((await p.req('GET', '/papi/logo')).status),
  'GET /papi/me': async (p) => expect((await p.req('GET', '/papi/me')).json.user.email).toBe('selin@quillfield.example'),
  'GET /papi/account': async (p) => expect((await p.req('GET', '/papi/account')).json.email).toBe('selin@quillfield.example'),
  'GET /papi/boards/:id/tasks': async (p) => {
    for (const b of foreign.boards) notFound((await p.req('GET', `/papi/boards/${b}/tasks`)).status);
    const list = (await p.req('GET', `/papi/boards/${env.a.boards.csBoard}/tasks`)).json.tasks.map((t: any) => t.id);
    expect(list).toEqual([own]);
  },
  'POST /papi/boards/:id/tasks': async (p) => {
    for (const b of foreign.boards) notFound((await p.req('POST', `/papi/boards/${b}/tasks`, { title: 'Sneaky request' })).status);
  },
  'GET /papi/tasks/:id': async (p) => {
    for (const t of foreign.tasks) notFound((await p.req('GET', `/papi/tasks/${t}`)).status);
    const t = (await p.req('GET', `/papi/tasks/${own}`)).json.task;
    expect(t.files.map((f: any) => f.id)).toEqual([ownFile]);
  },
  'POST /papi/tasks/:id/comments': async (p) => {
    for (const t of foreign.tasks) notFound((await p.req('POST', `/papi/tasks/${t}/comments`, { body: 'hello?' })).status);
  },
  'POST /papi/tasks/:id/approve': async (p) => {
    for (const t of foreign.tasks) notFound((await p.req('POST', `/papi/tasks/${t}/approve`, {})).status);
  },
  'GET /papi/files/:id': async (p) => {
    for (const f of foreign.files) notFound((await p.req('GET', `/papi/files/${f}`)).status);
    expect((await p.req('GET', `/papi/files/${ownFile}`)).status).toBe(200);
  },
  'DELETE /papi/account/passkeys/:id': async (p) => notFound((await p.req('DELETE', `/papi/account/passkeys/${crypto.randomUUID()}`)).status),
  'DELETE /papi/account/identities/:provider': async (p) => none([200, 400, 404])((await p.req('DELETE', '/papi/account/identities/google')).status),
  // Sign-in and the person's own settings act only on the signed-in person (portal-signin.test.ts goes deeper).
  'POST /papi/account/passkeys/options': async (p) => none([200, 400])((await p.req('POST', '/papi/account/passkeys/options', {})).status),
  'POST /papi/account/passkeys': async (p) => none([400])((await p.req('POST', '/papi/account/passkeys', { challengeId: crypto.randomUUID(), response: {} })).status),
  'PUT /papi/account/password': async (p) => none([400, 403])((await p.req('PUT', '/papi/account/password', { password: 'short' })).status),
  'POST /papi/account/signout-all': async () => undefined, // run last, in its own test below
  'POST /papi/auth/start': async (p) => expect((await p.req('POST', '/papi/auth/start', { email: 'otto@beta-customer.example' })).status).toBe(200),
  'POST /papi/auth/verify': async (p) => none([400])((await p.req('POST', '/papi/auth/verify', { token: 'x'.repeat(43) })).status),
  'POST /papi/auth/code': async (p) => none([400, 401])((await p.req('POST', '/papi/auth/code', { email: 'otto@beta-customer.example', code: '000000' })).status),
  'POST /papi/auth/password': async (p) => none([400, 401, 403])((await p.req('POST', '/papi/auth/password', { email: 'otto@beta-customer.example', password: 'whatever-long' })).status),
  'POST /papi/auth/forgot': async (p) => none([200, 400])((await p.req('POST', '/papi/auth/forgot', { email: 'otto@beta-customer.example' })).status),
  'POST /papi/auth/reset': async (p) => none([400])((await p.req('POST', '/papi/auth/reset', { token: 'x'.repeat(43), password: 'a-new-password' })).status),
  'POST /papi/auth/passkey/options': async (p) => none([200, 403])((await p.req('POST', '/papi/auth/passkey/options', {})).status),
  'POST /papi/auth/passkey': async (p) => none([400, 401, 403])((await p.req('POST', '/papi/auth/passkey', { challengeId: crypto.randomUUID(), response: {} })).status),
  'GET /papi/auth/oauth/:provider/start': async (p) => none([302, 400, 403, 404])((await p.req('GET', '/papi/auth/oauth/google/start')).status),
  'POST /papi/auth/logout': async () => undefined, // ends the session: covered by portal-signin.test.ts
};

describe('every portal address', () => {
  it('has a probe here (a new address cannot be added without one)', () => {
    const routes = [...new Set(portal.routes.filter((r) => r.path.startsWith('/papi/') && r.method !== 'ALL' && r.path !== '/papi/*').map((r) => `${r.method} ${r.path}`))];
    const missing = routes.filter((r) => !PROBES[r]);
    expect(missing, `addresses without an isolation probe: ${missing.join(', ')}`).toEqual([]);
  });

  it('reaches only the person’s own company and customer', async () => {
    for (const [route, probe] of Object.entries(PROBES)) {
      try {
        await probe(selin);
      } catch (e) {
        throw new Error(`${route}: ${(e as Error).message}`);
      }
    }
    // Nothing anyone reached above left a trace in another customer's or company's records.
    const [n] = await env.db.system((q) => q.query(`select count(*)::int as n from tasks where title = 'Sneaky request'`));
    expect(n.n).toBe(0);
    const [c] = await env.db.system((q) => q.query(`select count(*)::int as n from comments where body = 'hello?'`));
    expect(c.n).toBe(0);
    // Another company's person asked for links on this portal: nothing was sent.
    await env.settle();
    expect(env.email.sent.filter((m) => m.to === 'otto@beta-customer.example')).toHaveLength(0);
  });

  it('without a session, everything but signing in answers 401', async () => {
    const anon = new P();
    for (const path of ['/papi/me', '/papi/account', `/papi/boards/${env.a.boards.csBoard}/tasks`, `/papi/tasks/${own}`, `/papi/files/${ownFile}`]) expect((await anon.req('GET', path)).status, path).toBe(401);
    for (const path of [`/papi/tasks/${own}/comments`, `/papi/tasks/${own}/approve`, `/papi/boards/${env.a.boards.csBoard}/tasks`]) expect((await anon.req('POST', path, { body: 'x', title: 'xyz' })).status, path).toBe(401);
  });

  it('a session from this company means nothing on another company’s portal', async () => {
    const beta = new P('beta');
    beta.cookie = selin.cookie;
    for (const path of ['/papi/me', `/papi/tasks/${foreign.tasks.at(-1)}`, `/papi/files/${foreign.files.at(-1)}`]) expect((await beta.req('GET', path)).status, path).toBe(401);
  });
});

describe('the sign-in link', () => {
  it('works once, and not after its time', async () => {
    const p = new P();
    await p.req('POST', '/papi/auth/start', { email: 'mila@velto.example' });
    await env.settle();
    const token = tokenIn(env.email.last('mila@velto.example').text);
    // Past its half hour: refused, and still refused when tried again.
    await env.db.system((q) => q.query(`update portal_tokens set expires_at = now() - interval '1 second' where used_at is null and kind = 'link'`));
    expect((await p.req('POST', '/papi/auth/verify', { token })).status).toBe(400);
    await p.req('POST', '/papi/auth/start', { email: 'mila@velto.example' });
    await env.settle();
    const fresh = tokenIn(env.email.last('mila@velto.example').text);
    expect((await new P().req('POST', '/papi/auth/verify', { token: fresh })).status).toBe(200);
    expect((await new P().req('POST', '/papi/auth/verify', { token: fresh })).status).toBe(400);
  });

  it('signing out everywhere ends every session at once', async () => {
    const other = await enter('acme', 'selin@quillfield.example');
    expect((await selin.req('POST', '/papi/account/signout-all', {})).status).toBe(200);
    expect((await other.req('GET', '/papi/me')).status).toBe(401);
    expect((await selin.req('GET', '/papi/me')).status).toBe(401);
  });
});
