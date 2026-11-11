import { createApp } from '../api/src/app';
import type { Config } from '../api/src/context';
import { migrate } from '../api/src/db/migrate';
import { loadMigrations } from '../api/src/db/migrations-fs';
import { createMemoryPg, pgliteDb } from '../api/src/db/pglite';
import { MemoryEmail, MemoryStorage } from '../api/src/lib/services';
import { seedDemo } from '../scripts/seed-demo';

export const BASE = 'tendwell.test';

export function testConfig(over: Partial<Config> = {}): Config {
  return {
    baseDomain: BASE,
    scheme: 'https',
    centralHost: `app.${BASE}`,
    authSecret: 'test-secret-test-secret-test-secret-123',
    devExposeTokens: true,
    devOrgHeader: false,
    maxDevices: 2,
    sessionDays: 30,
    oauth: { google: { clientId: 'google-client', clientSecret: 'google-secret' } },
    ...over,
  };
}

export type FetchStub = (url: string, init?: RequestInit) => Promise<Response>;

export async function setup(over: Partial<Config> = {}) {
  const db = pgliteDb(await createMemoryPg());
  await migrate(db, loadMigrations());
  const email = new MemoryEmail();
  const storage = new MemoryStorage();
  const fetchHolder: { impl: FetchStub } = { impl: async () => new Response('no stub', { status: 500 }) };
  const config = testConfig(over);
  const app = createApp({ db, email, storage, config, fetch: ((u: any, i: any) => fetchHolder.impl(String(u), i)) as typeof fetch });
  const a = await seedDemo(db, { slug: 'acme', locale: 'en' });
  const b = await seedDemo(db, { slug: 'beta', locale: 'tr' });
  return { db, app, email, storage, config, a, b, fetchHolder };
}

export type Env = Awaited<ReturnType<typeof setup>>;

let deviceCounter = 0;
export const newDevice = () => `test-device-${Date.now().toString(36)}-${(deviceCounter++).toString().padStart(4, '0')}`;

export class Client {
  cookie = '';
  constructor(
    private env: Env,
    public slug: string,
    public device = newDevice(),
  ) {}

  async req(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
    const headers: Record<string, string> = { 'x-tendwell-device': this.device, ...extra };
    if (this.cookie) headers.cookie = this.cookie;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await this.env.app.request(`https://${this.slug}.${BASE}${path}`, { method, headers, body: payload });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const m = /tw_session=([^;]*)/.exec(setCookie);
      if (m) this.cookie = m[1] ? `tw_session=${m[1]}` : '';
    }
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
  post = (p: string, b?: unknown) => this.req('POST', p, b ?? {});
  patch = (p: string, b: unknown) => this.req('PATCH', p, b);
  del = (p: string) => this.req('DELETE', p);
}

export async function login(env: Env, slug: string, email: string, device?: string) {
  const c = new Client(env, slug, device);
  const start = await c.post('/api/auth/start', { email });
  if (!start.json.devToken) throw new Error(`no token for ${email}: ${JSON.stringify(start.json)}`);
  const v = await c.post('/api/auth/verify', { token: start.json.devToken, deviceId: c.device, deviceLabel: 'Test browser' });
  if (v.status !== 200) throw new Error(`verify failed: ${JSON.stringify(v.json)}`);
  return c;
}
