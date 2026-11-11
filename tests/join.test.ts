import { beforeAll, describe, expect, it } from 'vitest';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
});

async function ask(email: string, name = 'New Person') {
  const c = new Client(env, 'acme');
  const start = await c.post('/api/auth/start', { email });
  return { c, start, token: start.json.devJoinToken as string | undefined, name };
}

describe('joining a company', () => {
  it('someone at the company domain asks to join; admins are told; approval sends a sign-in link', async () => {
    const { c, token } = await ask('noor@demo.example');
    expect(token).toBeTruthy();
    expect(env.email.last('noor@demo.example').text).toContain('/join#token=');

    const j = await c.post('/api/join', { token, name: 'Noor Celik', note: 'New on the CS team', deviceId: c.device });
    expect(j.json).toEqual({ status: 'pending' });
    await env.settle();
    expect(env.email.last('ada@demo.example').subject).toBe('Noor Celik wants to join Demo Company');

    const list = (await ada.get('/api/admin/join-requests')).json.requests;
    expect(list).toMatchObject([{ email: 'noor@demo.example', name: 'Noor Celik', note: 'New on the CS team' }]);
    const ok = await ada.post(`/api/admin/join-requests/${list[0].id}/approve`, {});
    expect(ok.status).toBe(200);
    expect(env.email.last('noor@demo.example').subject).toContain('Demo Company');

    const noor = new Client(env, 'acme');
    const v = await noor.post('/api/auth/verify', { token: ok.json.devToken, deviceId: noor.device });
    expect(v.json.status).toBe('ok');
    expect((await noor.get('/api/me')).json.user).toMatchObject({ name: 'Noor Celik', roleKey: 'member' });
  });

  it('a request is filed once; a second link does not duplicate it', async () => {
    const a = await ask('dup@demo.example');
    await a.c.post('/api/join', { token: a.token, name: 'Dup', deviceId: a.c.device });
    const b = await ask('dup@demo.example');
    await b.c.post('/api/join', { token: b.token, name: 'Dup again', deviceId: b.c.device });
    const pending = (await ada.get('/api/admin/join-requests')).json.requests.filter((r: any) => r.email === 'dup@demo.example');
    expect(pending.length).toBe(1);
  });

  it('declining tells the person politely', async () => {
    const a = await ask('nope@demo.example');
    await a.c.post('/api/join', { token: a.token, name: 'Nope', deviceId: a.c.device });
    const r = (await ada.get('/api/admin/join-requests')).json.requests.find((x: any) => x.email === 'nope@demo.example');
    expect((await ada.post(`/api/admin/join-requests/${r.id}/reject`, {})).status).toBe(200);
    expect(env.email.last('nope@demo.example').subject).toContain('Your request to join');
  });

  it('other domains get nothing; invitation-only companies send no join links', async () => {
    const outsider = await ask('someone@elsewhere.example');
    expect(outsider.token).toBeUndefined();
    expect(outsider.start.json).toEqual({ ok: true });
    expect(env.email.last('someone@elsewhere.example')).toBeUndefined();

    await ada.patch('/api/admin/org', { joinRequests: false });
    const closed = await ask('closed@demo.example');
    expect(closed.token).toBeUndefined();
    await ada.patch('/api/admin/org', { joinRequests: true });
  });

  it('auto-join: the person is in right away as a member', async () => {
    await ada.patch('/api/admin/org', { autoJoin: true });
    const a = await ask('auto@demo.example');
    expect(env.email.last('auto@demo.example').subject).toBe('Join Demo Company on Tendwell');
    const j = await a.c.post('/api/join', { token: a.token, name: 'Auto Person', deviceId: a.c.device });
    expect(j.json).toEqual({ status: 'ok' });
    expect((await a.c.get('/api/me')).json.user).toMatchObject({ name: 'Auto Person', roleKey: 'member', seat: 'full' });
    await ada.patch('/api/admin/org', { autoJoin: false });
  });

  it('a join link cannot be reused, and only works on the company it came from', async () => {
    const a = await ask('once@demo.example');
    await a.c.post('/api/join', { token: a.token, name: 'Once', deviceId: a.c.device });
    expect((await a.c.post('/api/join', { token: a.token, name: 'Twice', deviceId: a.c.device })).json.error).toBe('invalid_token');
    const b = await ask('elsewhere@demo.example');
    const beta = new Client(env, 'beta');
    expect((await beta.post('/api/join', { token: b.token, name: 'X', deviceId: beta.device })).json.error).toBe('invalid_token');
  });

  it('adds a domain only with a code sent to an address there', async () => {
    expect((await ada.post('/api/admin/domains', { email: 'me@gmail.com' })).json.error).toBe('domain_public');
    const r = await ada.post('/api/admin/domains', { email: 'it@acme-labs.example' });
    expect(env.email.last('it@acme-labs.example').text).toContain(r.json.devCode);
    expect((await ada.post('/api/admin/domains/verify', { email: 'it@acme-labs.example', code: '000000' })).json.error).toBe('invalid_token');
    expect((await ada.post('/api/admin/domains/verify', { email: 'it@acme-labs.example', code: r.json.devCode })).json).toEqual({ ok: true, domain: 'acme-labs.example' });
    expect((await ada.get('/api/me')).json.org.domains).toContain('acme-labs.example');
    await ada.del('/api/admin/domains/acme-labs.example');
    expect((await ada.get('/api/me')).json.org.domains).not.toContain('acme-labs.example');
  });

  it('only people who manage users see requests', async () => {
    const lena = await login(env, 'acme', 'lena@demo.example');
    expect((await lena.get('/api/admin/join-requests')).status).toBe(403);
  });
});
