// Runs the assistant's evaluation (cases.ts, 333 cases in nine languages)
// through the real core (api/src/assistant/core.ts).
//
//   npx tsx tests/assistant-eval/run.ts                 # no key: free rules + docs search, fixed checks
//   ANTHROPIC_API_KEY=… npx tsx tests/assistant-eval/run.ts   # the model answers, an LLM judge grades
//
// Options (environment): ASSISTANT_MODEL (default claude-sonnet-5-5),
// ASSISTANT_JUDGE_MODEL (default claude-opus-5-5), EVAL_ONLY=<id prefix or
// category>, EVAL_LANGS=en,tr, EVAL_OUT=<file.json> for the full results,
// EVAL_CONCURRENCY (default 4). The workspace the model may read is invented
// (three sample customers); nothing real is sent anywhere.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepare, type AnswerIndex, type DocSection } from '../../shared/src/answers';
import type { AssistReply } from '../../shared/src/assist';
import { emptyTrace, setupHealthTool, type Tool } from '../../shared/src/assistant';
import { answer, settingsOf, type AssistEnv, type AssistStore } from '../../api/src/assistant/core';
import { assistantConfigFrom, costMicros } from '../../api/src/assistant/cost';
import { anthropicProvider, type LlmProvider } from '../../api/src/assistant/provider';
import { allCases, BLOCKED, type EvalCase } from './cases';
import { gradeWithoutModel, judgePrompt, parseJudge, precheckWithModel, type Verdict } from './grade';

import { HELP_LANGUAGES, type HelpLanguage } from '../../shared/src/i18n';

const ROOT = join(import.meta.dirname, '..', '..');

/** The built docs' sections; built into a temporary folder when there is no build. */
function docs(): Record<HelpLanguage, AnswerIndex> {
  let dir = join(ROOT, 'dist', 'web', 'docs');
  if (!existsSync(join(dir, 'en', 'answers.json'))) {
    dir = mkdtempSync(join(tmpdir(), 'curahold-eval-docs-'));
    execFileSync(process.execPath, ['--import', 'tsx', join(ROOT, 'scripts', 'build-docs.ts'), dir], { stdio: 'ignore', cwd: ROOT });
  }
  const read = (l: string) => prepare(JSON.parse(readFileSync(join(dir, l, 'answers.json'), 'utf8')) as DocSection[]);
  return Object.fromEntries(HELP_LANGUAGES.map((l) => [l, read(l)])) as Record<HelpLanguage, AnswerIndex>;
}

/** An invented workspace, read through tools shaped like the app's (shared/src/assistant.ts). */
function workspace(): { tools: Tool[]; trace: ReturnType<typeof emptyTrace> } {
  const trace = emptyTrace();
  const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
  const customers = [
    { name: 'Cedarmoor Health', owner: 'Ada Demir', 'Renewal date': day(24), 'Annual value': 48000, openTasks: 3, overdueTasks: 1 },
    { name: 'Quillfield Labs', owner: 'Ada Demir', 'Renewal date': day(61), 'Annual value': 21500, openTasks: 1, overdueTasks: 0 },
    { name: 'Brookmere Dental', owner: 'Lena Fischer', 'Renewal date': day(140), 'Annual value': 9900, openTasks: 2, overdueTasks: 2 },
  ];
  const seen = (what: string) => !trace.data.includes(what) && trace.data.push(what);
  return {
    trace,
    tools: [
      {
        name: 'list_customers',
        description: 'Lists the customers this person can see, with owner, renewal date, annual value and open/overdue task counts. sort: "renewal" with within_days, "attention", "value" or "name". Returns { total, totalValue, currency, customers }.',
        inputSchema: { type: 'object', properties: { sort: { type: 'string' }, within_days: { type: 'number' }, query: { type: 'string' } } },
        execute(input) {
          seen('customers');
          let list = customers;
          if (input.sort === 'renewal' && Number(input.within_days) > 0) list = list.filter((c) => c['Renewal date'] <= day(Number(input.within_days)));
          return { total: list.length, totalValue: list.reduce((n, c) => n + c['Annual value'], 0), currency: 'USD', customers: list };
        },
      },
      {
        name: 'customer_details',
        description: 'One customer by name: fields, open tasks and latest timeline entries.',
        inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
        execute(input) {
          const c = customers.find((x) => x.name.toLowerCase() === String(input.name).toLowerCase());
          if (!c) throw new Error(`No customer called "${input.name}" that this person can see.`);
          seen(c.name);
          return { ...c, tasks: [{ title: 'Send the renewal proposal', due: day(-2), status: 'In progress' }, { title: 'Quarterly review call', due: day(9), status: 'To do' }], timeline: [{ what: 'note', at: day(-3), title: 'Asked for a discount on seats' }] };
        },
      },
      {
        name: 'list_tasks',
        description: 'Open tasks with a due date. who: "me" or "everyone"; due: "overdue", "today", "week", "month".',
        inputSchema: { type: 'object', properties: { who: { type: 'string' }, due: { type: 'string' } } },
        execute(input) {
          seen('tasks');
          if (input.due === 'overdue') return { total: 1, tasks: [{ title: 'Send the renewal proposal', due: day(-2), priority: 'high', customer: 'Cedarmoor Health', who: ['Ada Demir'] }] };
          return { total: 2, tasks: [{ title: 'Quarterly review call', due: day(9), customer: 'Cedarmoor Health', who: ['Ada Demir'] }, { title: 'Onboarding check-in', due: day(5), customer: 'Quillfield Labs', who: ['Ada Demir'] }] };
        },
      },
      // The setup checks (shared/src/setupHealth.ts), read-only: two failing, one fixed.
      setupHealthTool(
        {
          api: (async () => ({
            failing: 2,
            fixed: 1,
            found: 3,
            checks: [
              { status: 'fail', severity: 'high', area: 'sync', problem: 'A connected tool no longer accepts our sign-in', why: 'Nothing comes in or goes out until it is connected again.', fix: '/settings/sources/c1', fixLabel: 'Connect again' },
              { status: 'fail', severity: 'medium', area: 'import', problem: '3 rows had a date we could not read', why: 'Write dates like 2026-03-31.', fix: '/import', fixLabel: 'Import again' },
              { status: 'ok', severity: 'low', area: 'team', problem: 'Invitations not accepted', why: '', fix: '/settings/people', fixLabel: 'See invitations' },
            ],
          })) as never,
        },
        trace,
      ),
    ],
  };
}

