// Setup health and "Test your setup" (shared/src/setupHealth.ts).
//
//   GET  /setup-health                the checks this person can fix (?area=import,sync for one screen's warnings); reads only
//   POST /setup-health/check          the same, run now, and what failed is remembered ("2 of 5 fixed")
//   POST /setup-health/:id/confirm    a check that cannot be read from here: "I did this" (or take it back)
//   GET  /setup-test                  the steps to try after setting up, with every try kept and the go-live gate
//   POST /setup-test/:id/run          run one step that the server can run (a test ticket, a test sync, a dry run)
//   POST /setup-test/:id/mark         the person's own verdict: passed, failed, left out, or not yet
//   POST /setup-test/:id/input        what the step is tried with (a customer, a connection, a colleague), kept
//   POST /setup-test/:id/issue        turn a failed step into an issue (the onboarding plan lists it too)
//   POST /setup-test/approve          the go-live approvals: the company's side, then Curahold's
//   POST /setup-test/reset            start the list again (administrators)
//
// Everything reads as the person asking (row security), and nothing here
// fixes anything: the fix is always a link the person clicks. A test step
// does what its button says (a test ticket, a sync run) and nothing more.
import { Hono } from 'hono';
import { z } from 'zod';
import { ACCOUNTING_ALL, ACCOUNTING_FILE } from '../../../shared/src/accounting';
import { translate, type MessageKey } from '../../../shared/src/i18n';
import { checkDef, canSeeCheck, gateOpen, TEST_BUNDLES, TEST_STEPS, testStepDef, type Approval, type SetupTest, type TestIssue, type TestRun, type TestStatus, type TestStepDef, type TestStepResult } from '../../../shared/src/setupHealth';
import { isOwner, nowOf, portalUrl, run, todayOf, type AppEnv, type C } from '../context';
import type { Q } from '../db';
import { audit } from '../lib/audit';
import { fail } from '../lib/errors';
import { localDate, preview, splitTrigger } from '../lib/automations';
import { closeStepIssue, openStepIssue, runSqlChecks, setupHealthFor, type Asker } from '../lib/setupHealth';
import { body } from '../lib/validate';
import { syncConnection } from '../sync/engine';
import { createRecordType } from './records';
import { ticketInput, upsertTicket } from './tickets';

export const setupHealthRoutes = new Hono<AppEnv>();

const SYNC_BUDGET_MS = 20_000;

function askerOf(c: C): Asker {
  const auth = c.get('auth');
  return { perms: auth.perms, admin: auth.roleKey === 'admin', owner: isOwner(c) };
}
/** A check's or a step's id (not a uuid): known ids only. */
const idParam = (c: C) => {
  const v = c.req.param('id') ?? '';
  if (!/^[a-z][a-zA-Z0-9_.-]{1,60}$/.test(v)) fail('not_found');
  return v;
};
const writer = (c: C) => c.get('auth').seat === 'full' && !c.get('tokenKind');
const may = (c: C, step: TestStepDef) => {
  const who = askerOf(c);
  return who.admin || step.fixer.some((p) => who.perms.includes(p));
};

// ------------------------------------------------------------------ the checks

/** One person's checks; `remember` keeps what failed, so a later visit can say how much of it is fixed. */
const healthOf = (c: C, remember: boolean) => {
  const org = c.get('org');
  const auth = c.get('auth');
  const areas = (c.req.query('area') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 13);
  return run(c, (q) =>
    setupHealthFor(q, c.get('deps'), { orgId: org.id, userId: auth.userId, who: askerOf(c), locale: c.get('locale'), terms: org.terms, areas, canWrite: remember && writer(c) }),
  );
};

// Reading changes nothing (the menu's number and each screen's warnings read this).
setupHealthRoutes.get('/setup-health', async (c) => c.json(await healthOf(c, false)));

// "Check again" (and opening the panel): the same checks, and what failed is remembered.
setupHealthRoutes.post('/setup-health/check', async (c) => {
  if (!writer(c)) fail('read_only_seat');
  return c.json(await healthOf(c, true));
});

