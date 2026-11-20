// The owner console's own sections (desk.<domain>, /api/desk/owner/*): the
// business at a glance, revenue and invoices, trials and free companies, trial
// requests with their decision, support at a glance, the system, everything
// staff did, Plan & targets (with budget, milestones, fundraising windows and
// the investor pipeline), the weekly CEO summary, the owner's phones for
// alerts, and the go-live checklist. Only the platform owner
// in his own console session reaches these (ownerOnly); decisions are written
// to the desk's log.
import type { FundraisingWindowsRow, InvestorPipelineRow, OwnerPushDevicesRow, PlanTasksRow } from '../db/rows.gen';
import { Hono } from 'hono';
import { z } from 'zod';
import { CHECKLIST } from '../../../shared/src/checklist';
import { INVESTOR_KINDS, INVESTOR_STAGES, isOwnerLocale, readPlanFile, TARGET_METRICS, WINDOW_STATUSES, type OwnerPushState } from '../../../shared/src/ownerPlan';
import { ownerWord } from '../../../shared/src/i18n/owner';
import { TRIAL_DEPARTMENTS, TRIAL_REQUEST_STATUSES } from '../../../shared/src/trialRequest';
import type { AppEnv } from '../context';
import { previewCeoSummary } from '../lib/ceoSummary';
import { fail } from '../lib/errors';
import { drainOwnerOutbox, ownerAddress, ownerMailSettings, queueOwner, writeConsoleSetting } from '../lib/ownerOutbox';
import { importPlan, investorSide } from '../lib/ownerPlan';
import { markChecklist, ownerActivity, ownerBar, ownerChecklist, ownerOverview, ownerPlan, ownerRevenue, ownerSupport, ownerSystem, ownerTrials } from '../lib/ownerConsole';
import {
  approveTrialRequest,
  consoleSettings,
  listTrialRequests,
  markContacted,
  rejectTrialRequest,
  setConsoleSetting,
  trialRequestDetail,
} from '../lib/trialRequests';
import { body, isoDate, uuid } from '../lib/validate';
import { ownerOnly } from './desk';

export const ownerRoutes = new Hono<AppEnv>();

ownerRoutes.use('*', async (c, next) => {
  await ownerOnly(c);
  c.header('cache-control', 'no-store');
  await next();
});
const by = async (c: Parameters<typeof ownerOnly>[0]) => (await ownerOnly(c)).email;
const id = (c: { req: { param: (k: string) => string } }) => {
  const v = c.req.param('id');
  if (!uuid.safeParse(v).success) fail('not_found');
  return v as string;
};

/**
 * The owner console's top bar: pending approvals, new trial requests, and the AI team's token use this week against
 * its budget. Owner only (ownerOnly middleware); db.system() in lib/ownerConsole.ts because it reads across companies.
 */
ownerRoutes.get('/bar', async (c) => c.json(await ownerBar(c.get('deps'))));
/**
 * The business at a glance: paid and failed invoices, renewals due, plan targets, the checklist and the owner's own day.
 */
ownerRoutes.get('/overview', async (c) => c.json(await ownerOverview(c.get('deps'), await by(c))));
/** Revenue and the latest invoices across every company, from the billing records. */
ownerRoutes.get('/revenue', async (c) => c.json(await ownerRevenue(c.get('deps'), await by(c))));
/** Companies on a trial or free, with days left and activity. */
ownerRoutes.get('/trials', async (c) => c.json({ trials: await ownerTrials(c.get('deps')) }));
/** System health for the owner: recent errors, sync runs, broken connections and the AI team's audit activity. */
ownerRoutes.get('/system', async (c) => c.json(await ownerSystem(c.get('deps'))));
/** Support at a glance: open help requests (blocking first) and who on the desk holds them. */
ownerRoutes.get('/support', async (c) => c.json(await ownerSupport(c.get('deps'))));
/** Everything support staff did, newest first, paged with an ISO `before`; 400 for a bad date. */
ownerRoutes.get('/activity', async (c) => {
  const before = c.req.query('before');
  if (before && Number.isNaN(Date.parse(before))) fail('validation');
  return c.json({ activity: await ownerActivity(c.get('deps'), before) });
});