const memory = (): AssistStore => ({ usage: async () => ({ companyMicros: 0, globalMicros: 0 }), record: async () => undefined, cacheGet: async () => null, cachePut: async () => undefined, log: async () => undefined });

async function main() {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  const cfg = { ...assistantConfigFrom({ ...process.env, ANTHROPIC_API_KEY: key }), blockedNames: BLOCKED, globalMonthlyUsd: 1e6, companyMaxUsd: 1e6 };
  const provider: LlmProvider | null = key ? anthropicProvider({ apiKey: key, model: cfg.model }) : null;
  const judgeModel = process.env.ASSISTANT_JUDGE_MODEL?.trim() || 'claude-opus-5-5';
  const judge = key ? anthropicProvider({ apiKey: key, model: judgeModel }) : null;
  const index = docs();
  const only = process.env.EVAL_ONLY;
  const langs = process.env.EVAL_LANGS?.split(',');
  const cases = allCases().filter((c) => (!only || c.id.startsWith(only) || c.category === only) && (!langs || langs.includes(c.lang)));
  const results: { case: EvalCase; reply: AssistReply | null; verdict: Verdict; micros: number }[] = [];
  let judgeMicros = 0;

  const one = async (c: EvalCase) => {
    const live = workspace();
    const env: AssistEnv = {
      config: cfg,
      provider,
      store: memory(),
      docs: async (l) => index[l],
      docsVersion: 'eval',
      surface: 'app',
      locale: c.lang,
      orgId: 'eval',
      settings: { ...settingsOf({}, cfg), retentionDays: 0, monthlyCapUsd: 1e6 },
      who: { name: 'Ada Demir', role: 'admin', company: 'Demo Company', customer: 'Customer', customers: 'Customers', currency: 'USD', today: new Date().toISOString().slice(0, 10) },
      live,
    };
    try {
      const { reply, micros } = await answer(env, { question: c.question });
      let verdict: Verdict;
      if (!provider) verdict = gradeWithoutModel(c, reply);
      else {
        verdict = precheckWithModel(c, reply) ?? { status: 'pass', why: '' };
        if (verdict.status === 'pass' && judge) {
          const j = await judge.complete({ system: [{ text: 'You are a strict evaluator. Reply with JSON only.' }], messages: [{ role: 'user', content: judgePrompt(c, reply) }], tools: [], maxTokens: 200 });
          judgeMicros += costMicros(judge.model, j.usage);
          verdict = parseJudge(j.content.map((b) => (b.type === 'text' ? b.text : '')).join(''));
        }
      }
      results.push({ case: c, reply, verdict, micros });
    } catch (e) {
      results.push({ case: c, reply: null, verdict: { status: 'fail', why: `threw: ${(e as Error).message}` }, micros: 0 });
    }
  };
  const width = provider ? Math.max(1, Number(process.env.EVAL_CONCURRENCY) || 4) : 1;
  for (let i = 0; i < cases.length; i += width) await Promise.all(cases.slice(i, i + width).map(one));

  // Summary: by category and by language.
  const rows = new Map<string, { pass: number; fail: number; skip: number }>();
  const add = (k: string, s: Verdict['status']) => {
    const r = rows.get(k) ?? { pass: 0, fail: 0, skip: 0 };
    r[s]++;
    rows.set(k, r);
  };
  for (const r of results) {
    add(`category ${r.case.category}`, r.verdict.status);
    add(`language ${r.case.lang}`, r.verdict.status);
    add('ALL', r.verdict.status);
  }
  console.log(`\nAssistant evaluation — ${provider ? `model ${cfg.model}, judge ${judgeModel}` : 'no key: free rules + docs search, fixed checks'} — ${results.length} cases\n`);
  for (const [k, v] of [...rows].sort()) console.log(`${k.padEnd(24)} pass ${String(v.pass).padStart(3)}  fail ${String(v.fail).padStart(3)}  skip ${String(v.skip).padStart(3)}`);
  const fails = results.filter((r) => r.verdict.status === 'fail');
  if (fails.length) {
    console.log('\nFailures:');
    for (const f of fails.slice(0, 60)) console.log(`- ${f.case.key}: ${f.verdict.why}`);
  }
  if (provider) {
    const spent = results.reduce((n, r) => n + r.micros, 0);
    console.log(`\nCost: assistant $${(spent / 1e6).toFixed(4)} (${((spent / 1e6 / Math.max(1, results.length)) * 1000).toFixed(2)} per 1,000 questions), judge $${(judgeMicros / 1e6).toFixed(4)}`);
  }
  if (process.env.EVAL_OUT) writeFileSync(process.env.EVAL_OUT, JSON.stringify(results.map((r) => ({ key: r.case.key, category: r.case.category, verdict: r.verdict, reply: r.reply })), null, 2));
  process.exit(fails.length ? 1 : 0);
}

void main();
