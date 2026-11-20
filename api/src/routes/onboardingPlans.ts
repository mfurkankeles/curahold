// Onboarding plans (db/migrations/0200_onboarding.sql, lib/onboarding.ts,
// shared/src/onboarding.ts): the company's own getting-started hub, the plans
// it runs for its customers (the portfolio), their templates, and the shared
// progress report. Everything runs under the person's own rights: row
// security decides which plans they see and change; the product's own
// signals move a plan on with owner access (they are the company's facts).
import { quarantine } from '../lib/uploadScan';
import { Hono } from 'hono';
import { z } from 'zod';
import { translate } from '../../../shared/src/i18n';
import {
  BUILT_IN_TEMPLATES,
  builtInTemplate,
  GOAL_PRIORITIES,
  GOAL_STATUSES,
  isSignal,
  ISSUE_STATUSES,
  ISSUE_TYPES,
  MAX_PHASES,
  PHASES as PHASES_BUILT_IN,
  MAX_TEMPLATE_RULES,
  onboardingSettings,
  PHASE_KEY,
  phaseOrder,
  reportOf,
  ROLES,
  SITE_STATUSES,
  SIDES,
  FIELD_TYPES,
  unlocked,
  URGENCIES,
  type Blueprint,
  type Template,
} from '../../../shared/src/onboarding';
import { accessFor, nowOf, orgUrl, portalUrl, requirePerm, requireWriter, run, todayOf, type AppEnv, type C } from '../context';
import { checkStorage } from '../billing/entitlements';
import type { Q, Row } from '../db';
import { audit } from '../lib/audit';
import { randomToken, sha256Hex } from '../lib/crypto';
import { fail } from '../lib/errors';
import { day, iso } from '../lib/mappers';
import { advancePlan, clientBlueprint, createPlan, ensureSelfPlan, finishPlan, judgeFields, listPlans, readPlan, refreshMapping } from '../lib/onboarding';
import { readUpload } from '../lib/upload';
import { body, isoDate, param, uuid } from '../lib/validate';

export const onboardingPlanRoutes = new Hono<AppEnv>();
const PHASE_KEY_BUILT_IN = (k: string) => (PHASES_BUILT_IN as readonly string[]).includes(k);
/** Mounted before sign-in: the shared report, opened with its secret link. */
export const onboardingShareRoutes = new Hono<AppEnv>();

const writer = (c: C) => c.get('auth').seat === 'full' && !c.get('tokenKind');
const portalOf = (c: C) => portalUrl(c.get('deps').config, c.get('org').slug);

/** Moves the plan on from what the product can see (owner access: these are the company's own facts), then reads it as the person may. */
async function fresh(c: C, planId: string) {
  const org = c.get('org');
  await c.get('deps').db.system((q) => advancePlan(q, org.id, planId));
  const plan = await run(c, (q) => readPlan(q, org.id, planId, todayOf(c), writer(c), { portalUrl: portalOf(c), locale: c.get('locale') }));
  if (!plan) fail('not_found');
  return plan!;
}

/** The plan a thing inside it belongs to, as far as this person may see it. */
async function planOfChild(q: Q, table: string, id: string): Promise<string> {
  const [r] = await q.query(`select plan_id from ${table} where id = $1`, [id]);
  if (!r) fail('not_found');
  return r.plan_id as string;
}
/** The same fields for a change: every one optional, and none filled with its default (a change sends only what changes). */
function patchOf<S extends z.ZodObject<any>>(schema: S) {
  const shape = Object.fromEntries(Object.entries(schema.shape).map(([k, v]: [string, any]) => [k, (v instanceof z.ZodDefault ? (v as any).unwrap() : v).optional()]));
  return z.object(shape) as unknown as z.ZodType<Partial<z.infer<S>>>;
}
const touch = (q: Q, planId: string) => q.query('update onboarding_plans set updated_at = now() where id = $1', [planId]);

// ------------------------------------------------------------------ the company's own plan

/** The company's own getting-started plan: made the first time an administrator opens it, moved on by what the product sees. */
onboardingPlanRoutes.get('/onboarding/self', async (c) => {
  const org = c.get('org');
  const auth = c.get('auth');
  let id = await run(c, async (q) => (await q.query(`select id from onboarding_plans where kind = 'self'`))[0]?.id as string | undefined);
  if (!id) {
    if (!auth.perms.includes('org.manage') || !writer(c)) return c.json({ plan: null });
    id = await run(c, (q) => ensureSelfPlan(q, org.id, auth.userId, todayOf(c)));
  }
  return c.json({ plan: await fresh(c, id) });
});

/** Just the headline (the side bar's chip): how far, and the next step. */
onboardingPlanRoutes.get('/onboarding/self/summary', async (c) => {
  const out = await run(c, async (q) => {
    const [p] = await q.query(`select id, status from onboarding_plans where kind = 'self'`);
    if (!p) return null;
    const list = await q.query(`select id, key, title_key, title, phase, position, status, depends_on, due_on, side, updated_at, required from onboarding_steps where plan_id = $1`, [p.id]);
    const steps = list.map((x) => ({ id: x.id, key: x.key, phase: x.phase, position: x.position, status: x.status, dependsOn: x.depends_on ?? [], dueOn: day(x.due_on), side: x.side, updatedAt: iso(x.updated_at)!, required: x.required }));
    const counted = steps.filter((x) => x.status !== 'skipped');
    const w = (x: { required: boolean }) => (x.required ? 1 : 0.5);
    const all = counted.reduce((n, x) => n + w(x), 0);
    const done = counted.filter((x) => x.status === 'done').reduce((n, x) => n + w(x), 0);
    const next = steps.find((x) => x.status !== 'done' && x.status !== 'skipped' && unlocked(x, steps));
    const row = next ? list.find((x) => x.id === next.id) : null;
    return { status: p.status, pct: all ? Math.round((done / all) * 100) : 0, next: row ? { key: row.key, titleKey: row.title_key, title: row.title } : null };
  });
  return c.json({ summary: out });
});

// ------------------------------------------------------------------ settings

const settingsInput = z.object({
  fromHandover: z.boolean().optional(),
  templateId: z.string().max(60).nullable().optional(),
  rules: z.array(z.object({ field: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(120), templateId: z.string().min(1).max(60) })).max(MAX_TEMPLATE_RULES).optional(),
});

onboardingPlanRoutes.get('/onboarding/settings', async (c) => c.json({ settings: onboardingSettings(c.get('org').settings) }));

