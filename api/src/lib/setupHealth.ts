// The setup checks' queries (the registry is shared/src/setupHealth.ts).
//
// Every company check is one scalar sub-query returning {n, ref}: how many
// things it found and one of them to open. All of them go to the database as
// ONE statement, inside the asker's own transaction, so row security decides
// what each person's count covers and the whole panel costs one round trip.
// Every statement names org_id itself as well, so the same SQL is safe for
// the daily run (owner access, one company at a time).
//
// The install's own checks (mail, the assistant's key) read the server's
// configuration, not the database: only the install's owner sees them.
import { ACCOUNTING_ALL } from '../../../shared/src/accounting';
import { translate, type Locale, type MessageKey } from '../../../shared/src/i18n';
import { bySeverity, canSeeCheck, CHECKS, TEST_BUNDLES, TEST_STEPS, type SetupCheckDef, type SetupCheckResult, type SetupHealth } from '../../../shared/src/setupHealth';
import type { Deps } from '../context';
import type { Q } from '../db';
import { localDate } from '../../../shared/src/days';
import { assistantConfig, providerOf } from '../routes/assist';

/** Providers that only read mail or events: they have no object mapping to finish. */
const NO_MAPPING = ['gmail', 'outlook', 'gcal', 'outlookcal', 'segment', 'whatsapp'];
/** An error that means the other tool no longer accepts our sign-in. */
const AUTH_ERROR = `(401|403|unauthori|forbidden|expired|invalid_grant|invalid token|token|sign.?in|re-?connect|yetki|oturum)`;

const count = (from: string, ref = 'null') => `(select jsonb_build_object('n', count(*), 'ref', ${ref}) ${from})`;
const flag = (cond: string, ref = 'null') => `(select jsonb_build_object('n', case when ${cond} then 1 else 0 end, 'ref', ${ref}))`;
const lastImport = (expr: string) =>
  `(select jsonb_build_object('n', coalesce(${expr}, 0)) from (select summary from import_batches where org_id = $1 and kind = 'accounts' and undone_at is null and created_at > now() - interval '30 days' order by created_at desc limit 1) b)`;
const sources = (accounting: boolean) => `c.org_id = $1 and c.kind = 'source' and c.status <> 'disabled' and ${accounting ? '' : 'not '}(c.provider = any($2::text[]))`;
const lastRun = `(select r.status from sync_runs r where r.org_id = $1 and r.connection_id = c.id order by r.started_at desc limit 1)`;
const portalOn = `coalesce((select (settings->'portal'->>'enabled')::boolean from orgs where id = $1), false)`;
/** A key of an account field the company no longer has. */
const noField = (expr: string) => `(${expr} is not null and ${expr} <> 'owner' and not exists (select 1 from orgs o, jsonb_array_elements(o.account_fields) f where o.id = $1 and f->>'key' = ${expr}))`;
const noBoard = (expr: string) => `(nullif(${expr}, '') is not null and not exists (select 1 from boards b where b.org_id = $1 and b.id::text = ${expr} and b.archived_at is null))`;

