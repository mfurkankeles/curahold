// Onboarding plans on the server (db/migrations/0200_onboarding.sql,
// shared/src/onboarding.ts): making a plan from a blueprint, reading the
// product signals that complete steps by themselves, putting a plan together
// for the API, the hand-over hooks (a won deal opens a draft plan; confirming
// the hand-over starts it; a finished plan hands the customer to Customer
// Success with a health baseline), in-app reminders for stalled steps, and the
// onboarding input of the health score.
//
// Every function takes a `q` and filters on org_id itself, so it works under the
// person's own row security (routes) and with owner access (scheduler, hooks).
//
// The setup checks (setup health, "test your setup") are read by contract, not
// by importing their code: lib/onboardingSetup.ts is the one adapter
// (docs/DEVELOPER.md, "Onboarding plans").
import { translate, type Locale, type MessageKey } from '../../../shared/src/i18n';
import {
  BUILT_IN_TEMPLATES,
  builtInTemplate,
  checkField,
  healthSignals,
  isSignal,
  NO_SETUP,
  onboardingSettings,
  phaseOrder,
  templateFor,
  ASK_TEMPLATE,
  progressOf,
  scheduleSteps,
  SIGNALS,
  STALL_DAYS,
  stalled,
  type Blueprint,
  type Plan,
  type PlanKind,
  type PlanStep,
  type PlanSummary,
  type SignalFacts,
  type SignalId,
} from '../../../shared/src/onboarding';
import type { AccountField } from '../../../shared/src/model';
import type { Deps } from '../context';
import type { Q, Row } from '../db';
import { audit } from './audit';
import { localDate } from '../../../shared/src/days';
import { enqueue } from './notify';
import { setupState, syncSetupIssues } from './onboardingSetup';

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v).slice(0, 10));
const num = (v: unknown) => (v == null ? null : Number(v));

// ------------------------------------------------------------------ signals

/** The company-wide facts (its own plan). One query, no cost. */
async function companyFacts(q: Q, orgId: string): Promise<SignalFacts> {
  const [r] = await q.query(
    `select
       (select count(*) from users u where u.org_id = $1 and u.status in ('active', 'invited')) >= 2 as team,
       exists (select 1 from department_members dm join departments d on d.id = dm.department_id where d.org_id = $1 and d.enabled and dm.role = 'lead') as depts,
       exists (select 1 from import_batches b where b.org_id = $1 and b.undone_at is null
                 and coalesce((b.summary->>'created')::int, 0) + coalesce((b.summary->>'updated')::int, 0) > 0) as import,
       exists (select 1 from accounts a where a.org_id = $1 and a.archived_at is null) as customers,
       exists (select 1 from connections c where c.org_id = $1 and c.kind = 'source' and c.status = 'active') as sync_auth,
       exists (select 1 from connections c where c.org_id = $1 and c.kind = 'source' and c.status = 'active' and c.last_ok_at is not null) as sync_ok,
       exists (select 1 from records r join record_types t on t.id = r.type_id where r.org_id = $1 and t.kind = 'ticket') as ticket,
       (select coalesce((o.settings->'portal'->>'enabled')::boolean, false)
               and (o.settings->'portal'->'brand'->>'color' is not null or o.settings->'logo' is not null) from orgs o where o.id = $1) as portal,
       exists (select 1 from automations x where x.org_id = $1) as automation`,
    [orgId],
  );
  const facts: SignalFacts = {
    'team.invited': !!r.team,
    'departments.set': !!r.depts,
    'import.ok': !!r.import,
    'customers.first': !!r.customers,
    'sync.authorised': !!r.sync_auth,
    'sync.ok': !!r.sync_ok,
    'ticket.first': !!r.ticket,
    'portal.branded': !!r.portal,
    'automation.first': !!r.automation,
  };
  // The setup checks, by contract (lib/onboardingSetup.ts; a customer's plan has none: its steps wait for a person).
  const setup = await setupState(q, orgId);
  if (setup.available) {
    if (setup.checkedAt) facts['setup.health'] = setup.failing.length === 0;
    facts['setup.test'] = setup.testsDone;
  }
  return facts;
}

/** What is known about one customer (a client plan). */
async function customerFacts(q: Q, orgId: string, accountId: string): Promise<SignalFacts> {
  const [r] = await q.query(
    `select
       exists (select 1 from handovers h where h.org_id = $1 and h.account_id = $2 and h.status = 'confirmed' and h.source_kind <> 'onboarding') as handover,
       exists (select 1 from account_team t join departments d on d.id = t.department_id where t.org_id = $1 and t.account_id = $2 and d.key in ('onboarding', 'success')) as owner,
       exists (select 1 from portal_users p where p.org_id = $1 and p.account_id = $2 and p.status <> 'disabled') as invited,
       exists (select 1 from portal_users p where p.org_id = $1 and p.account_id = $2 and p.last_seen_at is not null) as active,
       exists (select 1 from tasks t join portal_users p on p.id = t.portal_author_id where t.org_id = $1 and p.account_id = $2) as request,
       exists (select 1 from records r join record_types rt on rt.id = r.type_id where r.org_id = $1 and r.account_id = $2 and rt.kind = 'ticket') as ticket,
       exists (select 1 from activities a where a.org_id = $1 and a.account_id = $2 and a.kind in ('meeting', 'review', 'call')
                 and a.happened_at > coalesce((select min(p.created_at) from onboarding_plans p where p.org_id = $1 and p.account_id = $2), now())) as meeting`,
    [orgId, accountId],
  );
  return {
    'client.handover': !!r.handover,
    'client.owner': !!r.owner,
    'client.portalInvited': !!r.invited,
    'client.portalActive': !!r.active,
    'client.firstRequest': !!r.request,
    'client.ticket': !!r.ticket,
    'client.meeting': !!r.meeting,
  };
}