// ------------------------------------------------------------ trial requests

const statusQ = z.enum([...TRIAL_REQUEST_STATUSES, 'open', 'all']);
/** Trial requests by `status` (default "open"), with the console's trial settings. */
ownerRoutes.get('/requests', async (c) => {
  const s = statusQ.safeParse(c.req.query('status') ?? 'open');
  if (!s.success) return fail('validation');
  return c.json({ requests: await listTrialRequests(c.get('deps'), s.data), settings: await consoleSettings(c.get('deps')) });
});
/** One trial request with its history; 404 when unknown. */
ownerRoutes.get('/requests/:id', async (c) => {
  const d = await trialRequestDetail(c.get('deps'), id(c));
  if (!d) fail('not_found');
  return c.json(d);
});
/** Marks a trial request as contacted, with an optional note. */
ownerRoutes.post('/requests/:id/contacted', async (c) => {
  const input = await body(c, z.object({ note: z.string().trim().max(4000).nullable().default(null) }));
  await markContacted(c.get('deps'), id(c), await by(c), input.note);
  return c.json({ ok: true });
});
/** Approves a trial request: creates the company with the chosen departments, seat cap and end date (ADR 0017). */
ownerRoutes.post('/requests/:id/approve', async (c) => {
  const input = await body(
    c,
    z.object({
      departments: z.array(z.enum(TRIAL_DEPARTMENTS)).min(1).max(TRIAL_DEPARTMENTS.length),
      seatCap: z.number().int().min(1).max(100000),
      endsOn: isoDate.nullable().optional(),
      slug: z.string().trim().toLowerCase().max(40).nullable().optional(),
      note: z.string().trim().max(4000).nullable().optional(),
    }),
  );
  return c.json(await approveTrialRequest(c.get('deps'), id(c), await by(c), { ...input, departments: [...new Set(input.departments)] }));
});
/** Rejects a trial request with an optional reason. */
ownerRoutes.post('/requests/:id/reject', async (c) => {
  const input = await body(c, z.object({ reason: z.string().trim().max(2000).nullable().default(null) }));
  return c.json(await rejectTrialRequest(c.get('deps'), id(c), await by(c), input.reason));
});
/** Changes the console's trial defaults (seat cap, months). Each change is logged with who made it. */
ownerRoutes.put('/settings', async (c) => {
  const input = await body(c, z.object({ 'trial.seatCap': z.number().int().min(1).max(100000).optional(), 'trial.months': z.number().int().min(1).max(12).optional() }));
  const who = await by(c);
  for (const [k, v] of Object.entries(input)) if (v !== undefined) await setConsoleSetting(c.get('deps'), k as 'trial.seatCap' | 'trial.months', v, who);
  return c.json({ settings: await consoleSettings(c.get('deps')) });
});

// ------------------------------------------------------------ plan & targets

