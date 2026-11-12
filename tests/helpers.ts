import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../api/src/app';
import type { Config } from '../api/src/context';
import { migrate } from '../api/src/db/migrate';
import { loadMigrations } from '../api/src/db/migrations-fs';
import postgres from 'postgres';
import type { Db } from '../api/src/db';
import { createMemoryPg, pgliteDb } from '../api/src/db/pglite';
import { postgresDb } from '../api/src/db/postgres';
import { MemoryEmail, MemoryStorage } from '../api/src/lib/services';
import { seedDemo } from '../scripts/seed-demo';

export const BASE = 'curahold.test';

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
    signupEnabled: true,
    connectors: {},
    ...over,
  };
}

export type FetchStub = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * The database the tests run on: in memory by default; with TEST_DATABASE_URL
 * (a throwaway Postgres whose user may create databases), a fresh database
 * there for every setup — the same driver and the same server as production.
 */
async function testDb(): Promise<Db> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return pgliteDb(await createMemoryPg());
  const name = `app_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = postgres(url, { max: 1, onnotice: () => undefined });
  await admin.unsafe(`create database ${name}`);
  await admin.end({ timeout: 2 });
  const target = new URL(url);
  target.pathname = `/${name}`;
  return postgresDb(target.toString(), { max: 4, idleTimeout: 2 });
}

/** The database built once for the run (tests/global-setup.ts), when there is one. */
const template = () => (process.env.TEST_DATABASE_URL ? null : (process.env.APP_TEST_TEMPLATE ?? null));

export async function setup(over: Partial<Config> = {}) {
  const from = template();
  // A copy of the run's database (migrated, both sample companies in it), or a fresh one built here.
  const db = from ? pgliteDb(await createMemoryPg(new Blob([readFileSync(join(from, 'template.tar'))]))) : await testDb();
  if (!from) await migrate(db, loadMigrations());
  const email = new MemoryEmail();
  const storage = new MemoryStorage();
  const fetchHolder: { impl: FetchStub } = { impl: async () => new Response('no stub', { status: 500 }) };
  const config = testConfig(over);
  // Background work (deliveries) is collected so a test can wait for it.
  const background: Promise<unknown>[] = [];
  const clock = { now: null as Date | null };
  const deps = {
    db,
    email,
    storage,
    config,
    fetch: ((u: any, i: any) => fetchHolder.impl(String(u), i)) as typeof fetch,
    defer: (p: Promise<unknown>) => void background.push(p),
    now: () => clock.now ?? new Date(),
  };
  const app = createApp(deps);
  const settle = async () => {
    while (background.length) await Promise.allSettled(background.splice(0));
  };
  type Seeded = Awaited<ReturnType<typeof seedDemo>>;
  const kept = from ? (JSON.parse(readFileSync(join(from, 'seed.json'), 'utf8')) as { a: Seeded; b: Seeded }) : null;
  const a = kept?.a ?? (await seedDemo(db, { slug: 'acme', locale: 'en' }));
  const b = kept?.b ?? (await seedDemo(db, { slug: 'beta', locale: 'tr' }));
  return { db, app, email, storage, config, a, b, fetchHolder, deps, settle, clock };
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
    const headers: Record<string, string> = { 'x-curahold-device': this.device, ...extra };
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
      const m = /app_session=([^;]*)/.exec(setCookie);
      if (m) this.cookie = m[1] ? `app_session=${m[1]}` : '';
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
  put = (p: string, b: unknown) => this.req('PUT', p, b);
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
