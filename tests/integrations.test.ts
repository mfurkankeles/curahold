// The Zapier and Make apps (integrations/) are both built from one
// description of what other tools can do with Curahold. Here every trigger,
// action and search of that description is run against the real API with a
// real API key, through the Zapier app's own functions; and the Make app is
// checked to be the one that description builds, with every address it calls
// existing in the product.
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { deliverWebhooks } from '../api/src/lib/webhooks';
import { BASE, Client, login, setup, type Env } from './helpers';

const require = createRequire(import.meta.url);
const ops = require('../integrations/zapier/operations.js');
const zapier = require('../integrations/zapier/app.js');

class ZapierError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
  }
}

describe('the Zapier and Make apps against the real API', () => {
  let env: Env;
  let ada: Client;
  let key: string;
  const DOMAIN = `acme.${BASE}`;
  const sent: { url: string; headers: Headers; body: string }[] = [];
  const requests: { method: string; url: string; auth: string | null }[] = [];

  /** Zapier's `z`, with requests going to the product in this process instead of over the network. */
  const z = {
    errors: { Error: ZapierError },
    async request(req: { method: string; url: string; body?: unknown; headers?: Record<string, string> }) {
      let r = { ...req, headers: { ...(req.headers ?? {}) } };
      for (const before of zapier.beforeRequest) r = before(r, z, bundleOf({}));
      requests.push({ method: r.method, url: r.url, auth: r.headers.Authorization ?? null });
      const res = await env.app.request(r.url, { method: r.method, headers: { ...r.headers, ...(r.body === undefined ? {} : { 'content-type': 'application/json' }) }, body: r.body === undefined ? undefined : JSON.stringify(r.body) });
      const text = await res.text();
      let out = { status: res.status, data: text ? JSON.parse(text) : null };
      for (const after of zapier.afterResponse) out = after(out, z);
      return out;
    },
  };
  let authData = { domain: DOMAIN, apiKey: '' };
  const bundleOf = (extra: Record<string, unknown>) => ({ authData, inputData: {}, ...extra });
  const run = (kind: 'creates' | 'searches' | 'triggers', name: string, inputData: Record<string, unknown> = {}) => zapier[kind][name].operation.perform(z, bundleOf({ inputData }));

  beforeAll(async () => {
    env = await setup();
    ada = await login(env, 'acme', 'ada@demo.example');
    key = (await ada.post('/api/dev/keys', { name: 'Zapier', canWrite: true })).json.token;
    authData = { domain: DOMAIN, apiKey: key };
    env.fetchHolder.impl = async (url, init) => {
      sent.push({ url, headers: new Headers(init?.headers), body: String(init?.body ?? '') });
      return new Response('ok');
    };
  });

  it('connects with the company address and an API key, and names the connection after the company', async () => {
    expect(await zapier.authentication.test(z, bundleOf({}))).toEqual({ company: 'Demo Company', email: 'ada@demo.example' });
    expect(requests.at(-1)).toEqual({ method: 'GET', url: `https://${DOMAIN}/api/me`, auth: `Bearer ${key}` });
    authData = { domain: `https://${DOMAIN}/some/page`, apiKey: key };
    expect((await zapier.authentication.test(z, bundleOf({}))).company).toBe('Demo Company');
    authData = { domain: DOMAIN, apiKey: 'chk_wrong' };
    await expect(zapier.authentication.test(z, bundleOf({}))).rejects.toMatchObject({ status: 401 });
    // The key is only ever sent to a plain host name.
    for (const bad of ['', 'localhost', 'acme.curahold.test:8443', 'user@acme.curahold.test', 'acme.curahold.test?x=1', '10.0.0.1/..', 'evil.example#acme.curahold.test']) {
      authData = { domain: bad, apiKey: key };
      const before = requests.length;
      await expect(zapier.authentication.test(z, bundleOf({})), bad).rejects.toThrow(bad === '10.0.0.1/..' || bad === 'evil.example#acme.curahold.test' ? /./ : /Curahold address/);
      if (bad !== '10.0.0.1/..' && bad !== 'evil.example#acme.curahold.test') expect(requests.length, bad).toBe(before);
    }
    authData = { domain: DOMAIN, apiKey: key };
  });

  it('the address a key may be sent to is a bare host name, nothing more', () => {
    expect(ops.hostOf(' HTTPS://Acme.Curahold.test/settings ')).toBe('acme.curahold.test');
    for (const bad of ['', 'localhost', 'acme', 'acme.curahold.test:8443', 'user@acme.curahold.test', 'acme..test', '-acme.test', 'acme.test?x', 'acme.test#x', 'a b.test']) expect(() => ops.hostOf(bad), bad).toThrow();
  });

  it('fills the dropdowns: boards, people, customers', async () => {
    for (const name of ['list_boards', 'list_people', 'list_accounts']) {
      const rows = await run('triggers', name);
      expect(rows.length, name).toBeGreaterThan(0);
      expect(Object.keys(rows[0]).sort()).toEqual(['id', 'name']);
      expect(typeof rows[0].name).toBe('string');
    }
    expect((await run('triggers', 'list_people')).map((p: any) => p.name)).toContain('Ada Demir');
  });

  let taskId: string;
  let accountId: string;
  it('does what an automation can do: customers, tasks, comments, timeline entries', async () => {
    const account = await run('creates', 'create_account', { name: 'Larkspur Clinics', ownerId: env.a.ids.lena });
    expect(account).toMatchObject({ name: 'Larkspur Clinics', ownerId: env.a.ids.lena });
    accountId = account.id;
    expect(await run('creates', 'update_account', { accountId, name: 'Larkspur Clinics Group', ownerId: '' })).toMatchObject({ id: accountId, name: 'Larkspur Clinics Group', ownerId: env.a.ids.lena });

    const board = (await run('triggers', 'list_boards'))[0];
    // Zapier hands dates over with a time of day; a due date is a day.
    const task = await run('creates', 'create_task', { boardId: board.id, title: 'Send the welcome pack', accountId, assigneeIds: [env.a.ids.mert], dueDate: '2027-01-15T10:00:00+03:00', priority: 'high', description: '' });
    expect(task).toMatchObject({ title: 'Send the welcome pack', accountId, assigneeIds: [env.a.ids.mert], dueDate: '2027-01-15', priority: 'high' });
    taskId = task.id;

    // Two changes in a row: each reads the task's version first, so neither is refused or overwrites the other.
    const one = await run('creates', 'update_task', { taskId, title: 'Send the welcome pack today' });
    const two = await run('creates', 'update_task', { taskId, priority: 'urgent', dueDate: '2027-01-20' });
    expect(two).toMatchObject({ id: taskId, title: 'Send the welcome pack today', priority: 'urgent', dueDate: '2027-01-20' });
    expect(two.version).toBeGreaterThan(one.version);

    expect(await run('creates', 'add_comment', { taskId, body: 'Sent from an automation.' })).toMatchObject({ body: 'Sent from an automation.' });
    expect(await run('creates', 'log_activity', { accountId, kind: 'call', body: 'Kick-off call held.' })).toMatchObject({ kind: 'call', body: 'Kick-off call held.' });
    const timeline = (await ada.get(`/api/accounts/${accountId}/timeline`)).json.items;
    expect(JSON.stringify(timeline)).toContain('Kick-off call held.');

    expect((await run('searches', 'find_account', { name: 'Larkspur' })).map((a: any) => a.name)).toEqual(['Larkspur Clinics Group']);
    expect(await run('searches', 'find_account', { name: 'No such customer anywhere' })).toEqual([]);
    // Curahold's own words reach the person building the automation.
    await expect(run('creates', 'create_task', { boardId: board.id })).rejects.toMatchObject({ status: 400, code: 'validation' });
    await expect(run('creates', 'add_comment', { taskId: '00000000-0000-4000-8000-000000000000', body: 'x' })).rejects.toMatchObject({ status: 404 });
  });

  it('a read-only key can look but is told plainly that it cannot change anything', async () => {
    const readOnly = (await ada.post('/api/dev/keys', { name: 'Read', canWrite: false })).json.token;
    authData = { domain: DOMAIN, apiKey: readOnly };
    expect((await run('searches', 'find_account', { name: 'Larkspur' })).length).toBe(1);
    await expect(run('creates', 'create_account', { name: 'Nope' })).rejects.toMatchObject({ status: 403, code: 'read_only_token' });
    authData = { domain: DOMAIN, apiKey: key };
  });

  it('starts an automation within one delivery: adds its own webhook, checks the signature, removes the webhook again', async () => {
    const created = zapier.triggers.task_created.operation;
    const done = zapier.triggers.task_done.operation;
    const target = 'https://hooks.zapier.example/hooks/standard/1/abc';
    const sub = await created.performSubscribe(z, bundleOf({ targetUrl: target }));
    const subDone = await done.performSubscribe(z, bundleOf({ targetUrl: `${target}-done` }));
    expect(sub.secret).toMatch(/^whsec_/);
    expect((await ada.get('/api/dev/webhooks')).json.webhooks.map((w: any) => [w.url, w.events])).toEqual([[target, ['task.created']], [`${target}-done`, ['task.updated']]]);

    const board = (await run('triggers', 'list_boards'))[0];
    const made = await run('creates', 'create_task', { boardId: board.id, title: 'Call about the renewal' });
    await deliverWebhooks(env.deps, 50);
    const hit = sent.find((s) => s.url === target)!;
    expect(hit).toBeTruthy();
    // Zapier hands header names over with a prefix of its own.
    const bundle = (s: typeof hit, secret: string, over: Partial<{ content: string }> = {}) => bundleOf({ subscribeData: { id: 'x', secret }, cleanedRequest: JSON.parse(over.content ?? s.body), rawRequest: { headers: { 'Http-Curahold-Signature': s.headers.get('curahold-signature') }, content: over.content ?? s.body } });
    const out = await created.perform(z, bundle(hit, sub.secret));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: made.id, title: 'Call about the renewal', event: 'task.created' });
    expect(out[0].eventId).toBeTruthy();
    // Changed on the way, signed with another secret, or meant for another trigger: dropped.
    expect(await created.perform(z, bundle(hit, sub.secret, { content: hit.body.replace('Call about', 'Pay for') }))).toEqual([]);
    expect(await created.perform(z, bundle(hit, 'whsec_somebody_elses_secret'))).toEqual([]);
    expect(await zapier.triggers.account_created.operation.perform(z, bundle(hit, sub.secret))).toEqual([]);
    const stale = `t=${Math.floor(Date.now() / 1000) - 3600},v1=${createHmac('sha256', sub.secret).update(`${Math.floor(Date.now() / 1000) - 3600}.${hit.body}`).digest('hex')}`;
    expect(await created.perform(z, bundleOf({ subscribeData: sub, cleanedRequest: JSON.parse(hit.body), rawRequest: { headers: { 'Http-Curahold-Signature': stale }, content: hit.body } }))).toEqual([]);

    // "Task completed" lets a change through only once the task is done.
    sent.length = 0;
    await run('creates', 'update_task', { taskId: made.id, title: 'Call about the renewal (booked)' });
    await deliverWebhooks(env.deps, 50);
    const edit = sent.find((s) => s.url === `${target}-done`)!;
    expect(await done.perform(z, bundle(edit, subDone.secret))).toEqual([]);
    sent.length = 0;
    env.clock.now = new Date(Date.now() + 120_000);
    const doneKey = (await ada.get('/api/boards')).json.boards.find((b: any) => b.id === board.id).columns.find((c: any) => c.done).key;
    await run('creates', 'update_task', { taskId: made.id, status: doneKey });
    await deliverWebhooks(env.deps, 50);
    const finished = sent.find((s) => s.url === `${target}-done`)!;
    expect(await done.perform(z, bundle(finished, subDone.secret))).toMatchObject([{ id: made.id, done: true, event: 'task.updated' }]);
    env.clock.now = null;

    // A few real items to build with; an example where there is no list to read.
    const recent = await created.performList(z, bundleOf({}));
    expect(recent.length).toBeLessThanOrEqual(3);
    expect(await zapier.triggers.comment_created.operation.performList(z, bundleOf({}))).toEqual([ops.SAMPLES.comment]);

    await created.performUnsubscribe(z, bundleOf({ subscribeData: sub }));
    await done.performUnsubscribe(z, bundleOf({ subscribeData: subDone }));
    expect((await ada.get('/api/dev/webhooks')).json.webhooks).toEqual([]);
  });

  it('describes itself the way Zapier expects', () => {
    const all = [...Object.entries(zapier.triggers), ...Object.entries(zapier.creates), ...Object.entries(zapier.searches)] as [string, any][];
    expect(all).toHaveLength(ops.triggers.length + Object.keys(ops.lists).length + ops.actions.length + ops.searches.length);
    for (const [name, def] of all) {
      expect(def.key, name).toBe(name);
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(def.display.label.length, name).toBeGreaterThan(2);
      expect(def.display.description, name).toMatch(/\.$/);
      expect(def.operation.sample, name).toBeTruthy();
      for (const f of def.operation.inputFields ?? []) {
        if (f.dynamic) expect(Object.keys(zapier.triggers), `${name}.${f.key}`).toContain(f.dynamic.split('.')[0]);
        expect(['string', 'text', 'datetime']).toContain(f.type);
      }
    }
    for (const t of ops.triggers) expect(zapier.triggers[t.key].operation.type).toBe('hook');
    // Every event the product sends can start an automation.
    const events = (readFileSync(join(import.meta.dirname, '..', 'docs', 'site', 'en', 'webhooks.md'), 'utf8').match(/^\| `([a-z]+\.[a-z]+)` \|/gm) ?? []).map((l) => l.split('`')[1]);
    expect([...new Set(ops.triggers.map((t: any) => t.event))].sort()).toEqual(events.sort());
  });

  it('the Make app is the one the description builds, and calls only addresses the product has', async () => {
    const { build } = (await import(join(import.meta.dirname, '..', 'integrations', 'make', 'build.mjs'))) as { build(): any };
    const app = build();
    expect(JSON.parse(readFileSync(join(import.meta.dirname, '..', 'integrations', 'make', 'app.json'), 'utf8'))).toEqual(JSON.parse(JSON.stringify(app)));
    const routes = env.app.routes.map((r) => ({ method: r.method, re: new RegExp(`^${r.path.replace(/:[A-Za-z]+/g, '[^/]+')}$`) }));
    const exists = (method: string, url: string) => routes.some((r) => (r.method === method || r.method === 'ALL') && r.re.test(`/api${url.split('?')[0].replace(/\{\{[^}]+\}\}/g, 'x')}`));
    const calls: { method: string; url: string }[] = [];
    for (const r of Object.values<any>(app.rpcs)) calls.push(r.api);
    for (const w of Object.values<any>(app.webhooks)) calls.push(w.attach, w.detach);
    for (const m of Object.values<any>(app.modules)) for (const c of m.api ? [m.api].flat() : []) calls.push(c);
    expect(calls.length).toBeGreaterThan(20);
    for (const c of calls) expect(exists(c.method, c.url), `${c.method} ${c.url}`).toBe(true);
    // Same names on both sides.
    expect(Object.keys(app.modules).sort()).toEqual([...ops.triggers.map((t: any) => `watch_${t.key}`), ...ops.actions.map((a: any) => a.key), ...ops.searches.map((s: any) => s.key)].sort());
    expect(app.base.log.sanitize).toContain('request.headers.authorization');
    expect(JSON.stringify(app)).not.toContain('chk_');
  });
});