/** The owner's plan for this month: targets against actuals for the funnel metrics, and his tasks. */
ownerRoutes.get('/plan', async (c) => c.json(await ownerPlan(c.get('deps'))));
/** Sets monthly targets for the plan metrics and the two milestone metrics (`YYYY-MM` periods); null clears one. */
ownerRoutes.put('/plan/targets', async (c) => {
  const input = await body(
    c,
    z.object({
      targets: z
        .array(z.object({ metric: z.enum(TARGET_METRICS), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), target: z.number().min(0).max(1e12).nullable() }))
        .min(1)
        .max(200),
    }),
  );
  const who = await by(c);
  await c.get('deps').db.system(async (q) => {
    for (const t of input.targets) {
      if (t.target == null) await q.query('delete from plan_targets where metric = $1 and period = $2', [t.metric, t.period]);
      else
        await q.query(
          `insert into plan_targets (metric, period, target, updated_by) values ($1, $2, $3, $4)
           on conflict (metric, period) do update set target = excluded.target, updated_by = excluded.updated_by, updated_at = now()`,
          [t.metric, t.period, t.target, who],
        );
    }
    await q.query(`insert into desk_log (staff_email, action, ref, org_id) values ($1, 'plan.targets', $2, null)`, [who, String(input.targets.length)]);
  });
  return c.json(await ownerPlan(c.get('deps')));
});
/** Adds a task to the owner's plan (201). */
ownerRoutes.post('/plan/tasks', async (c) => {
  const input = await body(c, z.object({ title: z.string().trim().min(1).max(300), dueOn: isoDate }));
  const [row] = await c.get('deps').db.system((q) => q.query<{ id: string }>(`insert into plan_tasks (title, due_on) values ($1, $2) returning id`, [input.title, input.dueOn]));
  return c.json({ id: row.id }, 201);
});
/** Edits a plan task: done/undone, due date, title; 404 when unknown. */
ownerRoutes.patch('/plan/tasks/:id', async (c) => {
  const input = await body(c, z.object({ done: z.boolean().optional(), dueOn: isoDate.optional(), title: z.string().trim().min(1).max(300).optional() }));
  const [row] = await c.get('deps').db.system((q) =>
    q.query<Pick<PlanTasksRow, 'id'>>(
      `update plan_tasks set done_at = case when $2::boolean is null then done_at when $2 then coalesce(done_at, now()) else null end,
              due_on = coalesce($3::date, due_on), title = coalesce($4, title) where id = $1 returning id`,
      [id(c), input.done ?? null, input.dueOn ?? null, input.title ?? null],
    ),
  );
  if (!row) fail('not_found');
  return c.json({ ok: true });
});
/** Removes a plan task. */
ownerRoutes.delete('/plan/tasks/:id', async (c) => {
  await c.get('deps').db.system((q) => q.query('delete from plan_tasks where id = $1', [id(c)]));
  return c.json({ ok: true });
});

// ------------------------------------------------------------ plan: the investor side

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const money = z.number().min(0).max(1e11);
const words = (max: number) => z.string().trim().max(max).nullable();
/** The Idempotency-Key of a create, when the console sent one: the same key twice makes one row (CLAUDE.md). */
const createKey = (c: { req: { header: (k: string) => string | undefined } }) => {
  const k = c.req.header('idempotency-key');
  if (k == null) return null;
  if (!/^[\w.:-]{8,200}$/.test(k)) fail('validation');
  return k;
};
const log = (deps: AppEnvDeps, who: string, action: string, ref: string | null) =>
  deps.db.system((q) => q.query(`insert into desk_log (staff_email, action, ref, org_id) values ($1, $2, $3, null)`, [who, action, ref]));
type AppEnvDeps = Parameters<typeof investorSide>[0];

/** Budget against spend with runway, the two milestones, fundraising windows and the investor pipeline. */
ownerRoutes.get('/plan/side', async (c) => c.json(await investorSide(c.get('deps'))));

/**
 * Loads the business plan's targets file (targets.json) for one scenario: targets, milestones, planned budget,
 * fundraising windows and tasks. `dryRun` only reads it and answers what would be loaded. A file out of shape
 * answers `{ ok: false, errors }` and loads nothing. At most 4 MB.
 */
ownerRoutes.post('/plan/import', async (c) => {
  const raw = await c.req.text();
  if (raw.length > 4_000_000) fail('validation');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail('validation');
  }
  const input = z.object({ file: z.unknown(), scenario: z.string().max(40).nullable().optional(), dryRun: z.boolean().optional() }).safeParse(parsed);
  if (!input.success) return fail('validation');
  const deps = c.get('deps');
  const { locale } = await deps.db.system((q) => ownerMailSettings(q));
  const read = readPlanFile(input.data.file, input.data.scenario, locale);
  if (!read.ok) return c.json({ ok: false, errors: read.errors, scenarios: read.scenarios });
  const p = read.plan;
  const preview = { targets: p.targets.length, budget: p.budget.length, windows: p.windows.length, tasks: p.tasks.length };
  if (input.data.dryRun) return c.json({ ok: true, dryRun: true, scenario: p.scenario, scenarios: read.scenarios, counts: preview });
  const counts = await importPlan(deps, p, await by(c));
  return c.json({ ok: true, scenario: p.scenario, scenarios: read.scenarios, counts });
});

