// The assistant's doors on the real API (routes/assist.ts): as the signed-in
// person (their data through the same API, so the same walls), the company's
// settings and usage, the public docs chat, and the desk's first reply — with
// a scripted model, so no key is needed.
import { beforeAll, describe, expect, it } from 'vitest';
import type { DocSection } from '../shared/src/answers';
import { mockProvider, respondWith, type LlmRequest, type LlmResponse } from '../api/src/assistant/provider';
import type { Deps } from '../api/src/context';
import { BASE, Client, login, setup, type Env } from './helpers';

const DOCS: DocSection[] = [
  { u: '/docs/en/getting-started/', a: 'first-setup', t: 'Getting started', h: 'First setup', m: '<p>Invite your team from <strong>Settings → People</strong>.</p>', s: 'help' },
  { u: '/docs/en/customers/', a: 'importing', t: 'Customers', h: 'Importing', m: '<p>Import customers from a CSV file: <strong>Customers → Import</strong>.</p>', s: 'help' },
];

let env: Env;
let ada: Client;
let lena: Client;
let script: (req: LlmRequest, n: number) => LlmResponse = () => respondWith({ kind: 'answer', text: 'From **Settings → People**.', sources: ['S1'] });
const provider = mockProvider((req, n) => script(req, n), 'claude-sonnet-5-5');

beforeAll(async () => {
  env = await setup();
  (env.deps as Deps).assistant = { provider, docs: async () => DOCS };
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  // Each person says yes to the consent notice first (tests/assistant-consent.test.ts checks the refusal without it).
  for (const who of [ada, lena]) expect((await who.post('/api/assist/consent', { granted: true })).status).toBe(200);
}, 60_000);

describe('CuraAI in the app', () => {
  it("asks back on the owner's question, in Turkish, without the model", async () => {
    const before = provider.calls.length;
    const r = await ada.post('/api/assist', { question: 'ben kişileri dashboard a nasıl eklerim?' });
    expect(r.status).toBe(200);
    expect(r.json.reply.kind).toBe('clarify');
    expect(r.json.reply.lang).toBe('tr');
    expect(r.json.reply.options).toHaveLength(4);
    expect(provider.calls.length).toBe(before);
  });

  it('reads data as the person asking: what they can see, never another company’s', async () => {
    const made = await ada.post('/api/accounts', { name: 'Wall Test Harbour' });
    expect(made.status).toBe(201);
    const other = await login(env, 'beta', 'ada@demo.example');
    await other.post('/api/assist/consent', { granted: true });
    const seen: string[] = [];
    script = (req, n) => {
      if (n % 2 === 1) return { content: [{ type: 'tool_use', id: `t${n}`, name: 'list_customers', input: { query: 'Wall Test', limit: 25 } }], stop: 'tool_use', usage: { input: 500, output: 20, cacheRead: 2000, cacheWrite: 0 } };
      seen.push((req.messages.at(-1)!.content as any[])[0].content as string);
      return respondWith({ kind: 'answer', text: 'Here they are.' });
    };
    for (const who of [ada, lena, other]) {
      provider.calls.length = 0;
      const r = await who.post('/api/assist', { question: 'Which customers are called Wall Test?' });
      expect(r.json.reply.fallback ?? r.json.reply.engine).toBe('llm');
      expect(r.json.reply.data.length).toBe(1);
    }
    const visibleTo = async (who: Client) => (await who.get('/api/accounts?limit=5&q=Wall%20Test')).json.accounts.length;
    expect(seen[0]).toContain('Wall Test Harbour');
    expect(seen[1].includes('Wall Test Harbour')).toBe((await visibleTo(lena)) > 0);
    // Another company never sees it, through the assistant or otherwise.
    expect(seen[2]).not.toContain('Wall Test Harbour');
    expect(await visibleTo(other)).toBe(0);
    script = () => respondWith({ kind: 'answer', text: 'From **Settings → People**.', sources: ['S1'] });
  });

  it('counts usage per company; only an administrator sees and changes the settings', async () => {
    const view = await ada.get('/api/assist/settings');
    expect(view.status).toBe(200);
    expect(view.json.usage.questions).toBeGreaterThanOrEqual(3);
    expect(view.json.usage.modelQuestions).toBeGreaterThanOrEqual(2);
    expect(view.json.engine).toMatchObject({ available: true, model: 'claude-sonnet-5-5' });
    expect((await lena.get('/api/assist/settings')).status).toBe(403);
    expect((await lena.put('/api/assist/settings', { enabled: false })).status).toBe(403);
    expect((await ada.put('/api/assist/settings', { retentionDays: 3 })).status).toBe(400);

    const off = await ada.put('/api/assist/settings', { enabled: false, retentionDays: 7 });
    expect(off.json.settings).toMatchObject({ enabled: false, retentionDays: 7 });
    const r = await ada.post('/api/assist', { question: 'How do I import customers from a CSV file?' });
    expect(r.json.reply.fallback).toBe('off');
    expect(r.json.reply.citations[0].section).toBe('Importing');
    await ada.put('/api/assist/settings', { enabled: true });
  });

  it('a new company starts with AI answers off, and the 0240 migration switches existing ones off (the demo stays on)', async () => {
    const { createOrg } = await import('../api/src/lib/orgs');
    const { readFileSync } = await import('node:fs');
    const made = await createOrg(env.db, { slug: 'freshco', name: 'Fresh Co', locale: 'en', admin: { email: 'fresh@demo.example', name: 'Fresh Admin' } });
    const orgId = made.orgId;
    const fresh = await login(env, 'freshco', 'fresh@demo.example');
    expect((await fresh.get('/api/assist/status')).json.available).toBe(false);
    expect((await fresh.get('/api/assist/settings')).json.settings.enabled).toBe(false);
    // The migration over a copy of the state: a stored true (written by an old card) goes off; slug 'demo' is kept.
    const sql = readFileSync(new URL('../db/migrations/0240_assistant_default_off.sql', import.meta.url), 'utf8');
    // Inside one transaction that is rolled back, so the other tests keep their companies as they were.
    let seen: Record<string, string | null> = {};
    await env.db
      .system(async (q) => {
        await q.query(`update orgs set settings = settings || '{"assistant":{"enabled":true}}'::jsonb where id = $1`, [orgId]);
        await q.query(`update orgs set slug = 'demo' where slug = 'beta'`);
        await q.query(sql);
        const rows = await q.query<{ slug: string; on: string | null }>(`select slug, settings->'assistant'->>'enabled' as on from orgs where slug in ('freshco', 'demo', 'acme')`);
        seen = Object.fromEntries(rows.map((r) => [r.slug, r.on]));
        throw new Error('roll back');
      })
      .catch((e: Error) => expect(e.message).toBe('roll back'));
    expect(seen).toEqual({ freshco: 'false', acme: 'false', demo: 'true' });
    expect((await ada.get('/api/assist/settings')).json.settings.enabled).toBe(true);
  });

  it('keeps the questions in the company’s log, readable by the person who asked', async () => {
    const rows = await env.db.system((q) => q.query(`select l.question, u.email from assistant_log l join users u on u.id = l.user_id`));
    expect(rows.some((r) => r.email === 'ada@demo.example' && r.question === 'Which customers are called Wall Test?')).toBe(true);
    const [other] = await env.db.system((q) => q.query(`select id from orgs where slug = 'beta'`));
    const seen = await env.db.tenant({ orgId: other.id, userId: null }, (q) => q.query('select * from assistant_log'));
    expect(seen).toHaveLength(0);
  });
});