onboardingPlanRoutes.put('/onboarding/settings', async (c) => {
  requireWriter(c);
  requirePerm(c, 'org.manage');
  const input = await body(c, settingsInput);
  const org = c.get('org');
  const next = { ...onboardingSettings(org.settings), ...input };
  await run(c, async (q) => {
    await q.query(`update orgs set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('onboarding', $2::jsonb) where id = $1`, [org.id, JSON.stringify(next)]);
    await audit(q, { orgId: org.id, actorId: c.get('auth').userId, action: 'onboarding.settings', entity: 'org', entityId: org.id, meta: next });
  });
  return c.json({ settings: next });
});

// ------------------------------------------------------------------ the portfolio

/** Every customer plan this person may see, with its progress and stall flags; `account` for one customer's, `open=1` for the running ones. */
onboardingPlanRoutes.get('/onboarding-plans', async (c) => {
  const account = c.req.query('account');
  const plans = await run(c, (q) => listPlans(q, c.get('org').id, todayOf(c), { accountId: account && uuid.safeParse(account).success ? account : null, open: c.req.query('open') === '1' }));
  return c.json({ plans });
});

/** Opens a plan for a customer from a template (the company's default when none is named). */
onboardingPlanRoutes.post('/onboarding-plans', async (c) => {
  requireWriter(c);
  const input = await body(c, z.object({ accountId: uuid, templateId: z.string().max(60).nullable().optional(), name: z.string().trim().min(1).max(160).optional(), ownerId: uuid.nullable().optional(), startOn: isoDate.optional() }));
  const org = c.get('org');
  const auth = c.get('auth');
  const id = await run(c, async (q) => {
    const [a] = await q.query('select id, name from accounts where id = $1 and archived_at is null', [input.accountId]);
    if (!a) fail('not_found');
    const [open] = await q.query(`select id from onboarding_plans where account_id = $1 and status in ('draft', 'active', 'paused')`, [input.accountId]);
    if (open) fail('conflict');
    const tpl = await clientBlueprint(q, org.id, input.templateId ?? null);
    const [dept] = await q.query(`select key from departments where enabled and key in ('onboarding', 'success') order by (key = 'onboarding') desc limit 1`);
    return createPlan(q, {
      orgId: org.id,
      actorId: auth.userId,
      kind: 'client',
      accountId: a.id,
      name: input.name ?? translate(c.get('locale'), 'ob.plan.nameFor', { account: a.name }),
      blueprint: tpl.blueprint,
      templateId: tpl.id,
      department: dept?.key ?? null,
      ownerId: input.ownerId ?? auth.userId,
      welcome: translate(org.locale, 'ob.plan.welcome', { account: a.name }),
      startOn: input.startOn ?? todayOf(c),
      locale: org.locale,
    });
  });
  return c.json({ plan: await fresh(c, id) }, 201);
});

onboardingPlanRoutes.get('/onboarding-plans/:id', async (c) => c.json({ plan: await fresh(c, param(c, 'id')) }));

onboardingPlanRoutes.patch('/onboarding-plans/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(
    c,
    z.object({
      name: z.string().trim().min(1).max(160).optional(),
      status: z.enum(['draft', 'active', 'paused', 'cancelled']).optional(),
      ownerId: uuid.nullable().optional(),
      welcome: z.string().max(4000).optional(),
      note: z.string().max(8000).optional(),
      targetOn: isoDate.nullable().optional(),
      portalVisible: z.boolean().optional(),
    }),
  );
  const org = c.get('org');
  await run(c, async (q) => {
    const sets: string[] = [];
    const vals: unknown[] = [id];
    const put = (col: string, v: unknown) => (vals.push(v), sets.push(`${col} = $${vals.length}`));
    if (input.name !== undefined) put('name', input.name);
    if (input.status !== undefined) put('status', input.status);
    if (input.ownerId !== undefined) put('owner_id', input.ownerId);
    if (input.welcome !== undefined) put('welcome', input.welcome);
    if (input.note !== undefined) put('note', input.note);
    if (input.targetOn !== undefined) put('target_on', input.targetOn);
    if (input.portalVisible !== undefined) put('portal_visible', input.portalVisible);
    if (!sets.length) return;
    const rows = await q.query(`update onboarding_plans set ${sets.join(', ')}, updated_at = now() where id = $1 returning id`, vals);
    if (!rows.length) fail('not_found');
    await audit(q, { orgId: org.id, actorId: c.get('auth').userId, action: 'onboarding.plan_changed', entity: 'org', entityId: org.id, meta: { plan: id, fields: Object.keys(input) } });
  });
  return c.json({ plan: await fresh(c, id) });
});

/** Onboarding is done: the baseline is kept, and a plan that lived in Onboarding is handed to Customer Success. */
onboardingPlanRoutes.post('/onboarding-plans/:id/finish', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const org = c.get('org');
  const handover = await run(c, async (q) => {
    const rows = await q.query(`update onboarding_plans set updated_at = now() where id = $1 and status in ('active', 'paused') returning id`, [id]);
    if (!rows.length) fail('not_found');
    return finishPlan(q, org.id, id, c.get('auth').userId);
  });
  return c.json({ plan: await fresh(c, id), handoverId: handover });
});

// ------------------------------------------------------------------ the report and its link

onboardingPlanRoutes.get('/onboarding-plans/:id/report', async (c) => {
  const plan = await fresh(c, param(c, 'id'));
  return c.json({ report: reportOf(plan, c.get('org').name, nowOf(c.get('deps'))) });
});

/** A read-only link to the progress report, for someone without a seat (the sponsor). The secret is shown once. */
onboardingPlanRoutes.post('/onboarding-plans/:id/share', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const org = c.get('org');
  const secret = randomToken(24);
  await run(c, async (q) => {
    const rows = await q.query('update onboarding_plans set share_hash = $2, share_at = now(), updated_at = now() where id = $1 returning id', [id, await sha256Hex(secret)]);
    if (!rows.length) fail('not_found');
    await audit(q, { orgId: org.id, actorId: c.get('auth').userId, action: 'onboarding.shared', entity: 'org', entityId: org.id, meta: { plan: id } });
  });
  return c.json({ url: `${orgUrl(c.get('deps').config, org.slug)}/r/onboarding/${secret}` }, 201);
});

onboardingPlanRoutes.delete('/onboarding-plans/:id/share', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  await run(c, async (q) => {
    const rows = await q.query('update onboarding_plans set share_hash = null, share_at = null, updated_at = now() where id = $1 returning id', [id]);
    if (!rows.length) fail('not_found');
  });
  return c.json({ ok: true });
});