/** Company checks: id → a scalar sub-query; $1 the company, $2 the accounting providers. */
export const SQL_CHECKS: Record<string, string> = {
  'team.alone': flag(`(select count(*) from users where org_id = $1 and status in ('active', 'invited')) <= 1`),
  'team.invitesWaiting': count(`from users where org_id = $1 and status = 'invited' and created_at < now() - interval '7 days'`),
  'team.emptyRoles': count(`from roles r where r.org_id = $1 and not r.system and not exists (select 1 from users u where u.org_id = $1 and u.role_id = r.id and u.status in ('active', 'invited'))`, 'min(r.name)'),
  'dept.empty': flag(`not exists (select 1 from department_members m join departments d on d.id = m.department_id where m.org_id = $1 and d.org_id = $1 and d.enabled)`),
  'dept.noLead': count(
    `from departments d where d.org_id = $1 and d.enabled
       and exists (select 1 from department_members m where m.org_id = $1 and m.department_id = d.id)
       and not exists (select 1 from department_members m where m.org_id = $1 and m.department_id = d.id and m.role = 'lead')`,
    'min(d.key)',
  ),
  // The latest customer import (kept 30 days, not undone): what its rows said (routes/accounts.ts, summary.problems).
  'import.failedRows': lastImport(`case when b.summary ? 'problems' then (b.summary->'problems'->>'other')::int else (b.summary->>'errors')::int end`),
  'import.missingName': lastImport(`(b.summary->'problems'->>'name')::int`),
  'import.badDates': lastImport(`(b.summary->'problems'->>'date')::int`),
  'import.badMoney': lastImport(`(b.summary->'problems'->>'money')::int`),
  'import.duplicates': count(`from (select min(name) as name from accounts where org_id = $1 and archived_at is null group by name_fold having count(*) > 1) d`, 'min(d.name)'),
  'sync.notAuthorised': count(`from connections c where ${sources(false)} and c.status = 'error' and c.last_error ~* '${AUTH_ERROR}'`, 'min(c.id::text)'),
  'sync.lastRunFailed': count(`from connections c where ${sources(false)} and not (c.status = 'error' and c.last_error ~* '${AUTH_ERROR}') and ${lastRun} = 'error'`, 'min(c.id::text)'),
  'sync.mappingIncomplete': count(
    `from connections c where ${sources(false)} and not (c.provider = any(array[${NO_MAPPING.map((p) => `'${p}'`).join(', ')}]))
       and (c.config->'sync'->>'startedAt' is null
            or not exists (select 1 from jsonb_array_elements(coalesce(c.config->'sync'->'objects', '[]'::jsonb)) o where coalesce((o->>'enabled')::boolean, false)))`,
    'min(c.id::text)',
  ),
  // An incoming webhook whose deliveries of the last day were all refused or not used: a wrong secret, a changed payload.
  'sync.hooksFailing': count(
    `from inbound_hooks h where h.org_id = $1 and h.enabled
       and exists (select 1 from inbound_deliveries d where d.org_id = $1 and d.hook_id = h.id and d.status in ('failed', 'rejected') and not d.test and d.received_at > now() - interval '24 hours')
       and not exists (select 1 from inbound_deliveries d where d.org_id = $1 and d.hook_id = h.id and d.status = 'ok' and d.received_at > now() - interval '24 hours')`,
    'min(h.id::text)',
  ),
  // WhatsApp connected a day ago and nothing ever arrived: the callback is not set up in the Meta app yet.
  'sync.whatsappSilent': count(
    `from connections c where c.org_id = $1 and c.kind = 'source' and c.provider = 'whatsapp' and c.status <> 'disabled'
       and c.created_at < now() - interval '24 hours' and c.state->>'lastInboundAt' is null`,
    'min(c.id::text)',
  ),
  'sync.stuckChanges': count(`from sync_changes s where s.org_id = $1 and s.last_error is not null and s.attempts >= 3`, 'min(s.connection_id::text)'),
  'sync.conflicts': count(`from task_events e where e.org_id = $1 and e.kind = 'sync_conflict' and e.created_at > now() - interval '7 days'`),
  'sync.keyExpiring': count(`from api_tokens k where k.org_id = $1 and k.kind = 'key' and k.revoked_at is null and k.expires_at between now() and now() + interval '14 days'`),
  'finance.failing': count(`from connections c where ${sources(true)} and (c.status = 'error' or ${lastRun} = 'error')`, 'min(c.id::text)'),
  'finance.stale': count(
    `from connections c where ${sources(true)} and c.provider <> 'finfile' and c.status = 'active' and c.config->'sync'->>'startedAt' is not null
       and coalesce(c.last_ok_at, c.created_at) < now() - interval '48 hours'`,
    'min(c.id::text)',
  ),
  'bi.stale': count(`from api_tokens k where k.org_id = $1 and k.kind = 'analytics' and k.revoked_at is null and (k.expires_at is null or k.expires_at > now()) and coalesce(k.last_used_at, k.created_at) < now() - interval '7 days'`),
  'bi.keyExpiring': count(`from api_tokens k where k.org_id = $1 and k.kind = 'analytics' and k.revoked_at is null and k.expires_at between now() and now() + interval '14 days'`),
  'portal.noChannel': flag(`${portalOn} and not exists (select 1 from boards b where b.org_id = $1 and b.archived_at is null and coalesce((b.portal->>'enabled')::boolean, false))`),
  'portal.nobodyInvited': flag(`${portalOn} and not exists (select 1 from portal_users p where p.org_id = $1)`),
  'portal.unbranded': flag(`${portalOn} and exists (select 1 from orgs o where o.id = $1 and o.settings->'portal'->'brand'->>'color' is null and o.settings->'logo' is null)`),
  'auto.none': flag(`not exists (select 1 from automations a where a.org_id = $1 and a.enabled)`),
  'auto.deletedField': count(
    `from automations a where a.org_id = $1 and a.enabled and (
        (a.trigger->>'type' = 'account_date' and ${noField(`a.trigger->>'field'`)})
        or (a.action->>'type' = 'set_field' and a.action->>'target' = 'account' and ${noField(`a.action->>'field'`)})
        or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(a.trigger->'conditions') = 'array' then a.trigger->'conditions' else '[]'::jsonb end) k where ${noField(`k->>'field'`)}))`,
    'min(a.name)',
  ),
  'auto.deletedBoard': count(`from automations a where a.org_id = $1 and a.enabled and (${noBoard(`a.trigger->>'boardId'`)} or (a.action->>'type' = 'create_tasks' and ${noBoard(`a.action->>'boardId'`)}))`, 'min(a.name)'),
  'data.customersNoOwner': count(`from accounts a where a.org_id = $1 and a.archived_at is null and a.owner_id is null`, 'min(a.id::text)'),
  'data.dealsNoStage': count(
    `from records r join record_types t on t.id = r.type_id where r.org_id = $1 and t.org_id = $1 and t.kind = 'opportunity' and r.archived_at is null
       and coalesce(r.fields->>'stage', '') = '' and coalesce(r.fields->>'status', 'open') not in ('won', 'lost')`,
  ),
  'data.ticketsNoOwner': count(
    `from records r join record_types t on t.id = r.type_id where r.org_id = $1 and t.org_id = $1 and t.kind = 'ticket' and r.archived_at is null
       and r.owner_id is null and coalesce(r.fields->>'status', 'open') not in ('solved', 'closed')`,
  ),
  'privacy.noOwner': flag(`not exists (select 1 from users u join roles r on r.id = u.role_id where u.org_id = $1 and r.org_id = $1 and u.status = 'active' and 'privacy.manage' = any(r.perms))`),
  'billing.trialEnding': flag(`exists (select 1 from orgs o where o.id = $1 and o.plan = 'trial' and o.trial_ends_at is not null and o.trial_ends_at < now() + interval '14 days')`, `(select to_char(trial_ends_at, 'YYYY-MM-DD') from orgs where id = $1)`),
  'billing.seatsFull': flag(
    `exists (select 1 from orgs o where o.id = $1 and o.trial_seat_cap is not null
       and (select count(*) from users u where u.org_id = $1 and u.seat = 'full' and u.status in ('active', 'invited')) >= o.trial_seat_cap)`,
  ),
};

