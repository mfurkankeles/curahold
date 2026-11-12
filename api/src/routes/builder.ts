// The report builder: what can be reported on, running a report as it is
// being built, and the reports people keep.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AccountField } from '../../../shared/src/model';
import { BUCKETS, CHARTS, FORMATS, MEASURE_FNS, PERIODS, type ReportDef, type SavedReport } from '../../../shared/src/reports';
import { nowOf, requireWriter, run, type AppEnv, type C } from '../context';
import type { Q, Row } from '../db';
import { audit } from '../lib/audit';
import { localDate } from '../lib/automations';
import { fail } from '../lib/errors';
import { iso } from '../lib/mappers';
import { catalogInfo, loadCatalog, resolveDef, runReport, type EngineCtx } from '../lib/reportEngine';
import { body, isoDate, param } from '../lib/validate';

export const builderRoutes = new Hono<AppEnv>();

// A field of the company's own, or a stand-in such as $money (see the report library).
const fieldKey = z.string().regex(/^\$?[a-z][a-z0-9_]{0,39}$/);
const OPS = ['contains', 'empty', 'not_empty', 'gte', 'lte', 'eq', 'last_days', 'next_days', 'this', 'last', 'before', 'after', 'in', 'not_in', 'yes', 'no'] as const;
export const reportDefSchema = z.object({
  source: z.string().regex(/^(tasks|accounts|deals|activities|time|record:[a-z][a-z0-9_]{1,40})$/),
  format: z.enum(FORMATS).optional(),
  showChart: z.boolean().optional(),
  filters: z
    .array(
      z.object({
        field: fieldKey,
        op: z.enum(OPS),
        values: z.array(z.string().max(60)).max(50).optional(),
        value: z.union([z.number().finite(), z.string().max(100)]).optional(),
        period: z.enum(PERIODS).optional(),
        date: isoDate.optional(),
      }),
    )
    .max(12),
  groups: z.array(z.object({ field: fieldKey, bucket: z.enum(BUCKETS).optional() })).max(2),
  measure: z.object({ fn: z.enum(MEASURE_FNS), field: fieldKey.optional() }),
  chart: z.enum(CHARTS),
  columns: z.array(fieldKey).max(10).optional(),
  top: z.number().int().min(1).max(50).optional(),
  sort: z.enum(['value', 'label']).optional(),
  goal: z.number().positive().max(1e13).optional(),
});

export function engineCtx(c: C, q: Q): EngineCtx {
  const org = c.get('org');
  const auth = c.get('auth');
  const tz = org.timezone || 'UTC';
  return { q, viewer: auth, locale: c.get('locale'), today: localDate(nowOf(c.get('deps')), tz), tz, accountDefs: (org.account_fields ?? []) as AccountField[] };
}

const toReport = (r: Row, me: string): SavedReport => ({
  id: r.id,
  name: r.name,
  description: r.description ?? '',
  def: r.def as ReportDef,
  shared: !!r.shared,
  createdBy: r.created_by ?? null,
  mine: r.created_by === me,
  updatedAt: iso(r.updated_at)!,
});

builderRoutes.get('/reports/catalog', async (c) => {
  const out = await run(c, async (q) => {
    const cat = await loadCatalog(engineCtx(c, q));
    return { sources: catalogInfo(cat), deals: cat.deals };
  });
  return c.json(out);
});

/** A report as it stands in the builder, or one from the library. Nothing is kept. */
builderRoutes.post('/reports/run', async (c) => {
  const input = await body(c, z.object({ def: reportDefSchema, resolve: z.boolean().optional() }));
  const out = await run(c, async (q) => {
    const ctx = engineCtx(c, q);
    const cat = await loadCatalog(ctx);
    const result = await runReport(ctx, cat, input.def as ReportDef);
    // A library report names fields by their part ($money…): the builder wants the company's own.
    const made = input.resolve ? resolveDef(cat, input.def as ReportDef) : null;
    return { result, ...(made && 'def' in made ? { def: made.def } : {}) };
  });
  return c.json(out);
});

builderRoutes.get('/reports/saved', async (c) => {
  const me = c.get('auth').userId;
  const rows = await run(c, (q) => q.query('select * from reports order by lower(name)'));
  return c.json({ reports: rows.map((r) => toReport(r, me)) });
});

builderRoutes.get('/reports/saved/:id', async (c) => {
  const id = param(c, 'id');
  const [row] = await run(c, (q) => q.query('select * from reports where id = $1', [id]));
  if (!row) fail('not_found');
  return c.json({ report: toReport(row, c.get('auth').userId) });
});

const reportInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  def: reportDefSchema,
  shared: z.boolean().optional(),
});

builderRoutes.post('/reports/saved', async (c) => {
  requireWriter(c);
  const input = await body(c, reportInput);
  const org = c.get('org');
  const auth = c.get('auth');
  const row = await run(c, async (q) => {
    const [r] = await q.query(
      `insert into reports (org_id, name, description, def, shared, created_by) values ($1, $2, $3, $4, $5, $6) returning *`,
      [org.id, input.name, input.description ?? '', JSON.stringify(input.def), input.shared ?? false, auth.userId],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'report.created', entity: 'report', entityId: r.id, meta: { name: input.name, shared: !!input.shared } });
    return r;
  });
  return c.json({ report: toReport(row, auth.userId) }, 201);
});

builderRoutes.patch('/reports/saved/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const input = await body(c, reportInput.partial());
  const auth = c.get('auth');
  const row = await run(c, async (q) => {
    // Row-level security lets through only its maker (or an administrator, for a shared one).
    const [r] = await q.query(
      `update reports set name = coalesce($2, name), description = coalesce($3, description), def = coalesce($4::jsonb, def),
              shared = coalesce($5, shared), updated_at = now() where id = $1 returning *`,
      [id, input.name ?? null, input.description ?? null, input.def ? JSON.stringify(input.def) : null, input.shared ?? null],
    );
    if (!r) {
      const [seen] = await q.query('select 1 from reports where id = $1', [id]);
      fail(seen ? 'forbidden' : 'not_found');
    }
    return r;
  });
  return c.json({ report: toReport(row, auth.userId) });
});

builderRoutes.delete('/reports/saved/:id', async (c) => {
  requireWriter(c);
  const id = param(c, 'id');
  const org = c.get('org');
  const auth = c.get('auth');
  await run(c, async (q) => {
    const [r] = await q.query<{ name: string }>('delete from reports where id = $1 returning name', [id]);
    if (!r) {
      const [seen] = await q.query('select 1 from reports where id = $1', [id]);
      fail(seen ? 'forbidden' : 'not_found');
    }
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'report.deleted', entity: 'report', entityId: id, meta: { name: r.name } });
  });
  return c.body(null, 204);
});