/** The shared report: only what the report shows (no notes, no people, no e-mail addresses). */
onboardingShareRoutes.get('/share/onboarding/:secret', async (c) => {
  const secret = c.req.param('secret');
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(secret)) fail('not_found');
  const org = c.get('org');
  const deps = c.get('deps');
  const hash = await sha256Hex(secret);
  const id = await deps.db.system(async (q) => (await q.query('select id from onboarding_plans where org_id = $1 and share_hash = $2', [org.id, hash]))[0]?.id as string | undefined);
  if (!id) fail('not_found');
  const now = nowOf(deps);
  const report = await deps.db.system(async (q) => {
    await advancePlan(q, org.id, id!);
    const plan = await readPlan(q, org.id, id!, todayOf(c), false);
    return plan ? reportOf(plan, org.name, now) : null;
  });
  if (!report) fail('not_found');
  c.header('cache-control', 'no-store');
  c.header('x-robots-tag', 'noindex');
  return c.json({ report });
});

// ------------------------------------------------------------------ steps

const stepInput = z.object({
  status: z.enum(['todo', 'doing', 'done', 'blocked', 'skipped']).optional(),
  ownerId: uuid.nullable().optional(),
  personId: uuid.nullable().optional(),
  startOn: isoDate.nullable().optional(),
  dueOn: isoDate.nullable().optional(),
  delayReason: z.string().max(500).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().max(2000).optional(),
  required: z.boolean().optional(),
});

/** A step of its own, written here (not from the template). */
onboardingPlanRoutes.post('/onboarding-plans/:id/steps', async (c) => {
  requireWriter(c);
  const planId = param(c, 'id');
  const input = await body(c, z.object({ title: z.string().trim().min(1).max(200), body: z.string().max(2000).default(''), phase: z.string().regex(PHASE_KEY), side: z.enum(['vendor', 'customer', 'both']), dueOn: isoDate.nullable().optional(), after: z.array(z.string().max(60)).max(10).default([]), required: z.boolean().default(true) }));
  const org = c.get('org');
  await run(c, async (q) => {
    const [p] = await q.query('select id from onboarding_plans where id = $1', [planId]);
    if (!p) fail('not_found');
    const keys = (await q.query<{ key: string }>('select key from onboarding_steps where plan_id = $1', [planId])).map((r) => r.key);
    let key = `own${keys.length + 1}`;
    while (keys.includes(key)) key = `${key}x`;
    await q.query(
      `insert into onboarding_steps (org_id, plan_id, key, title, body, phase, position, side, due_on, start_on, depends_on, required)
       values ($1, $2, $3, $4, $5, $6, 1000 + $7, $8, $9, $12, $10, $11)`,
      [org.id, planId, key, input.title, input.body, input.phase, keys.length, input.side, input.dueOn ?? null, input.after.filter((k) => keys.includes(k)), input.required, todayOf(c)],
    );
    await touch(q, planId);
  });
  return c.json({ plan: await fresh(c, planId) }, 201);
});

onboardingPlanRoutes.patch('/onboarding-steps/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, stepInput);
  const auth = c.get('auth');
  const org = c.get('org');
  const planId = await run(c, async (q) => {
    const [s] = await q.query('select * from onboarding_steps where id = $1', [id]);
    if (!s) fail('not_found');
    if (input.status === 'done' && s.status !== 'done') {
      // Only what the product cannot see is ticked by hand; the rest completes by itself.
      if (s.signal && isSignal(s.signal)) fail('validation', { fields: 'status' }, { fields: ['status'], reason: 'automatic' });
      const others = await q.query('select key, status, depends_on from onboarding_steps where plan_id = $1', [s.plan_id]);
      if (!unlocked({ dependsOn: s.depends_on ?? [] }, others.map((x) => ({ ...x, dependsOn: x.depends_on ?? [] })) as any)) fail('conflict');
    }
    const sets: string[] = [];
    const vals: unknown[] = [id];
    const put = (col: string, v: unknown) => (vals.push(v), sets.push(`${col} = $${vals.length}`));
    if (input.status !== undefined) {
      put('status', input.status);
      if (input.status === 'done') {
        put('done_at', new Date());
        put('done_by', auth.userId);
        put('done_how', 'manual');
      } else if (s.status === 'done') {
        sets.push('done_at = null', 'done_by = null', 'done_how = null');
      }
    }
    if (input.ownerId !== undefined) put('owner_id', input.ownerId);
    if (input.personId !== undefined) put('person_id', input.personId);
    if (input.startOn !== undefined) put('start_on', input.startOn);
    if (input.dueOn !== undefined) put('due_on', input.dueOn);
    if (input.delayReason !== undefined) put('delay_reason', input.delayReason);
    if (input.title !== undefined) put('title', input.title);
    if (input.body !== undefined) put('body', input.body);
    if (input.required !== undefined) put('required', input.required);
    // A new owner hears it is their turn again.
    if (input.ownerId !== undefined || input.personId !== undefined) sets.push('nudged_at = null');
    if (sets.length) {
      const rows = await q.query(`update onboarding_steps set ${sets.join(', ')}, updated_at = now() where id = $1 returning id`, vals);
      if (!rows.length) fail('not_found');
    }
    await touch(q, s.plan_id);
    if (input.status) await audit(q, { orgId: org.id, actorId: auth.userId, action: 'onboarding.step', entity: 'org', entityId: org.id, meta: { plan: s.plan_id, step: s.key, status: input.status } });
    return s.plan_id as string;
  });
  return c.json({ plan: await fresh(c, planId) });
});

onboardingPlanRoutes.delete('/onboarding-steps/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const planId = await run(c, async (q) => {
    const [s] = await q.query('delete from onboarding_steps where id = $1 returning plan_id, key', [id]);
    if (!s) fail('not_found');
    // Nothing waits for a step that is gone.
    await q.query('update onboarding_steps set depends_on = array_remove(depends_on, $2) where plan_id = $1', [s.plan_id, s.key]);
    await touch(q, s.plan_id);
    return s.plan_id as string;
  });
  return c.json({ plan: await fresh(c, planId) });
});

/**
 * The plan's phases, made its own: renamed, reordered, added (no key yet) or removed. Its template
 * is not touched. A phase that still has steps cannot go: move or remove them first.
 */