/** Checks that only apply somewhere: billing ones where billing is on. Not applying = passing. */
function applies(id: string, deps: Deps): boolean {
  if (id.startsWith('billing.trial')) return !!deps.config.billing;
  return true;
}

/** The install's own checks: what the server's configuration says. Where mail only shows on screen (dev, demo), mail is not a problem. */
export const CONFIG_CHECKS: Record<string, (deps: Deps) => { n: number; ref?: string | null } | null> = {
  'email.notSetUp': (deps) => (deps.config.devExposeTokens ? null : { n: deps.email.delivers === false ? 1 : 0 }),
  'email.domainRecords': (deps) => (deps.config.devExposeTokens ? null : { n: 1 }),
  'assistant.noKey': (deps) => {
    const cfg = assistantConfig(deps);
    return cfg.provider === 'off' ? null : { n: providerOf(deps) ? 0 : 1 };
  },
};

export interface Asker {
  perms: readonly string[];
  admin: boolean;
  owner: boolean;
}

/** The checks one person sees (administrators: every company check; the owner: the install's too). */
export function visibleChecks(who: Asker): SetupCheckDef[] {
  return CHECKS.filter((d) => canSeeCheck(d, who));
}

/** Runs the SQL checks in one statement: id → {n, ref}. */
export async function runSqlChecks(q: Q, orgId: string, ids: string[]): Promise<Record<string, { n: number; ref: string | null }>> {
  const list = ids.filter((id) => SQL_CHECKS[id]);
  if (!list.length) return {};
  const sql = `select ${list.map((id, i) => `${SQL_CHECKS[id]} as c${i}`).join(',\n')}`;
  // $2 (the accounting providers) only when a chosen check reads it: Postgres refuses a parameter nobody uses.
  const [row] = await q.query(sql, sql.includes('$2') ? [orgId, ACCOUNTING_ALL as readonly string[]] : [orgId]);
  const out: Record<string, { n: number; ref: string | null }> = {};
  list.forEach((id, i) => {
    const v = (row?.[`c${i}`] ?? {}) as { n?: number; ref?: string | null };
    out[id] = { n: Number(v.n ?? 0), ref: v.ref ?? null };
  });
  return out;
}

