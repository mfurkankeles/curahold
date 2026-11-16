// The customer portal: switching it on, opening a board, inviting someone at
// a customer, their sign-in on the portal's own domain, and above all what
// they can never see — another customer, internal notes, other boards,
// another company, or the app itself.
import { beforeAll, describe, expect, it } from 'vitest';
import { createPortalApp } from '../api/src/portal';
import { brandPalette, contrast, PORTAL_SURFACES } from '../shared/src/portal';
import { BASE, Client, login, setup, type Env } from './helpers';

const PORTAL = 'curahold-portal.test';
let env: Env;
let portal: ReturnType<typeof createPortalApp>;
let ada: Client; // admin
let zeynep: Client; // member, owns Quillfield
let mert: Client; // manager
let quill = '';
let velto = '';

/** A browser on the portal's domain: its own cookie, nothing else. */
class PortalClient {
  cookie = '';
  constructor(public slug = 'acme') {}
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { 'x-curahold-portal': '1', ...headers };
    if (this.cookie) h.cookie = this.cookie;
    const form = body instanceof FormData;
    if (body !== undefined && !form) h['content-type'] = 'application/json';
    const res = await portal.request(`https://${this.slug}.${PORTAL}${path}`, { method, headers: h, body: body === undefined ? undefined : form ? (body as FormData) : JSON.stringify(body) });
    const m = /app_portal=([^;]*)/.exec(res.headers.get('set-cookie') ?? '');
    if (m) this.cookie = m[1] ? `app_portal=${m[1]}` : '';
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, json, headers: res.headers };
  }
  get = (p: string) => this.req('GET', p);
  /** A form: the fields in "data", and files. */
  send = (p: string, data: unknown, files: [name: string, bytes: Uint8Array | string][]) => {
    const f = new FormData();
    f.set('data', JSON.stringify(data));
    for (const [name, bytes] of files) f.append('files', new File([bytes as BlobPart], name));
    return this.req('POST', p, f);
  };
  post = (p: string, b: unknown = {}) => this.req('POST', p, b);
}

const linkIn = (text: string) => /#token=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? '';

async function signIn(email: string) {
  const p = new PortalClient();
  await p.post('/papi/auth/start', { email });
  await env.settle();
  const mail = env.email.last(email);
  const r = await p.post('/papi/auth/verify', { token: linkIn(mail.text) });
  expect(r.status).toBe(200);
  return p;
}

beforeAll(async () => {
  env = await setup({ portalDomain: PORTAL });
  portal = createPortalApp(env.deps);
  ada = await login(env, 'acme', 'ada@demo.example');
  zeynep = await login(env, 'acme', 'zeynep@demo.example');
  mert = await login(env, 'acme', 'mert@demo.example');
  quill = env.a.accounts['Quillfield Retail'];
  velto = env.a.accounts['Velto Mobility'];
});

let selin: PortalClient;
let ownTask = '';
let otherCustomer = '';
let internalOnly = '';

