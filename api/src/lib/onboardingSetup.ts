// The onboarding hub's one door to the setup checks ("setup health") and the
// "test your setup" list. Those are their own feature, with their own screens
// and code (shared/src/setupHealth.ts); the hub only needs their ids and
// states, through the small contract in shared/src/onboarding.ts (SetupState).
//
// The default source is the setup feature's own summary (setupSummary in
// lib/setupHealth.ts): which checks failed at the last daily run, each test's
// state and reason, and "Setup complete" (written only after both approvals).
// Tests swap the source for a stub (setSetupSource).
//
// A failed test is ONE shared issue on the company's own plan (source
// 'setup_test', source_ref = the test's id). The test list opens it the moment
// a step fails and resolves it when the step passes (openStepIssue /
// closeStepIssue there); the plan only catches up with what happened before it
// existed, through the same two functions, so there is never a second row.
import type { SetupState } from '../../../shared/src/onboarding';
import { translate, type Locale, type MessageKey } from '../../../shared/src/i18n';
import { testStepDef } from '../../../shared/src/setupHealth';
import type { Q } from '../db';
import { closeStepIssue, openStepIssue, setupSummary } from './setupHealth';

export interface SetupSource {
  read(q: Q, orgId: string): Promise<SetupState>;
}

export const tableSource: SetupSource = {
  async read(q, orgId) {
    const sum = await setupSummary(q, orgId);
    return {
      available: true,
      failing: sum.failing.filter((x: unknown) => typeof x === 'string'),
      checkedAt: sum.dailyAt,
      // Only steps somebody has tried: a step not tried yet is no news for the plan.
      tests: sum.tests.filter((t) => t.status !== 'todo').map((t) => ({ id: t.id, status: t.status, reason: t.reason, at: t.at })),
      testsDone: sum.doneAt != null,
    };
  },
};

let source: SetupSource = tableSource;
/** For tests: read the setup state from somewhere else (null puts the table back). */
export function setSetupSource(s: SetupSource | null) {
  source = s ?? tableSource;
}
export const setupState = (q: Q, orgId: string) => source.read(q, orgId);

/**
 * Keeps the plan's shared issues in step with the tests: one row per failed
 * test, resolved when it passes. Returns how many rows it opened.
 */
export async function syncSetupIssues(q: Q, orgId: string, planId: string, state: SetupState, locale: Locale): Promise<number> {
  if (!state.available) return 0;
  let opened = 0;
  const [have] = await q.query<{ refs: string[] }>(
    `select coalesce(array_agg(source_ref) filter (where status <> 'resolved'), '{}') as refs from onboarding_issues where plan_id = $1 and org_id = $2 and source = 'setup_test'`,
    [planId, orgId],
  );
  const open = new Set(have?.refs ?? []);
  for (const t of state.tests) {
    if (t.status === 'fail' && !open.has(t.id)) {
      const title = translate(locale, 'ob.issue.testFailed', { test: testName(locale, t.id) });
      const why = t.reason ? translate(locale, `sh.test.reason.${t.reason}` as MessageKey, { error: '' }) : '';
      const body = t.reason ? translate(locale, 'ob.issue.testReason', { reason: why.startsWith('sh.') ? t.reason : why }) : '';
      await openStepIssue(q, { orgId, userId: null, stepId: t.id, title, body, urgent: testStepDef(t.id)?.required ?? true, planId });
      opened++;
    } else if ((t.status === 'pass' || t.status === 'skipped') && open.has(t.id)) await closeStepIssue(q, orgId, t.id);
  }
  return opened;
}

/** A test's name in the plan's words (ob.test.<id>); an id this hub does not know is shown as it is. */
export function testName(locale: Locale, id: string): string {
  const key = `ob.test.${id}` as MessageKey;
  const said = translate(locale, key);
  return said === key ? id : said;
}
