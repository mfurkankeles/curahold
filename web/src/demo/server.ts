// The Tendwell API running inside the browser tab: the same Hono app and
// SQL migrations as production, on PGlite (Postgres compiled to WebAssembly),
// with row-level security switched on. The app's fetch('/api/…') calls are
// answered here instead of over the network.
import type { Config, Deps } from '../../../api/src/context';
import type { Db } from '../../../api/src/db';
import { getDeviceId } from '../lib/device';
import { ORIGIN } from './memory';

// --- Browsers drop Cookie / Set-Cookie on script-made requests and responses.
// A real server would see them, so these two keep them visible to the API.
const NativeResponse = globalThis.Response;
class KeptHeadersResponse extends NativeResponse {
  #headers: Headers;
  constructor(body?: BodyInit | null, init?: ResponseInit) {
    super(body, init);
    const h = new Headers(init?.headers);
    super.headers.forEach((v, k) => {
      if (!h.has(k)) h.set(k, v);
    });
    this.#headers = h;
  }
  get headers() {
    return this.#headers;
  }
  static [Symbol.hasInstance](x: unknown) {
    return x instanceof NativeResponse;
  }
}
globalThis.Response = KeptHeadersResponse as typeof Response;

class KeptHeadersRequest extends Request {
  #headers: Headers;
  constructor(url: string, init: RequestInit, headers: Headers) {
    super(url, init);
    super.headers.forEach((v, k) => {
      if (!headers.has(k)) headers.set(k, v);
    });
    this.#headers = headers;
  }
  get headers() {
    return this.#headers;
  }
}

/** One browser's cookies for demo.tendwell.com. */
class Jar {
  private items = new Map<string, string>();
  header() {
    return [...this.items].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  take(res: Response) {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair, ...attrs] = line.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      const gone = attrs.some((a) => /^\s*max-age\s*=\s*0\s*$/i.test(a) || (/^\s*expires=/i.test(a) && new Date(a.split('=')[1]) < new Date()));
      if (gone || !value) this.items.delete(name);
      else this.items.set(name, value);
    }
  }
  get(name: string) {
    return this.items.get(name) ?? null;
  }
  set(name: string, value: string | null) {
    if (value) this.items.set(name, value);
    else this.items.delete(name);
  }
}

export interface DemoServer {
  db: Db;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  call: <T = any>(method: string, path: string, body?: unknown) => Promise<T>;
  jar: Jar;
  /** The customer portal, on its own (pretend) domain with its own cookies. */
  portalCall: <T = any>(method: string, path: string, body?: unknown) => Promise<T>;
  emails: { to: string; subject: string; text: string }[];
  /** Signs someone at a customer into the portal through the real email-link flow. */
  portalSignIn: (email: string) => Promise<void>;
}

/** The customer portal's address in the demo: another site than the app's, as in production. */
export const PORTAL_ORIGIN = 'https://demo.tendwell-portal.com';

// The app sends this browser's device id with every call; sign-ins use the same one.
const DEVICE = getDeviceId();

