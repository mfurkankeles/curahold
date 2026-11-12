import { beforeAll, describe, expect, it } from 'vitest';
import { pngIcon } from '../api/src/lib/png';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
});

const upload = (c: Client, bytes: Uint8Array, type: string, name = 'logo.png') => {
  const form = new FormData();
  form.append('file', new File([bytes as Uint8Array<ArrayBuffer>], name, { type }));
  return c.req('POST', '/api/admin/logo', form);
};

describe('company logo', () => {
  it('an admin uploads it; the sign-in page, the app and emails use it', async () => {
    expect((await new Client(env, 'acme').get('/api/org')).json.logoUrl).toBeNull();
    const r = await upload(ada, pngIcon(64, [255, 255, 255, 255], [18, 120, 107, 255]), 'image/png');
    expect(r.status).toBe(200);
    const org = (await new Client(env, 'acme').get('/api/org')).json;
    expect(org.logoUrl).toMatch(/^\/api\/logo\?v=\d+$/);
    expect((await ada.get('/api/me')).json.org.logoUrl).toBe(org.logoUrl);
    // Public (the sign-in page shows it), safe to serve.
    const res = await env.app.request(`https://acme.curahold.test${org.logoUrl}`);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('content-security-policy')).toContain('sandbox');
    // Another company has none.
    expect((await env.app.request('https://beta.curahold.test/api/logo')).status).toBe(404);
    // Invitation emails carry it.
    const roles = (await ada.get('/api/admin/roles')).json.roles;
    await ada.post('/api/admin/users', { email: 'newhire@demo.example', name: 'New Hire', roleId: roles.find((x: any) => x.key === 'member').id, seat: 'full' });
    const mail = env.email.last('newhire@demo.example');
    expect(mail.html).toContain(`https://acme.curahold.test${org.logoUrl}`);
    expect(mail.html).toContain('Sign in');
  });

  it('refuses files that are not images, too large ones, and non-admins', async () => {
    expect((await upload(ada, new TextEncoder().encode('<script>alert(1)</script>'), 'image/png')).status).toBe(400);
    expect((await upload(ada, new Uint8Array(1100 * 1024), 'image/png')).status).toBe(413);
    const lena = await login(env, 'acme', 'lena@demo.example');
    expect((await upload(lena, pngIcon(16, [0, 0, 0, 0], [0, 0, 0, 255]), 'image/png')).status).toBe(403);
    expect((await upload(ada, new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>'), 'image/svg+xml', 'logo.svg')).status).toBe(200);
  });

  it('can be removed', async () => {
    expect((await ada.del('/api/admin/logo')).status).toBe(200);
    expect((await new Client(env, 'acme').get('/api/org')).json.logoUrl).toBeNull();
    expect((await env.app.request('https://acme.curahold.test/api/logo')).status).toBe(404);
  });
});
