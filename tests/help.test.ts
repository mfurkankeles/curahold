// Asking for help and letting support in: the request with its files and
// context, the support desk's message, consent (checkbox → grant), the
// company policy, support's entry link and session, what support can and
// cannot do, revoking, and the activity log.
import { beforeAll, describe, expect, it } from 'vitest';
import { cleanPageUrl } from '../api/src/routes/help';
import { supportBlocked } from '../api/src/lib/support';
import { BASE, Client, login, setup, type Env } from './helpers';

const STAFF_KEY = 'staff-key-staff-key-staff-key-0123';
let env: Env;
let ada: Client; // admin
let zeynep: Client; // member
let sofia: Client; // viewer

const png = () => new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0])], 'screen.png', { type: 'image/png' });

function helpForm(data: unknown, files: File[] = []) {
  const f = new FormData();
  f.set('data', JSON.stringify(data));
  for (const x of files) f.append('files', x);
  return f;
}

const base = {
  category: 'bug',
  impact: 'blocking',
  subject: 'Renewal board does not load',
  description: 'I expected the board to open; it spins forever since this morning.',
  steps: '1. Open Renewals\n2. Wait',
  pageUrl: 'https://acme.curahold.test/boards/123?view=list&token=abc#secret',
  context: {
    browser: 'Chrome 131 on macOS',
    viewport: '1440×900',
    version: '0.1.0',
    pages: ['/home', '/boards/123'],
    errors: [{ at: '2026-11-11T09:00:00Z', message: 'TypeError: x is undefined' }],
    failed: [{ at: '2026-11-11T09:00:01Z', method: 'GET', path: '/api/boards/123', status: 500 }],
  },
};

/** Support's own tooling: an entry link for a grant, then the browser that opens it. */
async function enter(grantId: string, staff = 'Deniz (Curahold support)') {
  const link = await env.app.request(`https://acme.${BASE}/api/support/enter-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-curahold-staff-key': STAFF_KEY },
    body: JSON.stringify({ grantId, staff }),
  });
  const made = await link.json();
  if (link.status !== 201) return { status: link.status, json: made, browser: null as any };
  const token = new URL(made.url).hash.replace('#token=', '');
  const browser = new Client(env, 'acme');
  const res = await env.app.request(`https://acme.${BASE}/api/support/enter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-curahold-device': browser.device },
    body: JSON.stringify({ token }),
  });
  const cookie = /app_support=([^;]*)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
  browser.cookie = cookie ? `app_support=${cookie}` : '';
  return { status: res.status, json: await res.json(), browser, token, setCookie: res.headers.get('set-cookie') ?? '' };
}

beforeAll(async () => {
  env = await setup({ staffKey: STAFF_KEY, support: { email: 'desk@curahold.test' } });
  ada = await login(env, 'acme', 'ada@demo.example');
  zeynep = await login(env, 'acme', 'zeynep@demo.example');
  sofia = await login(env, 'acme', 'sofia@demo.example');
  // The default lets only administrators let support in; these tests are about everyone doing so.
  await ada.put('/api/support/policy', { policy: 'anyone' });
});

