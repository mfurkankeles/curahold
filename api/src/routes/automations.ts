// Automations: plain-language rules an admin builds on screen. Each can be
// previewed before saving, paused with one click, run on demand, and shows
// what it did.
import { Hono } from 'hono';
import { z } from 'zod';
import type { Automation, AutomationRun } from '../../../shared/src/automation';
import { nowOf, requirePerm, run, type AppEnv, type C } from '../context';
import type { Row } from '../db';
import { audit } from '../lib/audit';
import { toTrash } from '../lib/trash';
import { localDate, preview, runScheduledAutomations, splitTrigger } from '../lib/automations';
import { fail } from '../lib/errors';
import { iso } from '../lib/mappers';
import { body, param, uuid } from '../lib/validate';

export const automationRoutes = new Hono<AppEnv>();

const days = z.number().int().min(0).max(3650);
const fieldKey = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);

export const triggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('account_date'), field: fieldKey, daysBefore: days }),
  z.object({ type: z.literal('account_every'), days: days.min(1) }),
  z.object({ type: z.literal('account_inactive'), days: days.min(1) }),
  z.object({ type: z.literal('account_created') }),
  z.object({ type: z.literal('task_overdue'), days }),
  z.object({ type: z.literal('task_moved'), boardId: uuid.nullable(), column: z.string().min(1).max(24) }),
]);

const conditionSchema = z.object({
  field: z.union([fieldKey, z.literal('owner')]),
  op: z.enum(['eq', 'neq', 'gt', 'lt', 'empty', 'not_empty']),
  value: z.union([z.string().max(200), z.number(), z.null()]).optional(),
});

const person = z.string().regex(/^user:[0-9a-f-]{36}$/);
const assignee = z.union([z.enum(['account_owner', 'assignees', 'none']), person]);
const recipient = z.union([z.enum(['account_owner', 'assignees', 'team_lead', 'admins']), person]);

export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create_tasks'),
    boardId: uuid,
    column: z.string().max(24).nullable().optional(),
    tasks: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(300),
          dueInDays: z.number().int().min(0).max(365),
          assignee,
          subtasks: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
        }),
      )
      .min(1)
      .max(10),
  }),
  z.object({ type: z.literal('notify'), to: z.array(recipient).min(1).max(10), message: z.string().trim().min(1).max(500) }),
]);

const toAutomation = (r: Row): Automation => {
  const { trigger, conditions } = splitTrigger(r.trigger);
  return {
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    trigger,
    conditions,
    action: r.action,
    preset: r.preset ?? null,
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
    lastRunAt: iso(r.last_run_at),
    runs30d: Number(r.runs_30d ?? 0),
  };
};

async function checkRefs(c: C, action: z.infer<typeof actionSchema>, trigger: z.infer<typeof triggerSchema>) {
  await run(c, async (q) => {
    if (action.type === 'create_tasks') {
      const [b] = await q.query('select columns from boards where id = $1 and archived_at is null', [action.boardId]);
      if (!b) fail('validation', { fields: 'action.boardId' }, { fields: ['action.boardId'] });
    }
    if (trigger.type === 'task_moved' && trigger.boardId) {
      const [b] = await q.query('select 1 from boards where id = $1', [trigger.boardId]);
      if (!b) fail('validation', { fields: 'trigger.boardId' }, { fields: ['trigger.boardId'] });
    }
    const people = [
      ...(action.type === 'notify' ? action.to : action.tasks.map((t) => t.assignee)),
    ].filter((p) => p.startsWith('user:')).map((p) => p.slice(5));
    if (people.length) {
      const rows = await q.query(`select id from users where id = any($1::uuid[]) and status in ('active', 'invited')`, [people]);
      if (rows.length !== new Set(people).size) fail('bad_assignee');
    }
  });
}

const LIST_SQL = `select a.*,
    (select max(r.at) from automation_runs r where r.automation_id = a.id) as last_run_at,
    (select count(*) from automation_runs r where r.automation_id = a.id and r.at > now() - interval '30 days') as runs_30d
  from automations a`;

automationRoutes.get('/automations', async (c) => {
  const rows = await run(c, (q) => q.query(`${LIST_SQL} order by a.created_at`));
  return c.json({ automations: rows.map(toAutomation) });
});

const editable = z.object({
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  trigger: triggerSchema,
  conditions: z.array(conditionSchema).max(10),
  action: actionSchema,
});