onboardingPlanRoutes.put('/onboarding-plans/:id/phases', async (c) => {
  requireWriter(c);
  const planId = param(c, 'id');
  const input = await body(c, z.object({ phases: z.array(z.object({ key: z.string().regex(PHASE_KEY).optional(), name: z.string().trim().max(60).nullable() })).min(1).max(MAX_PHASES) }));
  await run(c, async (q) => {
    const [p] = await q.query('select id, phases from onboarding_plans where id = $1', [planId]);
    if (!p) fail('not_found');
    const used = (await q.query<{ phase: string }>('select distinct phase from onboarding_steps where plan_id = $1', [planId])).map((r) => r.phase);
    const known = phaseOrder(p.phases, used).map((x) => x.key);
    let n = 1;
    const next = input.phases.map((x) => {
      if (x.key) return { key: x.key, name: x.name || null };
      while (known.includes(`ph${n}`) || input.phases.some((y) => y.key === `ph${n}`)) n++;
      known.push(`ph${n}`);
      return { key: `ph${n}`, name: x.name || null };
    });
    // A new phase needs a name: it has none in any language.
    if (next.some((x) => !x.name && !PHASE_KEY_BUILT_IN(x.key))) fail('validation', { fields: 'phases' }, { fields: ['phases'], reason: 'name' });
    if (new Set(next.map((x) => x.key)).size !== next.length) fail('validation', { fields: 'phases' }, { fields: ['phases'] });
    if (used.some((u) => !next.some((x) => x.key === u))) fail('conflict', undefined, { reason: 'phase_has_steps' });
    await q.query('update onboarding_plans set phases = $2, updated_at = now() where id = $1', [planId, JSON.stringify(next)]);
  });
  return c.json({ plan: await fresh(c, planId) });
});

/** The steps of one phase in a new order (they may come from another phase: they move into this one). */
onboardingPlanRoutes.put('/onboarding-plans/:id/steps/order', async (c) => {
  requireWriter(c);
  const planId = param(c, 'id');
  const input = await body(c, z.object({ phase: z.string().regex(PHASE_KEY), ids: z.array(uuid).min(1).max(200) }));
  await run(c, async (q) => {
    const [p] = await q.query('select id, phases from onboarding_plans where id = $1', [planId]);
    if (!p) fail('not_found');
    const used = (await q.query<{ phase: string }>('select distinct phase from onboarding_steps where plan_id = $1', [planId])).map((r) => r.phase);
    if (!phaseOrder(p.phases, used).some((x) => x.key === input.phase) && !PHASE_KEY_BUILT_IN(input.phase)) fail('validation', { fields: 'phase' }, { fields: ['phase'] });
    const rows = await q.query(
      `update onboarding_steps s set phase = $2, position = o.n - 1, updated_at = now()
         from unnest($3::uuid[]) with ordinality o(id, n) where s.id = o.id and s.plan_id = $1 returning s.id`,
      [planId, input.phase, input.ids],
    );
    if (rows.length !== new Set(input.ids).size) fail('not_found');
    await touch(q, planId);
  });
  return c.json({ plan: await fresh(c, planId) });
});

/** A draft that waits for its template ("ask each time"): made again from the one chosen. Returns the new plan. */
onboardingPlanRoutes.post('/onboarding-plans/:id/template', async (c) => {
  requireWriter(c);
  const planId = param(c, 'id');
  const input = await body(c, z.object({ templateId: z.string().min(1).max(60) }));
  const org = c.get('org');
  const newId = await run(c, async (q) => {
    const [p] = await q.query('select * from onboarding_plans where id = $1', [planId]);
    if (!p) fail('not_found');
    const [has] = await q.query('select 1 from onboarding_steps where plan_id = $1 limit 1', [planId]);
    if (p.kind !== 'client' || p.status !== 'draft' || has) fail('conflict');
    const tpl = await clientBlueprint(q, org.id, input.templateId);
    await q.query('delete from onboarding_plans where id = $1', [planId]);
    return createPlan(q, {
      orgId: org.id, actorId: c.get('auth').userId, kind: 'client', accountId: p.account_id, name: p.name, blueprint: tpl.blueprint, templateId: tpl.id,
      handoverId: p.handover_id, status: 'draft', department: p.department, ownerId: p.owner_id, note: p.note, welcome: p.welcome, startOn: todayOf(c),
      locale: c.get('locale'),
    });
  });
  return c.json({ plan: await fresh(c, newId) }, 201);
});

/** A step's short form: the answers are written to the customer's own fields, then the step is done. */
onboardingPlanRoutes.post('/onboarding-steps/:id/answer', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ values: z.record(z.string(), z.string().max(500)) }));
  const auth = c.get('auth');
  const org = c.get('org');
  const planId = await run(c, async (q) => {
    const [s] = await q.query('select s.*, p.account_id from onboarding_steps s join onboarding_plans p on p.id = s.plan_id where s.id = $1', [id]);
    if (!s) fail('not_found');
    if (!s.account_id || !(s.form ?? []).length) fail('validation', { fields: 'values' }, { fields: ['values'] });
    const keys = Object.keys(input.values).filter((k) => s.form.includes(k));
    if (!keys.length) fail('validation', { fields: 'values' }, { fields: ['values'] });
    const rows = await q.query(`update accounts set fields = fields || $2::jsonb, updated_at = now() where id = $1 returning id`, [s.account_id, JSON.stringify(Object.fromEntries(keys.map((k) => [k, input.values[k]])))]);
    if (!rows.length) fail('not_found');
    await q.query(`update onboarding_steps set status = 'done', done_at = now(), done_by = $2, done_how = 'manual', updated_at = now() where id = $1 and status <> 'done'`, [id, auth.userId]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'onboarding.answered', entity: 'account', entityId: s.account_id, meta: { plan: s.plan_id, fields: keys } });
    await refreshMapping(q, org.id, s.plan_id);
    return s.plan_id as string;
  });
  return c.json({ plan: await fresh(c, planId) });
});