describe('the public docs chat', () => {
  const ask = (body: unknown, headers: Record<string, string> = { 'x-curahold-ask': '1' }) =>
    env.app.request(`https://${BASE}/api/assist/public`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

  it('answers from the docs only, and only from a page that says so', async () => {
    expect((await ask({ question: 'How do I invite my team?' }, {})).status).toBe(403);
    const consentId = crypto.randomUUID();
    const said = await env.app.request(`https://${BASE}/api/assist/public/consent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-curahold-ask': '1' }, body: JSON.stringify({ consentId, granted: true, lang: 'en' }) });
    expect(said.status).toBe(200);
    provider.calls.length = 0;
    const r = await ask({ question: 'How do I invite my team?', lang: 'en', consentId });
    expect(r.status).toBe(200);
    const { reply } = (await r.json()) as any;
    expect(reply.kind).toBe('answer');
    expect(reply.citations[0].url).toBe('/docs/en/getting-started/#first-setup');
    // No workspace tools on the public docs.
    expect(provider.calls[0].tools.map((t) => t.name)).toEqual(['search_docs', 'respond']);
  });
});

describe('the desk’s first reply', () => {
  it('drafts an answer from the docs as a note only the desk sees', async () => {
    script = () => respondWith({ kind: 'answer', text: 'You can invite people from **Settings → People**.', sources: ['S1'] });
    const r = await ada.post('/api/help', { category: 'question', subject: 'Inviting my team', description: 'How do I invite my colleagues to Curahold?' });
    expect(r.status).toBe(201);
    await env.settle();
    const notes = await env.db.system((q) => q.query(`select body, internal, staff from help_messages where request_id = $1`, [r.json.request.id]));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ internal: true, staff: 'CuraAI' });
    expect(notes[0].body).toContain('Settings → People');
    expect(notes[0].body).toContain('/docs/en/getting-started/#first-setup');
    // The person who asked sees no message from it.
    const mine = await ada.get(`/api/help/${r.json.request.id}`);
    expect(JSON.stringify(mine.json)).not.toContain('CuraAI');
  });

  it('sends a request’s words to the model only when the person who wrote it accepted the notice', async () => {
    const notes = async (id: string) => env.db.system((q) => q.query(`select 1 from help_messages where request_id = $1 and staff = 'CuraAI'`, [id]));
    const zeynep = await login(env, 'acme', 'zeynep@demo.example');
    const before = provider.calls.length;
    const r = await zeynep.post('/api/help', { category: 'question', subject: 'Inviting my team', description: 'Private words that never saw the notice.' });
    expect(r.status).toBe(201);
    await env.settle();
    expect(provider.calls.length).toBe(before);
    expect(await notes(r.json.request.id)).toHaveLength(0);
    // A "no" is no better than no answer.
    await zeynep.post('/api/assist/consent', { granted: false });
    const no = await zeynep.post('/api/help', { category: 'question', subject: 'Inviting my team', description: 'Still private.' });
    await env.settle();
    expect(provider.calls.length).toBe(before);
    expect(await notes(no.json.request.id)).toHaveLength(0);
    // The operator may make the company's switch the basis instead (ASSISTANT_DESK_FIRST_REPLY_BASIS=company).
    const cfg = env.deps.config.assistant;
    env.deps.config.assistant = { ...(cfg ?? (await import('../api/src/assistant/cost')).assistantConfigFrom({})), deskFirstReplyBasis: 'company' };
    try {
      const yes = await zeynep.post('/api/help', { category: 'question', subject: 'Inviting my team', description: 'The company decides here.' });
      await env.settle();
      expect(await notes(yes.json.request.id)).toHaveLength(1);
    } finally {
      env.deps.config.assistant = cfg;
    }
    // And the settings card says which rule holds.
    expect((await ada.get('/api/assist/settings')).json.deskNeedsConsent).toBe(true);
  });
});