export async function startServer(step: (pct: number, key: 'db' | 'schema' | 'data' | 'app') => void): Promise<DemoServer> {
  step(8, 'db');
  const [{ createApp }, { createPortalApp }, { migrate }, { pgliteDb }, services, { PGlite }, fsBundle] = await Promise.all([
    import('../../../api/src/app'),
    import('../../../api/src/portal'),
    import('../../../api/src/db/migrate'),
    import('../../../api/src/db/pglite'),
    import('../../../api/src/lib/services'),
    import('@electric-sql/pglite'),
    // Postgres' own files, renamed at build time (see vite.demo.config.ts).
    fetch(new URL('./assets/pglite-fs.wasm', document.baseURI))
      .then((r) => (r.ok ? r.blob() : undefined))
      .catch(() => undefined),
  ]);
  const pg = new PGlite(fsBundle ? { fsBundle } : {});
  await pg.waitReady;
  const db = pgliteDb(pg);
  step(55, 'schema');
  const files = import.meta.glob('../../../db/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  await migrate(
    db,
    Object.entries(files).map(([p, sql]) => ({ name: p.split('/').pop()!, sql })),
  );
  step(72, 'data');
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  const config: Config = {
    baseDomain: 'tendwell.com',
    scheme: 'https',
    centralHost: 'app.tendwell.com',
    authSecret: btoa(String.fromCharCode(...secret)),
    devExposeTokens: true,
    devOrgHeader: false,
    maxDevices: 5,
    sessionDays: 30,
    oauth: {},
    signupEnabled: false,
    connectors: { demoCrm: true },
    portalDomain: 'tendwell-portal.com',
  };
  const email = new services.MemoryEmail();
  const deps: Deps = { db, email, storage: new services.MemoryStorage(), config, defer: (p) => void p };
  const app = createApp(deps);
  const portal = createPortalApp(deps);
  const jar = new Jar();
  const portalJar = new Jar();

  const portalRequest = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const cookie = portalJar.header();
    if (cookie) headers.set('cookie', cookie);
    const res = await portal.fetch(new KeptHeadersRequest(new URL(path, PORTAL_ORIGIN).href, { method: init.method ?? 'GET', body: init.body, redirect: 'manual' }, headers));
    portalJar.take(res);
    return res;
  };
  const portalCall = async (method: string, path: string, body?: unknown) => {
    const res = await portalRequest(path, {
      method,
      headers: { 'x-tendwell-portal': '1', 'content-type': 'application/json', 'x-tendwell-locale': 'tr' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(data)}`);
    return data;
  };

  const request = async (path: string, init: RequestInit = {}) => {
    const url = new URL(path, ORIGIN);
    const headers = new Headers(init.headers);
    const cookie = jar.header();
    if (cookie) headers.set('cookie', cookie);
    const res = await app.fetch(new KeptHeadersRequest(url.href, { method: init.method ?? 'GET', body: init.body, redirect: 'manual' }, headers));
    jar.take(res);
    return res;
  };
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await request(path, {
      method,
      headers: { 'x-tendwell-device': DEVICE, 'content-type': 'application/json', 'x-tendwell-locale': 'tr' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(data)}`);
    return data;
  };

  const { seedDemo } = await import('../../../scripts/seed-demo');
  await seedDemo(db, { locale: 'tr' });
  step(82, 'data');

  // Every call the app makes to its own address is answered here.
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, ORIGIN);
    if (url.origin === ORIGIN && url.pathname.startsWith('/papi/')) return portalRequest(url.pathname + url.search, init);
    if (url.origin !== ORIGIN || !(url.pathname.startsWith('/api/') || url.pathname === '/mcp')) return nativeFetch(input, init);
    return request(url.pathname + url.search, init);
  };
  const portalSignIn = async (address: string) => {
    if (portalJar.get('tw_portal')) return;
    await portalCall('POST', '/papi/auth/start', { email: address });
    // The link is emailed after the answer; wait for it (in memory, a moment).
    let mail: { text: string } | undefined;
    for (let i = 0; i < 40 && !mail; i++) {
      await new Promise((r) => setTimeout(r, 50));
      mail = email.sent.filter((m) => m.to === address && m.text.includes('#token=')).at(-1);
    }
    const token = /#token=([A-Za-z0-9_-]+)/.exec(mail?.text ?? '')?.[1];
    if (token) await portalCall('POST', '/papi/auth/verify', { token });
  };
  return { db, request, call, jar, portalCall, emails: email.sent, portalSignIn };
}

/** Signs `email` in through the real email-link flow and returns the session cookie. */
export async function signIn(server: DemoServer, email: string): Promise<string> {
  server.jar.set('tw_session', null);
  const start = await server.call<{ devToken: string }>('POST', '/api/auth/start', { email });
  await server.call('POST', '/api/auth/verify', { token: start.devToken, deviceId: DEVICE, deviceLabel: 'Demo' });
  const token = server.jar.get('tw_session');
  if (!token) throw new Error('no session');
  return token;
}

export const DEMO_DEVICE = DEVICE;