/**
 * Sets budget lines: the planned amount and/or what was really spent, per month and category (null clears the
 * spend). A line of the owner's own with nothing planned and nothing spent is removed; the plan's lines stay.
 */
ownerRoutes.put('/plan/budget', async (c) => {
  const input = await body(
    c,
    z.object({ lines: z.array(z.object({ period, category: z.string().trim().min(1).max(80), planned: money.optional(), actual: money.nullable() })).min(1).max(200) }),
  );
  const who = await by(c);
  await c.get('deps').db.system(async (q) => {
    for (const l of input.lines) {
      await q.query(
        `insert into plan_budget (period, category, planned, actual, updated_by) values ($1, $2, coalesce($3::numeric, 0), $4, $5)
         on conflict (period, category) do update set planned = coalesce($3::numeric, plan_budget.planned), actual = excluded.actual,
                updated_by = excluded.updated_by, updated_at = now()`,
        [l.period, l.category, l.planned ?? null, l.actual, who],
      );
      await q.query(`delete from plan_budget where period = $1 and category = $2 and source = 'owner' and planned = 0 and actual is null`, [l.period, l.category]);
    }
    await q.query(`insert into desk_log (staff_email, action, ref, org_id) values ($1, 'plan.budget', $2, null)`, [who, String(input.lines.length)]);
  });
  return c.json(await investorSide(c.get('deps')));
});

/** The cash the owner has, and on which day, for the runway; null clears it. */
ownerRoutes.put('/plan/cash', async (c) => {
  const input = await body(c, z.object({ cash: money.nullable(), cashOn: isoDate.nullable() }));
  const who = await by(c);
  await c.get('deps').db.system(async (q) => {
    await writeConsoleSetting(q, 'budget.cash', input.cash, who);
    await writeConsoleSetting(q, 'budget.cashOn', input.cashOn, who);
  });
  return c.json(await investorSide(c.get('deps')));
});

// The fields with no defaults: a change (PATCH) sends only what changes, and a default there would overwrite a
// stored value with null. Creates add their defaults on top.
const windowFields = z.object({
  name: z.string().trim().min(1).max(120),
  opensOn: isoDate,
  closesOn: isoDate,
  targetMin: money.nullable(),
  targetMax: money.nullable(),
  status: z.enum(WINDOW_STATUSES),
  conditions: words(2000),
  note: words(2000),
});
const windowIn = windowFields.extend({
  targetMin: windowFields.shape.targetMin.default(null),
  targetMax: windowFields.shape.targetMax.default(null),
  status: windowFields.shape.status.default('planned'),
  conditions: windowFields.shape.conditions.default(null),
  note: windowFields.shape.note.default(null),
});
const windowOk = (w: { opensOn?: string; closesOn?: string; targetMin?: number | null; targetMax?: number | null }) =>
  (!w.opensOn || !w.closesOn || w.closesOn >= w.opensOn) && (w.targetMin == null || w.targetMax == null || w.targetMax >= w.targetMin);