/** A file for a step (a signed form, an export): kept with the step, like any other file. */
onboardingPlanRoutes.post('/onboarding-steps/:id/files', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  const deps = c.get('deps');
  const f = await readUpload(c);
  const key = `${org.id}/onboarding/${id}/${crypto.randomUUID()}`;
  const planId = await run(c, async (q) => {
    const [s] = await q.query('select plan_id, upload from onboarding_steps where id = $1', [id]);
    if (!s) fail('not_found');
    // The plan's storage cap (shared/src/plans.json), before anything is stored.
    await checkStorage(q, org.id, accessFor(c), f.size);
    await deps.storage.put(key, f.data, f.mime);
    const [r] = await q.query(
      `insert into files (org_id, onboarding_step_id, name, size, mime, storage_key, uploaded_by) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [org.id, id, f.name, f.size, f.mime, key, auth.userId],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'file.uploaded', entity: 'file', entityId: r.id, meta: { name: f.name, plan: s.plan_id } });
    await touch(q, s.plan_id);
    return s.plan_id as string;
  });
  await quarantine(deps, org.id, key);
  return c.json({ plan: await fresh(c, planId) }, 201);
});

/** The step waits for Product: it becomes one more customer request on that story (the backlog counts it). */
onboardingPlanRoutes.post('/onboarding-steps/:id/request', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ storyId: uuid, note: z.string().trim().max(2000).optional() }));
  const org = c.get('org');
  const planId = await run(c, async (q) => {
    const [s] = await q.query('select s.plan_id, p.account_id from onboarding_steps s join onboarding_plans p on p.id = s.plan_id where s.id = $1', [id]);
    if (!s) fail('not_found');
    if (!s.account_id) fail('validation', { fields: 'storyId' }, { fields: ['storyId'] });
    const [r] = await q.query('select app_link_request($1, $2, $3, $4, $5) as id', [input.storyId, s.account_id, 'onboarding', id, input.note ?? '']);
    if (!r?.id) fail('not_found');
    await q.query('update onboarding_steps set task_id = $2, updated_at = now() where id = $1', [id, input.storyId]);
    await audit(q, { orgId: org.id, actorId: c.get('auth').userId, action: 'request.linked', entity: 'account', entityId: s.account_id, meta: { story: input.storyId, source: 'onboarding' } });
    return s.plan_id as string;
  });
  return c.json({ plan: await fresh(c, planId) });
});

// ------------------------------------------------------------------ the people of both sides

const personInput = z.object({
  side: z.enum(SIDES),
  name: z.string().trim().min(1).max(120),
  role: z.enum(ROLES).default('other'),
  duty: z.string().trim().max(300).default(''),
  contact: z.string().trim().max(200).default(''),
  userId: uuid.nullable().optional(),
});

onboardingPlanRoutes.post('/onboarding-plans/:id/people', async (c) => {
  requireWriter(c);
  const planId = param(c, 'id');
  const input = await body(c, personInput);
  await run(c, async (q) => {
    const [p] = await q.query('select id from onboarding_plans where id = $1', [planId]);
    if (!p) fail('not_found');
    if (input.userId && !(await q.query('select 1 from users where id = $1', [input.userId])).length) fail('bad_assignee');
    await q.query(
      `insert into onboarding_people (org_id, plan_id, side, user_id, name, role, duty, contact, position)
       values ($1, $2, $3, $4, $5, $6, $7, $8, (select count(*) from onboarding_people where plan_id = $2))`,
      [c.get('org').id, planId, input.side, input.userId ?? null, input.name, input.role, input.duty, input.contact],
    );
    await touch(q, planId);
  });
  return c.json({ plan: await fresh(c, planId) }, 201);
});

onboardingPlanRoutes.patch('/onboarding-people/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, patchOf(personInput));
  const planId = await run(c, async (q) => {
    const planId = await planOfChild(q, 'onboarding_people', id);
    await q.query(
      `update onboarding_people set side = coalesce($2, side), name = coalesce($3, name), role = coalesce($4, role), duty = coalesce($5, duty), contact = coalesce($6, contact),
              user_id = case when $7::boolean then $8 else user_id end where id = $1`,
      [id, input.side ?? null, input.name ?? null, input.role ?? null, input.duty ?? null, input.contact ?? null, input.userId !== undefined, input.userId ?? null],
    );
    await touch(q, planId);
    return planId;
  });
  return c.json({ plan: await fresh(c, planId) });
});

onboardingPlanRoutes.delete('/onboarding-people/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const planId = await run(c, async (q) => {
    const planId = await planOfChild(q, 'onboarding_people', id);
    await q.query('delete from onboarding_people where id = $1', [id]);
    await touch(q, planId);
    return planId;
  });
  return c.json({ plan: await fresh(c, planId) });
});

// ------------------------------------------------------------------ goals

const goalInput = z.object({
  title: z.string().trim().min(1).max(200),
  priority: z.enum(GOAL_PRIORITIES).default('must'),
  status: z.enum(GOAL_STATUSES).default('planned'),
  targetOn: isoDate.nullable().optional(),
  doneOn: isoDate.nullable().optional(),
  proofUrl: z.string().trim().max(500).regex(/^https?:\/\//).nullable().optional(),
});

onboardingPlanRoutes.post('/onboarding-plans/:id/goals', async (c) => {
  requireWriter(c);
  const planId = param(c, 'id');
  const input = await body(c, goalInput);
  await run(c, async (q) => {
    const [p] = await q.query('select id from onboarding_plans where id = $1', [planId]);
    if (!p) fail('not_found');
    await q.query(
      `insert into onboarding_goals (org_id, plan_id, title, priority, status, target_on, proof_url, position) values ($1, $2, $3, $4, $5, $6, $7, (select count(*) from onboarding_goals where plan_id = $2))`,
      [c.get('org').id, planId, input.title, input.priority, input.status, input.targetOn ?? null, input.proofUrl ?? null],
    );
    await touch(q, planId);
  });
  return c.json({ plan: await fresh(c, planId) }, 201);
});

onboardingPlanRoutes.patch('/onboarding-goals/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, patchOf(goalInput));
  const planId = await run(c, async (q) => {
    const planId = await planOfChild(q, 'onboarding_goals', id);
    await q.query(
      `update onboarding_goals set title = case when $2::text is null then title else $2 end, title_key = case when $2::text is null then title_key else null end,
              priority = coalesce($3, priority), status = coalesce($4, status),
              target_on = case when $5::boolean then $6::date else target_on end,
              done_on = case when $4 = 'done' and done_on is null then $9::date when $4 is not null and $4 <> 'done' then null else done_on end,
              proof_url = case when $7::boolean then $8 else proof_url end where id = $1`,
      [id, input.title ?? null, input.priority ?? null, input.status ?? null, input.targetOn !== undefined, input.targetOn ?? null, input.proofUrl !== undefined, input.proofUrl ?? null, todayOf(c)],
    );
    await touch(q, planId);
    return planId;
  });
  return c.json({ plan: await fresh(c, planId) });
});

onboardingPlanRoutes.delete('/onboarding-goals/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const planId = await run(c, async (q) => {
    const planId = await planOfChild(q, 'onboarding_goals', id);
    await q.query('delete from onboarding_goals where id = $1', [id]);
    return planId;
  });
  return c.json({ plan: await fresh(c, planId) });
});

// ------------------------------------------------------------------ shared issues

const issueInput = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(4000).default(''),
  side: z.enum(SIDES).default('vendor'),
  type: z.enum(ISSUE_TYPES).default('question'),
  urgency: z.enum(URGENCIES).default('normal'),
  dueOn: isoDate.nullable().optional(),
  stepId: uuid.nullable().optional(),
});

onboardingPlanRoutes.post('/onboarding-plans/:id/issues', async (c) => {
  requireWriter(c);
  const planId = param(c, 'id');
  const input = await body(c, issueInput);
  await run(c, async (q) => {
    const [p] = await q.query('select id from onboarding_plans where id = $1', [planId]);
    if (!p) fail('not_found');
    await q.query(
      `insert into onboarding_issues (org_id, plan_id, step_id, title, body, side, type, urgency, due_on, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [c.get('org').id, planId, input.stepId ?? null, input.title, input.body, input.side, input.type, input.urgency, input.dueOn ?? null, c.get('auth').userId],
    );
    await touch(q, planId);
  });
  return c.json({ plan: await fresh(c, planId) }, 201);
});

