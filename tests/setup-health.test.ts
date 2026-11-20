// Setup health and "Test your setup" (shared/src/setupHealth.ts): every check
// ships with its words and its help text in the eleven languages; the checks run
// as the person asking (row security, roles), each with its one-click fix; and
// the test list keeps every try with its evidence, turns a failed step into an
// issue, and closes only through the go-live gate (required steps, then two
// approvals). Nothing here fixes anything for the person.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { asksAboutSetup, CHECKS, SETUP_AREAS, TEST_BUNDLES, TEST_STEPS } from '../shared/src/setupHealth';
import { setupHealthTool, emptyTrace } from '../shared/src/assistant';
import { LOCALES, translate, type MessageKey } from '../shared/src/i18n';
import { CONFIG_CHECKS, dailySetupHealth, SQL_CHECKS, setupSummary } from '../api/src/lib/setupHealth';
import { helpBlock, HELP_PAGE } from '../scripts/docs/setup-health-page';
import { allCases } from './assistant-eval/cases';
import { prepare } from '../shared/src/answers';
import { answer, settingsOf, type AssistEnv } from '../api/src/assistant/core';
import { assistantConfigFrom } from '../api/src/assistant/cost';
import { login, setup, type Env } from './helpers';

const has = (l: (typeof LOCALES)[number], key: string) => translate(l, key as MessageKey) !== key;

describe('the registry', () => {
  it('gives every check a query, a fix screen, and its words in all eleven languages', () => {
    expect(new Set(CHECKS.map((c) => c.id)).size).toBe(CHECKS.length);
    for (const c of CHECKS) {
      expect(!!SQL_CHECKS[c.id] || !!CONFIG_CHECKS[c.id], `${c.id} has no query`).toBe(true);
      expect(c.fix.startsWith('/'), c.id).toBe(true);
      for (const l of LOCALES) for (const part of ['problem', 'why', 'fix']) expect(has(l, `sh.${c.id}.${part}`), `${l} sh.${c.id}.${part}`).toBe(true);
    }
    for (const l of LOCALES) for (const a of SETUP_AREAS) expect(has(l, `sh.area.${a}`), `${l} ${a}`).toBe(true);
  });

  it('gives every test step what it proves, how to do it and its title, and every bundle its words', () => {
    for (const s of TEST_STEPS)
      for (const l of LOCALES) {
        for (const part of ['title', 'how', 'expect']) expect(has(l, `sh.test.${s.id}.${part}`), `${l} ${s.id}.${part}`).toBe(true);
        if (!s.auto && s.id !== 'invite' && s.id !== 'import' && s.id !== 'portal') throw new Error(`${s.id}: a step a person checks needs its look button`);
      }
    for (const b of TEST_BUNDLES) for (const l of LOCALES) expect(has(l, `sh.bundle.${b.id}.title`) && has(l, `sh.bundle.${b.id}.body`), `${l} ${b.id}`).toBe(true);
    expect(TEST_BUNDLES.find((b) => b.id === 'golive')?.steps).toEqual(TEST_STEPS.filter((s) => s.required).map((s) => s.id));
  });

  it('ships every check with its help text: the help page in each language lists it, word for word', () => {
    for (const l of LOCALES) {
      const page = readFileSync(join('docs', 'site', l, HELP_PAGE), 'utf8');
      expect(page.includes(helpBlock(l)), `${l}: run npx tsx scripts/docs/setup-health-page.ts`).toBe(true);
      for (const c of CHECKS) expect(page).toContain(translate(l, `sh.${c.id}.fix` as MessageKey));
    }
  });
});

