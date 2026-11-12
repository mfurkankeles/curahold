// Pages built from cards: each role's home and shared report pages.
// Card numbers are worked out inside the viewer's own database scope, with
// the fields their role may see, so one page shows each person their part.
import { Hono } from 'hono';
import { z } from 'zod';
import type { Locale } from '../../../shared/src/i18n';
import type { AccountField, FieldType } from '../../../shared/src/model';
import {
  BREAKDOWNS,
  CARD_SCOPES,
  CARD_SIZES,
  CARD_TYPES,
  METRICS,
  type Card,
  type CardData,
  type CardRow,
  type CardScope,
  type Page,
} from '../../../shared/src/pages';
import { CHARTS, DASHBOARD_TEMPLATES, libraryReport, type ReportDef } from '../../../shared/src/reports';
import { pick } from '../../../shared/src/templates';
import { nowOf, requirePerm, run, type AppEnv, type AuthCtx, type C } from '../context';
import type { Q, Row } from '../db';
import { audit } from '../lib/audit';
import { localDate } from '../lib/automations';
import { fail } from '../lib/errors';
import { canSeeField, defsFor, type Viewer } from '../lib/fieldAccess';
import { iso } from '../lib/mappers';
import { loadCatalog, runReport, type Catalog } from '../lib/reportEngine';
import { engineCtx } from './builder';
import { body, param, uuid } from '../lib/validate';

export const pageRoutes = new Hono<AppEnv>();

const fieldKey = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const cardSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,20}$/),
  type: z.enum(CARD_TYPES),
  size: z.enum(CARD_SIZES),
  title: z.string().trim().max(80).optional(),
  scope: z.enum(CARD_SCOPES).optional(),
  days: z.number().int().min(1).max(730).optional(),
  metric: z.enum(METRICS).optional(),
  by: z.enum(BREAKDOWNS).optional(),
  field: fieldKey.optional(),
  options: z.array(z.string().regex(/^[a-z0-9_]{1,40}$/)).max(20).optional(),
  text: z.string().max(2000).optional(),
  reportId: uuid.optional(),
  report: z.string().regex(/^[a-z0-9_]{1,40}$/).optional(),
  chart: z.enum(CHARTS).optional(),
});
const cardsSchema = z
  .array(cardSchema)
  .max(24)
  .refine((cs) => new Set(cs.map((c) => c.id)).size === cs.length);
const roleKeys = z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,40}$/)).max(50);

const toPage = (r: Row): Page => ({
  id: r.id,
  name: r.name,
  cards: r.cards ?? [],
  homeFor: r.home_for ?? [],
  sharedWith: r.shared_with ?? [],
  position: r.position,
  updatedAt: iso(r.updated_at)!,
});

pageRoutes.get('/pages', async (c) => {
  const auth = c.get('auth');
  const rows = await run(c, (q) => q.query('select * from pages order by position, created_at'));
  const pages = rows.map(toPage);
  // Without a home of its own a role starts on the first page it can open.
  const home = pages.find((p) => p.homeFor.includes(auth.roleKey)) ?? pages[0] ?? null;
  return c.json({ pages, homeId: home?.id ?? null });
});

pageRoutes.get('/pages/:id', async (c) => {
  const id = param(c, 'id');
  const [row] = await run(c, (q) => q.query('select * from pages where id = $1', [id]));
  if (!row) fail('not_found');
  return c.json({ page: toPage(row) });
});

pageRoutes.get('/pages/:id/data', async (c) => {
  const id = param(c, 'id');
  const data = await run(c, async (q) => {
    const [row] = await q.query('select cards from pages where id = $1', [id]);
    if (!row) fail('not_found');
    return cardsData(c, q, row.cards ?? []);
  });
  return c.json({ data });
});

/** What cards would show, before the page is saved (for the editor). */
pageRoutes.post('/pages/preview', async (c) => {
  requirePerm(c, 'org.manage');
  const input = await body(c, z.object({ cards: cardsSchema }));
  const data = await run(c, (q) => cardsData(c, q, input.cards as Card[]));
  return c.json({ data });
});

