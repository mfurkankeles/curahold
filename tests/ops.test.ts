// Monitoring on free tiers (api/src/lib/ops.ts): the error-rate and latency
// watch, alerts into the owner console (company_log) once per rule per slot,
// one e-mail to the owner per alert, the hourly error_log check, and the
// readiness answer the status page and the synthetic check read.
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/src/app';
import { OpsWatch, opsHourlyCheck, raiseOpsAlert, OPS_RULES } from '../api/src/lib/ops';
import { BASE, setup, type Env } from './helpers';

const OWNER = 'owner@curahold.test';
let env: Env;
beforeAll(async () => {
  env = await setup({ owner: OWNER, support: { staff: [OWNER] }, ops: { alerts: true } });
});
const alerts = (ref: string) => env.db.system((q) => q.query(`select body, meta from company_log where kind = 'alert' and ref like $1`, [ref]));

describe('the ops watch', () => {
  it('stays quiet under the minimum, then raises the error alert once per 15 minutes', () => {
    const w = new OpsWatch();
    const t = Date.parse('2026-11-19T10:01:00Z');
    for (let i = 0; i < OPS_RULES.minRequests - 1; i++) expect(w.note(500, 10, t)).toBeNull();
    const a = w.note(200, 10, t + 1);
    expect(a?.rule).toBe('errors');
    expect(a?.ref).toBe('ops:errors:2026-11-19T10:00');
    expect(w.note(500, 10, t + 2)).toBeNull();
    // A new slot, still failing: one more.
    let next = null;
    for (let i = 0; i < OPS_RULES.minRequests && !next; i++) next = w.note(500, 10, t + 15 * 60_000 + i);
    expect(next?.ref).toBe('ops:errors:2026-11-19T10:15');
  });

  it('a healthy mix raises nothing; a slow tail raises the latency alert', () => {
    const w = new OpsWatch();
    const t = Date.parse('2026-11-19T10:01:00Z');
    for (let i = 0; i < 200; i++) expect(w.note(i % 50 === 0 ? 500 : 200, 40, t + i)).toBeNull(); // 2% errors
    let hit = null;
    for (let i = 0; i < 40 && !hit; i++) hit = w.note(200, 2600, t + 300 + i);
    expect(hit?.rule).toBe('latency');
    expect(hit?.meta.p95).toBeGreaterThanOrEqual(OPS_RULES.p95Ms);
  });

  it('old answers leave the window', () => {
    const w = new OpsWatch();
    const t = Date.parse('2026-11-19T10:01:00Z');
    for (let i = 0; i < 40; i++) w.note(500, 10, t);
    // Six minutes later the earlier failures no longer count: 20 fresh answers are under the minimum.
    for (let i = 0; i < 20; i++) expect(w.note(500, 10, t + 6 * 60_000)).toBeNull();
  });
});

describe('alerts reach the console and the owner', () => {
  it('stored once by reference, one e-mail per alert', async () => {
    const a = { rule: 'errors' as const, ref: 'ops:errors:test-slot', body: 'Errors: 9 of 60 answers failed (5xx) in the last 5 minutes', meta: { failed: 9 } };
    const before = env.email.sent.length;
    expect(await raiseOpsAlert(env.deps as any, a)).toBe(true);
    expect(await raiseOpsAlert(env.deps as any, a)).toBe(false);
    expect(await alerts('ops:errors:test-slot')).toHaveLength(1);
    const mails = env.email.sent.slice(before);
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe(OWNER);
    expect(mails[0].subject).toContain('errors');
  });

  it('the hourly check counts server errors across every isolate', async () => {
    const now = new Date();
    await env.db.system((q) =>
      q.query(`insert into error_log (source, method, path, message, at) select 'server', 'GET', '/api/x', 'boom', now() - interval '5 minutes' from generate_series(1, $1)`, [OPS_RULES.errorLogPerHour]),
    );
    const out = await opsHourlyCheck(env.deps as any, now);
    expect(out.map((a) => a.rule)).toContain('error-log');
    await opsHourlyCheck(env.deps as any, now);
    expect(await alerts(`ops:error-log:${now.toISOString().slice(0, 13)}`)).toHaveLength(1);
  });

  it('every API answer is watched: a slow tail lands in the console', async () => {
    const watch = new OpsWatch({ ...OPS_RULES, minRequests: 1, p95Ms: 0 });
    const app = createApp({ ...(env.deps as any), ops: watch });
    expect((await app.request(`https://app.${BASE}/api/health`)).status).toBe(200);
    await env.settle();
    expect((await alerts('ops:latency:%')).length).toBeGreaterThan(0);
  });
});

describe('health answers', () => {
  it('/api/health is cheap; /api/health/ready reaches the database; both readable by the status page', async () => {
    const live = await env.app.request(`https://app.${BASE}/api/health`);
    expect(await live.json()).toEqual({ ok: true });
    const r = await env.app.request(`https://app.${BASE}/api/health/ready`);
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    const body = (await r.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.db.ok).toBe(true);
    expect(typeof body.db.ms).toBe('number');
    expect(Object.keys(body).sort()).toEqual(['at', 'db', 'ok']);
  });

  it('answers 503 when the database is not reached', async () => {
    const broken = { ...(env.deps as any), db: { ...env.db, system: async () => Promise.reject(new Error('down')) } };
    const r = await createApp(broken).request(`https://app.${BASE}/api/health/ready`);
    expect(r.status).toBe(503);
    expect(((await r.json()) as any).db.ok).toBe(false);
  });
});

describe('the synthetic check', () => {
  it('times each address and names what failed; the status file says down when one is down', async () => {
    const { checksFrom, runChecks, statusJson } = await import('../scripts/synthetic');
    const checks = checksFrom({ SYN_APP: 'https://app.example.test', SYN_SITE: 'https://example.test', SYN_PORTAL: 'https://portal.example.test' });
    expect(checks.map((c) => c.id)).toEqual(['app', 'database', 'docs', 'site', 'security-txt', 'portal']);
    const stub = (async (u: string) => {
      if (u.endsWith('/papi/health')) throw new Error('connect refused');
      if (u.endsWith('/api/health/ready')) return new Response(JSON.stringify({ ok: false }), { status: 503 });
      if (u.endsWith('security.txt')) return new Response('Contact: mailto:security@example.test');
      if (u.endsWith('/api/health')) return new Response('{"ok":true}');
      return new Response('<!doctype html><html></html>');
    }) as unknown as typeof fetch;
    const r = await runChecks(checks, { fetch: stub });
    const by = Object.fromEntries(r.map((x) => [x.id, x.state]));
    expect(by).toEqual({ app: 'up', database: 'down', docs: 'up', site: 'up', 'security-txt': 'up', portal: 'down' });
    expect(r.find((x) => x.id === 'portal')!.error).toContain('refused');
    const s = statusJson(r, new Date('2026-11-19T10:00:00Z'));
    expect(s.state).toBe('down');
    expect(s.components).toHaveLength(6);
    expect(JSON.stringify(s)).not.toContain('example.test'); // the public file names components, not addresses
  });
});