describe('a help request', () => {
  it('arrives with its files, a cleaned page address and the context the person kept', async () => {
    const res = await zeynep.post('/api/help', helpForm(base, [png()]));
    expect(res.status).toBe(201);
    expect(res.json.request.ref).toMatch(/^CH-\d{6}$/);
    expect(res.json.grant).toBeNull();
    await env.settle();

    const desk = env.email.last('desk@curahold.test');
    expect(desk.subject).toContain(res.json.request.ref);
    expect(desk.subject).toContain('BLOCKING');
    expect(desk.text).toContain('Zeynep');
    expect(desk.text).toContain('TypeError: x is undefined');
    expect(desk.text).toContain('GET /api/boards/123 → 500');
    expect(desk.text).toContain('No access granted');
    // Secrets in the address never travel.
    expect(desk.text).not.toContain('abc');
    expect(desk.text).not.toContain('#secret');
    // The person gets a receipt with the reference.
    expect(env.email.last('zeynep@demo.example').subject).toContain(res.json.request.ref);

    // The desk's file link works without signing in; a tampered one does not.
    const link = /(https:\/\/\S+\/api\/help-files\/\S+)/.exec(desk.text)![1];
    const ok = await env.app.request(link);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    const bad = await env.app.request(link.replace(/s=[0-9a-f]{4}/, 's=0000'));
    expect(bad.status).toBe(404);

    const mine = await zeynep.get('/api/help');
    expect(mine.json.requests[0]).toMatchObject({ ref: res.json.request.ref, status: 'received', files: [{ name: 'screen.png' }] });
  });

  it('refuses files it should not take and requests without enough to act on', async () => {
    const exe = new File([new Uint8Array([77, 90])], 'tool.exe', { type: 'application/x-msdownload' });
    expect((await zeynep.post('/api/help', helpForm(base, [exe]))).json.error).toBe('help_file_type');
    expect((await zeynep.post('/api/help', helpForm(base, Array.from({ length: 7 }, png)))).json.error).toBe('help_too_many_files');
    const thin = await zeynep.post('/api/help', { ...base, description: 'broken' });
    expect(thin.status).toBe(400);
    expect(thin.json.fields).toContain('description');
  });

  it('other people do not see someone’s requests; administrators see the company’s', async () => {
    const lena = await login(env, 'acme', 'lena@demo.example');
    expect((await lena.get('/api/help')).json.requests).toHaveLength(0);
    const all = await ada.get('/api/help?all=1');
    expect(all.json.requests.some((r: any) => r.userName === 'Zeynep Tunç')).toBe(true);
    // Another company never does.
    const beta = await login(env, 'beta', 'ada@demo.example');
    expect((await beta.get('/api/help?all=1')).json.requests).toHaveLength(0);
  });

  it('keeps no secrets from the page address', () => {
    expect(cleanPageUrl('https://a.example/x?q=1&access_token=zzz#k')).toBe('https://a.example/x?q=1&access_token=%E2%80%A6');
    expect(cleanPageUrl('not an address')).toBeNull();
  });
});

