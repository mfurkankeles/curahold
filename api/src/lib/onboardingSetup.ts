// The onboarding hub's one door to the setup checks ("setup health") and the
// "test your setup" list. Those are their own feature, with their own screens
// and code (shared/src/setupHealth.ts); the hub only needs their ids and
// states, through the small contract in shared/src/onboarding.ts (SetupState).
//
// The default source reads the table that feature keeps (setup_progress) when
// it exists: kind 'daily' / item 'last' (detail.failing = ids failing at the
// last check), kind 'test' (one row per test: pass / fail / skipped, with
// detail.reason) and kind 'done' (every test passed). Until that feature is
// installed the state says `available: false` and those steps wait for a
// person. Tests swap the source for a stub (setSetupSource).
//
// A failed test becomes ONE shared issue on the company's own plan (source
// 'setup_test', source_ref = the test's id): opened when it fails, resolved
// when it passes again, opened again on the same row if it breaks later.
import { NO_SETUP, type SetupState } from '../../../shared/src/onboarding';
import { translate, type Locale, type MessageKey } from '../../../shared/src/i18n';
import type { Q } from '../db';

export interface SetupSource {
  read(q: Q, orgId: string): Promise<SetupState>;
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

export const tableSource: SetupSource = {
  async read(q, orgId) {
    const [t] = await q.query<{ ok: boolean }>(`select to_regclass('public.setup_progress') is not null as ok`);
    if (!t?.ok) return NO_SETUP;
    const rows = await q.query<{ kind: string; item: string; status: string; detail: any; at: unknown }>(
      `select kind, item, status, detail, at from setup_progress where org_id = $1 and kind in ('daily', 'test', 'done')`,
      [orgId],
    );
    const daily = rows.find((r) => r.kind === 'daily' && r.item === 'last');
    return {
      available: true,
      failing: Array.isArray(daily?.detail?.failing) ? daily!.detail.failing.filter((x: unknown) => typeof x === 'string') : [],
      checkedAt: daily ? iso(daily.at) : null,
      tests: rows
        .filter((r) => r.kind === 'test')
        .map((r) => ({
          id: r.item,
          status: (['pass', 'fail', 'skipped'].includes(r.status) ? r.status : 'todo') as 'pass' | 'fail' | 'skipped' | 'todo',
          reason: typeof r.detail?.reason === 'string' ? r.detail.reason : null,
          at: iso(r.at),
        })),
      testsDone: rows.some((r) => r.kind === 'done'),
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
  for (const t of state.tests) {
    if (t.status === 'fail') {
      const title = translate(locale, 'ob.issue.testFailed', { test: testName(locale, t.id) }).slice(0, 200);
      const body = t.reason ? translate(locale, 'ob.issue.testReason', { reason: t.reason }).slice(0, 4000) : '';
      const [row] = await q.query<{ inserted: boolean }>(
        `insert into onboarding_issues (org_id, plan_id, title, body, side, type, urgency, status, source, source_ref)
         values ($1, $2, $3, $4, 'customer', 'bug', 'high', 'open', 'setup_test', $5)
         on conflict (plan_id, source, source_ref) where source_ref is not null
         do update set status = 'open', resolved_at = null, body = excluded.body, updated_at = now(),
                       opened_on = case when onboarding_issues.status = 'resolved' then current_date else onboarding_issues.opened_on end
           where onboarding_issues.status = 'resolved' or onboarding_issues.body <> excluded.body
         returning (xmax = 0) as inserted`,
        [orgId, planId, title, body, t.id],
      );
      if (row?.inserted) opened++;
    } else if (t.status === 'pass' || t.status === 'skipped') {
      await q.query(
        `update onboarding_issues set status = 'resolved', resolved_at = now(), updated_at = now()
          where plan_id = $1 and org_id = $2 and source = 'setup_test' and source_ref = $3 and status <> 'resolved'`,
        [planId, orgId, t.id],
      );
    }
  }
  return opened;
}

/** A test's name in the plan's words (ob.test.<id>); an id this hub does not know is shown as it is. */
export function testName(locale: Locale, id: string): string {
  const key = `ob.test.${id}` as MessageKey;
  const said = translate(locale, key);
  return said === key ? id : said;
}