setupHealthRoutes.post('/setup-health/:id/confirm', async (c) => {
  const id = idParam(c);
  const def = checkDef(id);
  if (!def || !def.manual) fail('not_found');
  if (!canSeeCheck(def!, askerOf(c)) || !writer(c)) fail('forbidden');
  const input = await body(c, z.object({ done: z.boolean() }));
  const org = c.get('org');
  const auth = c.get('auth');
  await run(c, async (q) => {
    if (input.done)
      await q.query(
        `insert into setup_progress (org_id, kind, item, status, by_user) values ($1, 'ack', $2, 'pass', $3)
         on conflict (org_id, kind, item) do update set status = 'pass', by_user = excluded.by_user, at = now()`,
        [org.id, id, auth.userId],
      );
    else await q.query(`delete from setup_progress where org_id = $1 and kind = 'ack' and item = $2`, [org.id, id]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: input.done ? 'setup.check_confirmed' : 'setup.check_unconfirmed', entity: 'org', entityId: org.id, meta: { check: id } });
  });
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ test your setup

/** How many tries of each step are shown (all are kept). */
const RUNS_SHOWN = 5;

const syncKind = (provider: string): 'jira' | 'accounting' | 'crm' | 'other' =>
  provider === 'jira' ? 'jira' : (ACCOUNTING_ALL as readonly string[]).includes(provider) ? 'accounting' : ['gmail', 'outlook', 'segment'].includes(provider) ? 'other' : 'crm';

type Conn = { id: string; provider: string; label: string; status: string; started: string | null };

/** What the screen needs before anything is run: the last import, the people, customers and connections to try with, the portal. */
async function contextOf(c: C, q: Q) {
  const org = c.get('org');
  const auth = c.get('auth');
  const [imp] = await q.query(
    `select file_name, summary, created_at from import_batches where org_id = $1 and kind = 'accounts' and undone_at is null order by created_at desc limit 1`,
    [org.id],
  );
  const people = await q.query<{ id: string; name: string; role: string }>(
    `select u.id, u.name, r.name as role from users u join roles r on r.id = u.role_id
      where u.org_id = $1 and r.org_id = $1 and u.id <> $2 and u.status in ('active', 'invited') and r.key <> 'admin'
      order by u.created_at desc limit 50`,
    [org.id, auth.userId],
  );
  const customers = await q.query<{ id: string; name: string }>(`select id, name from accounts where org_id = $1 and archived_at is null order by name_fold limit 50`, [org.id]);
  const conns = await q.query<Conn>(
    `select id, provider, label, status, config->'sync'->>'startedAt' as started from connections
      where org_id = $1 and kind = 'source' and status <> 'disabled' and provider <> $2 order by (status = 'active') desc, created_at desc`,
    [org.id, ACCOUNTING_FILE],
  );
  const depts = await q.query<{ key: string; enabled: boolean }>('select key, enabled from departments where org_id = $1', [org.id]);
  return {
    import: imp
      ? {
          file: (imp.file_name as string | null) ?? null,
          rows: Number(imp.summary?.rows ?? 0) || null,
          created: Number(imp.summary?.created ?? 0),
          updated: Number(imp.summary?.updated ?? 0),
          skipped: Number(imp.summary?.skipped ?? 0),
          errors: Number(imp.summary?.errors ?? 0),
        }
      : null,
    people,
    customers,
    conns: (kind: 'crm' | 'jira' | 'accounting') => conns.filter((x) => syncKind(x.provider) === kind),
    portal: { on: !!(org.settings as any)?.portal?.enabled, url: portalUrl(c.get('deps').config, org.slug) },
    /** No department rows (a company from before departments): every group applies. */
    enabled: depts.length ? new Set(depts.filter((d) => d.enabled).map((d) => d.key)) : null,
  };
}
type Ctx = Awaited<ReturnType<typeof contextOf>>;

/** The steps of this company (its departments), and whether each can be tried here. */
function stepsOf(ctx: Ctx) {
  return TEST_STEPS.filter((s) => s.group === 'company' || !ctx.enabled || ctx.enabled.has(s.group)).map((s) => {
    const applies =
      s.id === 'import' ? !!ctx.import : s.id === 'portal' ? ctx.portal.on : s.id === 'crm' || s.id === 'jira' || s.id === 'accounting' ? ctx.conns(s.id).length > 0 : true;
    return { def: s, applies, required: s.required && applies };
  });
}

type Saved = { kind: string; item: string; status: string; detail: any; at: Date; by_name: string | null };
const approvalOf = (row: Saved | undefined): Approval | null => (row ? { at: new Date(row.at).toISOString(), by: row.by_name } : null);

/** May give the approval of this side: the company's administrator, or Curahold's side (the platform owner, or support staff signed in with edit access). */
function mayApprove(c: C, side: 'customer' | 'vendor'): boolean {
  if (!writer(c)) return false;
  const support = c.get('supportBy');
  if (side === 'vendor') return isOwner(c) || support?.level === 'edit';
  return !support && (askerOf(c).admin || c.get('auth').perms.includes('org.manage'));
}

async function testFor(c: C, q: Q): Promise<SetupTest> {
  const org = c.get('org');
  const who = askerOf(c);
  const ctx = await contextOf(c, q);
  const saved = await q.query<Saved>(
    `select p.kind, p.item, p.status, p.detail, p.at, u.name as by_name from setup_progress p left join users u on u.id = p.by_user and u.org_id = $1
      where p.org_id = $1 and p.kind in ('test', 'input', 'issue', 'approve', 'done')`,
    [org.id],
  );
  const runRows = await q.query<{ id: string; step: string; status: TestRun['status']; how: TestRun['how']; reason: string | null; seen: any; note: string | null; at: Date; by_name: string | null }>(
    `select x.* from (select r.id, r.step, r.status, r.how, r.reason, r.seen, r.note, r.at, u.name as by_name,
            row_number() over (partition by r.step order by r.at desc) as n
       from setup_test_runs r left join users u on u.id = r.by_user and u.org_id = $1 where r.org_id = $1) x
      where x.n <= $2 order by x.at desc`,
    [org.id, RUNS_SHOWN],
  );
  const find = (kind: string, item: string) => saved.find((r) => r.kind === kind && r.item === item);
  const all = stepsOf(ctx);
  const steps: TestStepResult[] = all
    .filter(({ def }) => who.admin || who.owner || may(c, def))
    .map(({ def: s, applies, required }) => {
      const row = find('test', s.id);
      const issueRow = find('issue', s.id);
      const kept = (find('input', s.id)?.detail?.value as string | undefined) ?? null;
      const live: Record<string, string | number | boolean | null> =
        s.id === 'import' && ctx.import
          ? { file: ctx.import.file, rows: ctx.import.rows, created: ctx.import.created, updated: ctx.import.updated, skipped: ctx.import.skipped, errors: ctx.import.errors }
          : s.id === 'invite'
            ? (() => {
                const p = ctx.people.find((x) => x.id === kept) ?? ctx.people[0];
                return p ? { userId: p.id, name: p.name, role: p.role } : ({} as Seen);
              })()
            : s.id === 'portal'
              ? { on: ctx.portal.on, url: ctx.portal.url }
              : {};
      const choices =
        s.input === 'account'
          ? ctx.customers.map((x) => ({ value: x.id, label: x.name }))
          : s.input === 'user'
            ? ctx.people.map((x) => ({ value: x.id, label: `${x.name} · ${x.role}` }))
            : s.input === 'connection'
              ? ctx.conns(s.id as 'crm' | 'jira' | 'accounting').map((x) => ({ value: x.id, label: x.label }))
              : [];
      const issue: TestIssue | null = issueRow
        ? { status: issueRow.status === 'open' ? 'open' : 'resolved', title: String(issueRow.detail?.title ?? ''), at: new Date(issueRow.at).toISOString(), by: issueRow.by_name, ref: (issueRow.detail?.ref as string | undefined) ?? null }
        : null;
      return {
        id: s.id,
        group: s.group,
        auto: s.auto,
        required,
        applies,
        minutes: s.minutes,
        status: (row?.status as TestStatus) ?? 'todo',
        reason: (row?.detail?.reason as string) ?? null,
        detail: { ...(row?.detail?.seen ?? {}), ...live },
        at: row ? new Date(row.at).toISOString() : null,
        by: row?.by_name ?? null,
        fix: s.fix,
        runs: runRows
          .filter((r) => r.step === s.id)
          .map((r) => ({ id: r.id, status: r.status, how: r.how, reason: r.reason, seen: r.seen ?? {}, note: r.note, at: new Date(r.at).toISOString(), by: r.by_name })),
        issue,
        input: s.input ? { kind: s.input, value: kept && choices.some((x) => x.value === kept) ? kept : null, choices } : null,
        canRun: writer(c) && may(c, s),
      };
    });
  // The gate is judged over every step of the company, not only the ones this person sees.
  const state = (id: string) => (find('test', id)?.status as TestStatus | undefined) ?? 'todo';
  const requiredAll = all.filter((s) => s.required);
  const done = find('done', 'all');
  const passed = steps.filter((s) => s.status === 'pass' || s.status === 'skipped').length;
  return {
    steps,
    passed,
    total: steps.length,
    bundles: TEST_BUNDLES.map((b) => {
      const ids = b.steps.filter((id) => steps.some((s) => s.id === id && s.applies));
      return { id: b.id, steps: ids, minutes: ids.reduce((n, id) => n + (testStepDef(id)?.minutes ?? 0), 0) };
    }),
    gate: {
      required: requiredAll.length,
      requiredPassed: requiredAll.filter((s) => state(s.def.id) === 'pass').length,
      approvals: { customer: approvalOf(find('approve', 'customer')), vendor: approvalOf(find('approve', 'vendor')) },
      canApprove: { customer: mayApprove(c, 'customer'), vendor: mayApprove(c, 'vendor') },
    },
    doneAt: done ? new Date(done.at).toISOString() : null,
    doneBy: done?.by_name ?? null,
  };
}

/** A failed step's issue, in the company's words: what was expected, what was seen, and where to re-test. */
function issueText(c: C, step: TestStepDef, title: string | null, detail: { reason?: string | null; seen?: Record<string, unknown> }) {
  const org = c.get('org');
  const say = (key: string, vars: Record<string, string> = {}) => translate(c.get('locale'), key as MessageKey, vars, org.terms);
  const reason = detail.reason ?? null;
  const body = [
    `${say('sh.run.expected')} ${say(`sh.test.${step.id}.expect`)}`,
    reason ? `${say('sh.run.saw')} ${say(`sh.test.reason.${reason}`, { error: '' })}` : '',
    detail.seen?.error ? String(detail.seen.error).slice(0, 300) : '',
    `/setup-test#${step.id}`,
  ]
    .filter(Boolean)
    .join('\n');
  return { title: title ?? say('sh.issue.title', { step: say(`sh.test.${step.id}.title`) }), body };
}

/**
 * Keeps one try of a step (with what it saw) and its new state. A pass resolves
 * the step's open issue. Before "Setup complete", a required step that stops
 * passing takes the approvals back: they were given to what was true then.
 */
async function save(c: C, q: Q, id: string, status: TestStatus, how: TestRun['how'], detail: { reason?: string | null; seen?: Record<string, unknown>; note?: string | null }) {
  const org = c.get('org');
  const auth = c.get('auth');
  if (status === 'todo') await q.query(`delete from setup_progress where org_id = $1 and kind = 'test' and item = $2`, [org.id, id]);
  else {
    await q.query(
      `insert into setup_test_runs (org_id, step, status, how, reason, seen, note, by_user) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [org.id, id, status, how, detail.reason ?? null, JSON.stringify(detail.seen ?? {}), detail.note ?? null, auth.userId],
    );
    await q.query(
      `insert into setup_progress (org_id, kind, item, status, detail, by_user) values ($1, 'test', $2, $3, $4, $5)
       on conflict (org_id, kind, item) do update set status = excluded.status, detail = excluded.detail, by_user = excluded.by_user, at = now()`,
      [org.id, id, status, JSON.stringify({ reason: detail.reason ?? null, seen: detail.seen ?? {} }), auth.userId],
    );
  }
  // A failed step is an issue at once (the plan lists the same row); a pass, or leaving it out, closes it.
  if (status === 'fail') {
    const step = testStepDef(id);
    if (step) await openStepIssue(q, { orgId: org.id, userId: auth.userId, stepId: id, ...issueText(c, step, null, detail), urgent: step.required });
  } else if (status === 'pass' || status === 'skipped') await closeStepIssue(q, org.id, id);
  const [done] = await q.query(`select 1 from setup_progress where org_id = $1 and kind = 'done'`, [org.id]);
  if (done) return;
  const ctx = await contextOf(c, q);
  const rows = await q.query<{ item: string; status: string }>(`select item, status from setup_progress where org_id = $1 and kind = 'test'`, [org.id]);
  const open = gateOpen(stepsOf(ctx).map((s) => ({ required: s.required, status: (rows.find((r) => r.item === s.def.id)?.status as TestStatus) ?? 'todo' })));
  if (!open) await q.query(`delete from setup_progress where org_id = $1 and kind = 'approve'`, [org.id]);
}

setupHealthRoutes.get('/setup-test', async (c) => c.json(await run(c, (q) => testFor(c, q))));

const stepOf = (c: C) => {
  const step = testStepDef(idParam(c));
  if (!step) fail('not_found');
  if (!writer(c) || !may(c, step!)) fail('forbidden');
  return step!;
};

setupHealthRoutes.post('/setup-test/:id/mark', async (c) => {
  const step = stepOf(c);
  const input = await body(c, z.object({ status: z.enum(['todo', 'pass', 'fail', 'skipped']), note: z.string().trim().max(500).optional() }));
  const out = await run(c, async (q) => {
    // A step that must pass cannot be left out: the gate would mean nothing.
    if (input.status === 'skipped' && stepsOf(await contextOf(c, q)).find((s) => s.def.id === step.id)?.required) fail('validation', { fields: 'status' }, { fields: ['status'], reason: 'required' });
    await save(c, q, step.id, input.status, 'person', { reason: input.status === 'fail' ? 'person' : null, note: input.note || null });
    return testFor(c, q);
  });
  return c.json(out);
});

setupHealthRoutes.post('/setup-test/:id/input', async (c) => {
  const step = stepOf(c);
  if (!step.input) fail('not_found');
  const input = await body(c, z.object({ value: z.string().uuid().nullable() }));
  const org = c.get('org');
  const out = await run(c, async (q) => {
    if (input.value === null) await q.query(`delete from setup_progress where org_id = $1 and kind = 'input' and item = $2`, [org.id, step.id]);
    else
      await q.query(
        `insert into setup_progress (org_id, kind, item, status, detail, by_user) values ($1, 'input', $2, 'ok', $3, $4)
         on conflict (org_id, kind, item) do update set detail = excluded.detail, by_user = excluded.by_user, at = now()`,
        [org.id, step.id, JSON.stringify({ value: input.value }), c.get('auth').userId],
      );
    return testFor(c, q);
  });
  return c.json(out);
});

setupHealthRoutes.post('/setup-test/:id/issue', async (c) => {
  const step = stepOf(c);
  const input = await body(c, z.object({ title: z.string().trim().min(1).max(200).optional() }));
  const org = c.get('org');
  const auth = c.get('auth');
  const out = await run(c, async (q) => {
    const [row] = await q.query<{ status: string; detail: any }>(`select status, detail from setup_progress where org_id = $1 and kind = 'test' and item = $2`, [org.id, step.id]);
    if (row?.status !== 'fail') fail('validation', { fields: 'id' }, { fields: ['id'], reason: 'not_failed' });
    const [had] = await q.query(`select 1 from setup_progress where org_id = $1 and kind = 'issue' and item = $2 and status = 'open'`, [org.id, step.id]);
    if (had) return testFor(c, q);
    const text = issueText(c, step, input.title ?? null, row!.detail ?? {});
    await openStepIssue(q, { orgId: org.id, userId: auth.userId, stepId: step.id, ...text, urgent: step.required });
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'setup.issue_opened', entity: 'org', entityId: org.id, meta: { step: step.id } });
    return testFor(c, q);
  });
  return c.json(out);
});

setupHealthRoutes.post('/setup-test/approve', async (c) => {
  const input = await body(c, z.object({ side: z.enum(['customer', 'vendor']), approve: z.boolean() }));
  if (!mayApprove(c, input.side)) fail('forbidden');
  const org = c.get('org');
  const auth = c.get('auth');
  const out = await run(c, async (q) => {
    const [done] = await q.query(`select 1 from setup_progress where org_id = $1 and kind = 'done'`, [org.id]);
    if (done) return testFor(c, q);
    if (!input.approve) {
      await q.query(`delete from setup_progress where org_id = $1 and kind = 'approve' and item = $2`, [org.id, input.side]);
      return testFor(c, q);
    }
    const ctx = await contextOf(c, q);
    const rows = await q.query<{ item: string; status: string }>(`select item, status from setup_progress where org_id = $1 and kind = 'test'`, [org.id]);
    if (!gateOpen(stepsOf(ctx).map((s) => ({ required: s.required, status: (rows.find((r) => r.item === s.def.id)?.status as TestStatus) ?? 'todo' }))))
      fail('validation', { fields: 'side' }, { fields: ['side'], reason: 'required_left' });
    await q.query(
      `insert into setup_progress (org_id, kind, item, status, by_user) values ($1, 'approve', $2, 'ok', $3)
       on conflict (org_id, kind, item) do update set by_user = excluded.by_user, at = now()`,
      [org.id, input.side, auth.userId],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'setup.approved', entity: 'org', entityId: org.id, meta: { side: input.side } });
    const both = await q.query(`select item from setup_progress where org_id = $1 and kind = 'approve'`, [org.id]);
    if (both.length === 2) {
      await q.query(`insert into setup_progress (org_id, kind, item, status, by_user) values ($1, 'done', 'all', 'ok', $2) on conflict (org_id, kind, item) do nothing`, [org.id, auth.userId]);
      await audit(q, { orgId: org.id, actorId: auth.userId, action: 'setup.tested', entity: 'org', entityId: org.id });
    }
    return testFor(c, q);
  });
  return c.json(out);
});

setupHealthRoutes.post('/setup-test/reset', async (c) => {
  if (!askerOf(c).admin && !c.get('auth').perms.includes('org.manage')) fail('forbidden');
  if (!writer(c)) fail('forbidden');
  const org = c.get('org');
  const out = await run(c, async (q) => {
    // The tries stay (they are the record); the list, the approvals and "complete" start again.
    await q.query(`delete from setup_progress where org_id = $1 and kind in ('test', 'approve', 'done')`, [org.id]);
    await audit(q, { orgId: org.id, actorId: c.get('auth').userId, action: 'setup.test_reset', entity: 'org', entityId: org.id });
    return testFor(c, q);
  });
  return c.json(out);
});

type Seen = Record<string, string | number | boolean | null>;
type Outcome = { status: 'pass' | 'fail'; reason?: string; seen?: Seen };

const keptInput = async (q: Q, orgId: string, step: string) =>
  ((await q.query<{ detail: any }>(`select detail from setup_progress where org_id = $1 and kind = 'input' and item = $2`, [orgId, step]))[0]?.detail?.value as string | undefined) ?? null;

/** A test ticket, sent the way any other tool sends one, then looked for where the team would see it. */
async function testTicket(c: C): Promise<Outcome> {
  const org = c.get('org');
  const auth = c.get('auth');
  const deps = c.get('deps');
  const customer = await run(c, async (q) => {
    const kept = await keptInput(q, org.id, 'ticket');
    const list = await q.query<{ id: string; name: string }>(
      `select id, name from accounts where org_id = $1 and archived_at is null order by (id::text = $2) desc, created_at limit 1`,
      [org.id, kept ?? ''],
    );
    return list[0] ?? null;
  });
  if (!customer) return { status: 'fail', reason: 'no_customer' };
  // The kind is made the first time a ticket arrives (routes/tickets.ts does the same).
  await deps.db.system(async (q) => {
    const [have] = await q.query(`select id from record_types where org_id = $1 and kind = 'ticket' and archived_at is null`, [org.id]);
    if (!have) await createRecordType(q, org.id, null, { kind: 'ticket' });
  });
  const input = ticketInput.parse({
    subject: translate(c.get('locale'), 'sh.test.ticket.subject' as MessageKey, {}, org.terms),
    requester: auth.email,
    channel: 'setup-check',
    account: { id: customer.id },
  });
  const made = await run(c, (q) => upsertTicket(q, org.id, auth.userId, 'setup-check', `t${nowOf(deps).getTime().toString(36)}`, input, todayOf(c)));
  const [arrived] = await run(c, (q) => q.query(`select id from records where org_id = $1 and id = $2 and account_id is not null`, [org.id, made.id]));
  return arrived ? { status: 'pass', seen: { record: made.id, customer: customer.name } } : { status: 'fail', reason: 'ticket_hidden', seen: { customer: customer.name } };
}

/** One run of the connection's sync, as "Sync now" does. */
async function testSync(c: C, kind: 'crm' | 'jira' | 'accounting'): Promise<Outcome> {
  const org = c.get('org');
  const conn = await run(c, async (q) => {
    const ctx = await contextOf(c, q);
    const kept = await keptInput(q, org.id, kind);
    const list = ctx.conns(kind);
    return list.find((x) => x.id === kept) ?? list[0] ?? null;
  });
  if (!conn) return { status: 'fail', reason: 'not_connected' };
  if (!conn.started) return { status: 'fail', reason: 'mapping', seen: { connection: conn.id, name: conn.label } };
  const result = await syncConnection(c.get('deps'), org.id, conn.id, { trigger: 'manual', userId: c.get('auth').userId, budgetMs: SYNC_BUDGET_MS });
  if (!result) return { status: 'fail', reason: 'busy', seen: { connection: conn.id, name: conn.label } };
  const sum = (k: 'created' | 'updated' | 'failed') => Object.values(result.stats ?? {}).reduce((n, s) => n + Number(s?.[k] ?? 0), 0);
  const seen: Seen = { connection: conn.id, name: conn.label, created: sum('created'), updated: sum('updated'), failed: sum('failed') };
  if (result.status === 'error') return { status: 'fail', reason: 'sync_error', seen: { ...seen, error: String(result.errors?.[0]?.message ?? '').slice(0, 300) || null } };
  return { status: 'pass', seen };
}

/** A dry run of the first rule: whom it would act on today. Changes nothing. */
async function testAutomation(c: C): Promise<Outcome> {
  const org = c.get('org');
  return run(c, async (q): Promise<Outcome> => {
    const broken = await runSqlChecks(q, org.id, ['auto.deletedField', 'auto.deletedBoard']);
    const bad = broken['auto.deletedField']?.n ? broken['auto.deletedField'] : broken['auto.deletedBoard']?.n ? broken['auto.deletedBoard'] : null;
    if (bad) return { status: 'fail', reason: 'broken_rule', seen: { name: bad.ref } };
    const rules = await q.query(`select id, name, trigger from automations where org_id = $1 and enabled order by created_at limit 20`, [org.id]);
    if (!rules.length) return { status: 'fail', reason: 'no_rules' };
    const today = localDate(nowOf(c.get('deps')), org.timezone);
    for (const r of rules) {
      const { trigger, conditions } = splitTrigger(r.trigger);
      const p = await preview(q, org.id, trigger, conditions, today);
      if (p.count !== null) return { status: 'pass', seen: { name: r.name, count: p.count, sample: p.sample.slice(0, 3).join(', ') || null } };
    }
    // Only rules that wait for something to happen: nothing to try in advance, and nothing wrong with them.
    return { status: 'pass', seen: { name: rules[0].name, event: true } };
  });
}

setupHealthRoutes.post('/setup-test/:id/run', async (c) => {
  const step = stepOf(c);
  if (!step.auto) fail('validation', { fields: 'id' }, { fields: ['id'] });
  const outcome: Outcome =
    step.id === 'ticket' ? await testTicket(c) : step.id === 'automation' ? await testAutomation(c) : await testSync(c, step.id as 'crm' | 'jira' | 'accounting');
  const out = await run(c, async (q) => {
    await save(c, q, step.id, outcome.status, 'run', { reason: outcome.reason ?? null, seen: outcome.seen ?? {} });
    return testFor(c, q);
  });
  return c.json(out);
});
