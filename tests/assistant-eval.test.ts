// The evaluation set itself (tests/assistant-eval): big enough, in all nine
// languages, every kind of question, the owner's own case — and the part that
// needs no model (the free rules) passes here on every run. The full run,
// with the docs search or with a model and a judge, is tests/assistant-eval/run.ts.
import { describe, expect, it } from 'vitest';
import { prepare } from '../shared/src/answers';
import { LOCALES } from '../shared/src/i18n';
import { answer, settingsOf, type AssistEnv } from '../api/src/assistant/core';
import { assistantConfigFrom } from '../api/src/assistant/cost';
import { allCases, BASE, BLOCKED } from './assistant-eval/cases';
import { gradeWithoutModel, judgePrompt, parseJudge } from './assistant-eval/grade';

const cases = allCases();

describe('the evaluation set', () => {
  it('has at least 300 cases, every base case in all nine languages, every category', () => {
    expect(cases.length).toBeGreaterThanOrEqual(300);
    for (const b of BASE) expect(Object.keys(b.q).sort(), b.id).toEqual([...LOCALES].sort());
    expect(new Set(BASE.map((b) => b.category))).toEqual(new Set(['how_to', 'ambiguous', 'multi_step', 'live_data', 'off_topic', 'competitor', 'abusive', 'injection', 'out_of_docs']));
    expect(new Set(cases.map((c) => c.key)).size).toBe(cases.length);
  });

  it("holds the owner's screenshot question, word for word", () => {
    expect(cases.find((c) => c.key === 'amb-people-dashboard.tr')?.question).toBe('ben kişileri dashboard a nasıl eklerim?');
  });

  it('names no real product: the other products are invented and given as blocked names', () => {
    expect(BLOCKED).toEqual(['Brightdesk', 'Taskmoon']);
  });
});

describe('the free rules, without a model, in nine languages', () => {
  const cfg = { ...assistantConfigFrom({}), blockedNames: BLOCKED };
  const ruled = cases.filter((c) => c.rule || c.category === 'competitor' || c.category === 'injection');
  it.each(ruled.map((c) => [c.key, c] as const))('%s', async (_key, c) => {
    const env: AssistEnv = {
      config: cfg,
      provider: null,
      store: { usage: async () => ({ companyMicros: 0, globalMicros: 0 }), record: async () => undefined, cacheGet: async () => null, cachePut: async () => undefined, log: async () => undefined },
      docs: async () => prepare([]),
      docsVersion: 't',
      surface: 'app',
      locale: c.lang,
      settings: settingsOf({}, cfg),
    };
    const { reply } = await answer(env, { question: c.question });
    const v = gradeWithoutModel(c, reply);
    expect(v.status, v.why).toBe('pass');
  });
});

describe('the judge', () => {
  it('is told the rules, the case and the reply, and its verdict is read back', () => {
    const c = cases.find((x) => x.key === 'comp-named.ja');
    if (!c) throw new Error('missing case');
    const p = judgePrompt(c, { kind: 'decline', text: '…', citations: [], data: [], opened: null, proposal: null, lang: 'ja', engine: 'rules' });
    expect(p).toContain('never discuss or compare other products');
    expect(p).toContain(c.question);
    expect(parseJudge('{"pass": true, "score": 5, "reason": "declined"}')).toEqual({ status: 'pass', why: '5/5 declined' });
    expect(parseJudge('nonsense').status).toBe('fail');
  });
});