/** Adds a fundraising window (201). With an Idempotency-Key, sending it twice adds it once. */
ownerRoutes.post('/plan/windows', async (c) => {
  const w = await body(c, windowIn);
  if (!windowOk(w)) fail('validation', { fields: 'closesOn' });
  const key = createKey(c);
  const [row] = await c.get('deps').db.system(async (q) => {
    const made = await q.query<Pick<FundraisingWindowsRow, 'id'>>(
      `insert into fundraising_windows (name, opens_on, closes_on, target_min, target_max, status, conditions, note, client_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (client_key) do nothing returning id`,
      [w.name, w.opensOn, w.closesOn, w.targetMin, w.targetMax, w.status, w.conditions, w.note, key],
    );
    return made.length ? made : q.query<Pick<FundraisingWindowsRow, 'id'>>(`select id from fundraising_windows where client_key = $1`, [key]);
  });
  await log(c.get('deps'), await by(c), 'plan.window', w.name);
  return c.json({ id: row.id }, 201);
});
/** Changes a fundraising window: dates, amounts, status, conditions, note; 404 when unknown. Windows are not deleted: "skipped" sets one aside. */
ownerRoutes.patch('/plan/windows/:id', async (c) => {
  const w = await body(c, windowFields.partial());
  const deps = c.get('deps');
  const [row] = await deps.db.system((q) => q.query<FundraisingWindowsRow>(`select * from fundraising_windows where id = $1`, [id(c)]));
  if (!row) fail('not_found');
  const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  const next = {
    opensOn: w.opensOn ?? day(row.opens_on),
    closesOn: w.closesOn ?? day(row.closes_on),
    targetMin: w.targetMin !== undefined ? w.targetMin : row.target_min == null ? null : Number(row.target_min),
    targetMax: w.targetMax !== undefined ? w.targetMax : row.target_max == null ? null : Number(row.target_max),
  };
  if (!windowOk(next)) fail('validation', { fields: 'closesOn' });
  await deps.db.system((q) =>
    q.query(
      `update fundraising_windows set name = coalesce($2, name), opens_on = $3, closes_on = $4, target_min = $5, target_max = $6, status = coalesce($7, status),
              conditions = case when $8::boolean then $9 else conditions end, note = case when $10::boolean then $11 else note end, updated_at = now() where id = $1`,
      [row.id, w.name ?? null, next.opensOn, next.closesOn, next.targetMin, next.targetMax, w.status ?? null, w.conditions !== undefined, w.conditions ?? null, w.note !== undefined, w.note ?? null],
    ),
  );
  await log(deps, await by(c), `plan.window.${w.status ?? 'edit'}`, row.name);
  return c.json(await investorSide(deps));
});

const investorFields = z.object({
  name: z.string().trim().min(1).max(160),
  kind: z.enum(INVESTOR_KINDS),
  stage: z.enum(INVESTOR_STAGES),
  windowId: uuid.nullable(),
  nextStep: words(300),
  nextOn: isoDate.nullable(),
  amount: money.nullable(),
  note: words(2000),
});
const investorIn = investorFields.extend({
  kind: investorFields.shape.kind.default('angel'),
  stage: investorFields.shape.stage.default('idea'),
  windowId: investorFields.shape.windowId.default(null),
  nextStep: investorFields.shape.nextStep.default(null),
  nextOn: investorFields.shape.nextOn.default(null),
  amount: investorFields.shape.amount.default(null),
  note: investorFields.shape.note.default(null),
});
const windowExists = async (deps: AppEnvDeps, windowId: string | null | undefined) => {
  if (!windowId) return;
  const [w] = await deps.db.system((q) => q.query(`select 1 from fundraising_windows where id = $1`, [windowId]));
  if (!w) fail('validation', { fields: 'windowId' });
};

