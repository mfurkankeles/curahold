// Demo data for onboarding plans (db/migrations/0200_onboarding.sql), after the
// flow between departments (scripts/seed-flow.ts) in the live demo:
//   * the demo company's own getting-started plan with Curahold, about 60%
//     done three weeks in, with one stuck issue and one failed setup test (a
//     shared issue row), and a data table with one failing row;
//   * Cedarmoor Health's draft plan, opened by its won deal's hand-over card;
//   * Quillfield Retail's plan running behind, waiting on the customer;
//   * Velto Mobility rolling out over three sites.
// Invented names only (the demo's own).
import type { Q } from '../api/src/db';
import { advancePlan, createPlan, ensureSelfPlan, judgeFields } from '../api/src/lib/onboarding';
import { openStepIssue } from '../api/src/lib/setupHealth';
import { translate, type Locale, type MessageKey } from '../shared/src/i18n';
import { builtInTemplate } from '../shared/src/onboarding';

const shiftSql = `update onboarding_steps set start_on = start_on - $2::int, due_on = due_on - $2::int where plan_id = $1`;

/**
 * Seeds the demo's onboarding plans: the company's own plan three weeks in, and customer plans at different stages.
 */
export async function seedOnboarding(q: Q, o: { orgId: string; ids: Record<string, string>; locale: Locale; accounts: Record<string, string> }) {
  const T = (k: string, v?: Record<string, string | number>) => translate(o.locale, k as MessageKey, v);
  const [quill, , , velto] = Object.values(o.accounts);
  const today = new Date().toISOString().slice(0, 10);
  const done = (planId: string, keys: string[], daysAgo: number, how: 'manual' | 'auto' = 'manual') =>
    q.query(
      `update onboarding_steps set status = 'done', done_how = $3, done_by = $4, done_at = now() - make_interval(days => $5), updated_at = now() - make_interval(days => $5)
        where plan_id = $1 and key = any($2::text[])`,
      [planId, keys, how, how === 'manual' ? o.ids.ada : null, daysAgo],
    );

  // ---- the company's own plan: three weeks in.
  const self = await ensureSelfPlan(q, o.orgId, o.ids.ada, today);
  await q.query(`update onboarding_plans set started_on = started_on - 21, target_on = target_on - 21 where id = $1`, [self]);
  await q.query(shiftSql, [self, 21]);
  await advancePlan(q, o.orgId, self);
  await done(self, ['kickoff'], 19);
  await done(self, ['import', 'portal', 'sync', 'syncRun'], 9, 'auto');
  await q.query(`update onboarding_steps set status = 'doing', updated_at = now() - interval '4 days' where plan_id = $1 and key = 'ticket'`, [self]);
  await q.query(`insert into onboarding_people (org_id, plan_id, side, user_id, name, role, duty, position) values ($1, $2, 'customer', $3, $4, 'integration', $5, 2), ($1, $2, 'customer', $6, $7, 'sponsor', '', 3)`, [
    o.orgId, self, o.ids.zeynep, (await q.query('select name from users where id = $1', [o.ids.zeynep]))[0]?.name ?? 'Zeynep', T('ob.demo.dutyData'), o.ids.mert, (await q.query('select name from users where id = $1', [o.ids.mert]))[0]?.name ?? 'Mert',
  ]);
  await q.query(`update onboarding_steps set person_id = (select id from onboarding_people where plan_id = $1 and role = 'integration' limit 1) where plan_id = $1 and key in ('import', 'sync', 'test')`, [self]);
  // One stuck issue (open nine days, Curahold's move) and the failed CRM test as its one shared row.
  await q.query(
    `insert into onboarding_issues (org_id, plan_id, title, body, side, type, urgency, opened_on, created_by) values ($1, $2, $3, $4, 'vendor', 'data', 'high', current_date - 9, $5)`,
    [o.orgId, self, T('ob.demo.issueStuck'), T('ob.demo.issueStuckBody'), o.ids.zeynep],
  );
  // Through the setup feature's own door, so the test list and the plan show the same row (lib/setupHealth.ts).
  await q.query(
    `insert into setup_progress (org_id, kind, item, status, detail) values ($1, 'test', 'crm', 'fail', $2) on conflict (org_id, kind, item) do update set status = 'fail', detail = excluded.detail`,
    [o.orgId, JSON.stringify({ reason: 'sync_error', seen: {} })],
  );
  const crm = await openStepIssue(q, { orgId: o.orgId, userId: null, stepId: 'crm', title: T('ob.issue.testFailed', { test: T('ob.test.crm') }), body: T('ob.issue.testReason', { reason: T('ob.demo.testReason') }), urgent: true, planId: self });
  if (crm) await q.query(`update onboarding_issues set opened_on = current_date - 2 where id = $1`, [crm]);
  // The data table: what the import brought, one row failing its format rule.
  for (const [i, [name, type, required, example, received]] of (
    [
      [T('ob.demo.fieldRenewal'), 'date', true, '2027-03-31', '31/03/2027'],
      [T('ob.demo.fieldOwner'), 'email', true, 'owner@demo.example', 'zeynep@demo.example'],
      [T('ob.demo.fieldValue'), 'money', false, '12 400 EUR', '18 000 EUR'],
    ] as const
  ).entries()) {
    await q.query(
      `insert into onboarding_fields (org_id, plan_id, source, name, type, required, example, received, received_at, checked_at, checked_by, position)
       values ($1, $2, 'import', $3, $4, $5, $6, $7, now() - interval '3 days', case when $8 then now() else null end, $9, $10) on conflict do nothing`,
      [o.orgId, self, name, type, required, example, received, i > 0, i > 0 ? 'Zeynep' : null, i],
    );
  }
  await judgeFields(q, o.orgId, self);
  await q.query(`update onboarding_metrics set baseline = case title_key when 'manual' then 11 else 20 end, current = case title_key when 'manual' then 6 else 55 end, target = case title_key when 'manual' then 3 else 90 end where plan_id = $1`, [self]);

  // ---- Quillfield Retail: behind, the customer's turn for a week.
  if (quill) {
    const name = (await q.query('select name from accounts where id = $1', [quill]))[0]?.name ?? '';
    const id = await createPlan(q, {
      orgId: o.orgId, actorId: o.ids.zeynep, kind: 'client', accountId: quill, name: T('ob.plan.nameFor', { account: name }),
      blueprint: builtInTemplate('standard')!.blueprint, department: 'success', ownerId: o.ids.zeynep, welcome: T('ob.plan.welcome', { account: name }), startOn: today, locale: o.locale,
    });
    await q.query(`update onboarding_plans set started_on = started_on - 16, target_on = target_on - 16 where id = $1`, [id]);
    await q.query(shiftSql, [id, 16]);
    await done(id, ['handover', 'owner', 'stakeholders', 'kickoff', 'goals', 'portalInvite'], 12);
    await q.query(`update onboarding_steps set updated_at = now() - interval '8 days' where plan_id = $1 and key = 'portalActive'`, [id]);
    await q.query(`insert into onboarding_issues (org_id, plan_id, title, side, type, urgency, opened_on) values ($1, $2, $3, 'customer', 'access', 'normal', current_date - 6)`, [o.orgId, id, T('ob.demo.issueAccess')]);
  }
  // ---- Velto Mobility: a rollout over three sites.
  if (velto) {
    const name = (await q.query('select name from accounts where id = $1', [velto]))[0]?.name ?? '';
    const id = await createPlan(q, {
      orgId: o.orgId, actorId: o.ids.mert, kind: 'client', accountId: velto, name: T('ob.plan.nameFor', { account: name }),
      blueprint: builtInTemplate('multisite')!.blueprint, department: 'success', ownerId: o.ids.mert, welcome: T('ob.plan.welcome', { account: name }), startOn: today, locale: o.locale,
    });
    await q.query(`update onboarding_plans set started_on = started_on - 30, target_on = target_on - 30 where id = $1`, [id]);
    await q.query(shiftSql, [id, 30]);
    await done(id, ['handover', 'owner', 'stakeholders', 'kickoff', 'goals', 'portalInvite', 'portalActive', 'mapping', 'training'], 10);
    const sites = await q.query<{ id: string }>('select id from onboarding_sites where plan_id = $1 order by position', [id]);
    const stages = [{ kickoff: 'done', setup: 'done', data: 'done', test: 'done', golive: 'doing' }, { kickoff: 'done', setup: 'done', data: 'doing' }, { kickoff: 'done' }];
    for (const [i, s] of sites.entries()) await q.query('update onboarding_sites set stages = $2 where id = $1', [s.id, JSON.stringify(stages[i] ?? {})]);
  }
}
