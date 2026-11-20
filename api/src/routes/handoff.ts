// The flow between departments (db/migrations/0170_flow.sql, lib/handoff.ts):
// the customer's team (one owner per department), the hand-over card of a won
// deal, promises made to the customer, customer requests linked to product work
// with what that work is worth (the backlog's demand columns), and the loop back
// when the work ships. Everything runs under the person's own rights; the
// database functions decide what crosses a department's wall (titles and where
// work stands, never the board).
import { Hono } from 'hono';
import { z } from 'zod';
import { REQUEST_SOURCES, type AccountFlow, type DraftResult, type CustomerPromise, type DemandSummary, type Handover, type HandoverPacket, type LinkableStory, type LinkedWork, type StoryCustomer } from '../../../shared/src/handoff';
import type { AccountField, Column } from '../../../shared/src/model';
import { nowOf, requirePerm, requireWriter, run, todayOf, type AppEnv, type C } from '../context';
import type { Q, Row } from '../db';
import { audit } from '../lib/audit';
import { fail } from '../lib/errors';
import { canSeeField } from '../lib/fieldAccess';
import { createHandover, flowSettings, renewalOf, shippedDraft } from '../lib/handoff';
import { modelDraft, templatePromises } from '../assistant/actions';
import { assistantConfig, providerOf } from './assist';
import { translate, type Locale, type MessageKey } from '../../../shared/src/i18n';
import { labelOf } from '../../../shared/src/fields';
import { STANCES } from '../../../shared/src/records';
import { day, iso } from '../lib/mappers';
import { enqueue, kick } from '../lib/notify';
import { applyPlan, renewalField, valueField } from '../lib/playbooks';
import { runTaskMoved } from '../lib/automations';
import { startPlanForHandover } from '../lib/onboarding';
import { body, isoDate, param, uuid } from '../lib/validate';

export const handoffRoutes = new Hono<AppEnv>();

const toWork = (r: Row): LinkedWork => ({
  linkId: r.link_id,
  storyId: r.story_id,
  title: r.title,
  status: r.status_name ?? null,
  done: !!r.done,
  sprint: r.sprint_name ?? null,
  sprintEnds: day(r.sprint_ends),
  departmentKey: r.department_key,
  boardId: r.board_id ?? null,
  source: r.source,
  sourceId: r.source_id ?? null,
  note: r.note ?? '',
  createdAt: iso(r.created_at)!,
  shippedAt: iso(r.shipped_at),
  toldAt: iso(r.told_at),
  draft: r.draft ?? '',
  loopTaskId: r.loop_task_id ?? null,
  portalOpen: !!r.portal,
});

const toPromise = (r: Row): CustomerPromise => ({
  id: r.id,
  accountId: r.account_id,
  body: r.body,
  recordId: r.record_id ?? null,
  activityId: r.activity_id ?? null,
  dueDate: day(r.due_date),
  keptAt: iso(r.kept_at),
  createdById: r.created_by ?? null,
  createdAt: iso(r.created_at)!,
});

const toHandover = (r: Row): Handover => ({
  id: r.id,
  accountId: r.account_id,
  accountName: r.account_name ?? '',
  sourceKind: r.source_kind,
  sourceId: r.source_id,
  sourceName: r.source_name ?? '',
  stage: r.stage,
  status: r.status,
  toDepartment: r.to_department,
  summary: r.summary ?? '',
  planId: r.plan_id ?? null,
  ownerId: r.owner_id ?? null,
  sellerId: r.seller_id ?? null,
  createdAt: iso(r.created_at)!,
  confirmedAt: iso(r.confirmed_at),
  confirmedById: r.confirmed_by ?? null,
});

async function seesAccount(q: Q, id: string) {
  const [a] = await q.query('select id, name, owner_id, fields, currency from accounts where id = $1', [id]);
  if (!a) fail('not_found');
  return a;
}

const HANDOVER_SQL = `select h.*, a.name as account_name from handovers h join accounts a on a.id = h.account_id`;

// ------------------------------------------------------------ customer page

