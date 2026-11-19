// Demo data for setup health and "Test your setup" (shared/src/setupHealth.ts),
// in the live demo only (it rides on the departments' boards):
//   * a CRM connection that no longer accepts its sign-in (fix first);
//   * a Jira connection still waiting for its fields to be matched;
//   * the last customer import, with three dates it could not read;
//   * (the template's rules are off in the demo: "no automations yet");
//   * the test list half done: a colleague's view passed on the second try,
//     a test ticket arrived, and the Jira test failed and became an issue.
// Invented names only (the demo's own); nothing here is sent anywhere.
import type { Q } from '../api/src/db';
import { translate, type Locale, type MessageKey } from '../shared/src/i18n';

export async function seedSetup(q: Q, o: { orgId: string; ids: Record<string, string>; locale: Locale; accounts: Record<string, string> }) {
  const T = (k: string, v?: Record<string, string>) => translate(o.locale, k as MessageKey, v);
  const ago = (days: number, hours = 0) => `now() - interval '${days} days ${hours} hours'`;
  await q.query(
    `insert into connections (org_id, kind, provider, label, status, last_error, config, created_by, created_at)
     values ($1, 'source', 'demo', $2, 'error', '401 unauthorized: the sign-in has expired', '{"sync":{"startedAt":"2026-01-05T09:00:00Z","objects":[{"enabled":true}]}}', $3, ${ago(30)})`,
    [o.orgId, T('sh.demo.crm'), o.ids.ada],
  );
  const [jira] = await q.query<{ id: string }>(
    `insert into connections (org_id, kind, provider, label, status, config, created_by, created_at) values ($1, 'source', 'jira', $2, 'active', '{}', $3, ${ago(3)}) returning id`,
    [o.orgId, T('sh.demo.jira'), o.ids.ada],
  );
  await q.query(
    `insert into import_batches (org_id, file_name, summary, created_by, created_at) values ($1, 'customers.csv', $2, $3, ${ago(2)})`,
    [o.orgId, JSON.stringify({ created: 0, updated: 6, skipped: 0, errors: 3, rows: 9, problems: { name: 0, date: 3, money: 0, other: 0 } }), o.ids.ada],
  );
  const accounts = Object.entries(o.accounts);
  const progress = (kind: string, item: string, status: string, detail: unknown, by: string, at: string) =>
    q.query(`insert into setup_progress (org_id, kind, item, status, detail, by_user, at) values ($1, $2, $3, $4, $5, $6, ${at})`, [o.orgId, kind, item, status, JSON.stringify(detail), o.ids[by]]);
  const tried = (step: string, status: string, how: string, reason: string | null, seen: unknown, by: string, at: string) =>
    q.query(`insert into setup_test_runs (org_id, step, status, how, reason, seen, by_user, at) values ($1, $2, $3, $4, $5, $6, $7, ${at})`, [o.orgId, step, status, how, reason, JSON.stringify(seen), o.ids[by]]);
  // The failures the panel shows were first seen when set up; a fixed one ("1 of 4 fixed").
  for (const id of ['sync.notAuthorised', 'sync.mappingIncomplete', 'import.badDates', 'auto.none', 'team.invitesWaiting']) await progress('seen', id, 'seen', {}, 'ada', ago(2));
  // Through Mert's eyes: wrong the first time (a role saw too much), right after the fix.
  const [m] = await q.query<{ name: string; role: string }>('select u.name, r.name as role from users u join roles r on r.id = u.role_id where u.id = $1', [o.ids.mert]);
  const mert = { userId: o.ids.mert, name: m?.name ?? '', role: m?.role ?? '' };
  await tried('invite', 'fail', 'person', 'person', mert, 'ada', ago(2, 3));
  await tried('invite', 'pass', 'person', null, mert, 'ada', ago(2, 1));
  await progress('test', 'invite', 'pass', { reason: null, seen: mert }, 'ada', ago(2, 1));
  const [, first] = accounts[0] ?? [];
  const firstName = (await q.query<{ name: string }>('select name from accounts where id = $1', [first]))[0]?.name ?? '';
  await tried('ticket', 'pass', 'run', null, { customer: firstName }, 'ada', ago(1, 5));
  await progress('test', 'ticket', 'pass', { reason: null, seen: { customer: firstName } }, 'ada', ago(1, 5));
  const jiraSeen = { connection: jira.id, name: T('sh.demo.jira') };
  await tried('jira', 'fail', 'run', 'mapping', jiraSeen, 'ada', ago(1, 2));
  await progress('test', 'jira', 'fail', { reason: 'mapping', seen: jiraSeen }, 'ada', ago(1, 2));
  await progress('issue', 'jira', 'open', { title: T('sh.issue.title', { step: T('sh.test.jira.title') }), ref: null }, 'ada', ago(1, 1));
}