onboardingPlanRoutes.patch('/onboarding-issues/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, patchOf(issueInput.extend({ status: z.enum(ISSUE_STATUSES).optional() })));
  const planId = await run(c, async (q) => {
    const planId = await planOfChild(q, 'onboarding_issues', id);
    await q.query(
      `update onboarding_issues set title = coalesce($2, title), body = coalesce($3, body), side = coalesce($4, side), type = coalesce($5, type), urgency = coalesce($6, urgency),
              due_on = case when $7::boolean then $8::date else due_on end, status = coalesce($9, status),
              resolved_at = case when $9 = 'resolved' then coalesce(resolved_at, now()) when $9 is not null then null else resolved_at end, updated_at = now() where id = $1`,
      [id, input.title ?? null, input.body ?? null, input.side ?? null, input.type ?? null, input.urgency ?? null, input.dueOn !== undefined, input.dueOn ?? null, input.status ?? null],
    );
    await touch(q, planId);
    return planId;
  });
  return c.json({ plan: await fresh(c, planId) });
});

/** The issue IS this support ticket (no copy): the ticket's status decides when it is resolved. `recordId: null` unlinks it. */
onboardingPlanRoutes.post('/onboarding-issues/:id/ticket', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ recordId: uuid.nullable() }));
  const planId = await run(c, async (q) => {
    const [i] = await q.query('select i.plan_id, p.account_id from onboarding_issues i join onboarding_plans p on p.id = i.plan_id where i.id = $1', [id]);
    if (!i) fail('not_found');
    if (input.recordId) {
      const [t] = await q.query(`select r.id, r.account_id from records r join record_types rt on rt.id = r.type_id where r.id = $1 and rt.kind = 'ticket' and r.archived_at is null`, [input.recordId]);
      if (!t || (i.account_id && t.account_id !== i.account_id)) fail('not_found');
      // One ticket, one issue.
      const [other] = await q.query('select id from onboarding_issues where record_id = $1 and plan_id = $2 and id <> $3', [input.recordId, i.plan_id, id]);
      if (other) fail('conflict');
    }
    await q.query('update onboarding_issues set record_id = $2, updated_at = now() where id = $1', [id, input.recordId]);
    await touch(q, i.plan_id);
    return i.plan_id as string;
  });
  return c.json({ plan: await fresh(c, planId) });
});

onboardingPlanRoutes.delete('/onboarding-issues/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const planId = await run(c, async (q) => {
    const planId = await planOfChild(q, 'onboarding_issues', id);
    // A failed test's row goes away only when the test passes.
    const rows = await q.query(`delete from onboarding_issues where id = $1 and source <> 'setup_test' returning id`, [id]);
    if (!rows.length) fail('conflict');
    return planId;
  });
  return c.json({ plan: await fresh(c, planId) });
});

// ------------------------------------------------------------------ the data-mapping table

const fieldInput = z.object({
  name: z.string().trim().min(1).max(120),
  target: z.string().trim().max(120).default(''),
  type: z.enum(FIELD_TYPES).default('text'),
  required: z.boolean().default(false),
  example: z.string().max(300).default(''),
  received: z.string().max(300).nullable().optional(),
  proofUrl: z.string().trim().max(500).regex(/^https?:\/\//).nullable().optional(),
});

onboardingPlanRoutes.post('/onboarding-plans/:id/fields', async (c) => {
  requireWriter(c);
  const planId = param(c, 'id');
  const input = await body(c, fieldInput);
  const org = c.get('org');
  await run(c, async (q) => {
    const [p] = await q.query('select id from onboarding_plans where id = $1', [planId]);
    if (!p) fail('not_found');
    const rows = await q.query(
      `insert into onboarding_fields (org_id, plan_id, source, name, target, type, required, example, received, received_at, proof_url, position)
       values ($1, $2, 'custom', $3, $4, $5, $6, $7, $8, case when $8::text is null then null else now() end, $9, (select count(*) from onboarding_fields where plan_id = $2))
       on conflict do nothing returning id`,
      [org.id, planId, input.name, input.target, input.type, input.required, input.example, input.received ?? null, input.proofUrl ?? null],
    );
    if (!rows.length) fail('conflict');
    await judgeFields(q, org.id, planId);
    await touch(q, planId);
  });
  return c.json({ plan: await fresh(c, planId) }, 201);
});

/** Edit a row, or tick it: `checked` (the customer says it looks right), `verified` (the company's side checked it too). */
onboardingPlanRoutes.patch('/onboarding-fields/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, patchOf(fieldInput.extend({ checked: z.boolean().optional(), verified: z.boolean().optional() })));
  const org = c.get('org');
  const auth = c.get('auth');
  const planId = await run(c, async (q) => {
    const planId = await planOfChild(q, 'onboarding_fields', id);
    await q.query(
      `update onboarding_fields set name = coalesce($2, name), target = coalesce($3, target), type = coalesce($4, type), required = coalesce($5, required), example = coalesce($6, example),
              received = case when $7::boolean then $8 else received end, received_at = case when $7::boolean then now() else received_at end,
              proof_url = case when $9::boolean then $10 else proof_url end,
              checked_at = case when $11::boolean is null then checked_at when $11 then now() else null end,
              checked_by = case when $11::boolean is null then checked_by when $11 then $13 else null end,
              verified_at = case when $12::boolean is null then verified_at when $12 then now() else null end,
              verified_by = case when $12::boolean is null then verified_by when $12 then $14::uuid else null end
        where id = $1`,
      [id, input.name ?? null, input.target ?? null, input.type ?? null, input.required ?? null, input.example ?? null, input.received !== undefined, input.received ?? null,
       input.proofUrl !== undefined, input.proofUrl ?? null, input.checked ?? null, input.verified ?? null, auth.name.slice(0, 120), auth.userId],
    );
    await judgeFields(q, org.id, planId);
    await touch(q, planId);
    return planId;
  });
  return c.json({ plan: await fresh(c, planId) });
});