handoffRoutes.get('/accounts/:id/flow', async (c) => {
  const id = param(c, 'id');
  const out = await run(c, async (q): Promise<AccountFlow> => {
    await seesAccount(q, id);
    const team = await q.query(
      `select m.department_id, d.key, m.user_id from account_team m join departments d on d.id = m.department_id and d.enabled
        where m.account_id = $1 order by d.position`,
      [id],
    );
    const work = await q.query('select * from app_account_linked_work($1)', [id]);
    const promises = await q.query('select * from promises where account_id = $1 order by (kept_at is null) desc, coalesce(due_date, created_at::date), created_at', [id]);
    const handovers = await q.query(`${HANDOVER_SQL} where h.account_id = $1 order by h.created_at desc limit 10`, [id]);
    return {
      team: team.map((r) => ({ departmentId: r.department_id, departmentKey: r.key, userId: r.user_id })),
      work: work.map(toWork),
      promises: promises.map(toPromise),
      handovers: handovers.map(toHandover),
    };
  });
  return c.json(out);
});

/** Who owns the customer in a department (null takes them off). */
handoffRoutes.put('/accounts/:id/team', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ departmentId: uuid, userId: uuid.nullable() }));
  const org = c.get('org');
  const auth = c.get('auth');
  await run(c, async (q) => {
    await seesAccount(q, id);
    const [d] = await q.query('select id from departments where id = $1 and enabled', [input.departmentId]);
    if (!d) fail('validation', { fields: 'departmentId' }, { fields: ['departmentId'] });
    if (input.userId) {
      const [u] = await q.query(`select id from users where id = $1 and status in ('active', 'invited')`, [input.userId]);
      if (!u) fail('bad_assignee');
      const rows = await q.query(
        `insert into account_team (org_id, account_id, department_id, user_id) values ($1, $2, $3, $4)
         on conflict (account_id, department_id) do update set user_id = excluded.user_id returning 1`,
        [org.id, id, input.departmentId, input.userId],
      );
      if (!rows.length) fail('forbidden');
    } else {
      await q.query('delete from account_team where account_id = $1 and department_id = $2', [id, input.departmentId]);
    }
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'account.team_changed', entity: 'account', entityId: id, meta: { department: input.departmentId, user: input.userId } });
  }).catch((e) => {
    // The row policy says no (not the customer's owner, a lead or an account manager).
    if (String((e as Error)?.message ?? '').includes('row-level security')) fail('forbidden');
    throw e;
  });
  return c.json({ ok: true });
});

// ------------------------------------------------------------ promises

