// Robots, scrapers and cost (api/src/lib/botGuard.ts, lib/humanCheck.ts and the
// new budgets in lib/ratelimit.ts): known crawlers refused by name (never the AI
// connector, never a request with its own key), scripted tools refused at the
// public doors in production, scanners slowed, uploads and the public "Ask"
// limited per address, unusual traffic raised to the console, and the public
// forms' honeypot / fill-time / Turnstile checks with and without a key.
import { beforeAll, describe, expect, it } from 'vitest';
import { BUDGETS, isUpload } from '../api/src/lib/ratelimit';
import { TRAFFIC_RULES, TrafficWatch, crawlerBearer, robotRefusal } from '../api/src/lib/botGuard';
import { TURNSTILE_VERIFY, humanCheck } from '../api/src/lib/humanCheck';
import { createPortalApp } from '../api/src/portal';
import { BASE, Client, login, setup, type Env } from './helpers';

const GPT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)';
const BROWSER = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
let ipSeq = 0;
const freshIp = () => `203.0.113.${++ipSeq}`;

describe('robots refused by name', () => {
  let env: Env;
  beforeAll(async () => {
    env = await setup({ robotGuard: 'strict' });
  });
  const ask = (path: string, headers: Record<string, string>, init: RequestInit = {}) => env.app.request(`https://acme.${BASE}${path}`, { ...init, headers: { 'x-curahold-locale': 'tr', ...headers } });

  it('an AI crawler gets 403 with a plain sentence on the app and the API', async () => {
    const r = await ask('/api/me', { 'user-agent': GPT });
    expect(r.status).toBe(403);
    const body = (await r.json()) as { error: string; message: string };
    expect(body.error).toBe('robot_refused');
    expect(body.message).toContain('yazılı iznimiz');
  });

  it('but never the AI connector, robots.txt, or a request carrying its own key', async () => {
    expect((await ask('/robots.txt', { 'user-agent': GPT })).status).toBe(200);
    expect((await ask('/.well-known/oauth-authorization-server', { 'user-agent': 'Claude-User' })).status).not.toBe(403);
    const ada = await login(env, 'acme', 'ada@demo.example');
    const { token } = (await ada.post('/api/dev/keys', { name: 'Assistant', canWrite: false })).json;
    expect((await ask('/api/me', { 'user-agent': 'Claude-User', authorization: `Bearer ${token}` })).status).toBe(200);
    expect(robotRefusal('strict', { path: '/mcp', ua: 'Claude-User', bearer: false })).toBeNull();
    expect(robotRefusal('strict', { path: '/oauth/token', ua: 'ChatGPT-User', bearer: false })).toBeNull();
  });

  it('a made-up bearer is no pass: a crawler with one is refused, on the API and everywhere else', async () => {
    // Security W3d (LOW): any "Bearer x" used to get a crawler past the block to the public answers.
    for (const bearer of ['Bearer x', 'Bearer chk_not_a_real_key', 'Bearer chk_' + 'a'.repeat(40)]) {
      for (const path of ['/api/auth/methods', '/api/me', '/api/trial/config']) {
        const r = await ask(path, { 'user-agent': GPT, authorization: bearer });
        expect(r.status, `${bearer} ${path}`).toBe(403);
        expect(((await r.json()) as { error: string }).error).toBe('robot_refused');
      }
    }
    // Outside the API a bearer means nothing, so it is not even looked at.
    expect(robotRefusal('crawlers', { path: '/customers', ua: GPT, bearer: true })).toBe('ai');
    expect(crawlerBearer('crawlers', { path: '/customers', ua: GPT, bearer: true })).toBeNull();
    expect(crawlerBearer('crawlers', { path: '/api/me', ua: GPT, bearer: true })).toBe('ai');
    expect(crawlerBearer('crawlers', { path: '/api/me', ua: BROWSER, bearer: true })).toBeNull();
    expect(crawlerBearer('off', { path: '/api/me', ua: GPT, bearer: true })).toBeNull();
  });

  it('scripted tools are refused at the public doors only, and only in strict mode', async () => {
    expect((await ask('/api/trial/code', { 'user-agent': 'curl/8.5.0', 'content-type': 'application/json' }, { method: 'POST', body: '{}' })).status).toBe(403);
    expect((await ask('/api/me', { 'user-agent': 'curl/8.5.0' })).status).toBe(401);
    expect(robotRefusal('strict', { path: '/papi/auth/start', ua: '', bearer: false })).toBe('tool');
    expect(robotRefusal('crawlers', { path: '/papi/auth/start', ua: 'HeadlessChrome/131', bearer: false })).toBeNull();
    expect(robotRefusal('off', { path: '/api/me', ua: GPT, bearer: false })).toBeNull();
    expect(robotRefusal(undefined, { path: '/api/me', ua: BROWSER, bearer: false })).toBeNull();
  });

  it('the portal refuses crawlers too, and says noindex', async () => {
    const portal = createPortalApp({ ...env.deps, config: { ...env.config, portalDomain: 'curahold-portal.test' } });
    const r = await portal.request('https://acme.curahold-portal.test/papi/org', { headers: { 'user-agent': GPT } });
    expect(r.status).toBe(403);
    const robots = await portal.request('https://acme.curahold-portal.test/robots.txt');
    expect(await robots.text()).toContain('Disallow: /');
  });
});