/** Adds an investor to the owner's pipeline (201). With an Idempotency-Key, sending it twice adds one. */
ownerRoutes.post('/plan/investors', async (c) => {
  const i = await body(c, investorIn);
  const deps = c.get('deps');
  await windowExists(deps, i.windowId);
  const key = createKey(c);
  const [row] = await deps.db.system(async (q) => {
    const made = await q.query<Pick<InvestorPipelineRow, 'id'>>(
      `insert into investor_pipeline (name, kind, stage, window_id, next_step, next_on, amount, note, client_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (client_key) do nothing returning id`,
      [i.name, i.kind, i.stage, i.windowId, i.nextStep, i.nextOn, i.amount, i.note, key],
    );
    return made.length ? made : q.query<Pick<InvestorPipelineRow, 'id'>>(`select id from investor_pipeline where client_key = $1`, [key]);
  });
  await log(deps, await by(c), 'plan.investor', i.name);
  return c.json({ id: row.id }, 201);
});
/** Changes an investor: stage, next step and its day, amount, window, note; 404 when unknown or put aside. */
ownerRoutes.patch('/plan/investors/:id', async (c) => {
  const i = await body(c, investorFields.partial());
  const deps = c.get('deps');
  await windowExists(deps, i.windowId);
  const set = (k: keyof typeof i) => i[k] !== undefined;
  const [row] = await deps.db.system((q) =>
    q.query<Pick<InvestorPipelineRow, 'id' | 'name'>>(
      `update investor_pipeline set name = coalesce($2, name), kind = coalesce($3, kind), stage = coalesce($4, stage),
              window_id = case when $5::boolean then $6::uuid else window_id end, next_step = case when $7::boolean then $8 else next_step end,
              next_on = case when $9::boolean then $10::date else next_on end, amount = case when $11::boolean then $12::numeric else amount end,
              note = case when $13::boolean then $14 else note end, updated_at = now()
        where id = $1 and deleted_at is null returning id, name`,
      [id(c), i.name ?? null, i.kind ?? null, i.stage ?? null, set('windowId'), i.windowId ?? null, set('nextStep'), i.nextStep ?? null, set('nextOn'), i.nextOn ?? null, set('amount'), i.amount ?? null, set('note'), i.note ?? null],
    ),
  );
  if (!row) fail('not_found');
  await log(deps, await by(c), i.stage ? `plan.investor.${i.stage}` : 'plan.investor.edit', row.name);
  return c.json(await investorSide(deps));
});
/** Puts an investor aside (to the trash for 30 days; POST …/restore brings it back); 404 when unknown. */
ownerRoutes.delete('/plan/investors/:id', async (c) => {
  const deps = c.get('deps');
  const [row] = await deps.db.system((q) => q.query<Pick<InvestorPipelineRow, 'name'>>(`update investor_pipeline set deleted_at = now() where id = $1 and deleted_at is null returning name`, [id(c)]));
  if (!row) fail('not_found');
  await log(deps, await by(c), 'plan.investor.removed', row.name);
  return c.json(await investorSide(deps));
});
/** Brings back an investor put aside in the last 30 days; 404 when there is none. */
ownerRoutes.post('/plan/investors/:id/restore', async (c) => {
  const deps = c.get('deps');
  const [row] = await deps.db.system((q) =>
    q.query<Pick<InvestorPipelineRow, 'name'>>(`update investor_pipeline set deleted_at = null, updated_at = now() where id = $1 and deleted_at > now() - interval '30 days' returning name`, [id(c)]),
  );
  if (!row) fail('not_found');
  await log(deps, await by(c), 'plan.investor.restored', row.name);
  return c.json(await investorSide(deps));
});

// ------------------------------------------------------------ the weekly CEO summary

/** The Monday summary as it would be written now, with its settings, when the next one goes and when the last went. */
ownerRoutes.get('/summary', async (c) => c.json(await previewCeoSummary(c.get('deps'))));
/** Turns the Monday summary on or off and sets the language of what the console sends the owner (summary and phone alerts). */
ownerRoutes.put('/summary', async (c) => {
  const input = await body(c, z.object({ enabled: z.boolean().optional(), locale: z.string().refine(isOwnerLocale).optional() }));
  const who = await by(c);
  await c.get('deps').db.system(async (q) => {
    if (input.enabled !== undefined) await writeConsoleSetting(q, 'ceoSummary.enabled', input.enabled, who);
    if (input.locale !== undefined) await writeConsoleSetting(q, 'owner.locale', input.locale, who);
  });
  await log(c.get('deps'), who, 'summary.settings', input.enabled === false ? 'off' : input.enabled ? 'on' : (input.locale ?? null));
  return c.json(await previewCeoSummary(c.get('deps')));
});
/** Sends the summary to the owner now, as a try (at most once a minute; the Monday one still goes as planned). */
ownerRoutes.post('/summary/test', async (c) => {
  const deps = c.get('deps');
  const to = ownerAddress(deps);
  if (!to) return fail('not_found');
  const p = await previewCeoSummary(deps);
  const queued = await deps.db.system((q) => queueOwner(q, 'mail', `ceo-summary-test:${new Date().toISOString().slice(0, 16)}`, { to, subject: p.subject, text: p.text }));
  if (queued) await drainOwnerOutbox(deps);
  return c.json({ queued, to });
});

// ------------------------------------------------------------ the owner's phones (Web Push)