const fill = (path: string, ref: string | null) =>
  ref ? path.replace('{ref}', encodeURIComponent(ref)) : path.replace(/\/\{ref\}$/, '').replace(/\?q=\{ref\}$/, '').replace('{ref}', '');

/**
 * The whole panel for one person: their checks, each with its words and fix,
 * remembered findings ("2 of 5 fixed") and what is new since the daily check.
 */
export async function setupHealthFor(
  q: Q,
  deps: Deps,
  opts: { orgId: string; userId: string | null; who: Asker; locale: Locale; terms?: Parameters<typeof translate>[3]; areas?: string[] | null; canWrite: boolean },
): Promise<SetupHealth> {
  const defs = visibleChecks(opts.who).filter((d) => !opts.areas?.length || opts.areas.includes(d.area));
  const sql = await runSqlChecks(
    q,
    opts.orgId,
    defs.filter((d) => applies(d.id, deps)).map((d) => d.id),
  );
  const memory = await q.query<{ kind: string; item: string; status: string; detail: any; at: Date; by_name: string | null }>(
    `select p.kind, p.item, p.status, p.detail, p.at, u.name as by_name from setup_progress p left join users u on u.id = p.by_user and u.org_id = $1
      where p.org_id = $1 and p.kind in ('seen', 'ack', 'daily')`,
    [opts.orgId],
  );
  const seen = new Set(memory.filter((m) => m.kind === 'seen').map((m) => m.item));
  const ack = new Map(memory.filter((m) => m.kind === 'ack' && m.status === 'pass').map((m) => [m.item, m]));
  const daily = memory.find((m) => m.kind === 'daily');
  const dailyFailing = new Set<string>(Array.isArray(daily?.detail?.failing) ? daily!.detail.failing : []);
  const say = (key: string, vars: Record<string, string | number>) => translate(opts.locale, key as MessageKey, vars, opts.terms);

  const checks: SetupCheckResult[] = [];
  for (const d of defs) {
    let found: { n: number; ref?: string | null } | null = { n: 0, ref: null };
    if (!applies(d.id, deps)) found = null;
    else if (SQL_CHECKS[d.id]) found = sql[d.id];
    else if (CONFIG_CHECKS[d.id]) found = CONFIG_CHECKS[d.id](deps);
    if (found === null) continue; // does not apply here
    const confirmed = d.manual ? (ack.get(d.id) ?? null) : null;
    const failing = d.manual ? !confirmed : found.n > 0;
    const ref = found.ref ?? null;
    const vars = { n: found.n, ref: ref ?? '' };
    checks.push({
      id: d.id,
      area: d.area,
      severity: d.severity,
      status: failing ? 'fail' : 'ok',
      count: found.n,
      fix: fill(d.fix, d.fix.includes('{ref}') ? ref : null),
      manual: !!d.manual,
      confirmed: confirmed ? { at: new Date(confirmed.at).toISOString(), by: confirmed.by_name } : null,
      fixed: !failing && seen.has(d.id),
      isNew: failing && !!daily && !dailyFailing.has(d.id),
      problem: say(`sh.${d.id}.problem`, vars),
      why: say(`sh.${d.id}.why`, vars),
      fixLabel: say(`sh.${d.id}.fix`, vars),
    });
  }
  // Remember what was found, so a later visit can say how much of it is fixed.
  const newly = checks.filter((c) => c.status === 'fail' && !seen.has(c.id)).map((c) => c.id);
  if (newly.length && opts.canWrite) {
    await q.query(
      `insert into setup_progress (org_id, kind, item, status, by_user) select $1, 'seen', id, 'seen', $3 from unnest($2::text[]) as id on conflict (org_id, kind, item) do nothing`,
      [opts.orgId, newly, opts.userId],
    );
    newly.forEach((id) => seen.add(id));
  }
  const sorted = bySeverity(checks);
  const failing = sorted.filter((c) => c.status === 'fail').length;
  const found = sorted.filter((c) => c.status === 'fail' || seen.has(c.id)).length;
  return {
    checks: sorted,
    failing,
    found,
    fixed: found - failing,
    checkedAt: new Date().toISOString(),
    dailyAt: daily ? new Date(daily.at).toISOString() : null,
  };
}