describe('the assistant', () => {
  it('catches "what is wrong with my setup" in all eleven languages, for free', () => {
    const asked = allCases().filter((c) => c.key.startsWith('live-setup'));
    expect(asked.length).toBeGreaterThanOrEqual(18);
    for (const c of asked) expect(asksAboutSetup(c.question), c.key).toBe(true);
    expect(asksAboutSetup('How do I add a customer?')).toBe(false);
  });

  it('answers it from the checks themselves, with fix buttons and no model, in every language', async () => {
    const cfg = assistantConfigFrom({});
    for (const c of allCases().filter((x) => x.key.startsWith('live-setup-wrong'))) {
      const trace = emptyTrace();
      const tool = setupHealthTool({ api: (async () => ({ failing: 1, fixed: 0, found: 1, checks: [{ status: 'fail', problem: 'P1', why: 'W1', fix: '/import', fixLabel: 'Import again', severity: 'medium', area: 'import' }] })) as never }, trace);
      const env: AssistEnv = {
        config: cfg,
        provider: null,
        store: { usage: async () => ({ companyMicros: 0, globalMicros: 0 }), record: async () => undefined, cacheGet: async () => null, cachePut: async () => undefined, log: async () => undefined },
        docs: async () => prepare([]),
        docsVersion: 't',
        surface: 'app',
        locale: c.lang,
        settings: settingsOf({}, cfg),
        live: { tools: [tool], trace },
      };
      const { reply, micros } = await answer(env, { question: c.question });
      expect(reply.engine, c.key).toBe('rules');
      expect(micros).toBe(0);
      expect(reply.text).toContain('P1');
      expect(reply.fixes).toEqual([{ label: 'Import again', to: '/import' }]);
    }
  });

  it('reads the failing checks through a read-only tool, with the fix screens as buttons', async () => {
    const trace = emptyTrace();
    const calls: string[] = [];
    const tool = setupHealthTool(
      {
        api: (async (path: string) => {
          calls.push(path);
          return { failing: 1, fixed: 2, found: 3, checks: [{ status: 'fail', problem: 'P', why: 'W', fix: '/settings/sources/x', fixLabel: 'Connect again', severity: 'high', area: 'sync' }, { status: 'ok', problem: 'Q', why: '', fix: '/a', fixLabel: 'A', severity: 'low', area: 'team' }] };
        }) as never,
      },
      trace,
    );
    const out = (await tool.execute({ area: 'sync' })) as { failing: number; problems: unknown[] };
    expect(calls).toEqual(['/setup-health?area=sync']);
    expect(out.failing).toBe(1);
    expect(out.problems).toHaveLength(1);
    expect(trace.fixes).toEqual([{ label: 'Connect again', to: '/settings/sources/x' }]);
  });
});

describe('the checks, as the person asking', () => {
  let env: Env;
  beforeAll(async () => {
    env = await setup();
  });

  it('shows an administrator every company check, worst first, with "x of y fixed"', async () => {
    const ada = await login(env, 'acme', 'ada@demo.example');
    const r = await ada.get('/api/setup-health');
    expect(r.status).toBe(200);
    const ids = r.json.checks.map((c: { id: string }) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['team.alone', 'sync.notAuthorised', 'data.customersNoOwner']));
    const sev = r.json.checks.map((c: { severity: string }) => ['high', 'medium', 'low'].indexOf(c.severity));
    expect([...sev].sort((a, b) => a - b)).toEqual(sev);
    expect(r.json.found).toBeGreaterThanOrEqual(r.json.failing);
  });

  it('finds a broken sign-in, links to the exact connection, and counts it fixed once it works', async () => {
    const [conn] = await env.db.system((q) =>
      q.query<{ id: string }>(`insert into connections (org_id, kind, provider, label, status, last_error) values ($1, 'source', 'demo', 'Test CRM', 'error', '401 unauthorized') returning id`, [env.a.orgId]),
    );
    const ada = await login(env, 'acme', 'ada@demo.example');
    // Reading remembers nothing; checking does.
    expect((await ada.get('/api/setup-health?area=sync')).json.found).toBe((await ada.get('/api/setup-health?area=sync')).json.failing);
    let r = await ada.post('/api/setup-health/check?area=sync');
    const bad = r.json.checks.find((c: { id: string }) => c.id === 'sync.notAuthorised');
    expect(bad).toMatchObject({ status: 'fail', severity: 'high', fix: `/settings/sources/${conn.id}` });
    expect(bad.problem.length).toBeGreaterThan(10);
    expect(r.json.checks.every((c: { area: string }) => c.area === 'sync')).toBe(true);
    // Another company never sees it.
    const other = await login(env, 'beta', 'ada@demo.example');
    const theirs = await other.get('/api/setup-health?area=sync');
    expect(theirs.json.checks.find((c: { id: string }) => c.id === 'sync.notAuthorised')?.status).toBe('ok');
    // Fixed by the person (here: by hand), not by the check.
    await env.db.system((q) => q.query(`update connections set status = 'disabled' where id = $1`, [conn.id]));
    r = await ada.post('/api/setup-health/check?area=sync');
    expect(r.json.checks.find((c: { id: string }) => c.id === 'sync.notAuthorised')).toMatchObject({ status: 'ok', fixed: true });
    expect(r.json.fixed).toBeGreaterThanOrEqual(1);
  });

  it('shows others only what their permissions fix', async () => {
    const zeynep = await login(env, 'acme', 'zeynep@demo.example');
    const r = await zeynep.get('/api/setup-health');
    expect(r.status).toBe(200);
    const ids: string[] = r.json.checks.map((c: { id: string }) => c.id);
    expect(ids.some((id) => id.startsWith('team.'))).toBe(false);
    expect(ids.some((id) => id.startsWith('email.') || id.startsWith('assistant.'))).toBe(false);
  });

  it('remembers what failed at the daily check (owner access, reads only)', async () => {
    await dailySetupHealth(env.deps);
    const s = await env.db.system((q) => setupSummary(q, env.a.orgId));
    expect(Array.isArray(s.failing)).toBe(true);
    expect(s.dailyAt).not.toBeNull();
    expect(s.tests.map((t) => t.id)).toEqual(TEST_STEPS.map((t) => t.id));
  });
});