automationRoutes.post('/automations', async (c) => {
  requirePerm(c, 'automations.manage');
  const input = await body(c, editable.extend({ preset: z.string().max(40).nullable().optional() }));
  await checkRefs(c, input.action, input.trigger);
  const org = c.get('org');
  const auth = c.get('auth');
  const id = crypto.randomUUID();
  const row = await run(c, async (q) => {
    await q.query(
      `insert into automations (id, org_id, name, enabled, trigger, action, preset, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, org.id, input.name, input.enabled, JSON.stringify({ ...input.trigger, conditions: input.conditions }), JSON.stringify(input.action), input.preset ?? null, auth.userId],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'automation.created', entity: 'automation', entityId: id });
    const [r] = await q.query(`${LIST_SQL} where a.id = $1`, [id]);
    return r;
  });
  return c.json({ automation: toAutomation(row) }, 201);
});

automationRoutes.patch('/automations/:id', async (c) => {
  requirePerm(c, 'automations.manage');
  const id = param(c, 'id');
  const input = await body(c, editable.partial());
  const org = c.get('org');
  const auth = c.get('auth');
  const current = await run(c, async (q) => {
    const [r] = await q.query('select * from automations where id = $1', [id]);
    if (!r) fail('not_found');
    return r;
  });
  const cur = splitTrigger(current.trigger);
  const trigger = input.trigger ?? (cur.trigger as z.infer<typeof triggerSchema>);
  const action = input.action ?? current.action;
  if (input.trigger || input.action) await checkRefs(c, action, trigger);
  const row = await run(c, async (q) => {
    await q.query(`update automations set name = $2, enabled = $3, trigger = $4, action = $5, updated_at = now() where id = $1`, [
      id,
      input.name ?? current.name,
      input.enabled ?? current.enabled,
      JSON.stringify({ ...trigger, conditions: input.conditions ?? cur.conditions }),
      JSON.stringify(action),
    ]);
    await audit(q, {
      orgId: org.id,
      actorId: auth.userId,
      action: input.enabled === false ? 'automation.paused' : input.enabled === true && !current.enabled ? 'automation.resumed' : 'automation.updated',
      entity: 'automation',
      entityId: id,
    });
    const [r] = await q.query(`${LIST_SQL} where a.id = $1`, [id]);
    return r;
  });
  return c.json({ automation: toAutomation(row) });
});

automationRoutes.delete('/automations/:id', async (c) => {
  requirePerm(c, 'automations.manage');
  const id = param(c, 'id');
  const org = c.get('org');
  const auth = c.get('auth');
  const trashId = await run(c, async (q) => {
    const [a] = await q.query<{ name: string }>('select name from automations where id = $1', [id]);
    if (!a) fail('not_found');
    const trashId = await toTrash(q, 'automation', [id], a.name);
    const rows = await q.query('delete from automations where id = $1 returning name', [id]);
    if (!rows.length) fail('not_found');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'automation.deleted', entity: 'automation', entityId: id, meta: { name: rows[0].name, trashId } });
    return trashId;
  });
  return c.json({ ok: true, trashId });
});

automationRoutes.get('/automations/:id/runs', async (c) => {
  requirePerm(c, 'automations.manage');
  const id = param(c, 'id');
  const rows = await run(c, async (q) => {
    const [rule] = await q.query('select 1 from automations where id = $1', [id]);
    if (!rule) fail('not_found');
    return q.query('select run_key, at, result from automation_runs where automation_id = $1 order by at desc limit 50', [id]);
  });
  const runs: AutomationRun[] = rows.map((r) => ({ key: r.run_key, at: iso(r.at)!, result: r.result ?? {} }));
  return c.json({ runs });
});

/** "This rule would act on 12 customers today." Changes nothing. */
automationRoutes.post('/automations/preview', async (c) => {
  requirePerm(c, 'automations.manage');
  const input = await body(c, z.object({ trigger: triggerSchema, conditions: z.array(conditionSchema).max(10) }));
  const org = c.get('org');
  const today = localDate(nowOf(c.get('deps')), org.timezone);
  const out = await run(c, (q) => preview(q, org.id, input.trigger, input.conditions, today));
  return c.json(out);
});

/** Run a scheduled rule now instead of waiting for the next hour (it still fires once per occasion). */
automationRoutes.post('/automations/:id/run', async (c) => {
  requirePerm(c, 'automations.manage');
  const id = param(c, 'id');
  const org = c.get('org');
  const deps = c.get('deps');
  const [rule] = await run(c, (q) => q.query('select 1 from automations where id = $1', [id]));
  if (!rule) fail('not_found');
  const fired = await runScheduledAutomations(deps, nowOf(deps), org.id, id);
  return c.json({ fired });
});
