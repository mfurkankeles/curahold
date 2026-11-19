// Security first run (19 Nov), the probes that found something or guard a new
// door added since 16 Nov: a portal session never opens the app, a refused
// portal upload leaves nothing in storage, the portal's file rules hold
// against renamed and disguised files and names that climb out of their
// folder, and connector addresses cannot point back at this machine by a
// spelling the checks did not know (a name ending in a dot).
// The wider sweeps live beside it: every id-addressed route against another
// company and every role (isolation-routes), every portal address
// (portal-isolation), the agents (team-redteam), limits (ratelimit, botguard).
import { beforeAll, describe, expect, it } from 'vitest';
import { createPortalApp } from '../api/src/portal';
import { privateHost } from '../api/src/connectors/messaging/webhook';
import { odooUrl } from '../api/src/sync/adapters/accounting/odoo';
import { bitrixWebhook } from '../api/src/sync/adapters/keyed';
import { PORTAL_FILE_MB, PORTAL_MAX_FILES } from '../shared/src/portal';
import { BASE, Client, login, setup, type Env } from './helpers';

const PORTAL = 'curahold-portal.test';
let env: Env;
let portal: ReturnType<typeof createPortalApp>;
let ada: Client;
let cookie = '';
let token = '';
let ownStep = '';
let companyStep = '';

const sys = (text: string, params: unknown[] = []) => env.db.system((q) => q.query(text, params));
const stored = () => (env.storage as any).items.size as number;
const send = (stepId: string, files: [name: string, bytes: BlobPart][]) => {
  const form = new FormData();
  form.set('data', '{}');
  for (const [name, bytes] of files) form.append('files', new File([bytes], name));
  return portal.request(`https://acme.${PORTAL}/papi/onboarding-steps/${stepId}/files`, { method: 'POST', headers: { 'x-curahold-portal': '1', cookie }, body: form });
};

beforeAll(async () => {
  env = await setup({ portalDomain: PORTAL });
  portal = createPortalApp(env.deps);
  ada = await login(env, 'acme', 'ada@demo.example');
  const account = env.a.accounts['Quillfield Retail'];
  await ada.put('/api/portal/settings', { enabled: true });
  expect((await ada.post('/api/portal/users', { accountId: account, email: 'pia@quillfield.example', name: 'Pia Lund' })).status).toBe(201);
  const plan = (await ada.post('/api/onboarding-plans', { accountId: account })).json.plan;
  await sys(`update onboarding_plans set portal_visible = true, status = 'active' where id = $1`, [plan.id]);
  ownStep = plan.steps[0].id;
  companyStep = plan.steps[1].id;
  await sys(`update onboarding_steps set side = 'customer', depends_on = '{}', upload = true where id = $1`, [ownStep]);
  await sys(`update onboarding_steps set side = 'vendor', upload = false where id = $1`, [companyStep]);
  const start = await portal.request(`https://acme.${PORTAL}/papi/auth/start`, { method: 'POST', headers: { 'x-curahold-portal': '1', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'pia@quillfield.example' }) });
  expect(start.status).toBeLessThan(300);
  await env.settle();
  const link = /#token=([A-Za-z0-9_-]+)/.exec(env.email.last('pia@quillfield.example').text)?.[1] ?? '';
  const v = await portal.request(`https://acme.${PORTAL}/papi/auth/verify`, { method: 'POST', headers: { 'x-curahold-portal': '1', 'content-type': 'application/json' }, body: JSON.stringify({ token: link }) });
  expect(v.status).toBe(200);
  token = /app_portal=([^;]*)/.exec(v.headers.get('set-cookie') ?? '')?.[1] ?? '';
  cookie = `app_portal=${token}`;
  expect(token.length).toBeGreaterThan(10);
});