onboardingPlanRoutes.delete('/onboarding-fields/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const planId = await run(c, async (q) => {
    const planId = await planOfChild(q, 'onboarding_fields', id);
    await q.query('delete from onboarding_fields where id = $1', [id]);
    return planId;
  });
  return c.json({ plan: await fresh(c, planId) });
});

// ------------------------------------------------------------------ sites and metrics

const siteInput = z.object({ name: z.string().trim().min(1).max(120), region: z.string().trim().max(80).default(''), stages: z.partialRecord(z.enum(PHASES_BUILT_IN), z.enum(SITE_STATUSES)).default({}) });

onboardingPlanRoutes.post('/onboarding-plans/:id/sites', async (c) => {
  requireWriter(c);
  const planId = param(c, 'id');
  const input = await body(c, siteInput);
  await run(c, async (q) => {
    const [p] = await q.query('select id from onboarding_plans where id = $1', [planId]);
    if (!p) fail('not_found');
    await q.query(`insert into onboarding_sites (org_id, plan_id, name, region, stages, position) values ($1, $2, $3, $4, $5, (select count(*) from onboarding_sites where plan_id = $2))`, [
      c.get('org').id, planId, input.name, input.region, JSON.stringify(input.stages),
    ]);
    await touch(q, planId);
  });
  return c.json({ plan: await fresh(c, planId) }, 201);
});

onboardingPlanRoutes.patch('/onboarding-sites/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, patchOf(siteInput));
  const planId = await run(c, async (q) => {
    const planId = await planOfChild(q, 'onboarding_sites', id);
    await q.query(`update onboarding_sites set name = coalesce($2, name), region = coalesce($3, region), stages = stages || coalesce($4::jsonb, '{}'::jsonb) where id = $1`, [
      id, input.name ?? null, input.region ?? null, input.stages ? JSON.stringify(input.stages) : null,
    ]);
    await touch(q, planId);
    return planId;
  });
  return c.json({ plan: await fresh(c, planId) });
});

onboardingPlanRoutes.delete('/onboarding-sites/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const planId = await run(c, async (q) => {
    const planId = await planOfChild(q, 'onboarding_sites', id);
    await q.query('delete from onboarding_sites where id = $1', [id]);
    return planId;
  });
  return c.json({ plan: await fresh(c, planId) });
});

/** A before/after figure: its baseline (the old way), where it is now, and the target. */
onboardingPlanRoutes.patch('/onboarding-metrics/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const n = z.number().finite().nullable().optional();
  const input = await body(c, z.object({ title: z.string().trim().min(1).max(120).optional(), unit: z.string().trim().max(20).optional(), baseline: n, current: n, target: n, better: z.enum(['up', 'down']).optional() }));
  const planId = await run(c, async (q) => {
    const planId = await planOfChild(q, 'onboarding_metrics', id);
    const keep = (k: keyof typeof input) => input[k] !== undefined;
    await q.query(
      `update onboarding_metrics set title = coalesce($2, title), title_key = case when $2::text is null then title_key else null end, unit = coalesce($3, unit), better = coalesce($4, better),
              baseline = case when $5::boolean then $6::numeric else baseline end, current = case when $7::boolean then $8::numeric else current end,
              target = case when $9::boolean then $10::numeric else target end, updated_at = now() where id = $1`,
      [id, input.title ?? null, input.unit ?? null, input.better ?? null, keep('baseline'), input.baseline ?? null, keep('current'), input.current ?? null, keep('target'), input.target ?? null],
    );
    await touch(q, planId);
    return planId;
  });
  return c.json({ plan: await fresh(c, planId) });
});

// ------------------------------------------------------------------ templates

const phaseShape = z.object({ key: z.string().regex(PHASE_KEY), name: z.string().trim().max(60).nullable() });
const stepShape = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9_.-]{0,60}$/),
  phase: z.string().regex(PHASE_KEY),
  titleKey: z.string().max(60).optional(),
  title: z.string().trim().max(200).optional(),
  body: z.string().max(2000).optional(),
  side: z.enum(['vendor', 'customer', 'both']),
  signal: z.string().max(60).refine(isSignal).optional(),
  days: z.number().int().min(0).max(365).optional(),
  hours: z.number().min(0).max(1000).optional(),
  after: z.array(z.string().max(60)).max(10).optional(),
  form: z.array(z.string().max(60)).max(10).optional(),
  upload: z.literal(true).optional(),
  optional: z.literal(true).optional(),
});
const blueprintShape = z.object({
  phases: z.array(phaseShape).max(MAX_PHASES).optional(),
  steps: z.array(stepShape).min(1).max(60),
  goals: z.array(z.object({ titleKey: z.string().max(60).optional(), title: z.string().trim().max(200).optional(), priority: z.enum(GOAL_PRIORITIES), days: z.number().int().min(0).max(730).optional() })).max(20).default([]),
  metrics: z.array(z.object({ titleKey: z.string().max(60).optional(), title: z.string().trim().max(120).optional(), unit: z.string().max(20), better: z.enum(['up', 'down']) })).max(12).default([]),
  fields: z.array(z.object({ name: z.string().trim().min(1).max(120), type: z.enum(FIELD_TYPES), required: z.boolean(), example: z.string().max(300).optional() })).max(60).default([]),
  sites: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  days: z.number().int().min(1).max(730).optional(),
});

const toTemplate = (r: Row): Template => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  summary: r.summary ?? '',
  builtIn: r.built_in ?? null,
  blueprint: r.body as Blueprint,
  updatedAt: iso(r.updated_at)!,
  used: Number(r.used ?? 0),
  finished: Number(r.finished ?? 0),
});

