// The load test: the large company perf.ts builds, served over real HTTP by
// the self-hosted server's own app and config (production request limits on,
// the address taken from the proxy header as behind the install guide's
// reverse proxy), with many people using it at once. Measures p50/p95/p99 per
// request kind and every refusal; then checks that the limits refuse a burst
// with 429 + Retry-After while normal use is never refused.
//
//   PERF_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres \
//   LOAD_KEEP=<database perf.ts made> npx tsx scripts/load.ts
//
// LOAD_PEOPLE (200), LOAD_WRITERS (50), LOAD_SECONDS (120, measured after a
// 20 s warm-up), LOAD_PORT (10300). It changes the database it is given (tasks,
// comments, files): use perf.ts's throwaway one, never a real one.
import { serve } from '@hono/node-server';
import postgres from 'postgres';
import { createApp } from '../api/src/app';
import { postgresDb } from '../api/src/db/postgres';
import { MemoryEmail, MemoryStorage } from '../api/src/lib/services';
import { selfHostConfig } from '../api/src/selfhost';
import { login, testConfig } from '../tests/helpers';

const base = process.env.PERF_DATABASE_URL;
const keep = process.env.LOAD_KEEP;
if (!base || !keep) {
  console.error('Set PERF_DATABASE_URL and LOAD_KEEP (a database scripts/perf.ts built).');
  process.exit(2);
}
const PEOPLE = Number(process.env.LOAD_PEOPLE) || 200;
const WRITERS = Math.min(PEOPLE, Number(process.env.LOAD_WRITERS) || 50);
const SECONDS = Number(process.env.LOAD_SECONDS) || 120;
const WARM = 20;
const PORT = Number(process.env.LOAD_PORT) || 10300;
// The mix. Think time: a person reads a screen for a few seconds before the next click (3–8 s);
// a writer changes something about every third click (adds, moves, comments, as on a busy morning).
const THINK: [number, number] = [3000, 8000];
const WRITE_SHARE = 0.35;

const url = new URL(base);
url.pathname = `/${keep}`;
const raw = postgres(url.toString(), { max: 1, onnotice: () => undefined });
const secret = 'load-test-secret-load-test-secret-0123456789';
// The server: what selfhost.ts builds (its config, its pool size), without the hourly timer and the live channel.
const config = { ...selfHostConfig({ PUBLIC_URL: `http://127.0.0.1:${PORT}`, COMPANY_SLUG: 'big', AUTH_SECRET: secret, DATABASE_URL: url.toString() }), devExposeTokens: false };
const db = postgresDb(url.toString(), { max: 10 });
const storage = new MemoryStorage();
const server = serve({ fetch: createApp({ db, email: new MemoryEmail(), storage, config, fetch, defer: () => undefined, now: () => new Date() } as any).fetch, port: PORT });

// Signing 200 people in through the front door would meet its own limit (20 sign-in steps an
// address, 200 a company): they sign in once beforehand, through the same database.
const side = createApp({ db, email: new MemoryEmail(), storage, config: testConfig({ authSecret: secret }), fetch, defer: () => undefined, now: () => new Date() } as any);
const [org] = await raw.unsafe(`select id from orgs where slug = 'big'`);
await raw.unsafe('delete from login_tokens');
const users = await raw.unsafe(`select id, email from users where org_id = $1 and status = 'active' and email like 'kisi%' order by email limit $2`, [org.id, PEOPLE]);
const [board] = await raw.unsafe(`select b.id from boards b where b.org_id = $1 and b.visibility = 'org' order by (select count(*) from tasks t where t.board_id = b.id) desc limit 1`, [org.id]);
const accounts = (await raw.unsafe(`select id from accounts where org_id = $1 and archived_at is null order by id limit 300`, [org.id])).map((r: any) => r.id);
const plans = (await raw.unsafe(`select id from onboarding_plans where org_id = $1 and kind = 'client' limit 100`, [org.id])).map((r: any) => r.id);
const steps = (await raw.unsafe(`select id from onboarding_steps where org_id = $1 and plan_id = any($2::uuid[]) limit 100`, [org.id, plans])).map((r: any) => r.id);
console.log(`${keep}: ${users.length} people, board ${board.id.slice(0, 8)}, ${plans.length} plans; signing in…`);
const people = await Promise.all(users.map(async (u: any, i: number) => ({ id: u.id as string, ip: `10.${(i >> 8) & 255}.${i & 255}.${7}`, c: await login({ app: side } as any, 'big', u.email) })));