describe('a portal session inside the app', () => {
  it('opens nothing there: not as the app’s cookie, not as a key, not under the portal’s own cookie name', async () => {
    for (const headers of [{ cookie: `app_session=${token}` }, { authorization: `Bearer ${token}` }, { cookie }] as Record<string, string>[]) {
      for (const path of ['/api/me', '/api/accounts', '/api/onboarding-plans', `/api/onboarding-steps/${ownStep}/files`]) {
        const r = await env.app.request(`https://acme.${BASE}${path}`, { headers: { 'x-curahold-device': 'probe', ...headers } });
        expect(r.status, `${path} ${JSON.stringify(headers).slice(0, 20)}`).toBe(401);
      }
    }
  });
});

describe('files from the portal', () => {
  it('a refused upload leaves nothing in storage', async () => {
    const before = stored();
    expect((await send(companyStep, [['list.pdf', '%PDF-1.4 x']])).status).toBe(404);
    expect((await send('00000000-0000-4000-8000-000000000000', [['list.pdf', '%PDF-1.4 x']])).status).toBe(404);
    expect(stored()).toBe(before);
  });

  it('a disguised or renamed file is refused; a real one is kept as our type and only ever downloaded', async () => {
    const refused: [string, BlobPart][] = [
      ['invoice.pdf', '<html><script>alert(1)</script>'],
      ['report.pdf.html', '%PDF-1.4 x'],
      ['photo.png', 'GIF89a....'],
      ['notes.txt', '<svg onload=alert(1)>'],
      ['logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'],
      ['tool.exe', 'MZ\x90\x00'],
      ['empty.pdf', ''],
    ];
    const before = stored();
    for (const f of refused) expect((await send(ownStep, [f])).status, f[0]).toBe(400);
    expect(stored()).toBe(before);
    expect(PORTAL_MAX_FILES).toBeGreaterThan(0);
    expect(PORTAL_FILE_MB).toBeGreaterThan(0);
    expect((await send(ownStep, Array.from({ length: PORTAL_MAX_FILES + 1 }, (_, i): [string, BlobPart] => [`p${i}.pdf`, '%PDF-1.4 x']))).status).toBe(400);
    expect((await send(ownStep, [['big.pdf', new Uint8Array(PORTAL_FILE_MB * 1024 * 1024 + 1).fill(0x25)]])).status).toBe(413);

    const ok = await send(ownStep, [['../../etc/passwd..\\..\\boot.PDF', '%PDF-1.4 x']]);
    expect(ok.status).toBe(201);
    const [f] = await sys(`select id, name, mime, storage_key from files where onboarding_step_id = $1 order by created_at desc limit 1`, [ownStep]);
    expect(f.name).not.toMatch(/[\\/]/);
    expect(f.mime).toBe('application/pdf');
    expect(f.storage_key).not.toContain('..');
    expect(f.storage_key).not.toContain('passwd');
    const dl = await portal.request(`https://acme.${PORTAL}/papi/files/${f.id}`, { headers: { 'x-curahold-portal': '1', cookie } });
    expect(dl.status).toBe(200);
    expect(dl.headers.get('content-disposition')).toMatch(/^attachment; filename\*=UTF-8''/);
    expect(dl.headers.get('content-disposition')).not.toMatch(/[\\/]|\.\.%2F/);
    expect(dl.headers.get('content-security-policy')).toContain('sandbox');
    expect(dl.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('connector addresses', () => {
  it('a host name ending in a dot is the same private host', () => {
    for (const h of ['localhost.', 'foo.localhost.', 'metadata.google.internal.', 'printer.local.', 'LOCALHOST..']) expect(privateHost(h), h).toBe(true);
    for (const u of ['https://localhost./', 'https://metadata.google.internal./', 'https://0x7f000001/', 'https://[::ffff:127.0.0.1]/', 'https://169.254.169.254/']) {
      expect(() => odooUrl(u), u).toThrow();
      expect(() => bitrixWebhook(`${u}rest/1/abcdefgh12/`), u).toThrow();
    }
    expect(privateHost('odoo.example.com.')).toBe(false);
  });
});