describe('limits for the public doors, uploads and scanners', () => {
  let env: Env;
  beforeAll(async () => {
    env = await setup({ limitScale: 1, clientIp: 'cf' });
  });

  it('the public "Ask" door: a person asking stays inside, a script from one address gets 429 with Retry-After', async () => {
    const ip = freshIp();
    // A visitor who said yes to the AI consent notice (assistant/consent.ts), so the door answers.
    const consentId = crypto.randomUUID();
    await env.app.request(`https://app.${BASE}/api/assist/public/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-curahold-ask': '1', 'cf-connecting-ip': freshIp(), 'user-agent': BROWSER },
      body: JSON.stringify({ consentId, granted: true, lang: 'en' }),
    });
    const ask = () =>
      env.app.request(`https://app.${BASE}/api/assist/public`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-curahold-ask': '1', 'cf-connecting-ip': ip, 'user-agent': BROWSER },
        body: JSON.stringify({ question: 'how do I add people?', lang: 'en', consentId }),
      });
    const codes: number[] = [];
    for (let i = 0; i < BUDGETS.assistDoor.cap + 2; i++) codes.push((await ask()).status);
    expect(codes.slice(0, 5).every((c) => c === 200)).toBe(true);
    const last = await ask();
    expect(last.status).toBe(429);
    expect(Number(last.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('a run of unknown API addresses from one signed-in address is a scanner: it waits', async () => {
    // Signed out, every address answers 401 alike (nothing to map, nothing looked up); signed in, unknown ones are 404.
    const ip = freshIp();
    const ada = await login(env, 'acme', 'ada@demo.example');
    const probe = (n: number) => ada.req('GET', `/api/nothing-here-${n}`, undefined, { 'cf-connecting-ip': ip, 'user-agent': BROWSER });
    const codes: number[] = [];
    for (let i = 0; i < BUDGETS.probe.cap + 3; i++) codes.push((await probe(i)).status);
    expect(codes.slice(0, 20).every((c) => c === 404)).toBe(true);
    expect(codes.at(-1)).toBe(429);
    // Another address is untouched.
    expect((await env.app.request(`https://acme.${BASE}/api/health`, { headers: { 'cf-connecting-ip': freshIp() } })).status).toBe(200);
  });

  it('a scanner without a session is counted too: every address answers 401, and they add up', async () => {
    // Security W3d (LOW): without a session nothing reached routing, so no 404 was ever counted.
    const ip = freshIp();
    const probe = (n: number) => env.app.request(`https://acme.${BASE}/api/nothing-here-${n}`, { headers: { 'cf-connecting-ip': ip, 'user-agent': BROWSER } });
    const codes: number[] = [];
    for (let i = 0; i < BUDGETS.probe.cap + 3; i++) codes.push((await probe(i)).status);
    expect(codes.slice(0, 20).every((c) => c === 401)).toBe(true);
    expect(codes.at(-1)).toBe(429);
    // A webhook receiver's refusals of a bad signature are not counted: a vendor's address is shared by many companies.
    const ada = await login(env, 'acme', 'ada@demo.example');
    const made = (await ada.post('/api/inbound-hooks', { name: 'Automations', recipe: 'curahold' })).json.hook;
    const vendor = freshIp();
    const hook = () => env.app.request(made.url, { method: 'POST', body: '{"a":1}', headers: { 'cf-connecting-ip': vendor, 'content-type': 'application/json', 'x-curahold-signature': 't=1,v1=00' } });
    const hookCodes: number[] = [];
    for (let i = 0; i < BUDGETS.probe.cap + 3; i++) hookCodes.push((await hook()).status);
    expect(hookCodes[0]).toBeGreaterThanOrEqual(400);
    expect(hookCodes).not.toContain(429);
  });

  it('uploads have a budget of their own', () => {
    expect(isUpload('POST', '/api/tasks/0b1c/files', undefined)).toBe(true);
    expect(isUpload('POST', '/papi/tasks/0b1c/comments', 'multipart/form-data; boundary=x')).toBe(true);
    expect(isUpload('POST', '/api/tasks', 'application/json')).toBe(false);
    expect(isUpload('GET', '/api/files/0b1c', undefined)).toBe(false);
    expect(BUDGETS.upload.cap).toBeLessThan(BUDGETS.write.cap);
  });
});

describe('unusual traffic reaches the console', () => {
  it('a burst of 429s from one address raises one alert per quarter hour, with no address in it', () => {
    let now = Date.parse('2026-11-19T10:00:00Z');
    const w = new TrafficWatch(() => now);
    const alerts = [];
    for (let i = 0; i < TRAFFIC_RULES.limitedPerIpPerMinute * 3; i++) {
      const a = w.note('limited', '198.51.100.7', '/api/search');
      if (a) alerts.push(a);
    }
    expect(alerts).toHaveLength(1);
    expect(alerts[0].rule).toBe('ip-burst');
    expect(JSON.stringify(alerts[0])).not.toContain('198.51.100.7');
    now += 60_000;
    for (let i = 0; i < TRAFFIC_RULES.limitedPerIpPerMinute; i++) expect(w.note('limited', '198.51.100.7', '/api/search')).toBeNull();
    now += TRAFFIC_RULES.alertEveryMinutes * 60_000;
    let again = null;
    for (let i = 0; i < TRAFFIC_RULES.limitedPerIpPerMinute; i++) again ??= w.note('limited', '198.51.100.7', '/api/search');
    expect(again?.rule).toBe('ip-burst');
  });

  it('many refused robots write an alert row the console reads (company_log, kind alert)', async () => {
    const env = await setup({ robotGuard: 'strict' });
    for (let i = 0; i < TRAFFIC_RULES.refusedPerMinute; i++) await env.app.request(`https://acme.${BASE}/api/me`, { headers: { 'user-agent': GPT } });
    await env.settle();
    const rows = await env.db.system((q) => q.query<{ body: string; ref: string }>(`select body, ref from company_log where kind = 'alert' and ref like 'traffic:robots:%'`));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].body).toMatch(/robot requests refused/);
  });
});

describe('public forms: honeypot, fill time, Turnstile', () => {
  it('without a key: the honeypot and a too-quick form are robots, a person goes on', async () => {
    const env = await setup();
    expect(await humanCheck(env.deps, { hp: 'http://spam.example' })).toBe('bot');
    expect(await humanCheck(env.deps, { ms: 300 })).toBe('bot');
    expect(await humanCheck(env.deps, { ms: 6000 })).toBe('person');
    expect(await humanCheck(env.deps, {})).toBe('person');
  });

  it('with a key: no token or a refused token fails, a good token passes, Cloudflare down lets people through', async () => {
    const env = await setup({ turnstile: { siteKey: '1x00000000000000000000AA', secretKey: 'test-secret' } });
    const seen: string[] = [];
    let answer: () => Response = () => Response.json({ success: true });
    env.fetchHolder.impl = async (url, init) => {
      seen.push(`${url} ${String((init as RequestInit).body)}`);
      return answer();
    };
    expect(await humanCheck(env.deps, { ms: 5000 })).toBe('failed');
    expect(await humanCheck(env.deps, { ms: 5000, ts: 'good-token' }, { ip: '203.0.113.9' })).toBe('person');
    expect(seen[0]).toContain(TURNSTILE_VERIFY);
    expect(seen[0]).toContain('secret=test-secret');
    // The address is not sent unless the operator chose it (TURNSTILE_SEND_IP=1).
    expect(seen[0]).not.toContain('remoteip');
    (env.deps.config.turnstile as { sendIp?: boolean }).sendIp = true;
    expect(await humanCheck(env.deps, { ms: 5000, ts: 'good-token' }, { ip: '203.0.113.9' })).toBe('person');
    expect(seen[1]).toContain('remoteip=203.0.113.9');
    (env.deps.config.turnstile as { sendIp?: boolean }).sendIp = false;
    answer = () => Response.json({ success: false, 'error-codes': ['invalid-input-response'] });
    expect(await humanCheck(env.deps, { ms: 5000, ts: 'bad-token' })).toBe('failed');
    answer = () => {
      throw new Error('network down');
    };
    expect(await humanCheck(env.deps, { ms: 5000, ts: 'any' })).toBe('person');
  });

  it('the trial form gives its site key, asks for a token before the e-mail goes out, and fakes success for a robot', async () => {
    const env = await setup({ signupMode: 'request', turnstile: { siteKey: '1x00000000000000000000AA', secretKey: 'test-secret' } });
    env.fetchHolder.impl = async () => Response.json({ success: true });
    const c = new Client(env, 'app');
    expect(((await c.get('/api/trial/config')).json as { turnstile: string }).turnstile).toBe('1x00000000000000000000AA');
    const none = await c.post('/api/trial/code', { email: 'ayla@northwind.example', locale: 'en' });
    expect(none.status).toBe(400);
    expect((none.json as { error: string }).error).toBe('human_check');
    const robot = await c.post('/api/trial/code', { email: 'robot@northwind.example', hp: 'x', ts: 'tok' });
    expect(robot.status).toBe(200);
    expect(env.email.sent.filter((m) => m.to === 'robot@northwind.example')).toHaveLength(0);
    const person = await c.post('/api/trial/code', { email: 'ayla@northwind.example', locale: 'en', ms: 9000, ts: 'tok' });
    expect(person.status).toBe(200);
  });

  it('without a key the trial config says so and the form works as before', async () => {
    const env = await setup({ signupMode: 'request' });
    const c = new Client(env, 'app');
    expect(((await c.get('/api/trial/config')).json as { turnstile: string | null }).turnstile).toBeNull();
    expect((await c.post('/api/trial/code', { email: 'deniz@northwind.example', locale: 'en' })).status).toBe(200);
  });
});