const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Kind = string;
const READS: [Kind, () => string][] = [
  ['home', () => '/api/me/start'],
  ['board', () => `/api/boards/${board.id}/tasks?per=100`],
  ['customers', () => '/api/accounts?limit=500&signals=1'],
  ['customer', () => `/api/accounts/${pick(accounts)}`],
  ['search', () => '/api/search?q=yenileme'],
  ['setup-health', () => '/api/setup-health'],
  ['onboarding-hub', () => '/api/onboarding/self'],
  ['onboarding-portfolio', () => '/api/onboarding-plans'],
  ['onboarding-plan', () => `/api/onboarding-plans/${pick(plans)}`],
  ['portfolio', () => '/api/reports/portfolio'],
  ['workload', () => '/api/reports/workload'],
  ['pulse', () => '/api/pulse'],
];
const times = new Map<Kind, number[]>();
const refusals = new Map<string, number>();
let measuring = false;
const call = async (p: (typeof people)[number], kind: Kind, method: string, path: string, body?: BodyInit, type = 'application/json') => {
  const at = performance.now();
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method,
    headers: { cookie: p.c.cookie, 'x-curahold-device': p.c.device, 'x-forwarded-for': p.ip, ...(body && type ? { 'content-type': type } : {}) },
    body,
  }).catch(() => null);
  const ms = performance.now() - at;
  const text = r ? await r.text() : '';
  if (measuring) {
    times.set(kind, [...(times.get(kind) ?? []), ms]);
    if (!r || r.status >= 400) refusals.set(`${kind} ${r?.status ?? 'net'}`, (refusals.get(`${kind} ${r?.status ?? 'net'}`) ?? 0) + 1);
  }
  return { status: r?.status ?? 0, text, headers: r?.headers };
};
const write = async (p: (typeof people)[number]) => {
  const n = Math.random();
  if (n < 0.45) {
    const made = await call(p, 'write: add task', 'POST', '/api/tasks', JSON.stringify({ boardId: board.id, title: 'Yük testi görevi', assigneeIds: [p.id] }));
    const t = made.status === 201 ? JSON.parse(made.text).task : null;
    if (t) await call(p, 'write: move task', 'PATCH', `/api/tasks/${t.id}`, JSON.stringify({ baseVersion: t.version, status: 'doing' }));
  } else if (n < 0.75) {
    const [t] = await raw.unsafe(`select id from tasks where board_id = $1 and archived_at is null order by random() limit 1`, [board.id]);
    await call(p, 'write: comment', 'POST', `/api/tasks/${t.id}/comments`, JSON.stringify({ body: 'Yük testi yorumu' }));
  } else if (n < 0.9) {
    await call(p, 'write: onboarding step', 'PATCH', `/api/onboarding-steps/${pick(steps)}`, JSON.stringify({ note: `yük ${Date.now()}` }));
  } else {
    const f = new FormData();
    f.append('file', new File(['%PDF-1.4 yük testi'], 'liste.pdf', { type: 'application/pdf' }));
    await call(p, 'write: upload', 'POST', `/api/onboarding-steps/${pick(steps)}/files`, f as any, '');
  }
};
const until = Date.now() + (WARM + SECONDS) * 1000;
setTimeout(() => (measuring = true), WARM * 1000);
await Promise.all(
  people.map(async (p, i) => {
    await sleep(Math.random() * THINK[1]);
    while (Date.now() < until) {
      if (i < WRITERS && Math.random() < WRITE_SHARE) await write(p);
      else {
        const [kind, path] = pick(READS);
        await call(p, kind, 'GET', path());
      }
      await sleep(THINK[0] + Math.random() * (THINK[1] - THINK[0]));
    }
  }),
);
measuring = false;

const pct = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))] ?? 0;
let all = 0;
console.log(`\n${PEOPLE} people (${WRITERS} writing), ${SECONDS} s after ${WARM} s warm-up\n${'kind'.padEnd(26)}${'n'.padStart(6)}${'p50'.padStart(8)}${'p95'.padStart(8)}${'p99'.padStart(8)}${'max'.padStart(8)}`);
for (const [k, xs] of [...times].sort()) {
  all += xs.length;
  console.log(`${k.padEnd(26)}${String(xs.length).padStart(6)}${pct(xs, 0.5).toFixed(0).padStart(8)}${pct(xs, 0.95).toFixed(0).padStart(8)}${pct(xs, 0.99).toFixed(0).padStart(8)}${Math.max(...xs).toFixed(0).padStart(8)}`);
}
const bad = [...refusals].reduce((n, [, v]) => n + v, 0);
console.log(`requests ${all} (${(all / SECONDS).toFixed(1)}/s) · refused or failed ${bad}${bad ? `: ${[...refusals].map(([k, v]) => `${k} ×${v}`).join(', ')}` : ''}`);

// The limits, from the other side: bursts a person would never make are refused, with when to try again.
measuring = false;
const burst = async (label: string, n: number, one: () => Promise<{ status: number; headers?: Headers }>) => {
  let first = 0;
  let retry = '';
  for (let i = 1; i <= n; i++) {
    const r = await one();
    if (r.status === 429 && !first) (first = i), (retry = r.headers?.get('retry-after') ?? '(none)');
  }
  console.log(`limit  ${label.padEnd(44)}${first ? `429 from request ${first}, Retry-After ${retry}` : `never refused in ${n}`}`);
};
const p0 = people[0];
await burst('one person, 400 reads at once', 400, () => call(p0, 'x', 'GET', '/api/pulse'));
await burst('one person, 60 uploads', 60, () => {
  const f = new FormData();
  f.append('file', new File(['%PDF-1.4 x'], 'x.pdf', { type: 'application/pdf' }));
  return call(people[1], 'x', 'POST', `/api/onboarding-steps/${steps[0]}/files`, f as any, '');
});
await burst('one address, 40 questions to the public Ask door', 40, () =>
  fetch(`http://127.0.0.1:${PORT}/api/assist/public`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-curahold-ask': '1', 'x-forwarded-for': '203.0.113.9' }, body: JSON.stringify({ question: 'How do I invite people?' }) }).then(async (r) => (await r.text(), { status: r.status, headers: r.headers })),
);
await burst('one address, 40 sign-in attempts', 40, () =>
  fetch(`http://127.0.0.1:${PORT}/api/auth/start`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' }, body: JSON.stringify({ email: 'nobody@big.example' }) }).then(async (r) => (await r.text(), { status: r.status, headers: r.headers })),
);
await burst('one address, 100 unknown API addresses', 100, () =>
  fetch(`http://127.0.0.1:${PORT}/api/zz-${Math.random().toString(36).slice(2)}`, { headers: { 'x-forwarded-for': '203.0.113.11' } }).then(async (r) => (await r.text(), { status: r.status, headers: r.headers })),
);
server.close();
await raw.end({ timeout: 2 });
await db.close?.();
process.exit(0);