describe('turning it on', () => {
  it('only administrators switch it on and open boards; private boards stay closed', async () => {
    expect((await zeynep.put('/api/portal/settings', { enabled: true })).status).toBe(403);
    expect((await ada.put('/api/portal/settings', { enabled: true })).status).toBe(200);
    const s = await ada.get('/api/portal');
    expect(s.json).toMatchObject({ available: true, enabled: true, address: `https://acme.${PORTAL}` });

    const cols = (await ada.get('/api/boards')).json.boards.find((b: any) => b.id === env.a.boards.csBoard).columns;
    const cfg = { enabled: true, intake: cols[0].key, labels: { [cols[1].key]: 'Being worked on' }, fields: ['due'] };
    expect((await mert.put(`/api/boards/${env.a.boards.csBoard}/portal`, cfg)).status).toBe(403);
    expect((await ada.put(`/api/boards/${env.a.boards.privateBoard}/portal`, cfg)).json.error).toBe('portal_private_board');
    const open = await ada.put(`/api/boards/${env.a.boards.csBoard}/portal`, cfg);
    expect(open.status).toBe(200);
    expect(open.json.board.portal).toMatchObject({ enabled: true, labels: { [cols[1].key]: 'Being worked on' } });
  });

  it('the company’s colour and foot line: only administrators set them, only real colours, and the portal reads them', async () => {
    expect((await zeynep.put('/api/portal/settings', { brand: { color: '#0f766e', poweredBy: false } })).status).toBe(403);
    expect((await ada.put('/api/portal/settings', { brand: { color: 'red; x', poweredBy: true } })).status).toBe(400);
    expect((await ada.put('/api/portal/settings', { brand: { color: '#0F766E', poweredBy: false } })).status).toBe(200);
    expect((await ada.get('/api/portal')).json.brand).toEqual({ color: '#0f766e', poweredBy: false });
    const org = await new PortalClient().get('/papi/org');
    expect(org.json.brand).toEqual({ color: '#0f766e', poweredBy: false });
  });

  it('every colour a company can pick gives readable text in both themes', () => {
    for (const color of ['#ffffff', '#000000', '#ffeb3b', '#0f766e', '#ff5722', '#2196f3', '#9c27b0', '#808080', '#00ff00', null]) {
      const p = brandPalette(color);
      for (const [theme, pal] of [['light', p.light], ['dark', p.dark]] as const) {
        expect(contrast(pal.fill, pal.onFill), `${color} ${theme} button`).toBeGreaterThanOrEqual(4.5);
        for (const bg of [PORTAL_SURFACES[theme].paper, PORTAL_SURFACES[theme].surface, pal.wash]) expect(contrast(pal.ink, bg), `${color} ${theme} ink on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('the customer’s owner invites someone there; others, and colleagues’ addresses, cannot be', async () => {
    expect((await mert.post('/api/portal/users', { accountId: quill, email: 'x@quillfield.example', name: 'X' })).json.error).toBe('portal_invite_owner');
    expect((await zeynep.post('/api/portal/users', { accountId: quill, email: 'lena@demo.example', name: 'Lena' })).json.error).toBe('portal_internal_email');
    const r = await zeynep.post('/api/portal/users', { accountId: quill, email: 'Selin@Quillfield.example', name: 'Selin Kaya' });
    expect(r.status).toBe(201);
    expect(r.json.person).toMatchObject({ email: 'selin@quillfield.example', status: 'invited', accountName: 'Quillfield Retail' });
    await env.settle();
    const invite = env.email.last('selin@quillfield.example');
    expect(invite.text).toContain(`https://acme.${PORTAL}/auth#token=`);
    // In the company's colour, without Curahold's name at the foot (switched off above).
    expect(invite.html).toContain(`background:${brandPalette('#0f766e').light.fill}`);
    expect(invite.html).not.toContain('>Curahold</p>');
    expect((await zeynep.post('/api/portal/users', { accountId: quill, email: 'selin@quillfield.example', name: 'Again' })).json.error).toBe('portal_email_taken');
    // Someone at another customer, for the isolation checks below.
    expect((await ada.post('/api/portal/users', { accountId: velto, email: 'mila@velto.example', name: 'Mila' })).status).toBe(201);
  });
});

describe('signing in on the portal', () => {
  it('the invitation link works once and sets a host-only, strict cookie', async () => {
    const p = new PortalClient();
    const token = linkIn(env.email.last('selin@quillfield.example').text);
    const v = await p.post('/papi/auth/verify', { token });
    expect(v.status).toBe(200);
    const cookie = v.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).not.toMatch(/Domain=/i);
    expect((await new PortalClient().post('/papi/auth/verify', { token })).status).toBe(400);
    selin = p;
    const me = await p.get('/papi/me');
    expect(me.json.account).toMatchObject({ id: quill, name: 'Quillfield Retail' });
    expect(me.json.boards.map((b: any) => b.id)).toEqual([env.a.boards.csBoard]);
    expect(me.json.boards[0].columns[1].name).toBe('Being worked on');
    // Where the company wrote nothing, the customer gets the step, never the team's own column name.
    const shown = me.json.boards[0].columns as { key: string; name: string | null; step: string; done: boolean }[];
    expect(shown[0]).toMatchObject({ name: null, step: 'new' });
    expect(shown[1].step).toBe('doing');
    for (const c of shown) if (c.done) expect(c.step).toBe('done');
    const internal = ((await ada.get('/api/boards')).json.boards.find((b: any) => b.id === env.a.boards.csBoard).columns as { name: string }[]).map((c) => c.name);
    for (const c of shown) if (c.key !== shown[1].key) expect(internal).not.toContain(c.name);
  });

  it('asking for a link gives nothing away', async () => {
    const p = new PortalClient();
    const known = await p.post('/papi/auth/start', { email: 'selin@quillfield.example' });
    const unknown = await p.post('/papi/auth/start', { email: 'nobody@quillfield.example' });
    expect(known.json).toEqual(unknown.json);
    expect(known.status).toBe(unknown.status);
  });

  it('writes need the portal header (no cross-site forms)', async () => {
    const r = await portal.request(`https://acme.${PORTAL}/papi/boards/${env.a.boards.csBoard}/tasks`, {
      method: 'POST',
      headers: { cookie: selin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Forged' }),
    });
    expect(r.status).toBe(403);
  });
});

describe('what someone at a customer sees, and never sees', () => {
  beforeAll(async () => {
    const mk = async (title: string, account: string | null) =>
      (await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title, accountId: account })).json.task.id as string;
    ownTask = await mk('Quarterly review deck', quill);
    otherCustomer = await mk('Velto contract terms', velto);
    internalOnly = await mk('Quillfield churn risk (internal)', quill);
    expect((await mert.put(`/api/tasks/${ownTask}/portal`, { shared: true })).status).toBe(200);
    expect((await mert.put(`/api/tasks/${otherCustomer}/portal`, { shared: true })).status).toBe(200);
    await mert.post(`/api/tasks/${ownTask}/comments`, { body: 'Internal: they may push back on price.' });
    await mert.post(`/api/tasks/${ownTask}/comments`, { body: 'Draft attached, ready Friday.', visibility: 'customer' });
  });

  it('only their own customer’s shared tasks, and only the replies meant for them', async () => {
    const list = (await selin.get(`/papi/boards/${env.a.boards.csBoard}/tasks`)).json.tasks;
    expect(list.map((t: any) => t.title)).toEqual(['Quarterly review deck']);
    const t = (await selin.get(`/papi/tasks/${ownTask}`)).json.task;
    expect(t.comments.map((c: any) => c.body)).toEqual(['Draft attached, ready Friday.']);
    expect(JSON.stringify(t)).not.toContain('push back');
    // Fields left out of the allow-list are not there at all.
    expect(t.priority).toBeNull();
    expect(t.assignees).toBeNull();
  });

  it('another customer’s task, an unshared task, a closed board: all simply not found', async () => {
    expect((await selin.get(`/papi/tasks/${otherCustomer}`)).status).toBe(404);
    expect((await selin.get(`/papi/tasks/${internalOnly}`)).status).toBe(404);
    expect((await selin.get(`/papi/boards/${env.a.boards.renewals}/tasks`)).status).toBe(404);
    expect((await selin.post(`/papi/tasks/${otherCustomer}/comments`, { body: 'hello?' })).status).toBe(404);
    expect((await selin.post(`/papi/boards/${env.a.boards.renewals}/tasks`, { title: 'Sneaky' })).status).toBe(404);
  });

  it('a task given to another customer stops being shared', async () => {
    const t = await mert.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'Moving task', accountId: quill });
    await mert.put(`/api/tasks/${t.json.task.id}/portal`, { shared: true });
    expect((await selin.get(`/papi/tasks/${t.json.task.id}`)).status).toBe(200);
    const full = (await mert.get(`/api/tasks/${t.json.task.id}`)).json.task;
    await mert.patch(`/api/tasks/${t.json.task.id}`, { accountId: velto, baseVersion: full.version });
    expect((await selin.get(`/papi/tasks/${t.json.task.id}`)).status).toBe(404);
    expect((await mert.get(`/api/tasks/${t.json.task.id}`)).json.task.portalShared).toBe(false);
  });

  it('a new request lands in the intake column for the customer’s owner, who is told', async () => {
    const r = await selin.post(`/papi/boards/${env.a.boards.csBoard}/tasks`, { title: 'Add two users to the report', description: 'Ayşe and Can need access.' });
    expect(r.status).toBe(201);
    const id = r.json.task.id;
    const [row] = await env.db.system((q) => q.query('select t.*, b.columns from tasks t join boards b on b.id = t.board_id where t.id = $1', [id]));
    expect(row).toMatchObject({ account_id: quill, portal_shared: true, assignee_ids: [env.a.ids.zeynep], created_by: null });
    expect(row.status).toBe(row.columns[0].key);
    const notes = (await zeynep.get('/api/notifications')).json;
    const n = (notes.notifications ?? notes.items ?? notes).find((x: any) => x.taskId === id);
    expect(n?.title).toContain('Selin Kaya (Quillfield Retail)');
    // Inside, the team sees who opened it.
    const inside = (await zeynep.get(`/api/tasks/${id}`)).json.task;
    expect(inside).toMatchObject({ portalShared: true, portalAuthorName: 'Selin Kaya' });
  });

  it('a reply from the customer reaches the team; a reply for the customer reaches them by email', async () => {
    const c = await selin.post(`/papi/tasks/${ownTask}/comments`, { body: 'Could we move it to Monday?' });
    expect(c.status).toBe(201);
    const inside = (await mert.get(`/api/tasks/${ownTask}`)).json.task.comments.at(-1);
    expect(inside).toMatchObject({ visibility: 'customer', portalAuthorName: 'Selin Kaya', authorId: null });
    await mert.post(`/api/tasks/${ownTask}/comments`, { body: 'Monday works.', visibility: 'customer' });
    await env.settle();
    const mail = env.email.last('selin@quillfield.example');
    expect(mail.subject).toContain('Quarterly review deck');
    expect(mail.text).toContain('Monday works.');
    expect(mail.text).toContain(`https://acme.${PORTAL}/t/${ownTask}`);
    // An internal note stays internal, and a reply on an unshared task is refused.
    expect((await mert.post(`/api/tasks/${internalOnly}/comments`, { body: 'x', visibility: 'customer' })).json.error).toBe('portal_not_shared');
  });
});