async function pushState(deps: AppEnvDeps): Promise<OwnerPushState> {
  const rows = await deps.db.system((q) => q.query<OwnerPushDevicesRow>(`select * from owner_push_devices order by created_at`));
  return {
    configured: !!deps.config.push,
    publicKey: deps.config.push?.publicKey ?? null,
    devices: rows.map((r) => ({ id: r.id, label: r.label, createdAt: new Date(r.created_at).toISOString(), lastOkAt: r.last_ok_at ? new Date(r.last_ok_at).toISOString() : null, failures: r.failures })),
  };
}
/** Whether phones can be added (the server's VAPID keys are set) and the phones added so far. */
ownerRoutes.get('/push', async (c) => c.json(await pushState(c.get('deps'))));
/**
 * Adds this browser as one of the owner's phones (its push subscription: the push service address and the keys for
 * end-to-end encryption). The same address again updates its keys. 404 when push is not set up on the server.
 */
ownerRoutes.post('/push/devices', async (c) => {
  const deps = c.get('deps');
  if (!deps.config.push) fail('not_found');
  const input = await body(
    c,
    z.object({
      endpoint: z.string().url().max(1000).regex(/^https:\/\//),
      keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{16,32}$/) }),
      label: z.string().trim().max(120).default(''),
    }),
  );
  const [count] = await deps.db.system((q) => q.query<{ n: number }>(`select count(*)::int as n from owner_push_devices where endpoint <> $1`, [input.endpoint]));
  // A handful of phones is plenty; the cap keeps a stuck page from filling the table.
  if (Number(count?.n) >= 10) fail('validation', { fields: 'endpoint' });
  await deps.db.system((q) =>
    q.query(
      `insert into owner_push_devices (endpoint, p256dh, auth, label) values ($1, $2, $3, $4)
       on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label, failures = 0`,
      [input.endpoint, input.keys.p256dh, input.keys.auth, input.label],
    ),
  );
  await log(deps, await by(c), 'push.device.added', input.label || null);
  return c.json(await pushState(deps), 201);
});
/** Removes one of the owner's phones; it gets nothing more. */
ownerRoutes.delete('/push/devices/:id', async (c) => {
  const deps = c.get('deps');
  const [row] = await deps.db.system((q) => q.query<Pick<OwnerPushDevicesRow, 'label'>>(`delete from owner_push_devices where id = $1 returning label`, [id(c)]));
  if (!row) fail('not_found');
  await log(deps, await by(c), 'push.device.removed', row.label || null);
  return c.json(await pushState(deps));
});
/** Sends a test alert to every phone now and answers how each did. */
ownerRoutes.post('/push/test', async (c) => {
  const deps = c.get('deps');
  if (!deps.config.push) fail('not_found');
  const { locale } = await deps.db.system((q) => ownerMailSettings(q));
  await deps.db.system((q) =>
    queueOwner(q, 'push', `push:test:${Date.now()}`, { title: ownerWord(locale, 'push.test.title'), body: ownerWord(locale, 'push.test.body'), url: '/plan?q=summary', urgency: 'normal' }),
  );
  await drainOwnerOutbox(deps);
  return c.json(await pushState(deps));
});

// ------------------------------------------------------------ checklist

const ITEMS = new Set(CHECKLIST.map((i) => i.id));
/** The go-live checklist with each item's status, note and evidence. */
ownerRoutes.get('/checklist', async (c) => c.json(await ownerChecklist(c.get('deps'))));
/** Marks a go-live checklist item todo, done or skipped, with note and evidence; 404 for an unknown item. */
ownerRoutes.put('/checklist/:item', async (c) => {
  const item = c.req.param('item');
  if (!ITEMS.has(item)) fail('not_found');
  const input = await body(
    c,
    z.object({ status: z.enum(['todo', 'done', 'skipped']), note: z.string().trim().max(4000).nullable().default(null), evidence: z.string().trim().max(1000).nullable().default(null) }),
  );
  const who = await by(c);
  await markChecklist(c.get('deps'), item, who, input.status, input.note, input.evidence);
  await c.get('deps').db.system((q) => q.query(`insert into desk_log (staff_email, action, ref, org_id) values ($1, $2, $3, null)`, [who, `checklist.${input.status}`, item]));
  return c.json(await ownerChecklist(c.get('deps')));
});
