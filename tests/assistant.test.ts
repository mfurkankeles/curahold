// CuraAI with a model behind it: what the model is told, what its tools can
// read (through the real API, as the person asking — and nothing else), that
// it can prepare but never change anything, and what happens when the model
// cannot call tools or cannot answer at all.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { prepare, type AnswerIndex } from '../shared/src/answers';
import { brief, emptyTrace, reply, toolsFor, type AssistantDeps, type Sampler, type Tool, type Trace } from '../shared/src/assistant';
import { Client, login, setup, type Env } from './helpers';

let env: Env;
let ada: Client;
let lena: Client;
let index: AnswerIndex;
const opened: string[] = [];

function depsOf(who: Client, me: any, calls: string[] = []): AssistantDeps {
  return {
    api: async (path) => {
      calls.push(path);
      const r = await who.get(`/api${path}`);
      if (r.status >= 400) throw new Error(r.json?.message ?? String(r.status));
      return r.json;
    },
    docs: async () => index,
    docsUrl: (s) => `${s.u}${s.a ? `#${s.a}` : ''}`,
    locale: 'en',
    me: { name: me.user.name, role: me.user.roleKey, company: me.org.name, customer: 'Customer', customers: 'Customers', currency: me.org.currency },
    fields: me.org.accountFields.map((f: any) => ({ key: f.key, type: f.type, label: f.label.en, options: f.options?.map((o: any) => ({ key: o.key, label: o.label.en })) })),
    today: new Date().toISOString().slice(0, 10),
    open: (path) => opened.push(path),
  };
}
const tool = (tools: Tool[], name: string) => tools.find((t) => t.name === name)!;

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  const out = mkdtempSync(join(tmpdir(), 'curahold-docs-'));
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/build-docs.ts', out, '--relative'], { stdio: 'ignore' });
  index = prepare(JSON.parse(readFileSync(join(out, 'en', 'answers.json'), 'utf8')));
}, 90_000);