handoffRoutes.post('/accounts/:id/promises', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(
    c,
    z.object({ body: z.string().trim().min(1).max(500), recordId: uuid.nullable().optional(), activityId: uuid.nullable().optional(), dueDate: isoDate.nullable().optional() }),
  );
  const org = c.get('org');
  const auth = c.get('auth');
  const row = await run(c, async (q) => {
    await seesAccount(q, id);
    const [p] = await q.query(
      `insert into promises (org_id, account_id, body, record_id, activity_id, due_date, created_by) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [org.id, id, input.body, input.recordId ?? null, input.activityId ?? null, input.dueDate ?? null, auth.userId],
    );
    return p;
  });
  return c.json({ promise: toPromise(row) }, 201);
});

/** Edits a promise made to a customer (what, by when, who). Writers only; 404 when unseen. */
handoffRoutes.patch('/promises/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ body: z.string().trim().min(1).max(500).optional(), kept: z.boolean().optional(), dueDate: isoDate.nullable().optional() }));
  const row = await run(c, async (q) => {
    const [p] = await q.query(
      `update promises set body = coalesce($2, body),
              kept_at = case when $3::boolean is null then kept_at when $3 then coalesce(kept_at, now()) else null end,
              due_date = case when $4 then $5::date else due_date end
        where id = $1 returning *`,
      [id, input.body ?? null, input.kept ?? null, input.dueDate !== undefined, input.dueDate ?? null],
    );
    if (!p) fail('not_found');
    return p;
  });
  return c.json({ promise: toPromise(row) });
});

/** Deletes a promise and returns it, so the client can offer Undo by posting it back. Writers only. */
handoffRoutes.delete('/promises/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const row = await run(c, async (q) => {
    const [p] = await q.query('delete from promises where id = $1 returning *', [id]);
    if (!p) fail('not_found');
    return p;
  });
  // The client offers Undo by posting the same promise back.
  return c.json({ ok: true, promise: toPromise(row) });
});

// ------------------------------------------------------------ hand-over

async function packetOf(c: C, q: Q, h: Row): Promise<HandoverPacket> {
  const org = c.get('org');
  const auth = c.get('auth');
  const defs = (org.account_fields ?? []) as AccountField[];
  const [a] = await q.query('select fields, currency from accounts where id = $1', [h.account_id]);
  const stakeholders = await q.query(
    `select r.id, r.name, r.fields from records r join record_types rt on rt.id = r.type_id
      where r.account_id = $1 and rt.kind = 'contact' and r.archived_at is null
      order by (r.fields->>'decision' is not null) desc, r.name limit 12`,
    [h.account_id],
  );
  const promises = await q.query('select * from promises where account_id = $1 and kept_at is null order by coalesce(due_date, created_at::date) limit 20', [h.account_id]);
  const work = await q.query('select * from app_account_linked_work($1)', [h.account_id]);
  const [deal] = h.source_kind === 'record' ? await q.query('select fields from records where id = $1', [h.source_id]) : [];
  const vf = valueField(defs);
  const value = vf && canSeeField(vf, auth) && typeof a?.fields?.[vf.key] === 'number' ? Number(a.fields[vf.key]) : null;
  const dept = await q.query(
    `select m.user_id from department_members m join departments d on d.id = m.department_id
      where d.key = $1 and d.enabled order by (m.role = 'lead') desc, m.created_at`,
    [h.to_department],
  );
  const close = deal?.fields?.close_date ?? null;
  return {
    ...toHandover(h),
    stakeholders: stakeholders.map((s) => ({ id: s.id, name: s.name, title: String(s.fields?.title ?? ''), decision: s.fields?.decision ?? null, stance: s.fields?.stance ?? null })),
    promises: promises.map(toPromise),
    requests: work.map(toWork).filter((w) => !w.done),
    closeDate: typeof close === 'string' ? close.slice(0, 10) : null,
    renewalDate: renewalOf(defs, a?.fields ?? {}),
    value,
    currency: a?.currency ?? org.currency,
    candidates: dept.map((d) => d.user_id),
  };
}

/** Customer handovers (sales to delivery), open ones by default or all with `status=all`. */
handoffRoutes.get('/handovers', async (c) => {
  const status = c.req.query('status') === 'all' ? null : 'open';
  const rows = await run(c, (q) => q.query(`${HANDOVER_SQL} where ($1::text is null or h.status = $1) order by h.created_at desc limit 50`, [status]));
  return c.json({ handovers: rows.map(toHandover) });
});

/** One handover with its checklist, promises and people; 404 when unseen. */
handoffRoutes.get('/handovers/:id', async (c) => {
  const id = param(c, 'id');
  const out = await run(c, async (q) => {
    const [h] = await q.query(`${HANDOVER_SQL} where h.id = $1`, [id]);
    if (!h) fail('not_found');
    return packetOf(c, q, h);
  });
  return c.json({ handover: out });
});

/** Prepare a hand-over card by hand, for a deal (record) or a pipeline task. */
handoffRoutes.post('/handovers', async (c) => {
  requireWriter(c);
  const input = await body(c, z.object({ sourceKind: z.enum(['record', 'task']), sourceId: uuid }));
  const org = c.get('org');
  const auth = c.get('auth');
  const out = await run(c, async (q) => {
    const [src] =
      input.sourceKind === 'record'
        ? await q.query('select id, account_id from records where id = $1', [input.sourceId])
        : await q.query('select id, account_id from tasks where id = $1', [input.sourceId]);
    if (!src) fail('not_found');
    if (!src.account_id) fail('validation', { fields: 'accountId' }, { fields: ['accountId'] });
    await seesAccount(q, src.account_id);
    const made = await createHandover(q, org.id, auth.userId, { kind: input.sourceKind, id: input.sourceId });
    const [h] = made
      ? await q.query(`${HANDOVER_SQL} where h.id = $1`, [made])
      : await q.query(`${HANDOVER_SQL} where h.source_kind = $1 and h.source_id = $2`, [input.sourceKind, input.sourceId]);
    return { h, made: !!made };
  });
  kick(c.get('deps'));
  return c.json({ handover: toHandover(out.h) }, out.made ? 201 : 200);
});

/** Edits a handover; a confirmed handover is closed for changes ('handover_confirmed'). Writers only. */
handoffRoutes.patch('/handovers/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ summary: z.string().max(8000).optional(), planId: uuid.nullable().optional(), status: z.enum(['open', 'dismissed']).optional() }));
  const row = await run(c, async (q) => {
    const [cur] = await q.query('select * from handovers where id = $1', [id]);
    if (!cur) fail('not_found');
    if (cur.status === 'confirmed') fail('handover_confirmed');
    await q.query(
      `update handovers set summary = coalesce($2, summary), plan_id = case when $3 then $4::uuid else plan_id end, status = coalesce($5, status) where id = $1`,
      [id, input.summary ?? null, input.planId !== undefined, input.planId ?? null, input.status ?? null],
    );
    const [h] = await q.query(`${HANDOVER_SQL} where h.id = $1`, [id]);
    return h;
  });
  return c.json({ handover: toHandover(row) });
});

/**
 * Confirm the hand-over: the owner of the takeover department is set on the
 * customer, the suggested playbook (if kept) is put on, and the owner is told.
 */
handoffRoutes.post('/handovers/:id/confirm', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ ownerId: uuid, planId: uuid.nullable().optional(), summary: z.string().max(8000).optional() }));
  const org = c.get('org');
  const auth = c.get('auth');
  const out = await run(c, async (q) => {
    const [h] = await q.query('select * from handovers where id = $1 for update', [id]);
    if (!h) fail('not_found');
    if (h.status === 'confirmed') fail('handover_confirmed');
    const [u] = await q.query(`select id from users where id = $1 and status in ('active', 'invited') and seat = 'full'`, [input.ownerId]);
    if (!u) fail('bad_assignee');
    const [dept] = await q.query('select id from departments where key = $1 and enabled', [h.to_department]);
    const account = await seesAccount(q, h.account_id);
    if (dept) {
      await q.query(
        `insert into account_team (org_id, account_id, department_id, user_id) values ($1, $2, $3, $4)
         on conflict (account_id, department_id) do update set user_id = excluded.user_id`,
        [org.id, h.account_id, dept.id, input.ownerId],
      );
    }
    // A customer nobody owned yet is the new owner's.
    if (!account.owner_id) await q.query('update accounts set owner_id = $2, updated_at = now() where id = $1', [h.account_id, input.ownerId]);
    const planId = input.planId === undefined ? h.plan_id : input.planId;
    let tasks: Row[] = [];
    if (planId) {
      const [plan] = await q.query('select * from plan_templates where id = $1', [planId]);
      if (plan) {
        const today = todayOf(c);
        tasks = await applyPlan(q, { orgId: org.id, actorId: auth.userId, plan, account: { ...account, owner_id: input.ownerId }, from: today, today });
      }
    }
    await q.query(
      `update handovers set status = 'confirmed', owner_id = $2, plan_id = $3, summary = coalesce($4, summary), confirmed_at = now(), confirmed_by = $5 where id = $1`,
      [id, input.ownerId, planId ?? null, input.summary ?? null, auth.userId],
    );
    await enqueue(q, [{ orgId: org.id, userId: input.ownerId, kind: 'handover_owner', actorId: auth.userId, data: { account: account.name, accountId: h.account_id, deal: h.source_name } }]);
    // The draft onboarding plan the card opened starts now, owned by the new owner.
    await startPlanForHandover(q, org.id, id, input.ownerId, null, todayOf(c));
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'handover.confirmed', entity: 'account', entityId: h.account_id, meta: { owner: input.ownerId, plan: planId ?? null, tasks: tasks.length } });
    const [row] = await q.query(`${HANDOVER_SQL} where h.id = $1`, [id]);
    return { row, tasks: tasks.length };
  });
  kick(c.get('deps'));
  return c.json({ handover: toHandover(out.row), tasks: out.tasks });
});

// ------------------------------------------------------------ request links

handoffRoutes.get('/stories/linkable', async (c) => {
  const query = (c.req.query('q') ?? '').slice(0, 120);
  const out = await run(c, async (q) => {
    const rows = await q.query('select * from app_linkable_stories($1, 20)', [query]);
    const desks = await q.query(`select id, name from app_request_desks() where department_key = 'product'`);
    return { rows, desks };
  });
  const stories: LinkableStory[] = out.rows.map((r) => ({ id: r.id, title: r.title, status: r.status_name ?? null, done: !!r.done, departmentKey: r.department_key, waiting: Number(r.waiting ?? 0) }));
  return c.json({ stories, desks: out.desks.map((d) => ({ id: d.id, name: d.name })) });
});

/** Links a customer's request to a product story, so product sees who asked; audited (201). */
handoffRoutes.post('/request-links', async (c) => {
  requireWriter(c);
  const input = await body(
    c,
    z.object({ storyId: uuid, accountId: uuid, source: z.enum(REQUEST_SOURCES), sourceId: uuid.nullable().optional(), note: z.string().trim().max(2000).optional() }),
  );
  const org = c.get('org');
  const auth = c.get('auth');
  const id = await run(c, async (q) => {
    const [r] = await q.query('select app_link_request($1, $2, $3, $4, $5) as id', [input.storyId, input.accountId, input.source, input.sourceId ?? null, input.note ?? '']);
    if (!r?.id) fail('not_found');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'request.linked', entity: 'account', entityId: input.accountId, meta: { story: input.storyId, source: input.source } });
    return r.id as string;
  });
  return c.json({ id }, 201);
});

/** Removes a request-to-story link. Writers only. */
handoffRoutes.delete('/request-links/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const ok = await run(c, async (q) => (await q.query('select app_unlink_request($1) as ok', [id]))[0]?.ok);
  if (!ok) fail('not_found');
  return c.json({ ok: true });
});

/** The owner told the customer (sent the draft themselves). */
handoffRoutes.post('/request-links/:id/told', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const ok = await run(c, async (q) => (await q.query('select app_mark_told($1) as ok', [id]))[0]?.ok);
  if (!ok) fail('not_found');
  return c.json({ ok: true });
});

/**
 * Close the customer's portal request: it moves to its board's done column, which
 * sends the portal's own "done" message and asks the customer to confirm. Only on
 * this explicit step: finishing the story never closes it by itself.
 */
handoffRoutes.post('/request-links/:id/close-portal', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const org = c.get('org');
  const auth = c.get('auth');
  const out = await run(c, async (q) => {
    const [l] = await q.query(`select * from request_links where id = $1 and source = 'portal' and shipped_at is not null`, [id]);
    if (!l) fail('not_found');
    const [t] = await q.query('select t.id, t.status, b.columns from tasks t join boards b on b.id = t.board_id where t.id = $1', [l.source_id]);
    if (!t) fail('not_found');
    const done = (t.columns as Column[]).find((col) => col.done);
    if (!done) fail('validation', { fields: 'status' }, { fields: ['status'] });
    if (t.status !== done!.key) await q.query('update tasks set status = $2, updated_by = $3, version = version + 1, updated_at = now() where id = $1', [t.id, done!.key, auth.userId]);
    await q.query('select app_mark_told($1)', [id]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'request.portal_closed', entity: 'task', entityId: t.id, meta: { link: id } });
    return { taskId: t.id as string, column: done!.key };
  });
  await runTaskMoved(c.get('deps'), org.id, out.taskId, out.column, nowOf(c.get('deps'))).catch(() => 0);
  return c.json({ ok: true });
});

// ------------------------------------------------------------ backlog

/** The backlog's demand columns: waiting customers, their annual value (when the person may see it), nearest renewal. */
handoffRoutes.get('/boards/:id/demand', async (c) => {
  const id = param(c, 'id');
  const org = c.get('org');
  const auth = c.get('auth');
  const defs = (org.account_fields ?? []) as AccountField[];
  const vf = valueField(defs);
  const rf = renewalField(defs);
  const valueVisible = !!vf && canSeeField(vf, auth);
  const rows = await run(c, async (q) => {
    const [b] = await q.query('select id from boards where id = $1', [id]);
    if (!b) fail('not_found');
    return q.query('select * from app_story_demand($1, $2, $3)', [id, vf?.key ?? '', rf && canSeeField(rf, auth) ? rf.key : '']);
  });
  const out: DemandSummary = {
    currency: org.currency,
    valueVisible,
    demand: rows.map((r) => ({
      storyId: r.story_id,
      waiting: Number(r.waiting),
      value: valueVisible && r.value != null ? Number(r.value) : null,
      nearestRenewal: day(r.nearest_renewal),
      renewingSoon: Number(r.renewing_90 ?? 0),
    })),
  };
  return c.json(out);
});

/** The customers behind a product task (through its linked requests); 404 when the task is unseen. */
handoffRoutes.get('/tasks/:id/customers', async (c) => {
  const id = param(c, 'id');
  const rows = await run(c, async (q) => {
    const [t] = await q.query('select id from tasks where id = $1', [id]);
    if (!t) fail('not_found');
    return q.query('select * from app_story_customers($1)', [id]);
  });
  const customers: StoryCustomer[] = rows.map((r) => ({
    linkId: r.link_id,
    accountId: r.account_id ?? null,
    accountName: r.account_name ?? null,
    visible: !!r.visible,
    source: r.source,
    createdAt: iso(r.created_at)!,
    shippedAt: iso(r.shipped_at),
    toldAt: iso(r.told_at),
  }));
  return c.json({ customers });
});

// ------------------------------------------------------------ drafts (D11)

const draftInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('handover_note'), handoverId: uuid }),
  z.object({ kind: z.literal('shipped_message'), linkId: uuid }),
  z.object({ kind: z.literal('meeting_promises'), activityId: uuid }),
]);

const stanceLabel = (k: string | null, locale: Locale) => (k ? labelOf(STANCES.find((s) => s.key === k)?.label, locale) || k : '');

/**
 * A draft from the assistant (or, without one, from the template). Nothing is
 * saved: the app shows it, the person edits and confirms, and can undo.
 */
handoffRoutes.post('/assist/draft', async (c) => {
  requireWriter(c);
  const input = await body(c, draftInput);
  const deps = c.get('deps');
  const org = c.get('org');
  const auth = c.get('auth');
  const locale = ((c.get('locale') as Locale | undefined) ?? org.locale) as Locale;
  const env = { deps, provider: providerOf(deps), orgId: org.id, userId: auth.userId, orgSettings: (org.settings ?? null) as Record<string, unknown> | null, config: assistantConfig(deps) };
  const t = (k: MessageKey, v?: Record<string, string | number>) => translate(locale, k, v);
  let facts: Record<string, unknown> = {};
  let fallback: Omit<DraftResult, 'ai' | 'why'>;
  if (input.kind === 'handover_note') {
    const p = await run(c, async (q) => {
      const [h] = await q.query(`${HANDOVER_SQL} where h.id = $1`, [input.handoverId]);
      if (!h) fail('not_found');
      return packetOf(c, q, h);
    });
    facts = {
      customer: p.accountName,
      deal: p.sourceName,
      people: p.stakeholders.map((s) => ({ name: s.name, title: s.title, stance: s.stance })),
      promises: p.promises.map((x) => x.body),
      waitingFromProduct: p.requests.map((r) => ({ title: r.title, status: r.status, sprintEnds: r.sprintEnds })),
      closeDate: p.closeDate,
      renewalDate: p.renewalDate,
      salesThread: p.summary,
    };
    const lines = [t('flow.note.head', { account: p.accountName, deal: p.sourceName })];
    if (p.stakeholders.length) lines.push('', t('flow.note.people'), ...p.stakeholders.slice(0, 6).map((s) => `• ${s.name}${s.title ? `, ${s.title}` : ''}${s.stance ? ` (${stanceLabel(s.stance, locale)})` : ''}`));
    if (p.promises.length) lines.push('', t('flow.note.promises'), ...p.promises.map((x) => `• ${x.body}`));
    if (p.requests.length) lines.push('', t('flow.note.waiting'), ...p.requests.map((r) => `• ${r.title}${r.status ? ` — ${r.status}` : ''}`));
    if (p.closeDate || p.renewalDate) lines.push('', t('flow.note.dates', { close: p.closeDate ?? '—', renewal: p.renewalDate ?? '—' }));
    const champion = p.stakeholders.find((s) => s.stance === 'champion') ?? p.stakeholders[0];
    lines.push('', champion ? t('flow.note.first', { name: champion.name }) : t('flow.note.firstNone'));
    fallback = { text: lines.join('\n') };
  } else if (input.kind === 'shipped_message') {
    const l = await run(c, async (q) => {
      const [x] = await q.query(
        `select l.note, a.name as account, t.title as story, t.description from request_links l join accounts a on a.id = l.account_id join tasks t on t.id = l.story_id where l.id = $1`,
        [input.linkId],
      );
      if (!x) fail('not_found');
      return x;
    });
    const [me] = await run(c, (q) => q.query('select name from users where id = $1', [auth.userId]));
    facts = { customer: l.account, work: l.story, whatTheyAsked: l.note, workDescription: String(l.description ?? '').slice(0, 1200), from: me?.name ?? '' };
    fallback = { text: shippedDraft(locale, { account: l.account, story: l.story, owner: me?.name ?? '' }) };
  } else {
    const m = await run(c, async (q) => {
      const [x] = await q.query('select title, body, account_id from activities where id = $1', [input.activityId]);
      if (!x) fail('not_found');
      return x;
    });
    facts = { meeting: m.title, notes: String(m.body ?? '').slice(0, 8000) };
    const found = templatePromises(String(m.body ?? ''));
    fallback = { text: '', ...found };
  }
  const { out, why } = await modelDraft(env, input.kind, locale, facts);
  const result: DraftResult = out ? { ...out, ai: true, why: null } : { ...fallback, ai: false, why };
  return c.json({ draft: result });
});

/** The owner edits the drafted message (kept with the link until they send it themselves). */
handoffRoutes.patch('/request-links/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, z.object({ draft: z.string().max(8000) }));
  const ok = await run(c, async (q) => (await q.query('select app_set_draft($1, $2) as ok', [id, input.draft]))[0]?.ok);
  if (!ok) fail('not_found');
  return c.json({ ok: true });
});

// ------------------------------------------------------------ settings

handoffRoutes.get('/flow/settings', async (c) => c.json({ settings: flowSettings(c.get('org').settings) }));

/** The company's flow settings: the hand-over card on won deals, its playbook, where "tell the customer" tasks go. */
handoffRoutes.put('/flow/settings', async (c) => {
  requirePerm(c, 'automations.manage');
  requireWriter(c);
  const input = await body(c, z.object({ handover: z.boolean().optional(), handoverPlanId: uuid.nullable().optional(), loopBoardId: uuid.nullable().optional() }));
  const org = c.get('org');
  const auth = c.get('auth');
  const next = { ...flowSettings(org.settings), ...input };
  await run(c, async (q) => {
    if (next.handoverPlanId && !(await q.query('select 1 from plan_templates where id = $1', [next.handoverPlanId])).length) fail('validation', { fields: 'handoverPlanId' }, { fields: ['handoverPlanId'] });
    if (next.loopBoardId && !(await q.query('select 1 from boards where id = $1 and archived_at is null', [next.loopBoardId])).length) fail('validation', { fields: 'loopBoardId' }, { fields: ['loopBoardId'] });
    await q.query(`update orgs set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{flow}', $2::jsonb) where id = $1`, [org.id, JSON.stringify(next)]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'automation.flow_settings', entity: 'org', entityId: org.id, meta: input });
  });
  return c.json({ settings: next });
});