describe('files, both ways', () => {
  const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46]);
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  let request = '';
  let fileId = '';

  it('a new request carries files; the type is checked by its first bytes, not its name', async () => {
    const before = (await env.db.system((q) => q.query('select count(*)::int as n from tasks')))[0].n;
    for (const [name, bytes] of [
      ['shot.png', '<html><script>alert(1)</script></html>'],
      ['run.exe', 'MZ'],
      ['logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'],
      ['page.txt', '<!doctype html><p>hi'],
      ['empty.pdf', ''],
    ] as const) {
      const r = await selin.send(`/papi/boards/${env.a.boards.csBoard}/tasks`, { title: 'With a bad file' }, [[name, bytes]]);
      expect(r.status, name).toBe(400);
      expect(r.json.error, name).toBe('portal_file_type');
    }
    const six = Array.from({ length: 6 }, (_, i) => [`n${i}.txt`, 'note'] as [string, string]);
    expect((await selin.send(`/papi/boards/${env.a.boards.csBoard}/tasks`, { title: 'Too many' }, six)).json.error).toBe('portal_too_many_files');
    // Nothing half-made from the refused ones.
    expect((await env.db.system((q) => q.query('select count(*)::int as n from tasks')))[0].n).toBe(before);

    const r = await selin.send(`/papi/boards/${env.a.boards.csBoard}/tasks`, { title: 'Invoice is wrong', description: 'See the attached.' }, [['invoice.pdf', PDF], ['screen.png', PNG]]);
    expect(r.status).toBe(201);
    request = r.json.task.id;
    expect(r.json.task.files.map((f: any) => [f.name, f.mime, f.commentId])).toEqual([
      ['invoice.pdf', 'application/pdf', null],
      ['screen.png', 'image/png', null],
    ]);
    fileId = r.json.task.files[0].id;
    // Inside, the team sees them on the task.
    expect((await zeynep.get(`/api/tasks/${request}`)).json.task.files.map((f: any) => f.name)).toEqual(['invoice.pdf', 'screen.png']);
  });

  it('a file is only ever downloaded: attachment, its own type, sandboxed', async () => {
    const r = await selin.get(`/papi/files/${fileId}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toMatch(/^attachment; filename\*=UTF-8''invoice\.pdf$/);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('content-security-policy')).toContain('sandbox');
    expect(r.headers.get('cache-control')).toContain('no-store');
  });

  it('files on an internal note, or added to the task inside, never reach the portal', async () => {
    const up = async (name: string) => {
      const f = new FormData();
      f.set('file', new File(['secret numbers'], name, { type: 'text/plain' }));
      return (await zeynep.req('POST', `/api/tasks/${request}/files`, f)).json.file.id as string;
    };
    const loose = await up('pricing-internal.txt');
    const noted = await up('margin-notes.txt');
    await zeynep.post(`/api/tasks/${request}/comments`, { body: 'Our margin on this.', fileIds: [noted] });
    const shared = await up('corrected-invoice.txt');
    await zeynep.post(`/api/tasks/${request}/comments`, { body: 'Here is the corrected one.', visibility: 'customer', fileIds: [shared] });
    const t = (await selin.get(`/papi/tasks/${request}`)).json.task;
    expect(t.files.map((f: any) => f.name)).toEqual(['invoice.pdf', 'screen.png', 'corrected-invoice.txt']);
    expect(t.files.at(-1).commentId).toBe(t.comments.at(-1).id);
    expect(JSON.stringify(t)).not.toMatch(/margin|pricing-internal/);
    for (const id of [loose, noted]) expect((await selin.get(`/papi/files/${id}`)).status).toBe(404);
    expect((await selin.get(`/papi/files/${shared}`)).status).toBe(200);
  });

  it('a reply can be files alone; another customer can neither see nor add to them', async () => {
    const r = await selin.send(`/papi/tasks/${request}/comments`, { body: '' }, [['signed.pdf', PDF]]);
    expect(r.status).toBe(201);
    expect(r.json.task.comments.at(-1)).toMatchObject({ body: 'signed.pdf', fromCustomer: true });
    const mila = await signIn('mila@velto.example');
    expect((await mila.get(`/papi/files/${fileId}`)).status).toBe(404);
    expect((await mila.get(`/papi/tasks/${request}`)).status).toBe(404);
    expect((await mila.send(`/papi/tasks/${request}/comments`, { body: 'x' }, [['a.pdf', PDF]])).status).toBe(404);
    // Not a file id at all, or one from the app's own side: the same answer.
    expect((await selin.get('/papi/files/not-a-uuid')).status).toBe(404);
    expect((await selin.get(`/papi/files/${crypto.randomUUID()}`)).status).toBe(404);
  });

  it('the list says when the latest word is the team’s', async () => {
    const list = (await selin.get(`/papi/boards/${env.a.boards.csBoard}/tasks`)).json.tasks;
    expect(list.find((t: any) => t.id === request).lastFromTeam).toBe(false);
    await zeynep.post(`/api/tasks/${request}/comments`, { body: 'Thanks, all done.', visibility: 'customer' });
    const again = (await selin.get(`/papi/boards/${env.a.boards.csBoard}/tasks`)).json.tasks;
    expect(again.find((t: any) => t.id === request).lastFromTeam).toBe(true);
  });
});

describe('approval and status emails', () => {
  let req = '';
  const cols = async () => (await ada.get('/api/boards')).json.boards.find((b: any) => b.id === env.a.boards.csBoard).columns as { key: string; done?: boolean }[];
  const move = async (status: string) => {
    const full = (await mert.get(`/api/tasks/${req}`)).json.task;
    expect((await mert.patch(`/api/tasks/${req}`, { status, baseVersion: full.version })).status).toBe(200);
    await env.settle();
  };
  const mails = () => env.email.sent.filter((m) => m.to === 'selin@quillfield.example');

  it('the customer hears once when work starts, and once when it is done, in the company’s colour', async () => {
    req = (await selin.post(`/papi/boards/${env.a.boards.csBoard}/tasks`, { title: 'Renew the SSL certificate' })).json.task.id;
    const c = await cols();
    const doing = c.filter((x) => !x.done).slice(1);
    const done = c.find((x) => x.done)!;
    const before = mails().length;
    await move(doing[0].key);
    expect(mails().length).toBe(before + 1);
    expect(mails().at(-1)!.subject).toContain('Renew the SSL certificate');
    expect(mails().at(-1)!.text).toContain(`https://acme.${PORTAL}/t/${req}`);
    if (doing[1]) {
      await move(doing[1].key);
      expect(mails().length).toBe(before + 1);
    }
    // Not finished yet: nothing to approve.
    expect((await selin.post(`/papi/tasks/${req}/approve`)).status).toBe(404);
    await move(done.key);
    expect(mails().length).toBe(before + 2);
    expect(mails().at(-1)!.html).toContain(`background:${brandPalette('#0f766e').light.fill}`);
  });

  it('a finished request is approved once; the approval is in the conversation for both sides', async () => {
    const r = await selin.post(`/papi/tasks/${req}/approve`);
    expect(r.status).toBe(200);
    expect(r.json.task).toMatchObject({ approvedBy: 'Selin Kaya' });
    expect(r.json.task.approvedAt).toBeTruthy();
    const again = await selin.post(`/papi/tasks/${req}/approve`);
    expect(again.json.task.comments.filter((x: any) => x.fromCustomer)).toHaveLength(1);
    const inside = (await mert.get(`/api/tasks/${req}`)).json.task.comments;
    expect(inside.at(-1)).toMatchObject({ visibility: 'customer', portalAuthorName: 'Selin Kaya' });
    // Someone at another customer cannot approve it.
    const mila = await signIn('mila@velto.example');
    expect((await mila.post(`/papi/tasks/${req}/approve`)).status).toBe(404);
  });

  it('an internal note sends the customer nothing and never shows', async () => {
    const before = mails().length;
    await mert.post(`/api/tasks/${req}/comments`, { body: 'INTERNAL ONLY: discount was a mistake' });
    await env.settle();
    expect(mails().length).toBe(before);
    expect(JSON.stringify((await selin.get(`/papi/tasks/${req}`)).json)).not.toContain('INTERNAL ONLY');
    expect(JSON.stringify((await selin.get(`/papi/boards/${env.a.boards.csBoard}/tasks`)).json)).not.toContain('INTERNAL ONLY');
  });
});

