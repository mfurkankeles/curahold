// The owner console's own sections (desk.<domain>, /api/desk/owner/*): the
// business at a glance, revenue and invoices, trials and free companies, trial
// requests with their decision, support at a glance, the system, everything
// staff did, Plan & targets and the go-live checklist. Only the platform owner
// in his own console session reaches these (ownerOnly); decisions are written
// to the desk's log.
import type { PlanTasksRow } from '../db/rows.gen';
import { Hono } from 'hono';
import { z } from 'zod';
import { CHECKLIST } from '../../../shared/src/checklist';
import { PLAN_METRICS } from '../../../shared/src/ownerConsole';
import { TRIAL_DEPARTMENTS, TRIAL_REQUEST_STATUSES } from '../../../shared/src/trialRequest';
import type { AppEnv } from '../context';
import { fail } from '../lib/errors';
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

ownerRoutes.get('/plan', async (c) => c.json(await ownerPlan(c.get('deps'))));
/** Sets monthly targets for the owner's plan metrics (`YYYY-MM` periods); null clears one. */
ownerRoutes.put('/plan/targets', async (c) => {
  const input = await body(
    c,
    z.object({
      targets: z
        .array(z.object({ metric: z.enum(PLAN_METRICS), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), target: z.number().min(0).max(1e12).nullable() }))
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