/** Facts about the plan itself: a customer sponsor named, every mapping row checked by both sides, goals agreed. */
async function planFacts(q: Q, planId: string): Promise<SignalFacts> {
  const [r] = await q.query(
    `select
       exists (select 1 from onboarding_people x where x.plan_id = $1 and x.side = 'customer' and x.role in ('sponsor', 'lead')) as people,
       exists (select 1 from onboarding_fields f where f.plan_id = $1)
         and not exists (select 1 from onboarding_fields f where f.plan_id = $1 and (f.checked_at is null or f.verified_at is null)) as mapping,
       exists (select 1 from onboarding_goals g where g.plan_id = $1 and g.target_on is not null) as goals`,
    [planId],
  );
  return { 'plan.people': !!r.people, 'plan.mapping': !!r.mapping, 'plan.goals': !!r.goals };
}

export async function factsFor(q: Q, orgId: string, plan: { id: string; kind: PlanKind; account_id: string | null }, needed: Set<SignalId>): Promise<SignalFacts> {
  const scopes = new Set([...needed].map((s) => SIGNALS[s].scope));
  const out: SignalFacts = {};
  if (scopes.has('company')) Object.assign(out, await companyFacts(q, orgId));
  if (scopes.has('customer') && plan.account_id) Object.assign(out, await customerFacts(q, orgId, plan.account_id));
  if (scopes.has('plan')) Object.assign(out, await planFacts(q, plan.id));
  return out;
}

/**
 * Moves a plan on from what the product can see: steps whose signal is now true
 * are done (by themselves; a step stays done), issues whose ticket was solved
 * are resolved. Returns the keys of the steps it completed.
 */
export async function advancePlan(q: Q, orgId: string, planId: string): Promise<string[]> {
  const [plan] = await q.query('select p.id, p.kind, p.account_id, p.status, o.locale from onboarding_plans p join orgs o on o.id = p.org_id where p.id = $1 and p.org_id = $2', [planId, orgId]);
  if (!plan || !['active', 'paused', 'draft'].includes(plan.status)) return [];
  // A failed setup test is one shared issue on the company's own plan.
  if (plan.kind === 'self') await syncSetupIssues(q, orgId, planId, await setupState(q, orgId), (plan.locale ?? 'en') as Locale);
  const open = await q.query<{ id: string; key: string; signal: string }>(
    `select id, key, signal from onboarding_steps where plan_id = $1 and org_id = $2 and signal is not null and status not in ('done', 'skipped')`,
    [planId, orgId],
  );
  const needed = new Set(open.map((x) => x.signal).filter(isSignal));
  const facts = needed.size ? await factsFor(q, orgId, plan as any, needed) : {};
  const hit = open.filter((x) => isSignal(x.signal) && facts[x.signal]);
  if (hit.length) {
    await q.query(`update onboarding_steps set status = 'done', done_at = now(), done_how = 'auto', updated_at = now() where id = any($1::uuid[])`, [hit.map((x) => x.id)]);
  }
  // A linked ticket that is solved or closed resolves its issue (the ticket is the truth).
  await q.query(
    `update onboarding_issues i set status = 'resolved', resolved_at = now(), updated_at = now()
       from records r where i.plan_id = $1 and i.org_id = $2 and i.record_id = r.id and i.status <> 'resolved'
        and r.fields->>'status' in ('solved', 'closed')`,
    [planId, orgId],
  );
  if (hit.length) await q.query('update onboarding_plans set updated_at = now() where id = $1', [planId]);
  return hit.map((x) => x.key);
}

// ------------------------------------------------------------------ making a plan

