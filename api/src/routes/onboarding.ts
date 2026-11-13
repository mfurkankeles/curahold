// Zero-code onboarding. Two parts:
//   1. provisionOrg — the self-serve path after sign-up or purchase: make the
//      company (reusing lib/orgs createOrg), start its 3-month trial, send the
//      welcome, and open its checklist. Called from the sign-up/purchase flow.
//   2. The in-app setup checklist (GET/POST /onboarding/checklist): the first
//      steps a new company works through, ticked off by its administrator, with
//      the trial's days-left alongside so the app can nudge gently.
import { Hono } from 'hono';
import { z } from 'zod';
import type { PlanKey } from '../../../shared/src/billing';
import { nowOf, orgUrl, requirePerm, run, type AppEnv, type Deps } from '../context';
import { readSubscription, startTrial } from '../billing/service';
import { audit } from '../lib/audit';
import { welcomeEmail } from '../lib/mailer';
import { createOrg, type NewOrg } from '../lib/orgs';
import { body } from '../lib/validate';

export const onboardingRoutes = new Hono<AppEnv>();

/** The first-run checklist, in the order shown. Generic on purpose — any company's first week. */
export const ONBOARDING_STEPS = ['invite_team', 'create_board', 'connect_tool', 'add_billing', 'first_task'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/**
 * Provision a company end to end: create it, start its trial, send the welcome,
 * open its checklist. Safe to reuse from sign-up — createOrg does the company,
 * roles and first admin; this adds the billing and onboarding around it.
 */
export async function provisionOrg(deps: Deps, input: NewOrg, opts: { plan?: PlanKey } = {}) {
  const created = await createOrg(deps.db, input);
  await startTrial(deps, { orgId: created.orgId, plan: opts.plan ?? 'business' });
  await deps.db.system(async (q) => {
    await q.query('insert into onboarding_checklists (org_id, welcomed_at) values ($1, now()) on conflict (org_id) do nothing', [created.orgId]);
    await audit(q, { orgId: created.orgId, actorId: created.adminId, action: 'org.created', entity: 'org', entityId: created.orgId, meta: { provisioned: true } });
  });
  // The welcome goes through the configured sender; the default console driver costs nothing.
  const link = `${orgUrl(deps.config, input.slug)}/login`;
  await deps.email.send(welcomeEmail(input.locale, { to: input.admin.email, name: input.admin.name, org: input.name, link })).catch((e) => console.error('[curahold] welcome email failed', e));
  return created;
}

/** The checklist and the trial's state, for anyone in the company to see. */
onboardingRoutes.get('/onboarding/checklist', async (c) => {
  const deps = c.get('deps');
  const org = c.get('org');
  const { done, sub } = await run(c, async (q) => ({
    done: (await q.query<{ done: string[] }>('select done from onboarding_checklists where org_id = $1', [org.id]))[0]?.done ?? [],
    sub: await readSubscription(q, nowOf(deps)),
  }));
  const steps = ONBOARDING_STEPS.map((key) => ({ key, done: done.includes(key) }));
  return c.json({
    steps,
    complete: steps.every((s) => s.done),
    trial: sub ? { status: sub.status, daysLeft: sub.daysLeft, trialEndsAt: sub.trialEndsAt } : null,
  });
});

/** Tick a step on or off (administrators). */
onboardingRoutes.post('/onboarding/checklist', async (c) => {
  requirePerm(c, 'org.manage');
  const input = await body(c, z.object({ step: z.enum(ONBOARDING_STEPS), done: z.boolean() }));
  const org = c.get('org');
  const done = await run(c, async (q) => {
    const [row] = await q.query<{ done: string[] }>(
      `insert into onboarding_checklists (org_id, done) values ($1, '{}') on conflict (org_id) do update set updated_at = now() returning done`,
      [org.id],
    );
    const set = new Set(row.done ?? []);
    if (input.done) set.add(input.step);
    else set.delete(input.step);
    const next = [...set];
    await q.query('update onboarding_checklists set done = $2::text[], updated_at = now() where org_id = $1', [org.id, next]);
    return next;
  });
  return c.json({ done });
});