/**
 * Once a day (lib/scheduler.ts): every company's checks with owner access, the
 * failing ones kept, so the panel can mark what broke since and count what is
 * fixed. Writes only the checks' own memory.
 */
export async function dailySetupHealth(deps: Deps): Promise<number> {
  const orgs = await deps.db.system((q) => q.query<{ id: string }>('select id from orgs'));
  const ids = Object.keys(SQL_CHECKS).filter((id) => applies(id, deps));
  let n = 0;
  for (const org of orgs) {
    await deps.db.system(async (q) => {
      const found = await runSqlChecks(q, org.id, ids);
      const failing = ids.filter((id) => found[id]?.n > 0);
      if (failing.length)
        await q.query(`insert into setup_progress (org_id, kind, item, status) select $1, 'seen', id, 'seen' from unnest($2::text[]) as id on conflict (org_id, kind, item) do nothing`, [org.id, failing]);
      await q.query(
        `insert into setup_progress (org_id, kind, item, status, detail, at) values ($1, 'daily', 'last', 'ok', $2, now())
         on conflict (org_id, kind, item) do update set detail = excluded.detail, at = excluded.at`,
        [org.id, JSON.stringify({ failing })],
      );
    });
    n++;
  }
  return n;
}

// ------------------------------------------------------------------ the onboarding plan's issues, one row per step

/** Today in the company's own time zone (a reopened issue is dated by it). */
async function companyDay(q: Q, orgId: string): Promise<string> {
  const [o] = await q.query<{ timezone: string | null }>('select timezone from orgs where id = $1', [orgId]);
  return localDate(new Date(), o?.timezone || 'UTC');
}

/**
 * A failed test step's issue. Two records of the same thing: the setup list's
 * own (setup_progress kind 'issue', detail.ref = the plan's row) and the ONE row
 * the company's own onboarding plan lists (onboarding_issues, source
 * 'setup_test', source_ref = the step's id) — not a second card. Breaking again
 * later opens the same row again. The plan's row is written inside a savepoint,
 * so that a refused write (row security) or no plan yet leaves the step's own
 * record standing; the plan picks the step up when it is made (lib/onboardingSetup.ts).
 * Returns the plan row's id, or null.
 */
export async function openStepIssue(
  q: Q,
  o: { orgId: string; userId: string | null; stepId: string; title: string; body: string; urgent: boolean; planId?: string },
): Promise<string | null> {
  let ref: string | null = null;
  await q.query('savepoint setup_issue');
  try {
    const [row] = await q.query<{ id: string }>(
      `insert into onboarding_issues (org_id, plan_id, title, body, side, type, urgency, status, source, source_ref, created_by)
       select $1, p.id, $2, $3, 'customer', 'bug', $4, 'open', 'setup_test', $5, $6 from onboarding_plans p
        where p.org_id = $1 and p.kind = 'self' and p.status in ('draft', 'active', 'paused') and ($7::uuid is null or p.id = $7::uuid)
        order by p.created_at desc limit 1
       on conflict (plan_id, source, source_ref) where source_ref is not null
       do update set status = 'open', resolved_at = null,
                     body = case when onboarding_issues.status = 'resolved' then excluded.body else onboarding_issues.body end,
                     opened_on = case when onboarding_issues.status = 'resolved' then $8::date else onboarding_issues.opened_on end,
                     updated_at = case when onboarding_issues.status = 'resolved' then now() else onboarding_issues.updated_at end
       returning id`,
      [o.orgId, o.title.slice(0, 200), o.body.slice(0, 4000), o.urgent ? 'high' : 'normal', o.stepId, o.userId, o.planId ?? null, await companyDay(q, o.orgId)],
    );
    ref = row?.id ?? null;
    await q.query('release savepoint setup_issue');
  } catch {
    await q.query('rollback to savepoint setup_issue');
  }
  await q.query(
    `insert into setup_progress (org_id, kind, item, status, detail, by_user) values ($1, 'issue', $2, 'open', $3, $4)
     on conflict (org_id, kind, item) do update set status = 'open', detail = excluded.detail, by_user = coalesce(excluded.by_user, setup_progress.by_user),
       at = case when setup_progress.status = 'open' then setup_progress.at else now() end`,
    [o.orgId, o.stepId, JSON.stringify({ title: o.title.slice(0, 200), ref }), o.userId],
  );
  return ref;
}

