// Curahold's own support desk with people of its own: signing in with a code
// sent to a staff address, what a session can and cannot do, taking a request,
// answering it, closing it, getting in to look (only with the person's
// consent) — and that none of it is reachable any other way.
import { beforeAll, describe, expect, it } from 'vitest';
import { BASE, Client, login, setup, type Env } from './helpers';

const STAFF_KEY = 'staff-key-staff-key-staff-key-1234';
const DENIZ = 'deniz.aksoy@curahold.test';
const EMRE = 'emre@curahold.test';
// The desk lives on a host of its own, apart from sign-up (app.) and the sales site.
const DESK = `https://desk.${BASE}`;
const CENTRAL = `https://app.${BASE}`;

let env: Env;
let ada: Client;
let lena: Client;

/** A browser at the central address: keeps the desk's cookie, sends the header every change needs. */
class Desk {
  cookie = '';
  attrs = '';
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = { 'x-curahold-desk': '1' }, host = DESK) {
    const r = await env.app.request(`${host}/api/desk${path}`, { method, headers: { ...headers, ...(this.cookie ? { cookie: this.cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers.get('set-cookie');
    const m = set && /desk_session=([^;]*)/.exec(set);
    if (m) {
      this.cookie = m[1] ? `desk_session=${m[1]}` : '';
      this.attrs = set!;
    }
    return { status: r.status, json: (await r.json().catch(() => null)) as any };
  }
  async signIn(email: string) {
    const sent = await this.req('POST', '/sign-in', { email });
    const done = await this.req('POST', '/sign-in/verify', { email, code: sent.json.devCode });
    expect(done.status, JSON.stringify(done.json)).toBe(200);
    return done.json;
  }
}
const codeMails = (to: string) => env.email.sent.filter((m) => m.to === to && /desk code/.test(m.subject));
async function ask(c: Client, over: Record<string, unknown> = {}) {
  const r = await c.post('/api/help', { category: 'question', subject: 'How do I import renewals?', description: 'I have a sheet with renewal dates.', ...over });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  await env.settle();
  return r.json.request as { id: string; ref: string };
}

beforeAll(async () => {
  env = await setup({ staffKey: STAFF_KEY, support: { email: 'desk@curahold.test', staff: [DENIZ, EMRE] } });
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
});

describe('signing in to the desk', () => {
  it('sends a code only to an address on the staff list, and says the same either way', async () => {
    const d = new Desk();
    const stranger = await d.req('POST', '/sign-in', { email: 'ada@demo.example' });
    expect(stranger).toMatchObject({ status: 200, json: { ok: true } });
    expect(stranger.json.devCode).toBeUndefined();
    expect(codeMails('ada@demo.example')).toHaveLength(0);
    const staff = await d.req('POST', '/sign-in', { email: ` ${DENIZ.toUpperCase()} ` });
    expect(staff.status).toBe(200);
    const [mail] = codeMails(DENIZ);
    expect(mail.subject).toMatch(/^\d{6} is your Curahold desk code$/);
    expect(mail.text).toContain(staff.json.devCode);
    // Only the code's digest is kept.
    const [row] = await env.db.system((q) => q.query('select code_hash, attempts from desk_codes where email = $1', [DENIZ]));
    expect(row.code_hash).not.toContain(staff.json.devCode);
    expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the right code opens a session for this browser only; it works once', async () => {
    const d = new Desk();
    const sent = await d.req('POST', '/sign-in', { email: DENIZ });
    const code = sent.json.devCode as string;
    expect((await d.req('POST', '/sign-in/verify', { email: EMRE, code })).status).toBe(401);
    const ok = await d.req('POST', '/sign-in/verify', { email: DENIZ, code });
    expect(ok.status).toBe(200);
    expect(ok.json.staff).toEqual({ email: DENIZ, name: 'Deniz Aksoy' });
    expect(d.attrs).toMatch(/HttpOnly/i);
    expect(d.attrs).toMatch(/SameSite=Strict/i);
    expect(d.attrs).toMatch(/Secure/i);
    expect(d.attrs).toMatch(/Path=\/api\/desk/i);
    expect((await d.req('GET', '/me')).json.staff).toEqual({ email: DENIZ, name: 'Deniz Aksoy' });
    expect((await new Desk().req('POST', '/sign-in/verify', { email: DENIZ, code })).status).toBe(401);
    const [log] = await env.db.system((q) => q.query(`select staff_email from desk_log where action = 'signed_in' order by id desc limit 1`));
    expect(log.staff_email).toBe(DENIZ);
  });

  it('five wrong tries spend a code, and no more than five codes an hour are sent', async () => {
    const d = new Desk();
    const sent = await d.req('POST', '/sign-in', { email: EMRE });
    const right = sent.json.devCode as string;
    const wrong = right === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await d.req('POST', '/sign-in/verify', { email: EMRE, code: wrong })).status).toBe(401);
    expect((await d.req('POST', '/sign-in/verify', { email: EMRE, code: right })).status).toBe(401);
    const before = codeMails(EMRE).length;
    for (let i = 0; i < 6; i++) await d.req('POST', '/sign-in', { email: EMRE });
    expect(codeMails(EMRE).length - before).toBe(4);
    expect((await d.req('POST', '/sign-in/verify', { email: EMRE, code: '12345' })).status).toBe(400);
  });

  it('a session is nothing without the header a form cannot send, off the desk’s own host, or after its owner leaves the team', async () => {
    const d = new Desk();
    await d.signIn(DENIZ);
    const r = await ask(lena);
    expect((await d.req('PUT', `/requests/${r.ref}/owner`, { mine: true }, {})).status).toBe(403);
    expect((await d.req('GET', '/requests', undefined, {}, `https://acme.${BASE}`)).status).toBe(403);
    expect((await d.req('POST', '/sign-in', { email: DENIZ }, {}, `https://acme.${BASE}`)).status).toBe(404);
    // Sign-up's central address is not the desk any more: no signing in there, and the cookie does not count.
    expect((await d.req('POST', '/sign-in', { email: DENIZ }, {}, CENTRAL)).status).toBe(404);
    expect((await d.req('GET', '/me', undefined, {}, CENTRAL)).status).toBe(401);
    // A port is not part of the address's name (a local run, a forwarded port).
    expect((await d.req('GET', '/me', undefined, {}, `${DESK}:8443`)).status).toBe(200);
    // Signed with the server's secret, but not as a desk session: refused.
    const { sign } = await import('../api/src/lib/crypto');
    const forged = new Desk();
    forged.cookie = `desk_session=${await sign({ desk: 1, e: DENIZ, x: Date.now() + 3600_000 }, env.config.authSecret)}`;
    expect((await forged.req('GET', '/requests')).status).toBe(403);
    // Asked who they are, someone without a session is told they are not signed in.
    expect((await forged.req('GET', '/me')).status).toBe(401);
    const late = new Desk();
    late.cookie = `desk_session=${await sign({ desk: 1, e: DENIZ, x: Date.now() - 1000 }, `${env.config.authSecret}:desk`)}`;
    expect((await late.req('GET', '/requests')).status).toBe(403);
    env.config.support!.staff = [EMRE];
    expect((await d.req('GET', '/requests')).status).toBe(403);
    env.config.support!.staff = [DENIZ, EMRE];
    expect((await d.req('GET', '/me')).status).toBe(200);
    await d.req('POST', '/sign-out');
    expect(d.cookie).toBe('');
  });

  it('nothing a company has opens the desk: not its session, not an API key', async () => {
    expect((await ada.get('/api/desk/requests')).status).toBe(403);
    const { token } = (await ada.post('/api/dev/keys', { name: 'k', canWrite: true })).json;
    const r = await env.app.request(`${DESK}/api/desk/requests`, { headers: { authorization: `Bearer ${token}` } });
    expect(r.status).toBe(403);
    // The application's database role cannot read the desk's own tables at all.
    for (const table of ['desk_codes', 'desk_claims', 'desk_log']) {
      await expect(env.db.tenant({ orgId: env.a.orgId, userId: env.a.ids.ada }, (q) => q.query(`select count(*) from ${table}`))).rejects.toThrow(/permission denied/);
    }
  });
});

describe('working a request', () => {
  const deniz = new Desk();
  const emre = new Desk();
  let r: { id: string; ref: string };
  beforeAll(async () => {
    // The tests above used up this hour's codes.
    await env.db.system((q) => q.query('delete from desk_codes'));
    await deniz.signIn(DENIZ);
    await emre.signIn(EMRE);
    r = await ask(lena, { subject: 'Renewal dates do not show', impact: 'blocking', neededBy: '2027-01-10' });
  });

  it('the queues say how much is waiting where', async () => {
    const me = (await deniz.req('GET', '/me')).json;
    expect(me.counts.received).toBeGreaterThanOrEqual(1);
    expect(me.counts.unclaimed).toBe(me.counts.received);
    expect(me.counts.mine).toBe(0);
    const unclaimed = (await deniz.req('GET', '/requests?status=received&unclaimed=1')).json.requests;
    expect(unclaimed.map((x: any) => x.ref)).toContain(r.ref);
    // What stops someone's work comes first.
    expect(unclaimed[0]).toMatchObject({ ref: r.ref, impact: 'blocking', neededBy: '2027-01-10', owner: null });
  });

  it('opening a request shows the company, who asked and their other requests, and is written down', async () => {
    const one = (await deniz.req('GET', `/requests/${r.ref}`)).json.request;
    expect(one.company).toMatchObject({ slug: 'acme', name: 'Demo Company', url: `https://acme.${BASE}`, plan: 'trial' });
    expect(one.company.people).toBeGreaterThan(3);
    expect(one.from).toMatchObject({ name: 'Lena Fischer', email: 'lena@demo.example' });
    expect(one.from.role).toBeTruthy();
    expect(one.access).toBeNull();
    expect(one.others.length).toBeGreaterThanOrEqual(1);
    expect(one.others.every((o: any) => o.ref !== r.ref)).toBe(true);
    const log = await env.db.system((q) => q.query(`select staff_email, action from desk_log where ref = $1 order by id`, [r.ref]));
    expect(log).toEqual([{ staff_email: DENIZ, action: 'opened' }]);
  });

  it('taking it makes it mine; a colleague can take it over; letting go frees it', async () => {
    expect((await deniz.req('PUT', `/requests/${r.ref}/owner`, { mine: true })).json).toEqual({ owner: DENIZ });
    expect((await deniz.req('GET', '/requests?mine=1')).json.requests.map((x: any) => x.ref)).toEqual([r.ref]);
    expect((await emre.req('GET', '/requests?mine=1')).json.requests).toEqual([]);
    expect((await deniz.req('GET', '/me')).json.counts.mine).toBe(1);
    expect((await emre.req('PUT', `/requests/${r.ref}/owner`, { mine: true })).json).toEqual({ owner: EMRE });
    expect((await deniz.req('GET', `/requests/${r.ref}`)).json.request.owner).toBe(EMRE);
    expect((await emre.req('PUT', `/requests/${r.ref}/owner`, { mine: false })).json).toEqual({ owner: null });
    // Tooling with the key names nobody, so it cannot take a request.
    const key = await env.app.request(`${DESK}/api/desk/requests/${r.ref}/owner`, { method: 'PUT', headers: { 'x-curahold-staff-key': STAFF_KEY, 'content-type': 'application/json' }, body: '{"mine":true}' });
    expect(key.status).toBe(403);
  });

  it('an answer goes to the person signed with a name, takes the request, and hands them the turn', async () => {
    env.email.sent.length = 0;
    const a = await deniz.req('POST', `/requests/${r.ref}/messages`, { body: 'Which column holds the date?' });
    expect(a.status).toBe(201);
    await env.settle();
    const one = (await deniz.req('GET', `/requests/${r.ref}`)).json.request;
    expect(one).toMatchObject({ status: 'answered', owner: DENIZ });
    expect(one.messages.at(-1)).toMatchObject({ author: 'support', name: 'Deniz Aksoy', internal: false, via: 'desk' });
    expect(env.email.sent.some((m) => m.to === 'lena@demo.example' && m.text.includes('Which column holds the date?'))).toBe(true);
    // In the product the person sees the answer, and who it is from.
    const hers = (await lena.get(`/api/help/${r.id}`)).json.request;
    expect(hers.messages.at(-1)).toMatchObject({ body: 'Which column holds the date?' });
    expect(JSON.stringify(hers)).not.toContain(DENIZ);
    const b = await emre.req('POST', `/requests/${r.ref}/messages`, { body: 'Seen this before with merged cells.', staff: 'Emre', internal: true });
    expect(b.status).toBe(201);
    await env.settle();
    // A note changes nothing the company can see, and does not move the request to its writer.
    const after = (await deniz.req('GET', `/requests/${r.ref}`)).json.request;
    expect(after).toMatchObject({ status: 'answered', owner: DENIZ });
    expect(after.messages.at(-1)).toMatchObject({ internal: true, name: 'Emre' });
    expect(JSON.stringify((await lena.get(`/api/help/${r.id}`)).json)).not.toContain('merged cells');
    expect(env.email.sent.some((m) => m.to === 'lena@demo.example' && m.text.includes('merged cells'))).toBe(false);
    const log = await env.db.system((q) => q.query(`select staff_email, action, message_id is not null as has from desk_log where ref = $1 and action in ('answered', 'noted') order by id`, [r.ref]));
    expect(log).toEqual([{ staff_email: DENIZ, action: 'answered', has: true }, { staff_email: EMRE, action: 'noted', has: true }]);
    // The key still works for tooling, and must say who is answering.
    const noName = await env.app.request(`${DESK}/api/desk/requests/${r.ref}/messages`, { method: 'POST', headers: { 'x-curahold-staff-key': STAFF_KEY, 'content-type': 'application/json' }, body: '{"body":"x"}' });
    expect(noName.status).toBe(400);
  });

  it('closing and reopening need no message, and tell the company nothing by email', async () => {
    env.email.sent.length = 0;
    expect((await deniz.req('PUT', `/requests/${r.ref}/status`, { status: 'solved' })).json).toEqual({ status: 'solved' });
    expect((await lena.get(`/api/help/${r.id}`)).json.request.status).toBe('solved');
    expect((await deniz.req('GET', '/requests?status=solved')).json.requests.map((x: any) => x.ref)).toContain(r.ref);
    expect((await deniz.req('PUT', `/requests/${r.ref}/status`, { status: 'received' })).status).toBe(200);
    expect((await deniz.req('PUT', `/requests/${r.ref}/status`, { status: 'whatever' })).status).toBe(400);
    expect((await deniz.req('PUT', '/requests/CH-999999/status', { status: 'solved' })).status).toBe(404);
    await env.settle();
    expect(env.email.sent).toHaveLength(0);
  });

  it('gets inside only while the person has let support in, as them, and their company sees who came', async () => {
    expect((await deniz.req('POST', `/requests/${r.ref}/enter-link`)).status).toBeGreaterThanOrEqual(400);
    await (await login(env, 'acme', 'ada@demo.example')).put('/api/support/policy', { policy: 'anyone' });
    const granted = await lena.post('/api/support/grants', { hours: 24 });
    expect(granted.status, JSON.stringify(granted.json)).toBeLessThan(300);
    const one = (await deniz.req('GET', `/requests/${r.ref}`)).json.request;
    expect(one.access).toMatchObject({ level: 'view' });
    const link = await deniz.req('POST', `/requests/${r.ref}/enter-link`);
    expect(link.status).toBe(201);
    expect(link.json.url).toMatch(new RegExp(`^https://acme\\.${BASE.replace('.', '\\.')}/support/enter#token=`));
    const token = link.json.url.split('#token=')[1];
    const browser = new Client(env, 'acme');
    const entered = await browser.post('/api/support/enter', { token });
    expect(entered.status).toBe(200);
    const [seen] = await env.db.system((q) => q.query(`select meta from audit_log where org_id = $1 and action = 'support.entered' order by at desc limit 1`, [env.a.orgId]));
    expect(seen.meta.staff).toBe(`Deniz Aksoy <${DENIZ}>`);
    // With the key alone nobody is named, so there is no way in.
    const key = await env.app.request(`${DESK}/api/desk/requests/${r.ref}/enter-link`, { method: 'POST', headers: { 'x-curahold-staff-key': STAFF_KEY } });
    expect(key.status).toBe(403);
  });
});