describe('support access, only with consent', () => {
  let grantId = '';

  it('the checkbox on a request opens read-only access for a day', async () => {
    const res = await zeynep.post('/api/help', helpForm({ ...base, grant: { hours: 24, level: 'view' } }));
    expect(res.status).toBe(201);
    expect(res.json.grant).toMatchObject({ level: 'view', active: true });
    grantId = res.json.grant.id;
    const hours = (Date.parse(res.json.grant.expiresAt) - Date.now()) / 3600e3;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
    await env.settle();
    expect(env.email.last('desk@curahold.test').text).toContain(`Grant ${grantId}`);
    const me = await zeynep.get('/api/me');
    expect(me.json.supportOpen).toMatchObject({ level: 'view', count: 1 });
  });

  it('only an administrator may allow changes', async () => {
    expect((await zeynep.post('/api/support/grants', { hours: 24, level: 'edit' })).json.error).toBe('support_edit_admins');
    expect((await zeynep.post('/api/support/grants', { hours: 5, level: 'view' })).status).toBe(400);
  });

  it('support needs its staff key, and an entry link works once', async () => {
    const noKey = await env.app.request(`https://acme.${BASE}/api/support/enter-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-curahold-staff-key': 'wrong-wrong-wrong-wrong-wrong' },
      body: JSON.stringify({ grantId, staff: 'Someone' }),
    });
    expect(noKey.status).toBe(403);

    const s = await enter(grantId);
    expect(s.status).toBe(200);
    expect(s.setCookie).toMatch(/HttpOnly/i);
    expect(s.setCookie).toMatch(/SameSite=Strict/i);
    expect(s.setCookie).toMatch(/Secure/i);
    const again = await env.app.request(`https://acme.${BASE}/api/support/enter`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-curahold-device': 'x'.repeat(20) },
      body: JSON.stringify({ token: s.token }),
    });
    expect(again.status).toBe(400);

    // Inside: support sees what Zeynep sees, as Zeynep, read only.
    const me = await s.browser.get('/api/me');
    expect(me.json.user.email).toBe('zeynep@demo.example');
    expect(me.json.supportBy).toMatchObject({ staff: 'Deniz (Curahold support)', level: 'view' });
    expect(me.json.user.seat).toBe('viewer');
    const zAccounts = (await zeynep.get('/api/accounts')).json.accounts.map((a: any) => a.id).sort();
    const sAccounts = (await s.browser.get('/api/accounts')).json.accounts.map((a: any) => a.id).sort();
    expect(sAccounts).toEqual(zAccounts);
    const write = await s.browser.post('/api/boards', { name: 'Should not exist', visibility: 'private' });
    expect(write.json.error).toBe('support_read_only');
    // Never: devices, keys, support access itself.
    for (const p of ['/api/me/sessions', '/api/dev/keys', '/api/support/grants']) {
      expect((await s.browser.get(p)).json.error).toBe('support_blocked');
    }
    // The other company stays out of reach, cookie or not.
    const beta = await env.app.request(`https://beta.${BASE}/api/me`, { headers: { cookie: s.browser.cookie } });
    expect(beta.status).toBe(401);

    // Leaving ends the session.
    await s.browser.post('/api/support/leave');
    expect((await s.browser.get('/api/me')).status).toBe(401);
  });

  it('revoking closes the door at once, sessions included', async () => {
    const s = await enter(grantId);
    expect((await s.browser.get('/api/me')).status).toBe(200);
    expect((await zeynep.del(`/api/support/grants/${grantId}`)).status).toBe(200);
    const after = await s.browser.get('/api/me');
    expect(after.status).toBe(401);
    expect(after.json.error).toBe('support_ended');
    expect((await enter(grantId)).status).toBe(401);
    expect((await zeynep.get('/api/me')).json.supportOpen).toBeUndefined();
  });

  it('an administrator’s edit grant lets support fix things, and every change is logged', async () => {
    const g = await ada.post('/api/support/grants', { hours: 72, level: 'edit' });
    expect(g.status).toBe(201);
    const s = await enter(g.json.grant.id);
    const made = await s.browser.post('/api/boards', { name: 'Fixed by support', visibility: 'private' });
    expect(made.status).toBe(201);
    // Still never: inviting people, roles, keys.
    expect((await s.browser.post('/api/admin/users', { email: 'x@demo.example' })).json.error).toBe('support_blocked');
    expect((await s.browser.post('/api/dev/keys', { name: 'k', canWrite: true })).json.error).toBe('support_blocked');
    const log = await ada.get('/api/admin/audit?limit=50');
    const actions = (log.json.entries ?? log.json.items ?? log.json).map((e: any) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['support.granted', 'support.entered', 'support.changed']));
    await ada.del(`/api/support/grants/${g.json.grant.id}`);
  });

  it('a viewer cannot pass on more than they have, and the company policy rules', async () => {
    // A viewer's grant is read only by nature.
    const v = await sofia.post('/api/support/grants', { hours: 24, level: 'view' });
    expect(v.status).toBe(201);
    // Administrators only: everyone else's open grants end with it.
    const p = await ada.put('/api/support/policy', { policy: 'admins' });
    expect(p.json).toMatchObject({ policy: 'admins', ended: 1 });
    expect((await sofia.post('/api/support/grants', { hours: 24, level: 'view' })).json.error).toBe('support_not_allowed');
    expect((await zeynep.put('/api/support/policy', { policy: 'anyone' })).status).toBe(403);
    const adminGrant = await ada.post('/api/support/grants', { hours: 24, level: 'view' });
    expect(adminGrant.status).toBe(201);
    // Off: nobody, and an open session ends on its next request.
    const s = await enter(adminGrant.json.grant.id);
    await ada.put('/api/support/policy', { policy: 'off' });
    expect((await s.browser.get('/api/me')).status).toBe(401);
    expect((await ada.post('/api/support/grants', { hours: 24, level: 'view' })).json.error).toBe('support_not_allowed');
    const list = await ada.get('/api/support/grants?all=1');
    expect(list.json).toMatchObject({ policy: 'off', canGrant: false });
    expect(list.json.grants.every((x: any) => !x.active)).toBe(true);
    await ada.put('/api/support/policy', { policy: 'anyone' });
  });

  it('knows which paths are closed to support', () => {
    expect(supportBlocked('GET', '/api/me')).toBe(false);
    expect(supportBlocked('PATCH', '/api/me')).toBe(true);
    expect(supportBlocked('GET', '/api/me/calendar')).toBe(true);
    expect(supportBlocked('POST', '/api/tasks')).toBe(false);
    expect(supportBlocked('PUT', '/api/connections/x/sync')).toBe(false);
    expect(supportBlocked('POST', '/api/connections/key')).toBe(true);
    expect(supportBlocked('DELETE', '/api/connections/abc')).toBe(true);
    expect(supportBlocked('GET', '/api/admin/users/1/export')).toBe(true);
  });

  it('the desk marks a request answered with its key', async () => {
    const [r] = (await zeynep.get('/api/help')).json.requests;
    const res = await env.app.request(`https://acme.${BASE}/api/support/requests/${r.ref}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-curahold-staff-key': STAFF_KEY },
      body: JSON.stringify({ status: 'answered' }),
    });
    expect(res.status).toBe(200);
    expect((await zeynep.get('/api/help')).json.requests[0].status).toBe('answered');
  });
});