export interface NewPlan {
  orgId: string;
  actorId: string | null;
  kind: PlanKind;
  accountId: string | null;
  name: string;
  blueprint: Blueprint;
  templateId?: string | null;
  handoverId?: string | null;
  status?: 'draft' | 'active';
  department?: 'onboarding' | 'success' | null;
  ownerId?: string | null;
  note?: string;
  welcome?: string;
  startOn: string;
  locale: Locale;
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Makes a plan and everything in it from a blueprint. Returns its id. */
export async function createPlan(q: Q, p: NewPlan): Promise<string> {
  const bp = p.blueprint;
  const dates = scheduleSteps(bp.steps, p.startOn);
  const lastDue = [...dates.values()].map((d) => d.due).sort().pop() ?? null;
  const target = bp.days ? addDays(p.startOn, bp.days) : lastDue;
  const [plan] = await q.query<{ id: string }>(
    `insert into onboarding_plans (org_id, kind, account_id, template_id, handover_id, name, status, department, owner_id, welcome, note, started_on, target_on, created_by, phases)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) returning id`,
    [p.orgId, p.kind, p.accountId, p.templateId ?? null, p.handoverId ?? null, p.name.slice(0, 160), p.status ?? 'active', p.department ?? null, p.ownerId ?? null, (p.welcome ?? '').slice(0, 4000), (p.note ?? '').slice(0, 8000), p.startOn, target, p.actorId, JSON.stringify(bp.phases ?? [])],
  );
  const sites: Row[] = [];
  for (const [i, raw] of (bp.sites ?? []).entries()) {
    const name = raw.startsWith('ob.') ? translate(p.locale, raw as MessageKey) : raw;
    const [row] = await q.query('insert into onboarding_sites (org_id, plan_id, name, position) values ($1, $2, $3, $4) returning id', [p.orgId, plan.id, name.slice(0, 120), i]);
    sites.push(row);
  }
  for (const [i, st] of bp.steps.entries()) {
    const d = dates.get(st.key)!;
    await q.query(
      `insert into onboarding_steps (org_id, plan_id, key, title_key, title, body, phase, position, side, owner_id, signal, effort_days, hands_on_hours, start_on, due_on, depends_on, fix, guide, form, upload, required)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [
        p.orgId, plan.id, st.key, st.titleKey ?? null, st.title ?? null, st.body ?? '', st.phase, i, st.side,
        st.side === 'customer' ? null : (p.ownerId ?? null), st.signal ?? null, st.days ?? null, st.hours ?? null, d.start, d.due,
        (st.after ?? []).filter((k) => bp.steps.some((x) => x.key === k)), st.fix ?? null, st.guide ?? null, st.form ?? [], !!st.upload, !st.optional,
      ],
    );
  }
  for (const [i, g] of bp.goals.entries()) {
    await q.query(`insert into onboarding_goals (org_id, plan_id, title_key, title, priority, target_on, position) values ($1, $2, $3, $4, $5, $6, $7)`, [
      p.orgId, plan.id, g.titleKey ?? null, g.title ?? null, g.priority, g.days ? addDays(p.startOn, g.days) : null, i,
    ]);
  }
  for (const [i, m] of bp.metrics.entries()) {
    await q.query(`insert into onboarding_metrics (org_id, plan_id, title_key, title, unit, better, position) values ($1, $2, $3, $4, $5, $6, $7)`, [p.orgId, plan.id, m.titleKey ?? null, m.title ?? null, m.unit, m.better, i]);
  }
  for (const [i, f] of bp.fields.entries()) {
    await q.query(`insert into onboarding_fields (org_id, plan_id, source, name, type, required, example, position) values ($1, $2, 'custom', $3, $4, $5, $6, $7) on conflict do nothing`, [
      p.orgId, plan.id, f.name, f.type, f.required, f.example ?? '', i,
    ]);
  }
  await seedPeople(q, p, plan.id);
  await refreshMapping(q, p.orgId, plan.id);
  await audit(q, { orgId: p.orgId, actorId: p.actorId, action: 'onboarding.plan_created', entity: p.accountId ? 'account' : 'org', entityId: p.accountId ?? p.orgId, meta: { plan: plan.id, kind: p.kind } });
  return plan.id;
}

/** Both sides to start with: the owner (and, for the company's own plan, Curahold's support) and the customer's people we know. */
async function seedPeople(q: Q, p: NewPlan, planId: string) {
  const T = (k: string) => translate(p.locale, k as MessageKey);
  const add = (side: string, name: string, role: string, opts: { userId?: string | null; contact?: string; duty?: string } = {}, position = 0) =>
    q.query(`insert into onboarding_people (org_id, plan_id, side, user_id, name, role, duty, contact, position) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
      p.orgId, planId, side, opts.userId ?? null, name.slice(0, 120), role, (opts.duty ?? '').slice(0, 300), (opts.contact ?? '').slice(0, 200), position,
    ]);
  if (p.kind === 'self') {
    // The vendor here is Curahold: its support desk is the contact.
    await add('vendor', T('ob.people.curahold'), 'lead', { duty: T('ob.people.curaholdDuty') });
    if (p.actorId) {
      const [u] = await q.query('select id, name from users where id = $1 and org_id = $2', [p.actorId, p.orgId]);
      if (u) await add('customer', u.name, 'lead', { userId: u.id });
    }
    return;
  }
  if (p.ownerId) {
    const [u] = await q.query('select id, name from users where id = $1 and org_id = $2', [p.ownerId, p.orgId]);
    if (u) await add('vendor', u.name, 'lead', { userId: u.id });
  }
  if (!p.accountId) return;
  // The customer's people as Sales left them (contacts with their stance): the decision maker becomes the sponsor.
  const contacts = await q.query(
    `select r.name, r.fields->>'decision' as decision, r.fields->>'stance' as stance, coalesce(r.fields->>'title', '') as title
       from records r join record_types rt on rt.id = r.type_id
      where r.org_id = $1 and r.account_id = $2 and rt.kind = 'contact' and r.archived_at is null
      order by (r.fields->>'decision' is not null) desc, r.created_at limit 6`,
    [p.orgId, p.accountId],
  );
  for (const [i, c] of contacts.entries()) {
    const role = c.decision ? 'sponsor' : c.stance === 'champion' ? 'lead' : 'user';
    await add('customer', c.name, role, { duty: c.title }, i);
  }
}

/**
 * The data-mapping table from what Curahold already knows: the company's own
 * plan lists the customer fields an import brought in and each connected
 * tool's field mapping; any plan lists the fields its steps' forms ask for.
 * Rows a person added or ticked are kept as they are.
 */
export async function refreshMapping(q: Q, orgId: string, planId: string) {
  const [plan] = await q.query('select p.kind, p.account_id, o.account_fields, o.locale from onboarding_plans p join orgs o on o.id = p.org_id where p.id = $1 and p.org_id = $2', [planId, orgId]);
  if (!plan) return;
  const defs = (plan.account_fields ?? []) as AccountField[];
  const label = (f: AccountField) => (f.label as any)?.[plan.locale] ?? (f.label as any)?.en ?? f.key;
  const typeOf = (t: string) => (['text', 'number', 'money', 'date', 'email', 'url', 'person'].includes(t) ? t : t === 'select' ? 'choice' : 'other');
  const rows: { source: string; name: string; target: string; type: string; example: string; ok: boolean | null; required: boolean }[] = [];
  if (plan.kind === 'self') {
    const [imp] = await q.query(`select summary from import_batches where org_id = $1 and kind = 'accounts' and undone_at is null order by created_at desc limit 1`, [orgId]);
    if (imp) {
      const [ex] = await q.query(`select fields from accounts where org_id = $1 and source = 'import' and archived_at is null order by created_at desc limit 1`, [orgId]);
      const ok = Number(imp.summary?.errors ?? 0) === 0;
      for (const f of defs.filter((d) => !d.rollup && !d.health).slice(0, 40)) {
        const v = ex?.fields?.[f.key];
        rows.push({ source: 'import', name: label(f), target: f.key, type: typeOf(f.type), example: v == null ? '' : String(v).slice(0, 300), ok, required: !!(f as any).required });
      }
    }
    const conns = await q.query(`select label, status, last_ok_at, config from connections where org_id = $1 and kind = 'source' and status <> 'disabled'`, [orgId]);
    for (const c of conns) {
      for (const o of (c.config?.sync?.objects ?? []) as { label: string; enabled: boolean; fields: { remote: string; local: string }[] }[]) {
        if (!o.enabled) continue;
        for (const f of (o.fields ?? []).slice(0, 40)) {
          rows.push({ source: 'sync', name: `${c.label} · ${o.label} · ${f.remote}`.slice(0, 120), target: f.local, type: 'other', example: '', ok: c.status === 'active' && !!c.last_ok_at, required: false });
        }
      }
    }
  }
  const forms = await q.query<{ key: string }>(`select distinct unnest(form) as key from onboarding_steps where plan_id = $1 and org_id = $2`, [planId, orgId]);
  if (forms.length) {
    const [acc] = plan.account_id ? await q.query('select fields from accounts where id = $1 and org_id = $2', [plan.account_id, orgId]) : [null];
    for (const { key } of forms) {
      const f = defs.find((d) => d.key === key);
      if (!f) continue;
      const v = acc?.fields?.[key];
      rows.push({ source: 'form', name: label(f), target: key, type: typeOf(f.type), example: v == null ? '' : String(v).slice(0, 300), ok: v != null && v !== '', required: true });
    }
  }
  for (const [i, r] of rows.entries()) {
    // What arrived is what the rules judge; the example stays what a person wrote, or the first value seen.
    await q.query(
      `insert into onboarding_fields (org_id, plan_id, source, name, target, type, example, auto_ok, required, position, received, received_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, case when $11::text is null then null else now() end)
       on conflict (plan_id, source, name) do update set auto_ok = excluded.auto_ok,
         example = case when onboarding_fields.example = '' then excluded.example else onboarding_fields.example end,
         received = coalesce(excluded.received, onboarding_fields.received),
         received_at = case when excluded.received is not null and excluded.received is distinct from onboarding_fields.received then now() else onboarding_fields.received_at end`,
      [orgId, planId, r.source, r.name, r.target, r.type, r.example, r.ok, r.required, 100 + i, r.source === 'sync' ? null : r.example === '' && r.source !== 'form' ? null : r.example],
    );
  }
  await judgeFields(q, orgId, planId);
}

/**
 * Runs the four rules on every row: a row that starts failing gets the day it
 * did; a failing row that passes again is fixed at once (it leaves the open
 * list without waiting for anything).
 */
/** Today in the company's own time zone (never the database server's day). */
export async function companyDay(q: Q, orgId: string): Promise<string> {
  const [o] = await q.query<{ timezone: string | null }>('select timezone from orgs where id = $1', [orgId]);
  return localDate(new Date(), o?.timezone || 'UTC');
}

export async function judgeFields(q: Q, orgId: string, planId: string) {
  const rows = await q.query('select id, type, required, received, auto_ok, failing_since, fixed_at from onboarding_fields where plan_id = $1 and org_id = $2', [planId, orgId]);
  for (const f of rows) {
    const failing = checkField({ type: f.type, required: f.required, received: f.received ?? null }).length > 0 || f.auto_ok === false;
    if (failing && !f.failing_since) await q.query('update onboarding_fields set failing_since = $2, fixed_at = null where id = $1', [f.id, await companyDay(q, orgId)]);
    else if (!failing && f.failing_since) await q.query('update onboarding_fields set failing_since = null, fixed_at = now() where id = $1', [f.id]);
  }
}

/** The company's own plan, made the first time it is asked for (or when its trial or paid start begins). */
export async function ensureSelfPlan(q: Q, orgId: string, actorId: string | null, today: string): Promise<string> {
  const [have] = await q.query('select id from onboarding_plans where org_id = $1 and kind = $2', [orgId, 'self']);
  if (have) return have.id;
  const [org] = await q.query('select name, locale from orgs where id = $1', [orgId]);
  const locale = (org?.locale ?? 'en') as Locale;
  const [tpl] = await q.query(`select id, body from onboarding_templates where org_id = $1 and kind = 'self' and archived_at is null order by created_at limit 1`, [orgId]);
  return createPlan(q, {
    orgId,
    actorId,
    kind: 'self',
    accountId: null,
    name: translate(locale, 'ob.self.name', { company: org?.name ?? '' }),
    blueprint: (tpl?.body as Blueprint) ?? builtInTemplate('self')!.blueprint,
    templateId: tpl?.id ?? null,
    welcome: translate(locale, 'ob.self.welcome'),
    startOn: today,
    locale,
  });
}

/** The blueprint a client plan starts from: the chosen template, the company's default, or the built-in standard one. */
export async function clientBlueprint(q: Q, orgId: string, templateId: string | null): Promise<{ id: string | null; blueprint: Blueprint; name: string | null }> {
  const s = onboardingSettings((await q.query('select settings from orgs where id = $1', [orgId]))[0]?.settings);
  const want = templateId ?? s.templateId;
  // A built-in template by its key ("standard", "multisite"): nothing to look up.
  if (want && builtInTemplate(want)?.kind === 'client') return { id: null, blueprint: builtInTemplate(want)!.blueprint, name: null };
  const [t] = want && /^[0-9a-f-]{36}$/i.test(want)
    ? await q.query(`select id, name, body from onboarding_templates where id = $1 and org_id = $2 and kind = 'client' and archived_at is null`, [want, orgId])
    : want
      ? []
      : await q.query(`select id, name, body from onboarding_templates where org_id = $1 and kind = 'client' and archived_at is null order by created_at limit 1`, [orgId]);
  if (t) return { id: t.id, blueprint: t.body as Blueprint, name: t.name };
  return { id: null, blueprint: builtInTemplate('standard')!.blueprint, name: null };
}

// ------------------------------------------------------------------ the hand-over hooks

/**
 * A won deal's hand-over card was just made: open a draft plan for the customer,
 * with the card's note as the hand-over note. Once per hand-over; nothing when
 * the company switched it off or the customer already has an open plan.
 */
export async function openPlanForHandover(q: Q, orgId: string, handoverId: string, today: string): Promise<string | null> {
  const [h] = await q.query('select h.*, o.settings, o.locale, a.name as account_name from handovers h join orgs o on o.id = h.org_id join accounts a on a.id = h.account_id where h.id = $1 and h.org_id = $2', [handoverId, orgId]);
  const settings = onboardingSettings(h?.settings);
  if (!h || h.source_kind === 'onboarding' || !settings.fromHandover) return null;
  const [open] = await q.query(`select id from onboarding_plans where org_id = $1 and account_id = $2 and status in ('draft', 'active', 'paused')`, [orgId, h.account_id]);
  if (open) return null;
  const locale = (h.locale ?? 'en') as Locale;
  // The customer's segment, plan or region may pick the template; "ask each time" opens an empty draft that asks.
  const [acc] = await q.query('select fields from accounts where id = $1 and org_id = $2', [h.account_id, orgId]);
  const pick = templateFor(settings, acc?.fields);
  const tpl = pick === ASK_TEMPLATE ? { id: null, blueprint: { steps: [], goals: [], metrics: [], fields: [] } as Blueprint } : await clientBlueprint(q, orgId, pick);
  return createPlan(q, {
    orgId,
    actorId: null,
    kind: 'client',
    accountId: h.account_id,
    name: translate(locale, 'ob.plan.nameFor', { account: h.account_name }),
    blueprint: tpl.blueprint,
    templateId: tpl.id,
    handoverId,
    status: 'draft',
    department: h.to_department === 'onboarding' ? 'onboarding' : 'success',
    note: await handoffNote(q, orgId, h, locale),
    welcome: translate(locale, 'ob.plan.welcome', { account: h.account_name }),
    startOn: today,
    locale,
  });
}

/**
 * The hand-over note a new plan opens with, drafted from the hand-over packet:
 * the deal, what was promised, the product work the customer waits for, the
 * renewal day, and the sales thread's summary. The owner edits it; nothing is
 * sent to anyone.
 */
export async function handoffNote(q: Q, orgId: string, h: Row, locale: Locale): Promise<string> {
  const T = (k: string, v?: Record<string, string | number>) => translate(locale, k as MessageKey, v);
  const promises = await q.query<{ body: string; due_date: unknown }>(
    `select body, due_date from promises where org_id = $1 and account_id = $2 and kept_at is null order by due_date nulls last, created_at limit 8`,
    [orgId, h.account_id],
  );
  const waits = await q.query<{ title: string }>(
    `select t.title from request_links l join tasks t on t.id = l.story_id where l.org_id = $1 and l.account_id = $2 and l.shipped_at is null order by l.created_at limit 8`,
    [orgId, h.account_id],
  );
  const [acc] = await q.query('select fields from accounts where id = $1 and org_id = $2', [h.account_id, orgId]);
  const renewal = typeof acc?.fields?.renewal_date === 'string' ? acc.fields.renewal_date.slice(0, 10) : null;
  const lines = [T('ob.note.head', { deal: h.source_name || '—' })];
  if (promises.length) lines.push('', T('ob.note.promises'), ...promises.map((p) => `• ${p.body}${p.due_date ? ` (${day(p.due_date)})` : ''}`));
  if (waits.length) lines.push('', T('ob.note.waiting'), ...waits.map((w) => `• ${w.title}`));
  if (renewal) lines.push('', T('ob.note.renewal', { date: renewal }));
  if (h.summary) lines.push('', h.summary);
  return lines.join('\n').slice(0, 8000);
}

/** The hand-over was confirmed: the draft plan starts, owned by the new owner, dated from today. */
export async function startPlanForHandover(q: Q, orgId: string, handoverId: string, ownerId: string, note: string | null, today: string) {
  const [p] = await q.query(`select id, started_on from onboarding_plans where org_id = $1 and handover_id = $2 and status = 'draft'`, [orgId, handoverId]);
  if (!p) return null;
  const shift = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day(p.started_on)}T00:00:00Z`)) / 86400_000);
  await q.query(
    `update onboarding_plans set status = 'active', owner_id = $2, note = coalesce($3, note), started_on = $4,
            target_on = target_on + $5::int, updated_at = now() where id = $1`,
    [p.id, ownerId, note, today, shift],
  );
  await q.query(
    `update onboarding_steps set owner_id = case when side <> 'customer' and owner_id is null then $2 else owner_id end,
            start_on = start_on + $3::int, due_on = due_on + $3::int where plan_id = $1`,
    [p.id, ownerId, shift],
  );
  await q.query(`update onboarding_goals set target_on = target_on + $2::int where plan_id = $1 and target_on is not null`, [p.id, shift]);
  const [owner] = await q.query('select name from users where id = $1 and org_id = $2', [ownerId, orgId]);
  if (owner && !(await q.query(`select 1 from onboarding_people where plan_id = $1 and side = 'vendor' and user_id = $2`, [p.id, ownerId])).length) {
    await q.query(`insert into onboarding_people (org_id, plan_id, side, user_id, name, role) values ($1, $2, 'vendor', $3, $4, 'lead')`, [orgId, p.id, ownerId, owner.name]);
  }
  await advancePlan(q, orgId, p.id);
  return p.id as string;
}

/**
 * Onboarding is finished: record the baseline (health score, the metrics now)
 * and, when the plan lived in the Onboarding department, put a hand-over card
 * in front of Customer Success. Returns the card's id, if one was made.
 */
export async function finishPlan(q: Q, orgId: string, planId: string, actorId: string | null): Promise<string | null> {
  const [p] = await q.query('select p.*, a.fields as acc_fields, a.name as account_name from onboarding_plans p left join accounts a on a.id = p.account_id where p.id = $1 and p.org_id = $2', [planId, orgId]);
  if (!p) return null;
  const metrics = await q.query('select id, coalesce(title, title_key) as name, current from onboarding_metrics where plan_id = $1', [planId]);
  const health = typeof p.acc_fields?.health_score === 'number' ? p.acc_fields.health_score : null;
  const baseline = { health, at: new Date().toISOString(), metrics: Object.fromEntries(metrics.map((m) => [m.name, num(m.current)])) };
  await q.query(`update onboarding_plans set status = 'done', done_at = now(), done_by = $2, baseline = $3, updated_at = now() where id = $1`, [planId, actorId, JSON.stringify(baseline)]);
  await audit(q, { orgId, actorId, action: 'onboarding.plan_done', entity: p.account_id ? 'account' : 'org', entityId: p.account_id ?? orgId, meta: { plan: planId, health } });
  if (p.kind !== 'client' || p.department !== 'onboarding') return null;
  const [org] = await q.query('select locale from orgs where id = $1', [orgId]);
  const T = (k: string, v?: Record<string, string | number>) => translate((org?.locale ?? 'en') as Locale, k as MessageKey, v);
  const goals = await q.query(`select coalesce(title, title_key) as t, status from onboarding_goals where plan_id = $1 order by position`, [planId]);
  const open = await q.query(`select title from onboarding_issues where plan_id = $1 and status <> 'resolved' order by opened_on`, [planId]);
  const summary = [
    T('ob.handoff.summary', { plan: p.name }),
    health == null ? '' : T('ob.handoff.health', { score: health }),
    ...metrics.filter((m) => m.current != null).map((m) => `• ${m.name.startsWith('ob.') || !m.name.includes(' ') ? T(`ob.metric.${m.name}` as string) : m.name}: ${m.current}`),
    goals.length ? T('ob.handoff.goals', { done: goals.filter((g) => g.status === 'done').length, all: goals.length }) : '',
    open.length ? T('ob.handoff.open', { n: open.length }) : '',
  ]
    .filter(Boolean)
    .join('\n');
  const [row] = await q.query(
    `insert into handovers (org_id, account_id, source_kind, source_id, source_name, stage, to_department, summary, created_by)
     values ($1, $2, 'onboarding', $3, $4, 'onboarded', 'success', $5, $6) on conflict (org_id, source_kind, source_id) do nothing returning id`,
    [orgId, p.account_id, planId, p.name.slice(0, 300), summary.slice(0, 8000), actorId],
  );
  if (row) {
    const leads = await q.query<{ user_id: string }>(`select dm.user_id from department_members dm join departments d on d.id = dm.department_id where d.org_id = $1 and d.key = 'success' and d.enabled and dm.role = 'lead'`, [orgId]);
    await enqueue(q, leads.map((l) => ({ orgId, userId: l.user_id, kind: 'handover', actorId, data: { account: p.account_name ?? '', accountId: p.account_id, deal: p.name, handoverId: row.id } })));
  }
  return row?.id ?? null;
}

// ------------------------------------------------------------------ reading

const STEP_SQL = `select s.*, u.name as owner_name, t.title as work_title, t.status as work_status, (t.done_at is not null) as work_done
  from onboarding_steps s left join users u on u.id = s.owner_id and u.org_id = s.org_id
  left join tasks t on t.id = s.task_id and t.org_id = s.org_id`;

export const toStep = (r: Row): PlanStep => ({
  id: r.id,
  key: r.key,
  titleKey: r.title_key ?? null,
  title: r.title ?? null,
  body: r.body ?? '',
  phase: r.phase,
  position: r.position,
  side: r.side,
  ownerId: r.owner_id ?? null,
  ownerName: r.owner_name ?? null,
  personId: r.person_id ?? null,
  signal: isSignal(r.signal) ? r.signal : null,
  status: r.status,
  effortDays: r.effort_days ?? null,
  handsOnHours: num(r.hands_on_hours),
  startOn: day(r.start_on),
  dueOn: day(r.due_on),
  doneAt: iso(r.done_at),
  doneBy: r.done_by ?? null,
  doneHow: r.done_how ?? null,
  dependsOn: r.depends_on ?? [],
  delayReason: r.delay_reason ?? '',
  fix: r.fix ?? null,
  guide: r.guide ?? null,
  form: r.form ?? [],
  upload: !!r.upload,
  required: r.required !== false,
  files: [],
  taskId: r.task_id ?? null,
  work: r.task_id && r.work_title !== undefined && r.work_title !== null ? { title: r.work_title, status: r.work_status ?? null, done: !!r.work_done } : null,
  siteId: r.site_id ?? null,
  updatedAt: iso(r.updated_at)!,
});

const toIssue = (r: Row) => ({
  id: r.id,
  stepId: r.step_id ?? null,
  title: r.title,
  body: r.body ?? '',
  side: r.side,
  type: r.type,
  urgency: r.urgency,
  status: r.status,
  openedOn: day(r.opened_on)!,
  dueOn: day(r.due_on),
  resolvedAt: iso(r.resolved_at),
  recordId: r.record_id ?? null,
  ticketStatus: r.ticket_status ?? null,
  fromPortal: !!r.portal_author_id,
  source: r.source ?? 'manual',
  sourceRef: r.source_ref ?? null,
});

/** Progress for many plans at once (lists, the console, health). */
export async function progressFor(q: Q, orgId: string, planIds: string[], today: string) {
  if (!planIds.length) return new Map<string, ReturnType<typeof progressOf>>();
  const steps = await q.query(`select id, plan_id, key, phase, position, status, depends_on, due_on, side, updated_at, done_how, done_at, required from onboarding_steps where org_id = $1 and plan_id = any($2::uuid[])`, [orgId, planIds]);
  const issues = await q.query(`select plan_id, status, side, opened_on, due_on from onboarding_issues where org_id = $1 and plan_id = any($2::uuid[])`, [orgId, planIds]);
  const plans = new Map((await q.query('select id, status, started_on, phases from onboarding_plans where id = any($1::uuid[])', [planIds])).map((r) => [r.id, r]));
  const out = new Map<string, ReturnType<typeof progressOf>>();
  for (const id of planIds) {
    const mine = steps.filter((x) => x.plan_id === id);
    const order = phaseOrder(plans.get(id)?.phases, mine.map((x) => x.phase as string));
    out.set(
      id,
      progressOf(
        mine.map((x) => ({ id: x.id, key: x.key, phase: x.phase, phaseAt: order.findIndex((o) => o.key === x.phase), position: x.position, status: x.status, dependsOn: x.depends_on ?? [], dueOn: day(x.due_on), side: x.side, updatedAt: iso(x.updated_at)!, doneHow: x.done_how, doneAt: iso(x.done_at), required: x.required !== false })),
        issues.filter((x) => x.plan_id === id).map((x) => ({ status: x.status, side: x.side, openedOn: day(x.opened_on)!, dueOn: day(x.due_on) })),
        today,
        plans.get(id)?.status,
        day(plans.get(id)?.started_on) ?? today,
      ),
    );
  }
  return out;
}

const SUMMARY_SQL = `select p.*, a.name as account_name, u.name as owner_name from onboarding_plans p
  left join accounts a on a.id = p.account_id left join users u on u.id = p.owner_id and u.org_id = p.org_id`;

const toSummary = (r: Row, progress: ReturnType<typeof progressOf>): PlanSummary => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  status: r.status,
  accountId: r.account_id ?? null,
  accountName: r.account_name ?? null,
  department: r.department ?? null,
  ownerId: r.owner_id ?? null,
  ownerName: r.owner_name ?? null,
  startedOn: day(r.started_on)!,
  targetOn: day(r.target_on),
  doneAt: iso(r.done_at),
  progress,
});

/** Every client plan this person may see (the portfolio), optionally one customer's. */
export async function listPlans(q: Q, orgId: string, today: string, opts: { accountId?: string | null; open?: boolean } = {}): Promise<PlanSummary[]> {
  const rows = await q.query(
    `${SUMMARY_SQL} where p.org_id = $1 and p.kind = 'client' and ($2::uuid is null or p.account_id = $2)
       and (not $3 or p.status in ('draft', 'active', 'paused')) order by p.started_on desc limit 500`,
    [orgId, opts.accountId ?? null, !!opts.open],
  );
  const prog = await progressFor(q, orgId, rows.map((r) => r.id), today);
  return rows.map((r) => toSummary(r, prog.get(r.id)!));
}

/** One plan, whole. `canEdit` is what the person may change (the routes check again on each write). */
export async function readPlan(q: Q, orgId: string, planId: string, today: string, canEdit: boolean, opts: { portalUrl?: string | null; locale?: Locale } = {}): Promise<Plan | null> {
  const [r] = await q.query(`${SUMMARY_SQL} where p.id = $1 and p.org_id = $2`, [planId, orgId]);
  if (!r) return null;
  const [steps, goals, issues, people, fields, sites, metrics, org] = await Promise.all([
    q.query(`${STEP_SQL} where s.plan_id = $1 order by s.position`, [planId]),
    q.query('select * from onboarding_goals where plan_id = $1 order by position', [planId]),
    q.query(`select i.*, rec.fields->>'status' as ticket_status from onboarding_issues i left join records rec on rec.id = i.record_id and rec.org_id = i.org_id where i.plan_id = $1 order by (i.status = 'resolved'), i.opened_on desc`, [planId]),
    q.query(`select * from onboarding_people where plan_id = $1 order by side desc, position, created_at`, [planId]),
    q.query(`select f.*, u.name as verified_name from onboarding_fields f left join users u on u.id = f.verified_by and u.org_id = f.org_id where f.plan_id = $1 order by f.position, f.name`, [planId]),
    q.query('select * from onboarding_sites where plan_id = $1 order by position, name', [planId]),
    q.query('select * from onboarding_metrics where plan_id = $1 order by position', [planId]),
    q.query('select settings, account_fields, locale from orgs where id = $1', [orgId]),
  ]);
  const files = await q.query(`select id, name, size, onboarding_step_id, portal_author_id from files where org_id = $1 and onboarding_step_id = any($2::uuid[]) order by created_at`, [orgId, steps.map((x) => x.id)]);
  const phases = phaseOrder(r.phases, steps.map((x) => x.phase as string));
  const planSteps = steps.map((x) => ({
    ...toStep(x),
    phaseAt: phases.findIndex((ph) => ph.key === x.phase),
    files: files.filter((f) => f.onboarding_step_id === x.id).map((f) => ({ id: f.id, name: f.name, size: Number(f.size), fromPortal: !!f.portal_author_id })),
  }));
  const planIssues = issues.map(toIssue);
  const progress = progressOf(planSteps, planIssues, today, r.status, day(r.started_on)!);
  const formKeys = [...new Set(planSteps.flatMap((s) => s.form))];
  const defs = (org[0]?.account_fields ?? []) as AccountField[];
  const lang = opts.locale ?? ((org[0]?.locale ?? 'en') as Locale);
  const formFields = formKeys.flatMap((k) => {
    const d = defs.find((x) => x.key === k);
    return d ? [{ key: k, label: (d.label as any)?.[lang] ?? (d.label as any)?.en ?? k, type: d.type as string }] : [];
  });
  let fieldValues: Record<string, unknown> = {};
  let account: Row | null = null;
  if (r.account_id) {
    [account] = await q.query(
      `select a.fields,
              exists (select 1 from portal_users p where p.org_id = a.org_id and p.account_id = a.id and p.last_seen_at is not null) as portal_active,
              (select count(*)::int from records x join record_types rt on rt.id = x.type_id where x.org_id = a.org_id and x.account_id = a.id
                 and rt.kind = 'ticket' and x.archived_at is null and x.fields->>'status' in ('open', 'pending')) as tickets
         from accounts a where a.id = $1`,
      [r.account_id],
    );
    fieldValues = Object.fromEntries(formKeys.map((k) => [k, account?.fields?.[k] ?? null]));
  }
  const setup = r.kind === 'self' ? await setupState(q, orgId) : NO_SETUP;
  const score = typeof account?.fields?.health_score === 'number' ? account.fields.health_score : null;
  const health = healthSignals({ progress, setup, accountId: r.account_id, portalActive: account ? !!account.portal_active : null, tickets: account ? Number(account.tickets) : null, score });
  return {
    ...toSummary(r, progress),
    templateId: r.template_id ?? null,
    handoverId: r.handover_id ?? null,
    welcome: r.welcome ?? '',
    note: r.note ?? '',
    baseline: r.baseline ?? {},
    shared: !!r.share_hash,
    portalVisible: !!r.portal_visible,
    people: people.map((x) => ({ id: x.id, side: x.side, userId: x.user_id ?? null, portalUserId: x.portal_user_id ?? null, name: x.name, role: x.role, duty: x.duty, contact: x.contact })),
    steps: planSteps,
    goals: goals.map((g) => ({ id: g.id, titleKey: g.title_key ?? null, title: g.title ?? null, priority: g.priority, status: g.status, targetOn: day(g.target_on), doneOn: day(g.done_on), proofUrl: g.proof_url ?? null })),
    issues: planIssues,
    fields: fields.map((f) => ({
      id: f.id, source: f.source, name: f.name, target: f.target, example: f.example, type: f.type, required: f.required, proofUrl: f.proof_url ?? null,
      received: f.received ?? null, receivedAt: iso(f.received_at), failingSince: day(f.failing_since), fixedAt: iso(f.fixed_at),
      autoOk: f.auto_ok ?? null, checkedAt: iso(f.checked_at), checkedBy: f.checked_by ?? null, verifiedAt: iso(f.verified_at), verifiedBy: f.verified_name ?? null,
    })),
    sites: sites.map((x) => ({ id: x.id, name: x.name, region: x.region, stages: x.stages ?? {} })),
    metrics: metrics.map((m) => ({ id: m.id, titleKey: m.title_key ?? null, title: m.title ?? null, unit: m.unit, baseline: num(m.baseline), current: num(m.current), target: num(m.target), better: m.better })),
    fieldValues,
    formFields,
    phases,
    setup,
    health,
    portalUrl: r.kind === 'client' && r.portal_visible && opts.portalUrl ? `${opts.portalUrl}/onboarding` : null,
    canEdit,
  };
}

// ------------------------------------------------------------------ reminders

/**
 * In-app reminders for one plan: whoever owns a step hears once when it is
 * their turn (it just unlocked), and again every STALL_DAYS while it stalls.
 * The owner is the step's person on the company's side, else its owner, else
 * the plan's owner (the company's own plan: whoever started it). By e-mail
 * only for the people who turned that on in their own notification settings. Returns how many went out.
 */
export async function remindPlan(q: Q, plan: { id: string; org_id: string; owner_id: string | null; created_by: string | null; name: string; account_id: string | null; timezone: string; settings: any }, now: Date): Promise<number> {
  const today = localDate(now, plan.timezone);
  const rows = await q.query(
    `${STEP_SQL} left join onboarding_people pe on pe.id = s.person_id where s.plan_id = $1 and s.org_id = $2`.replace('select s.*,', 'select s.*, pe.user_id as person_user,'),
    [plan.id, plan.org_id],
  );
  const steps = rows.map((r) => ({ ...toStep(r), nudgedAt: r.nudged_at as Date | null, personUser: (r.person_user as string | null) ?? null }));
  const open = steps.filter((s) => s.status !== 'done' && s.status !== 'skipped' && unlockedOf(s, steps));
  const due = open
    .map((s) => ({ s, what: !s.nudgedAt ? ('turn' as const) : stalled(s, steps, today) && now.getTime() - new Date(s.nudgedAt).getTime() >= STALL_DAYS * 86400_000 ? ('stalled' as const) : null }))
    .filter((x): x is { s: (typeof steps)[number]; what: 'turn' | 'stalled' } => !!x.what);
  if (!due.length) return 0;
  const list = due
    .map(({ s, what }) => ({ s, what, to: s.personUser ?? s.ownerId ?? plan.owner_id ?? plan.created_by }))
    .filter((x): x is typeof x & { to: string } => !!x.to);
  await enqueue(
    q,
    list.map(({ s, what, to }) => ({
      orgId: plan.org_id,
      userId: to,
      // Always in the app; by e-mail only for whoever turned that on (notify.ts: event 'onboarding', off by default).
      kind: 'onboarding_mail',
      data: { what, plan: plan.name, planId: plan.id, kind: plan.account_id ? 'client' : 'self', accountId: plan.account_id, step: s.title ?? '', stepKey: s.titleKey ?? '' },
      dedupeKey: `onboarding:${s.id}:${what}:${today}`,
    })),
  );
  await q.query('update onboarding_steps set nudged_at = $2 where id = any($1::uuid[])', [due.map((x) => x.s.id), now]);
  return list.length;
}
const unlockedOf = (s: PlanStep, steps: PlanStep[]) => s.dependsOn.every((k) => !steps.some((x) => x.key === k && x.status !== 'done' && x.status !== 'skipped'));

// ------------------------------------------------------------------ the hourly run

/** Every open plan of every company: move it on from the product's signals, then remind whose turn it is. */
export async function sweepOnboarding(deps: Deps, now: Date): Promise<{ advanced: number; nudged: number }> {
  const plans = await deps.db.system((q) =>
    q.query<{ id: string; org_id: string; owner_id: string | null; created_by: string | null; name: string; account_id: string | null; timezone: string; settings: any }>(
      `select p.id, p.org_id, p.owner_id, p.created_by, p.name, p.account_id, o.timezone, o.settings from onboarding_plans p join orgs o on o.id = p.org_id
        where p.status = 'active' order by p.org_id limit 5000`,
    ),
  );
  let advanced = 0;
  let nudged = 0;
  for (const p of plans) {
    await deps.db.system(async (q) => {
      advanced += (await advancePlan(q, p.org_id, p.id)).length;
      nudged += await remindPlan(q, p, now);
    });
  }
  return { advanced, nudged };
}

export { BUILT_IN_TEMPLATES };
