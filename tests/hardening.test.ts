// Fixes from the ASVS / API Top 10 pass (docs/security/asvs.md): uploaded pictures are
// checked by their first bytes, and the server never calls a private address it was given.
import { beforeAll, describe, expect, it } from 'vitest';
import { trustedType } from '../api/src/lib/upload';
import { login, setup, type Client, type Env } from './helpers';

let env: Env;
let ada: Client;

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).buffer;
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>').buffer as ArrayBuffer;

describe('uploads', () => {
  it('a picture type is believed only when the file starts like that picture', () => {
    expect(trustedType('image/png', PNG)).toBe('image/png');
    expect(trustedType('image/png', HTML)).toBe('application/octet-stream');
    expect(trustedType('image/svg+xml', HTML)).toBe('image/svg+xml'); // kept, but never shown in the page
    expect(trustedType('text/html; charset=utf-8', HTML)).toBe('text/html');
    expect(trustedType('not a type', HTML)).toBe('application/octet-stream');
  });

  it('a page dressed as a picture is only ever downloaded', async () => {
    const task = (await ada.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'With a file' })).json.task;
    const form = new FormData();
    form.append('file', new File([HTML], 'shot.png', { type: 'image/png' }));
    const up = await ada.req('POST', `/api/tasks/${task.id}/files`, form);
    expect(up.status).toBe(201);
    const id = up.json.file?.id ?? up.json.id;
    const got = await ada.get(`/api/files/${id}?inline=1`);
    expect(got.headers.get('content-type')).toBe('application/octet-stream');
    expect(got.headers.get('content-disposition')).toMatch(/^attachment/);
    expect(got.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('addresses the server calls', () => {
  it.each(['https://[::ffff:127.0.0.1]/hook', 'https://[::1]/hook', 'https://2130706433/hook', 'https://10.0.0.5/hook', 'https://metadata.internal/hook', 'http://example.com/hook'])(
    'a webhook to %s is refused',
    async (url) => {
      expect((await ada.post('/api/dev/webhooks', { url, events: ['task.created'] })).json.error).toBe('bad_webhook_url');
    },
  );

  it('an SSO token or key address on a private network is refused on the shared service', async () => {
    const r = await ada.put('/api/sso/settings', { protocol: 'oidc', tokenUrl: 'https://169.254.169.254/latest/meta-data', jwksUrl: 'https://idp.example.com/keys' });
    expect(r.status).toBe(400);
    expect(r.json.fields).toEqual(['tokenUrl']);
  });
});