const pageInput = z.object({
  name: z.string().trim().min(1).max(80),
  cards: cardsSchema.optional(),
  homeFor: roleKeys.optional(),
  sharedWith: roleKeys.optional(),
});

/** A role has one home: giving it a new one takes it off the old. */
async function moveHomes(q: Q, pageId: string, homeFor: string[] | undefined) {
  if (!homeFor?.length) return;
  await q.query(
    `update pages set home_for = array(select k from unnest(home_for) k where k <> all ($2::text[])), updated_at = now()
      where id <> $1 and home_for && $2::text[]`,
    [pageId, homeFor],
  );
}

pageRoutes.post('/pages', async (c) => {
  requirePerm(c, 'org.manage');
  const input = await body(c, pageInput);
  const org = c.get('org');
  const auth = c.get('auth');
  const row = await run(c, async (q) => {
    const [{ n }] = await q.query<{ n: number }>('select coalesce(max(position) + 1, 0)::int as n from pages');
    const id = crypto.randomUUID();
    await moveHomes(q, id, input.homeFor);
    const [r] = await q.query(
      `insert into pages (id, org_id, name, cards, home_for, shared_with, position, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [id, org.id, input.name, JSON.stringify(input.cards ?? []), input.homeFor ?? [], input.sharedWith ?? [], n, auth.userId],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'page.created', entity: 'page', entityId: id, meta: { name: input.name } });
    return r;
  });
  return c.json({ page: toPage(row) }, 201);
});

/** A ready-made dashboard, added as a page of the company's own (to change as they like). */
pageRoutes.post('/pages/from-template', async (c) => {
  requirePerm(c, 'org.manage');
  const input = await body(c, z.object({ template: z.string().max(40), name: z.string().trim().min(1).max(80).optional() }));
  const tpl = DASHBOARD_TEMPLATES.find((t) => t.key === input.template);
  if (!tpl) return fail('not_found');
  const org = c.get('org');
  const auth = c.get('auth');
  const cards = tpl.cards.map((k, i) => ('report' in k ? { id: `c${i + 1}`, type: 'report', size: k.size, report: k.report, ...(k.chart ? { chart: k.chart } : {}) } : { id: `c${i + 1}`, ...k }));
  const name = input.name ?? pick(tpl.name, c.get('locale'));
  const row = await run(c, async (q) => {
    const [{ n }] = await q.query<{ n: number }>('select coalesce(max(position) + 1, 0)::int as n from pages');
    const [r] = await q.query(`insert into pages (org_id, name, cards, position, created_by) values ($1, $2, $3, $4, $5) returning *`, [org.id, name, JSON.stringify(cards), n, auth.userId]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'page.created', entity: 'page', entityId: r.id, meta: { name, template: tpl.key } });
    return r;
  });
  return c.json({ page: toPage(row) }, 201);
});

pageRoutes.patch('/pages/:id', async (c) => {
  requirePerm(c, 'org.manage');
  const id = param(c, 'id');
  const input = await body(c, pageInput.partial());
  const org = c.get('org');
  const auth = c.get('auth');
  const row = await run(c, async (q) => {
    const [p] = await q.query('select * from pages where id = $1', [id]);
    if (!p) fail('not_found');
    await moveHomes(q, id, input.homeFor);
    const [r] = await q.query(
      `update pages set name = $2, cards = $3, home_for = $4, shared_with = $5, updated_at = now() where id = $1 returning *`,
      [
        id,
        input.name ?? p.name,
        JSON.stringify(input.cards ?? p.cards),
        input.homeFor ?? p.home_for,
        input.sharedWith ?? p.shared_with,
      ],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'page.updated', entity: 'page', entityId: id, meta: { fields: Object.keys(input) } });
    return r;
  });
  return c.json({ page: toPage(row) });
});

pageRoutes.put('/pages/order', async (c) => {
  requirePerm(c, 'org.manage');
  const input = await body(c, z.object({ ids: z.array(uuid).max(200) }));
  await run(c, async (q) => {
    for (const [i, id] of input.ids.entries()) await q.query('update pages set position = $2 where id = $1', [id, i]);
  });
  return c.json({ ok: true });
});

pageRoutes.delete('/pages/:id', async (c) => {
  requirePerm(c, 'org.manage');
  const id = param(c, 'id');
  const org = c.get('org');
  const auth = c.get('auth');
  await run(c, async (q) => {
    const rows = await q.query('delete from pages where id = $1 returning name', [id]);
    if (!rows.length) fail('not_found');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'page.deleted', entity: 'page', entityId: id, meta: { name: rows[0].name } });
  });
  return c.json({ ok: true });
});

// ------------------------------------------------------------- card data

// $1 is always the viewer. Every account query also runs under the
// database's own rules, so "all" means "all this person may see".
const MY_TEAMS = `(select team_id from team_members where user_id = $1 union select id from teams where lead_id = $1)`;
const SCOPE: Record<CardScope, string> = {
  mine: `a.owner_id = $1`,
  team: `(a.owner_id = $1 or a.team_id in ${MY_TEAMS} or a.owner_id in (select m.user_id from team_members m where m.team_id in ${MY_TEAMS}))`,
  // Mentions $1 so every query takes the same first argument.
  all: `$1::uuid is not null`,
};
const base = (scope: CardScope | undefined) => `a.archived_at is null and ${SCOPE[scope ?? 'all']}`;
const OPEN = `t.archived_at is null and t.parent_id is null
  and t.done_at is null`;
const dateOf = (p: string) => `(case when a.fields->>${p} ~ '^\\d{4}-\\d{2}-\\d{2}' then substr(a.fields->>${p}, 1, 10)::date end)`;
const moneyOf = (p: string) => `(case when jsonb_typeof(a.fields->${p}) = 'number' then (a.fields->>${p})::numeric end)`;
const taskScope: Record<CardScope, string> = {
  mine: `$1 = any (t.assignee_ids)`,
  team: `t.assignee_ids && array(select m.user_id from team_members m where m.team_id in ${MY_TEAMS})`,
  all: `$1::uuid is not null`,
};

type Pick = { field: AccountField } | { hidden: true } | { missing: true };

interface Ctx {
  q: Q;
  me: string;
  viewer: Viewer & AuthCtx;
  locale: Locale;
  today: string;
  all: AccountField[];
  seen: AccountField[];
  c: C;
  /** What reports can be made from, loaded once for the page. */
  cat?: Catalog;
}

/** The field a card reads: the one chosen, or a sensible guess among those this person can see. */
function fieldFor(ctx: Ctx, type: FieldType, explicit: string | undefined, preferred: string[]): Pick {
  if (explicit) {
    const f = ctx.all.find((d) => d.key === explicit);
    if (!f || f.type !== type) return { missing: true };
    return canSeeField(f, ctx.viewer) ? { field: f } : { hidden: true };
  }
  const seen = ctx.seen.filter((d) => d.type === type);
  const f = preferred.map((k) => seen.find((d) => d.key === k)).find(Boolean) ?? seen[0];
  if (f) return { field: f };
  return ctx.all.some((d) => d.type === type) ? { hidden: true } : { missing: true };
}

const RISKY = /risk|danger|churn|red|bad|critical|kritik|kotu|kötü/i;
function attentionOptions(f: AccountField, chosen?: string[]) {
  const keys = (f.options ?? []).map((o) => o.key);
  if (chosen?.length) return chosen.filter((k) => keys.includes(k));
  const risky = keys.filter((k) => RISKY.test(k));
  return risky.length ? risky : keys.slice(-1);
}

const optionOf = (ctx: Ctx, f: AccountField | null, key: unknown) => {
  if (!f || key == null) return null;
  const o = f.options?.find((x) => x.key === key);
  return o ? { label: pick(o.label, ctx.locale), color: o.color ?? null } : null;
};

const num = (v: unknown) => (v == null ? null : Number(v));

async function cardsData(c: C, q: Q, cards: Card[]): Promise<Record<string, CardData>> {
  const org = c.get('org');
  const auth = c.get('auth');
  const all = (org.account_fields ?? []) as AccountField[];
  const ctx: Ctx = {
    q,
    me: auth.userId,
    viewer: auth,
    locale: c.get('locale'),
    today: localDate(nowOf(c.get('deps')), org.timezone || 'UTC'),
    all,
    seen: defsFor(all, auth),
    c,
  };
  const out: Record<string, CardData> = {};
  for (const card of cards) {
    try {
      out[card.id] = await cardData(ctx, card);
    } catch (e) {
      console.error('[tendwell] card', card.type, e);
      out[card.id] = { kind: 'list', rows: [], total: 0 };
    }
  }
  return out;
}

async function cardData(ctx: Ctx, card: Card): Promise<CardData> {
  const { q, me, today } = ctx;
  const days = card.days ?? (card.type === 'quiet' ? 30 : 90);
  const health = fieldFor(ctx, 'select', undefined, ['health']);
  const healthField = 'field' in health ? health.field : null;
  const moneyPick = fieldFor(ctx, 'money', undefined, ['arr', 'mrr', 'deal_value']);
  const money = 'field' in moneyPick ? moneyPick.field : null;

  switch (card.type) {
    case 'note':
      return { kind: 'note', text: card.text ?? '' };

    case 'report': {
      let def: ReportDef;
      let name: string;
      if (card.reportId) {
        // A report its maker kept to themselves (or deleted) is not there for this person.
        const [r] = await q.query<{ name: string; def: ReportDef }>('select name, def from reports where id = $1', [card.reportId]);
        if (!r) return { kind: 'missing', need: 'report' };
        def = r.def;
        name = r.name;
      } else {
        const lib = libraryReport(card.report ?? '');
        if (!lib) return { kind: 'missing', need: 'report' };
        def = lib.def;
        name = pick(lib.name, ctx.locale);
      }
      const ectx = engineCtx(ctx.c, q);
      ctx.cat ??= await loadCatalog(ectx);
      const result = await runReport(ectx, ctx.cat, def);
      return { kind: 'report', name, chart: card.chart ?? def.chart, source: def.source, reportId: card.reportId ?? null, library: card.reportId ? null : (card.report ?? null), result };
    }

    case 'my_tasks': {
      const rows = await q.query(
        `select t.id, t.title, t.due_date::text as due, t.account_id, a.name as account_name, b.name as board_name,
                (t.due_date - $2::date) as left_days
           from tasks t join boards b on b.id = t.board_id left join accounts a on a.id = t.account_id
          where ${OPEN} and b.archived_at is null and $1 = any (t.assignee_ids)
          order by t.due_date nulls last, t.updated_at desc limit 8`,
        [me, today],
      );
      const [n] = await q.query(
        `select count(*)::int as total, count(*) filter (where t.due_date < $2::date)::int as overdue
           from tasks t join boards b on b.id = t.board_id where ${OPEN} and b.archived_at is null and $1 = any (t.assignee_ids)`,
        [me, today],
      );
      return {
        kind: 'list',
        total: n.total,
        extra: n.overdue,
        rows: rows.map((r): CardRow => {
          const left = num(r.left_days);
          return {
            id: r.id,
            accountId: r.account_id,
            title: r.title,
            sub: r.account_name ?? r.board_name,
            date: r.due,
            days: left,
            flag: left == null ? null : left < 0 ? 'overdue' : left <= 2 ? 'soon' : null,
          };
        }),
      };
    }

    case 'renewals': {
      const p = fieldFor(ctx, 'date', card.field, ['renewal_date', 'close_date']);
      if ('hidden' in p) return { kind: 'hidden' };
      if ('missing' in p) return { kind: 'missing', need: 'date' };
      const d = dateOf('$2');
      const where = `${base(card.scope)} and ${d} between $3::date and $3::date + $4::int`;
      const args = [me, p.field.key, today, days];
      const rows = await q.query(
        `select a.id, a.name, a.owner_id, ${d}::text as due, (${d} - $3::date) as left_days,
                ${moneyOf('$5')} as amount, a.fields->>$6 as opt
           from accounts a where ${where} order by ${d}, lower(a.name) limit 8`,
        [...args, money?.key ?? '', healthField?.key ?? ''],
      );
      const [n] = await q.query(
        `select count(*)::int as total, sum(${moneyOf('$5')}) as amount from accounts a where ${where}`,
        [...args, money?.key ?? ''],
      );
      return {
        kind: 'list',
        total: n.total,
        extra: num(n.amount) ?? undefined,
        rows: rows.map((r) => ({
          id: r.id,
          accountId: r.id,
          title: r.name,
          ownerId: r.owner_id,
          date: r.due,
          days: num(r.left_days),
          amount: num(r.amount),
          chip: optionOf(ctx, healthField, r.opt),
          flag: num(r.left_days)! <= 30 ? 'soon' : null,
        })),
      };
    }

    case 'attention': {
      const p = fieldFor(ctx, 'select', card.field, ['health']);
      if ('hidden' in p) return { kind: 'hidden' };
      if ('missing' in p) return { kind: 'missing', need: 'select' };
      const opts = attentionOptions(p.field, card.options);
      const where = `${base(card.scope)} and a.fields->>$2 = any ($3::text[])`;
      const rows = await q.query(
        `select a.id, a.name, a.owner_id, a.fields->>$2 as opt, ${moneyOf('$4')} as amount
           from accounts a where ${where} order by amount desc nulls last, lower(a.name) limit 8`,
        [me, p.field.key, opts, money?.key ?? ''],
      );
      const [n] = await q.query(
        `select count(*)::int as total, sum(${moneyOf('$4')}) as amount from accounts a where ${where}`,
        [me, p.field.key, opts, money?.key ?? ''],
      );
      return {
        kind: 'list',
        total: n.total,
        extra: num(n.amount) ?? undefined,
        rows: rows.map((r) => ({ id: r.id, accountId: r.id, title: r.name, ownerId: r.owner_id, amount: num(r.amount), chip: optionOf(ctx, p.field, r.opt) })),
      };
    }

    case 'quiet': {
      // Last touch: a logged call, meeting, email or note, or work on one of its tasks.
      const last = `(select max(x) from (select max(greatest(t.updated_at, t.created_at)) as x from tasks t where t.account_id = a.id
                      union all select max(v.happened_at) from activities v where v.account_id = a.id) l)`;
      const where = `${base(card.scope)} and coalesce(${last}, a.created_at) < now() - make_interval(days => $2::int)`;
      const rows = await q.query(
        `select a.id, a.name, a.owner_id, ${last} as last_at,
                floor(extract(epoch from now() - coalesce(${last}, a.created_at)) / 86400)::int as quiet_days
           from accounts a where ${where} order by ${last} nulls first, lower(a.name) limit 8`,
        [me, days],
      );
      const [n] = await q.query(`select count(*)::int as total from accounts a where ${where}`, [me, days]);
      return {
        kind: 'list',
        total: n.total,
        rows: rows.map((r) => ({ id: r.id, accountId: r.id, title: r.name, ownerId: r.owner_id, days: num(r.quiet_days), date: r.last_at ? iso(r.last_at)!.slice(0, 10) : null })),
      };
    }

    case 'stakeholders': {
      const [type] = await q.query(`select id, fields from record_types where kind = 'contact' and archived_at is null order by created_at limit 1`);
      if (!type) return { kind: 'missing', need: 'contacts' };
      const stance = (type.fields ?? []).find((f: AccountField) => f.key === 'stance');
      if (!stance) return { kind: 'missing', need: 'contacts' };
      if (!canSeeField(stance, ctx.viewer)) return { kind: 'hidden' };
      const where = `${base(card.scope)} and r.archived_at is null and r.type_id = $2 and r.fields->>'stance' in ('blocker', 'skeptic')`;
      const rows = await q.query(
        `select r.id, r.name, r.fields->>'stance' as opt, a.id as account_id, a.name as account_name, a.owner_id
           from records r join accounts a on a.id = r.account_id where ${where}
          order by (r.fields->>'stance') = 'blocker' desc, lower(a.name), lower(r.name) limit 8`,
        [me, type.id],
      );
      const [n] = await q.query(`select count(*)::int as total from records r join accounts a on a.id = r.account_id where ${where}`, [me, type.id]);
      const [none] = await q.query(
        `select count(*)::int as n from accounts a where ${base(card.scope)}
            and not exists (select 1 from records r where r.account_id = a.id and r.type_id = $2 and r.archived_at is null and r.fields->>'stance' = 'champion')`,
        [me, type.id],
      );
      return {
        kind: 'list',
        total: n.total,
        extra: none.n,
        rows: rows.map((r) => ({
          id: r.id,
          accountId: r.account_id,
          title: r.name,
          sub: r.account_name,
          ownerId: r.owner_id,
          chip: optionOf(ctx, stance, r.opt) && { ...optionOf(ctx, stance, r.opt)!, color: optionOf(ctx, stance, r.opt)!.color ?? (r.opt === 'blocker' ? 'coral' : 'honey') },
        })),
      };
    }

    case 'metric': {
      const metric = card.metric ?? 'accounts';
      if (metric === 'accounts') {
        const [n] = await q.query(`select count(*)::int as n from accounts a where ${base(card.scope)}`, [me]);
        return { kind: 'number', value: n.n, unit: 'count' };
      }
      if (metric === 'money') {
        const p = fieldFor(ctx, 'money', card.field, ['arr', 'mrr', 'deal_value']);
        if ('hidden' in p) return { kind: 'hidden' };
        if ('missing' in p) return { kind: 'missing', need: 'money' };
        const [n] = await q.query(`select coalesce(sum(${moneyOf('$2')}), 0) as v, count(*)::int as n from accounts a where ${base(card.scope)}`, [me, p.field.key]);
        return { kind: 'number', value: Number(n.v), unit: 'money', sub: { value: n.n, unit: 'count' } };
      }
      if (metric === 'attention') {
        const p = fieldFor(ctx, 'select', card.field, ['health']);
        if ('hidden' in p) return { kind: 'hidden' };
        if ('missing' in p) return { kind: 'missing', need: 'select' };
        const [n] = await q.query(
          `select count(*)::int as n, sum(${moneyOf('$4')}) as v from accounts a where ${base(card.scope)} and a.fields->>$2 = any ($3::text[])`,
          [me, p.field.key, attentionOptions(p.field, card.options), money?.key ?? ''],
        );
        return { kind: 'number', value: n.n, unit: 'count', sub: n.v != null ? { value: Number(n.v), unit: 'money' } : null };
      }
      if (metric === 'renewals') {
        const p = fieldFor(ctx, 'date', card.field, ['renewal_date', 'close_date']);
        if ('hidden' in p) return { kind: 'hidden' };
        if ('missing' in p) return { kind: 'missing', need: 'date' };
        const [n] = await q.query(
          `select count(*)::int as n, sum(${moneyOf('$5')}) as v from accounts a
            where ${base(card.scope)} and ${dateOf('$2')} between $3::date and $3::date + $4::int`,
          [me, p.field.key, today, days, money?.key ?? ''],
        );
        return { kind: 'number', value: n.n, unit: 'count', sub: n.v != null ? { value: Number(n.v), unit: 'money' } : null };
      }
      const overdue = metric === 'overdue' ? `and t.due_date < $2::date` : `and $2::date is not null`;
      const [n] = await q.query(
        `select count(*)::int as n from tasks t join boards b on b.id = t.board_id
          where ${OPEN} and b.archived_at is null and ${taskScope[card.scope ?? 'all']} ${overdue}`,
        [me, today],
      );
      return { kind: 'number', value: n.n, unit: 'count' };
    }

    case 'breakdown': {
      const by = card.by ?? 'field';
      if (by === 'field') {
        const p = fieldFor(ctx, 'select', card.field, ['health', 'tier']);
        if ('hidden' in p) return { kind: 'hidden' };
        if ('missing' in p) return { kind: 'missing', need: 'select' };
        const rows = await q.query(`select a.fields->>$2 as k, count(*)::int as n from accounts a where ${base(card.scope)} group by 1`, [me, p.field.key]);
        const counts = new Map(rows.map((r) => [r.k ?? '', r.n]));
        const bars = (p.field.options ?? []).map((o) => ({ key: o.key, label: pick(o.label, ctx.locale), value: counts.get(o.key) ?? 0, color: o.color ?? null }));
        const known = new Set(bars.map((b) => b.key));
        const other = rows.filter((r) => !known.has(r.k ?? '')).reduce((s, r) => s + r.n, 0);
        if (other) bars.push({ key: '__none', label: '', value: other, color: null });
        return { kind: 'bars', unit: 'count', bars };
      }
      const col = by === 'owner' ? 'a.owner_id' : 'a.team_id';
      const names = by === 'owner' ? 'select id, name from users' : 'select id, name from teams';
      const rows = await q.query(`select ${col} as k, count(*)::int as n from accounts a where ${base(card.scope)} group by 1 order by 2 desc limit 12`, [me]);
      const who = new Map((await q.query(names)).map((r) => [r.id, r.name]));
      return {
        kind: 'bars',
        unit: 'count',
        bars: rows.map((r) => ({ key: r.k ?? '__none', label: r.k ? (who.get(r.k) ?? '') : '', value: r.n, color: null })),
      };
    }

    case 'team_load': {
      const everyone = ctx.viewer.perms.includes('accounts.view_all');
      const people = await q.query(
        `select u.id, u.name from users u
          where u.status = 'active' and u.seat = 'full'
            and ($2 or u.id = $1 or u.id in (select m.user_id from team_members m where m.team_id in ${MY_TEAMS}))
          order by lower(u.name) limit 60`,
        [me, everyone],
      );
      const ids = people.map((p) => p.id);
      const accounts = await q.query(
        `select a.owner_id as id, count(*)::int as n, sum(${moneyOf('$3')}) as v,
                count(*) filter (where a.fields->>$4 = any ($5::text[]))::int as risk
           from accounts a where a.archived_at is null and a.owner_id = any ($2::uuid[]) and $1::uuid is not null group by 1`,
        [me, ids, money?.key ?? '', healthField?.key ?? '', healthField ? attentionOptions(healthField) : []],
      );
      const tasks = await q.query(
        `select u.id, count(*)::int as open, count(*) filter (where t.due_date < $3::date)::int as overdue
           from tasks t join boards b on b.id = t.board_id, unnest(t.assignee_ids) as u(id)
          where ${OPEN} and b.archived_at is null and u.id = any ($2::uuid[]) and $1::uuid is not null group by 1`,
        [me, ids, today],
      );
      const acc = new Map(accounts.map((r) => [r.id, r]));
      const tk = new Map(tasks.map((r) => [r.id, r]));
      return {
        kind: 'people',
        unit: money ? 'money' : null,
        rows: people.map((p) => ({
          userId: p.id,
          name: p.name,
          accounts: acc.get(p.id)?.n ?? 0,
          money: money ? Number(acc.get(p.id)?.v ?? 0) : null,
          attention: acc.get(p.id)?.risk ?? 0,
          open: tk.get(p.id)?.open ?? 0,
          overdue: tk.get(p.id)?.overdue ?? 0,
        })),
      };
    }

    case 'sync_health': {
      if (!ctx.viewer.perms.includes('connections.manage')) return { kind: 'hidden' };
      const rows = await q.query(
        `select c.id, c.provider, c.label, c.status, c.state->'lastRun' as last_run,
                (select count(*)::int from sync_changes s where s.connection_id = c.id and s.attempts > 0) as problems
           from connections c where c.kind = 'source' and c.status <> 'disabled' order by c.created_at`,
      );
      return {
        kind: 'sync',
        rows: rows.map((r) => ({
          id: r.id,
          provider: r.provider,
          name: r.label,
          status: r.last_run?.status ?? r.status,
          lastRunAt: r.last_run?.at ?? null,
          problems: r.problems,
          ok: r.status === 'active' && (!r.last_run || r.last_run.status === 'ok') && !r.problems,
        })),
      };
    }
  }
}