describe('test your setup', () => {
  let env: Env;
  beforeAll(async () => {
    env = await setup();
  });

  it('keeps every try with its evidence, turns a failure into an issue, and closes it on a pass', async () => {
    const ada = await login(env, 'beta', 'ada@demo.example');
    let r = await ada.get('/api/setup-test');
    expect(r.status).toBe(200);
    const ticket = r.json.steps.find((s: { id: string }) => s.id === 'ticket');
    expect(ticket).toMatchObject({ required: true, applies: true, status: 'todo', runs: [] });
    expect(ticket.input.choices.length).toBeGreaterThan(0);

    // The kept input is used on the next try.
    const chosen = ticket.input.choices[1] ?? ticket.input.choices[0];
    r = await ada.post('/api/setup-test/ticket/input', { value: chosen.value });
    expect(r.json.steps.find((s: { id: string }) => s.id === 'ticket').input.value).toBe(chosen.value);
    r = await ada.post('/api/setup-test/ticket/run');
    let t = r.json.steps.find((s: { id: string }) => s.id === 'ticket');
    expect(t.status).toBe('pass');
    expect(t.runs[0]).toMatchObject({ status: 'pass', how: 'run', seen: { customer: chosen.label } });

    // A person's verdict: it did not work → an issue; re-tested → it passes, the issue closes, both tries stay.
    r = await ada.post('/api/setup-test/invite/mark', { status: 'fail' });
    expect((await ada.post('/api/setup-test/invite/issue')).status).toBe(200);
    r = await ada.get('/api/setup-test');
    expect(r.json.steps.find((s: { id: string }) => s.id === 'invite').issue).toMatchObject({ status: 'open', ref: null });
    r = await ada.post('/api/setup-test/invite/mark', { status: 'pass' });
    t = r.json.steps.find((s: { id: string }) => s.id === 'invite');
    expect(t.issue.status).toBe('resolved');
    expect(t.runs.map((x: { status: string }) => x.status)).toEqual(['pass', 'fail']);
    // An issue only comes from a failed step.
    expect((await ada.post('/api/setup-test/invite/issue')).status).toBe(400);
  });

  it('never lets a required step be left out', async () => {
    const ada = await login(env, 'beta', 'ada@demo.example');
    expect((await ada.post('/api/setup-test/ticket/mark', { status: 'skipped' })).status).toBe(400);
  });

  it('closes through the gate: the required steps, then the company, then Curahold', async () => {
    const ada = await login(env, 'beta', 'ada@demo.example');
    let r = await ada.get('/api/setup-test');
    for (const s of r.json.steps.filter((x: { required: boolean; status: string }) => x.required && x.status !== 'pass'))
      r = s.auto ? await ada.post(`/api/setup-test/${s.id}/run`) : await ada.post(`/api/setup-test/${s.id}/mark`, { status: 'pass' });
    expect(r.json.gate.requiredPassed).toBe(r.json.gate.required);
    expect(r.json.doneAt).toBeNull();
    r = await ada.post('/api/setup-test/approve', { side: 'customer', approve: true });
    expect(r.json.gate.approvals.customer).not.toBeNull();
    expect(r.json.doneAt).toBeNull();
    r = await ada.post('/api/setup-test/approve', { side: 'vendor', approve: true });
    expect(r.json.doneAt).not.toBeNull();
    const s = await env.db.system((q) => setupSummary(q, env.b.orgId));
    expect(s.doneAt).not.toBeNull();
    expect(s.approvals.customer && s.approvals.vendor).toBeTruthy();
  });

  it('takes the approvals back when a required step stops passing before it is complete', async () => {
    const ada = await login(env, 'acme', 'ada@demo.example');
    let r = await ada.get('/api/setup-test');
    expect((await ada.post('/api/setup-test/approve', { side: 'customer', approve: true })).status).toBe(400);
    for (const s of r.json.steps.filter((x: { required: boolean }) => x.required)) r = s.auto ? await ada.post(`/api/setup-test/${s.id}/run`) : await ada.post(`/api/setup-test/${s.id}/mark`, { status: 'pass' });
    r = await ada.post('/api/setup-test/approve', { side: 'customer', approve: true });
    expect(r.json.gate.approvals.customer).not.toBeNull();
    r = await ada.post('/api/setup-test/invite/mark', { status: 'fail' });
    expect(r.json.gate.approvals.customer).toBeNull();
  });

  it('lets only the right people act', async () => {
    const sofia = await login(env, 'acme', 'sofia@demo.example');
    expect((await sofia.post('/api/setup-test/ticket/run')).status).toBe(403);
    expect((await sofia.post('/api/setup-test/approve', { side: 'customer', approve: true })).status).toBe(403);
    const zeynep = await login(env, 'acme', 'zeynep@demo.example');
    expect((await zeynep.post('/api/setup-test/approve', { side: 'vendor', approve: true })).status).toBe(403);
  });
});