/** The built-in templates (to copy) and the company's own, with how often each was used and finished. */
onboardingPlanRoutes.get('/onboarding-templates', async (c) => {
  const rows = await run(c, (q) =>
    q.query(
      `select t.*, (select count(*) from onboarding_plans p where p.template_id = t.id) as used,
              (select count(*) from onboarding_plans p where p.template_id = t.id and p.status = 'done') as finished
         from onboarding_templates t where t.archived_at is null order by t.kind, t.name`,
    ),
  );
  return c.json({ builtIn: BUILT_IN_TEMPLATES.map((t) => ({ key: t.key, kind: t.kind, blueprint: t.blueprint })), templates: rows.map(toTemplate) });
});

/** Make a template: from a built-in one (`from: "standard"`), a copy of the company's own (`from: <id>`), a running plan (`fromPlan`), or written out (`blueprint`). */
onboardingPlanRoutes.post('/onboarding-templates', async (c) => {
  requireWriter(c);
  const input = await body(c, z.object({ name: z.string().trim().min(1).max(120), summary: z.string().max(1000).default(''), kind: z.enum(['self', 'client']).optional(), from: z.string().max(60).optional(), fromPlan: uuid.optional(), blueprint: blueprintShape.optional() }));
  const org = c.get('org');
  const row = await run(c, async (q) => {
    let bp: Blueprint | null = (input.blueprint as Blueprint | undefined) ?? null;
    let kind = input.kind ?? 'client';
    let builtIn: string | null = null;
    if (!bp && input.from && builtInTemplate(input.from)) {
      const t = builtInTemplate(input.from)!;
      bp = t.blueprint;
      kind = t.kind;
      builtIn = t.key;
    } else if (!bp && input.from && uuid.safeParse(input.from).success) {
      const [t] = await q.query('select kind, body, built_in from onboarding_templates where id = $1', [input.from]);
      if (!t) fail('not_found');
      bp = t.body;
      kind = t.kind;
      builtIn = t.built_in;
    } else if (!bp && input.fromPlan) {
      bp = await blueprintOfPlan(q, input.fromPlan);
      kind = (await q.query('select kind from onboarding_plans where id = $1', [input.fromPlan]))[0]?.kind ?? kind;
    }
    if (!bp) fail('validation', { fields: 'blueprint' }, { fields: ['blueprint'] });
    const [r] = await q.query(
      `insert into onboarding_templates (org_id, kind, name, summary, body, built_in, created_by) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [org.id, kind, input.name, input.summary, JSON.stringify(bp), builtIn, c.get('auth').userId],
    );
    await audit(q, { orgId: org.id, actorId: c.get('auth').userId, action: 'onboarding.template_created', entity: 'org', entityId: org.id, meta: { template: r.id } });
    return r;
  });
  return c.json({ template: toTemplate(row) }, 201);
});

onboardingPlanRoutes.patch('/onboarding-templates/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ name: z.string().trim().min(1).max(120).optional(), summary: z.string().max(1000).optional(), blueprint: blueprintShape.optional() }));
  const row = await run(c, async (q) => {
    const [r] = await q.query(
      `update onboarding_templates set name = coalesce($2, name), summary = coalesce($3, summary), body = coalesce($4::jsonb, body), updated_at = now() where id = $1 and archived_at is null returning *`,
      [id, input.name ?? null, input.summary ?? null, input.blueprint ? JSON.stringify(input.blueprint) : null],
    );
    if (!r) fail('not_found');
    return r;
  });
  return c.json({ template: toTemplate(row) });
});

/** Put away: plans made from it keep everything they have. */
onboardingPlanRoutes.delete('/onboarding-templates/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  await run(c, async (q) => {
    const rows = await q.query('update onboarding_templates set archived_at = now() where id = $1 and archived_at is null returning id', [id]);
    if (!rows.length) fail('not_found');
  });
  return c.json({ ok: true });
});

/** A running plan as a template: its steps (with their order, sides and links), goals, mapping rows and metrics. */
async function blueprintOfPlan(q: Q, planId: string): Promise<Blueprint> {
  const [p] = await q.query('select started_on, target_on, phases from onboarding_plans where id = $1', [planId]);
  if (!p) fail('not_found');
  const steps = await q.query('select * from onboarding_steps where plan_id = $1 order by position', [planId]);
  // The plan's own phases, in its order, travel with the template (only when it changed them).
  const own = phaseOrder(p.phases, steps.map((s) => s.phase as string));
  const goals = await q.query('select * from onboarding_goals where plan_id = $1 order by position', [planId]);
  const metrics = await q.query('select * from onboarding_metrics where plan_id = $1 order by position', [planId]);
  const fields = await q.query(`select * from onboarding_fields where plan_id = $1 and source = 'custom' order by position`, [planId]);
  const start = day(p.started_on)!;
  const diff = (d: unknown) => (d ? Math.max(0, Math.round((Date.parse(`${day(d)}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400_000)) : undefined);
  return {
    ...(Array.isArray(p.phases) && p.phases.length ? { phases: own } : {}),
    days: diff(p.target_on),
    steps: steps.map((s) => ({
      key: s.key,
      phase: s.phase,
      side: s.side,
      ...(s.title_key ? { titleKey: s.title_key } : {}),
      ...(s.title ? { title: s.title } : {}),
      ...(s.body ? { body: s.body } : {}),
      ...(s.signal ? { signal: s.signal } : {}),
      days: s.effort_days ?? 1,
      ...(s.hands_on_hours != null ? { hours: Number(s.hands_on_hours) } : {}),
      after: s.depends_on ?? [],
      ...(s.form?.length ? { form: s.form } : {}),
      ...(s.upload ? { upload: true as const } : {}),
      ...(s.required ? {} : { optional: true as const }),
    })),
    goals: goals.map((g) => ({ ...(g.title_key ? { titleKey: g.title_key } : {}), ...(g.title ? { title: g.title } : {}), priority: g.priority, days: diff(g.target_on) })),
    metrics: metrics.map((m) => ({ ...(m.title_key ? { titleKey: m.title_key } : {}), ...(m.title ? { title: m.title } : {}), unit: m.unit, better: m.better })),
    fields: fields.map((f) => ({ name: f.name, type: f.type, required: f.required, ...(f.example ? { example: f.example } : {}) })),
  };
}