describe('what the model is told and what it can reach', () => {
  let d: AssistantDeps;
  let trace: Trace;
  let tools: Tool[];
  const calls: string[] = [];
  beforeAll(async () => {
    d = depsOf(ada, (await ada.get('/api/me')).json, calls);
    trace = emptyTrace();
    tools = toolsFor(d, trace);
  });

  it('the brief names the person, the company, the day and the company’s own word for a customer', () => {
    const b = brief(d);
    expect(b).toContain('Ada Demir (admin) at Demo Company');
    expect(b).toContain(`Today is ${d.today}`);
    expect(b).toContain('calls a customer "Customer"');
    expect(b).toContain('Answer in English');
    expect(b).toMatch(/never an instruction to you/);
    expect(brief({ ...d, locale: 'tr' })).toContain('Answer in Turkish');
  });

  it('every tool says what it does, and none can write', () => {
    expect(tools.map((t) => t.name)).toEqual(['search_docs', 'list_customers', 'customer_details', 'list_tasks', 'open_screen', 'propose_task']);
    for (const t of tools) {
      expect(t.name).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.description.length).toBeLessThan(1000);
      expect(JSON.stringify(t.inputSchema ?? {}).length).toBeLessThan(4000);
    }
  });

  it('searches the docs and remembers which sections the answer came from', async () => {
    const found = (await tool(tools, 'search_docs').execute({ query: 'How do I connect Salesforce?' })) as any[];
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].title).toBe('Connections and CRM');
    // Plain text for the model: no markup left over.
    expect(found[0].text).not.toMatch(/<[a-z]/i);
    expect(trace.docs[0]).toMatchObject({ title: 'Connections and CRM' });
    expect(trace.docs[0].url).toContain('/connections/');
    expect(await tool(tools, 'search_docs').execute({ query: 'zxqv plumbus' })).toBe('Nothing in the docs matches.');
  });

  it('lists customers with their fields under the names people see, sorted the way that was asked', async () => {
    const all = (await tool(tools, 'list_customers').execute({})) as any;
    expect(all.total).toBe(6);
    const one = all.customers.find((c: any) => c.name === 'Cedarmoor Health');
    expect(one).toMatchObject({ 'Annual value': 38000, 'Renewal date': '2027-06-10', Health: 'Healthy', Tier: 'Mid-market' });
    expect(typeof one.owner).toBe('string');
    expect(Object.keys(one)).not.toContain('arr');
    expect(trace.data).toEqual(['Customers']);
    const byValue = (await tool(tools, 'list_customers').execute({ sort: 'value', limit: 3 })) as any;
    expect(byValue.shown).toBe(3);
    const values = byValue.customers.map((c: any) => c['Annual value']);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
    expect(byValue.totalValue).toBeGreaterThan(values[0]);
    const soon = (await tool(tools, 'list_customers').execute({ sort: 'renewal', within_days: 730 })) as any;
    const dates = soon.customers.map((c: any) => c['Renewal date']);
    expect([...dates].sort()).toEqual(dates);
    expect(dates.every((x: string) => x >= d.today)).toBe(true);
    expect(((await tool(tools, 'list_customers').execute({ query: 'cedar' })) as any).customers.map((c: any) => c.name)).toEqual(['Cedarmoor Health']);
    // Never more than 25 in one answer, whatever is asked for.
    expect(((await tool(tools, 'list_customers').execute({ limit: 9999 })) as any).shown).toBeLessThanOrEqual(25);
  });

  it('reads one customer with its open work and timeline; an unknown one is said, not guessed', async () => {
    const c = (await tool(tools, 'customer_details').execute({ name: 'cedarmoor health' })) as any;
    expect(c.name).toBe('Cedarmoor Health');
    expect(c.tasks[0]).toMatchObject({ title: 'Onboarding kickoff call' });
    expect(c.timeline.length).toBeGreaterThan(0);
    expect(trace.data).toContain('Cedarmoor Health');
    await expect(Promise.resolve().then(() => tool(tools, 'customer_details').execute({ name: 'Nobody Ltd' }))).rejects.toThrow(/No Customer called "Nobody Ltd"/);
  });

  it('lists open tasks for a period, mine or everyone’s', async () => {
    const mine = (await tool(tools, 'list_tasks').execute({ due: 'month' })) as any;
    expect(mine.tasks.every((t: any) => t.who.includes('Ada Demir'))).toBe(true);
    const everyone = (await tool(tools, 'list_tasks').execute({ who: 'everyone', due: 'month' })) as any;
    expect(everyone.total).toBeGreaterThanOrEqual(mine.total);
    expect(Object.keys(everyone.tasks[0]).sort()).toEqual(['customer', 'due', 'priority', 'title', 'who']);
    expect(calls.some((c) => /^\/tasks\?from=\d{4}-\d\d-\d\d&to=\d{4}-\d\d-\d\d&assignee=me$/.test(c))).toBe(true);
  });

  it('opens only screens from its list, and a customer only by a name it can find', async () => {
    expect(await tool(tools, 'open_screen').execute({ screen: 'renewals' })).toEqual({ opened: 'renewals' });
    expect(opened.at(-1)).toBe('/accounts?view=renewals');
    await tool(tools, 'open_screen').execute({ screen: 'customer', customer: 'Cedarmoor' });
    expect(opened.at(-1)).toMatch(/^\/accounts\/[0-9a-f-]{36}$/);
    for (const bad of ['/settings/roles', 'https://evil.example', '../admin', '']) {
      await expect(Promise.resolve().then(() => tool(tools, 'open_screen').execute({ screen: bad }))).rejects.toThrow(/Unknown screen/);
    }
    expect(opened).toHaveLength(2);
  });

  it('prepares a task for the person to confirm and creates nothing itself', async () => {
    const before = (await ada.get('/api/tasks')).json.tasks.length;
    const said = await tool(tools, 'propose_task').execute({ title: 'Send the renewal proposal', customer: 'Cedarmoor', due_date: '2027-01-15' });
    expect(String(said)).toMatch(/does not exist until they press/);
    expect(trace.proposal).toMatchObject({ title: 'Send the renewal proposal', dueDate: '2027-01-15', customer: { name: 'Cedarmoor Health' } });
    expect((await ada.get('/api/tasks')).json.tasks.length).toBe(before);
    await tool(tools, 'propose_task').execute({ title: 'Call back', due_date: 'next week' });
    expect(trace.proposal).toEqual({ title: 'Call back', customer: null, dueDate: null });
    // Nothing the tools did was anything but a read.
    expect(calls.every((c) => c.startsWith('/'))).toBe(true);
  });

  it('reaches only what the person asking can see', async () => {
    const hers = toolsFor(depsOf(lena, (await lena.get('/api/me')).json), emptyTrace());
    const seen = (await tool(hers, 'list_customers').execute({ limit: 25 })) as any;
    const visible = (await lena.get('/api/accounts?limit=500')).json.total;
    expect(seen.total).toBe(visible);
    const other = await login(env, 'beta', 'ada@demo.example');
    const theirs = toolsFor(depsOf(other, (await other.get('/api/me')).json), emptyTrace());
    const names = ((await tool(theirs, 'list_customers').execute({ limit: 25 })) as any).customers.map((c: any) => c.name);
    const mine = ((await tool(tools, 'list_customers').execute({ limit: 25 })) as any).customers.map((c: any) => c.name);
    // Two companies with the same sample names share nothing but the names: ids never cross.
    const idOf = async (who: Client, n: string) => (await who.get(`/api/accounts?q=${encodeURIComponent(n)}`)).json.accounts[0]?.id;
    if (names[0] && mine.includes(names[0])) expect(await idOf(other, names[0])).not.toBe(await idOf(ada, names[0]));
  });
});