describe('walls', () => {
  it('the portal role can read no table, only call the portal functions', async () => {
    await expect(env.db.portal({ orgId: env.a.orgId, portalUserId: null }, (q) => q.query('select * from tasks limit 1'))).rejects.toThrow(/permission denied/);
    await expect(env.db.portal({ orgId: env.a.orgId, portalUserId: null }, (q) => q.query('select * from portal_users limit 1'))).rejects.toThrow(/permission denied/);
    await expect(env.db.portal({ orgId: env.a.orgId, portalUserId: null }, (q) => q.query(`select app_set_health('{}'::jsonb, '{}'::jsonb)`))).rejects.toThrow(/permission denied/);
    // And with no one signed in, the functions give nothing.
    const [r] = await env.db.portal({ orgId: env.a.orgId, portalUserId: null }, (q) => q.query('select portal_me() as me'));
    expect(r.me).toBeNull();
  });

  it('a portal cookie means nothing to the app, and an app cookie nothing to the portal', async () => {
    const app = await env.app.request(`https://acme.${BASE}/api/me`, { headers: { cookie: selin.cookie } });
    expect(app.status).toBe(401);
    const p = await portal.request(`https://acme.${PORTAL}/papi/me`, { headers: { cookie: ada.cookie.replace('app_session', 'app_portal') } });
    expect(p.status).toBe(401);
    // The app is not served on the portal's domain, nor the portal on the app's.
    expect((await env.app.request(`https://acme.${PORTAL}/api/me`, { headers: { cookie: ada.cookie } })).status).toBe(404);
    expect((await portal.request(`https://acme.${BASE}/papi/me`, { headers: { cookie: selin.cookie } })).status).toBe(404);
  });

  it('another company’s portal does not know them', async () => {
    const beta = new PortalClient('beta');
    beta.cookie = selin.cookie;
    expect((await beta.get('/papi/me')).status).toBe(404); // beta has no portal
    await env.db.system((q) => q.query(`update orgs set settings = settings || '{"portal":{"enabled":true}}' where slug = 'beta'`));
    expect((await beta.get('/papi/me')).status).toBe(401);
    await env.db.system((q) => q.query(`update orgs set settings = settings - 'portal' where slug = 'beta'`));
  });

  it('switching someone off ends their session at once', async () => {
    const mila = await signIn('mila@velto.example');
    expect((await mila.get(`/papi/boards/${env.a.boards.csBoard}/tasks`)).json.tasks.map((t: any) => t.title)).toEqual(['Velto contract terms']);
    const [p] = (await ada.get(`/api/portal/users?accountId=${velto}`)).json.people;
    expect((await ada.del(`/api/portal/users/${p.id}`)).status).toBe(200);
    expect((await mila.get('/papi/me')).status).toBe(401);
    // And they cannot ask for a new link.
    const mails = env.email.sent.filter((m) => m.to === 'mila@velto.example').length;
    await mila.post('/papi/auth/start', { email: 'mila@velto.example' });
    await env.settle();
    expect(env.email.sent.filter((m) => m.to === 'mila@velto.example')).toHaveLength(mails);
    // Taken back (the undo): she can sign in again, with a new link; the ended session stays ended.
    expect((await ada.post(`/api/portal/users/${p.id}/enable`)).status).toBe(200);
    expect((await ada.post(`/api/portal/users/${p.id}/enable`)).status).toBe(404);
    expect((await mila.get('/papi/me')).status).toBe(401);
    expect((await (await signIn('mila@velto.example')).get('/papi/me')).status).toBe(200);
  });

  it('the company’s switch closes the portal for everyone', async () => {
    await ada.put('/api/portal/settings', { enabled: false });
    expect((await selin.get('/papi/me')).status).toBe(404);
    expect((await selin.get('/papi/org')).status).toBe(404);
    await ada.put('/api/portal/settings', { enabled: true });
    expect((await selin.get('/papi/me')).status).toBe(200);
  });
});