/** The step passes again (or is left out): its issue is resolved, in the list and in the plan (the test is the truth). */
export async function closeStepIssue(q: Q, orgId: string, stepId: string): Promise<void> {
  await q.query(`update setup_progress set status = 'resolved', at = now() where org_id = $1 and kind = 'issue' and item = $2 and status = 'open'`, [orgId, stepId]);
  await q.query('savepoint setup_issue');
  try {
    await q.query(
      `update onboarding_issues set status = 'resolved', resolved_at = now(), updated_at = now()
        where org_id = $1 and source = 'setup_test' and source_ref = $2 and status <> 'resolved'`,
      [orgId, stepId],
    );
    await q.query('release savepoint setup_issue');
  } catch {
    await q.query('rollback to savepoint setup_issue');
  }
}

// ------------------------------------------------------------------ the interface other features read

/**
 * What another feature (the onboarding hub, a report) needs from the setup
 * checks without a person's permissions: which checks failed at the last
 * daily run, each test step's state with its issue, and "Setup complete".
 * One cheap read of the company's own memory; runs nothing. Works with
 * owner access or under row security alike (it filters on org_id itself).
 */
export interface SetupSummary {
  /** Check ids failing at the last daily run (empty: all green), and when that was. */
  failing: string[];
  dailyAt: string | null;
  tests: { id: string; status: 'todo' | 'pass' | 'fail' | 'skipped'; required: boolean; reason: string | null; at: string | null; issue: { status: 'open' | 'resolved'; ref: string | null } | null }[];
  approvals: { customer: string | null; vendor: string | null };
  doneAt: string | null;
}

/** The company's setup health in short: each check's latest status, for the setup page and the owner (ADR 0013). */
export async function setupSummary(q: Q, orgId: string): Promise<SetupSummary> {
  const rows = await q.query<{ kind: string; item: string; status: string; detail: any; at: Date }>(
    `select kind, item, status, detail, at from setup_progress where org_id = $1 and kind in ('daily', 'test', 'issue', 'approve', 'done')`,
    [orgId],
  );
  const one = (kind: string, item: string) => rows.find((r) => r.kind === kind && r.item === item);
  const daily = one('daily', 'last');
  const at = (r: { at: Date } | undefined) => (r ? new Date(r.at).toISOString() : null);
  return {
    failing: Array.isArray(daily?.detail?.failing) ? daily!.detail.failing : [],
    dailyAt: at(daily),
    tests: TEST_STEPS.map((s) => {
      const issue = one('issue', s.id);
      const test = one('test', s.id);
      return {
        id: s.id,
        status: ((test?.status as SetupSummary['tests'][number]['status'] | undefined) ?? 'todo'),
        required: s.required,
        reason: typeof test?.detail?.reason === 'string' ? test.detail.reason : null,
        at: at(test),
        issue: issue ? { status: issue.status === 'open' ? 'open' : 'resolved', ref: (issue.detail?.ref as string | undefined) ?? null } : null,
      };
    }),
    approvals: { customer: at(one('approve', 'customer')), vendor: at(one('approve', 'vendor')) },
    doneAt: at(one('done', 'all')),
  };
}

/** The registry, for a feature that lists the checks and steps (shared/src/setupHealth.ts has the types). */
export const listSetupChecks = () => ({ checks: CHECKS, steps: TEST_STEPS, bundles: TEST_BUNDLES });