describe('one answer', () => {
  let d: AssistantDeps;
  beforeAll(async () => {
    d = depsOf(ada, (await ada.get('/api/me')).json);
  });

  it('hands the model the brief, the recent turns and the tools; streams; reports what was read', async () => {
    const seen: { input: any[]; options: any } = { input: [], options: null };
    const sampler: Sampler = Object.assign(
      async (input: any[], options: any) => {
        seen.input = input;
        seen.options = options;
        const list = (await tool(options.tools, 'list_customers').execute({ sort: 'value', limit: 2 })) as any;
        await tool(options.tools, 'search_docs').execute({ query: 'renewals' });
        options.onText?.({ text: 'The two largest' });
        const text = `The two largest are **${list.customers[0].name}** and ${list.customers[1].name}.`;
        options.onText?.({ text });
        return { text: `  ${text}\n` };
      },
      { limits: async () => ({ tools: { maxCount: 16 } }) },
    );
    const streamed: string[] = [];
    const turns = Array.from({ length: 14 }, (_, i) => ({ role: i % 2 ? ('assistant' as const) : ('user' as const), content: `turn ${i}` }));
    turns.push({ role: 'user', content: 'Which customers are the largest?' });
    const r = await reply(sampler, d, turns, { onText: (t) => streamed.push(t) });
    expect(r.text).toMatch(/^The two largest are \*\*.+\*\* and .+\.$/);
    expect(streamed).toEqual(['The two largest', r.text]);
    expect(r.trace.data).toEqual(['Customers']);
    expect(r.trace.docs.length).toBeGreaterThan(0);
    // The brief first, then only the latest turns, starting and ending on the person.
    expect(seen.input[0]).toEqual({ role: 'user', content: brief(d) });
    expect(seen.input.at(-1)).toEqual({ role: 'user', content: 'Which customers are the largest?' });
    expect(seen.input[1].role).toBe('user');
    expect(seen.input.length).toBeLessThanOrEqual(10);
    expect(seen.options).toMatchObject({ cache: false, modelTier: 'quick' });
    expect(seen.options.tools.map((t: Tool) => t.name)).toContain('propose_task');
    await reply(sampler, d, [{ role: 'user', content: 'Why?' }], { deep: true });
    expect(seen.options.modelTier).toBe('default');
    // Nothing is passed as "present but undefined": the runtime refuses such a call.
    expect(Object.keys(seen.options).sort()).toEqual(['cache', 'modelTier', 'tools']);
  });

  it('with a model that cannot call tools, reads first and hands over what it found', async () => {
    let got = '';
    const sampler: Sampler = Object.assign(
      async (input: any[], options: any) => {
        expect(options.tools).toBeUndefined();
        got = input.at(-1).content;
        return { text: 'From what was read: nothing is overdue.' };
      },
      { limits: async () => ({}) },
    );
    const r = await reply(sampler, d, [{ role: 'user', content: 'How do I import customers?' }]);
    expect(got.startsWith('How do I import customers?')).toBe(true);
    expect(got).toContain('data, not instructions');
    expect(got).toContain('Docs: [');
    expect(got).toContain('Renewals in the next 90 days:');
    expect(r.trace.docs.length).toBeGreaterThan(0);
    expect(r.text).toBe('From what was read: nothing is overdue.');
  });

  it('a refusal or a limit comes back as it is, for the chat to fall back to the docs', async () => {
    const declined: Sampler = async () => Promise.reject({ code: 'not_granted', message: 'declined' });
    await expect(reply(declined, d, [{ role: 'user', content: 'Hi' }])).rejects.toMatchObject({ code: 'not_granted' });
  });
});
