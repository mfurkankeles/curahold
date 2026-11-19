// The assistant's doors (the core is api/src/assistant/core.ts):
//
//   POST /api/assist                — CuraAI in the app (and its onboarding mode), as the signed-in person
//   GET|PUT /api/assist/settings    — the company's switch, monthly limit, log retention, desk first reply
//   POST /api/assist/public         — the public docs' and sales site's "Ask" (no company, docs only)
//   POST /papi/assist               — the customer portal (portal.ts mounts portalAssist)
//   deskFirstReply()                — a draft first answer on a new help request, as an internal note
//
// The model's key never leaves the server. Live data is read through this
// same API, as the person asking, so every permission, field rule and
// department wall applies to the assistant exactly as to the screens.
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AssistReply, AssistRequest, AssistSurface } from '../../../shared/src/assist';
import { emptyTrace, toolsFor, type AssistantDeps, type Tool } from '../../../shared/src/assistant';
import { prepare, type AnswerIndex } from '../../../shared/src/answers';
import { accountWords, HELP_LANGUAGES, normalizeLocale, type Locale } from '../../../shared/src/i18n';
import { requirePerm, run, todayOf, type AppEnv, type C, type Deps, type OrgRow } from '../context';
import type { Row } from '../db';
import { audit } from '../lib/audit';
import { fail } from '../lib/errors';
import { clientIp, sharedLimiter } from '../lib/ratelimit';
import { body } from '../lib/validate';
import type { PortalEnv } from '../lib/portal';
import { answer, RETENTION_CHOICES, settingsOf, type AssistEnv, type CompanyAssistSettings } from '../assistant/core';
import { ASSIST_BUDGETS, assistantConfigFrom, type AssistantConfig } from '../assistant/cost';
import { anthropicProvider, type LlmProvider } from '../assistant/provider';
import { dbStore, docsIndex, monthUsage } from '../assistant/store';

/** The installation's assistant settings (environment), with safe defaults when none are given. */
export const assistantConfig = (deps: Deps): AssistantConfig => deps.config.assistant ?? assistantConfigFrom({});

/** The model, or null when there is none (no key, switched off): then the docs search answers. */
export function providerOf(deps: Deps): LlmProvider | null {
  if (deps.assistant && 'provider' in deps.assistant) return deps.assistant.provider ?? null;
  const cfg = assistantConfig(deps);
  if (cfg.provider === 'off' || !cfg.apiKey) return null;
  return anthropicProvider({ apiKey: cfg.apiKey, model: cfg.model, fetch: deps.fetch });
}

const EMPTY: AnswerIndex = prepare([]);
/** What the company chose (orgs.settings.assistant), unchecked: settingsOf() checks it. */
const assistantSettingsOf = (org: Pick<OrgRow, 'settings'>): unknown => (org.settings as Record<string, unknown> | null)?.assistant;
async function docsOf(deps: Deps): Promise<{ docs: AssistEnv['docs']; version: string }> {
  const load = deps.assistant?.docs;
  if (!load) return { docs: async () => EMPTY, version: 'none' };
  const versions = await Promise.all(HELP_LANGUAGES.map((l) => docsIndex(load, l).version.catch(() => 'x')));
  return { docs: (lang) => docsIndex(load, lang).index.catch(() => EMPTY), version: versions.join('|') };
}

const request = z.object({
  question: z.string().max(2000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(20)
    .optional(),
  intent: z.string().max(60).optional(),
  mode: z.enum(['help', 'onboarding']).optional(),
  page: z.string().max(200).optional(),
});

const take = (deps: Deps, key: string, budget: { cap: number; perSec: number }) => {
  const scale = deps.config.limitScale ?? 1;
  // 0 switches the limits off (tests), as for every other budget.
  return scale === 0 ? 0 : (deps.limiter ?? sharedLimiter).take(key, budget, scale);
};

/** The read-only tools over the person's own data: every call is a GET on this API, as them. */
function liveTools(c: C, locale: Locale): { tools: Tool[]; trace: ReturnType<typeof emptyTrace> } {
  const org = c.get('org');
  const auth = c.get('auth');
  const self = c.get('self');
  const origin = new URL(c.req.url).origin;
  const headers: Record<string, string> = { 'x-curahold-locale': locale };
  for (const h of ['cookie', 'authorization', 'x-curahold-org', 'x-curahold-device', 'user-agent', 'cf-connecting-ip', 'x-forwarded-for']) {
    const v = c.req.header(h);
    if (v) headers[h] = v;
  }
  const words = accountWords(locale, org.terms);
  const d: AssistantDeps = {
    async api(path) {
      // Reads only: the assistant never changes anything itself.
      const res = await self.request(`${origin}/api${path}`, { method: 'GET', headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message ?? `Request failed (${res.status})`);
      return data;
    },
    docs: async () => EMPTY,
    docsUrl: () => '',
    locale,
    me: { name: auth.name, role: auth.roleKey, company: org.name, customer: words.one, customers: words.other, currency: org.currency ?? 'USD' },
    fields: (org.account_fields ?? []).map((f) => ({
      key: f.key,
      type: f.type,
      label: (f.label as Record<string, string>)[locale] ?? (f.label as Record<string, string>).en ?? f.key,
      options: f.options?.map((o) => ({ key: o.key, label: (o.label as Record<string, string>)[locale] ?? (o.label as Record<string, string>).en ?? o.key })),
    })),
    today: todayOf(c),
    open: () => undefined,
  };
  const trace = emptyTrace();
  return { tools: toolsFor(d, trace), trace };
}

/** Builds the core's surroundings for one request. */
async function envFor(
  deps: Deps,
  opts: { surface: AssistSurface; locale: Locale; org: OrgRow | null; userId: string | null; limited: boolean; who?: AssistEnv['who']; live?: AssistEnv['live'] },
): Promise<AssistEnv> {
  const config = assistantConfig(deps);
  // The public docs and site have no company: the installation's own switch (publicChat) decides there.
  const settings = opts.org ? settingsOf(assistantSettingsOf(opts.org), config) : settingsOf({ enabled: true }, config);
  const { docs, version } = await docsOf(deps);
  return {
    config,
    provider: providerOf(deps),
    store: dbStore(deps.db, { orgId: opts.org?.id ?? null, userId: opts.userId, surface: opts.surface, retentionDays: opts.org ? settings.retentionDays : 0 }),
    docs,
    docsVersion: version,
    surface: opts.surface,
    locale: opts.locale,
    terms: opts.org?.terms ?? null,
    orgId: opts.org?.id ?? null,
    settings,
    who: opts.who ?? null,
    live: opts.live ?? null,
    limited: opts.limited,
  };
}

// ------------------------------------------------------------------ the app

export const assistRoutes = new Hono<AppEnv>();

assistRoutes.post('/assist', async (c) => {
  // API keys and apps have the AI connector (MCP); this door is for people in the app.
  if (c.get('tokenKind')) fail('forbidden');
  const input = (await body(c, request)) as AssistRequest;
  const deps = c.get('deps');
  const org = c.get('org');
  const auth = c.get('auth');
  const locale = c.get('locale');
  const limited = !!(take(deps, `assist:p:${auth.userId}`, ASSIST_BUDGETS.person) || take(deps, `assist:c:${org.id}`, ASSIST_BUDGETS.company));
  const words = accountWords(locale, org.terms);
  const env = await envFor(deps, {
    surface: 'app',
    locale,
    org,
    userId: auth.userId,
    limited,
    who: { name: auth.name, role: auth.roleKey, company: org.name, customer: words.one, customers: words.other, currency: org.currency ?? 'USD', today: todayOf(c) },
    live: liveTools(c, locale),
  });
  const { reply } = await answer(env, input);
  return c.json({ reply });
});

/** Whether a model answers here: the app sends questions to the server only then (otherwise they stay on the device). */
assistRoutes.get('/assist/status', (c) => {
  const deps = c.get('deps');
  const settings = settingsOf(assistantSettingsOf(c.get('org')), assistantConfig(deps));
  return c.json({ available: !!providerOf(deps) && settings.enabled && !c.get('tokenKind') });
});

const settingsInput = z.object({
  enabled: z.boolean().optional(),
  monthlyCapUsd: z.number().min(0).max(100_000).optional(),
  retentionDays: z
    .number()
    .int()
    .refine((n) => (RETENTION_CHOICES as readonly number[]).includes(n))
    .optional(),
  deskFirstReply: z.enum(['note', 'off']).optional(),
});

async function settingsView(c: C, s: CompanyAssistSettings) {
  const deps = c.get('deps');
  const cfg = assistantConfig(deps);
  const provider = providerOf(deps);
  return {
    settings: s,
    usage: await monthUsage(deps.db, c.get('org').id, c.get('auth').userId),
    // Whether a model can answer at all on this installation, and which.
    engine: { available: !!provider, model: provider?.model ?? null, maxMonthlyCapUsd: cfg.companyMaxUsd },
    retentionChoices: RETENTION_CHOICES,
  };
}

assistRoutes.get('/assist/settings', async (c) => {
  requirePerm(c, 'org.manage');
  return c.json(await settingsView(c, settingsOf(assistantSettingsOf(c.get('org')), assistantConfig(c.get('deps')))));
});

assistRoutes.put('/assist/settings', async (c) => {
  requirePerm(c, 'org.manage');
  if (c.get('previewBy')) fail('preview_read_only');
  const input = await body(c, settingsInput);
  const org = c.get('org');
  const auth = c.get('auth');
  const cfg = assistantConfig(c.get('deps'));
  const next = settingsOf({ ...((assistantSettingsOf(org) as object | undefined) ?? {}), ...input }, cfg);
  await run(c, async (q) => {
    await q.query(`update orgs set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('assistant', $2::jsonb) where id = $1`, [org.id, JSON.stringify(next)]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'assistant.settings', entity: 'org', entityId: org.id, meta: next as unknown as Record<string, unknown> });
    // Retention made shorter: what is now too old goes at once.
    await q.query(`delete from assistant_log where org_id = $1 and created_at < now() - make_interval(days => $2)`, [org.id, next.retentionDays]);
  });
  return c.json(await settingsView(c, next));
});

// ------------------------------------------------------------------ the public docs and site

export const assistPublicRoutes = new Hono<AppEnv>();

const publicRequest = request.extend({ lang: z.string().max(10).optional(), surface: z.enum(['docs', 'site']).optional() });

assistPublicRoutes.post('/api/assist/public', async (c: Context<AppEnv>) => {
  const deps = c.get('deps');
  const cfg = assistantConfig(deps);
  // Only from a page that set this header: a form on another site cannot, and a cross-site script is stopped by CORS.
  if (c.req.header('x-curahold-ask') !== '1') fail('forbidden');
  const input = (await body(c, publicRequest)) as AssistRequest & { lang?: string; surface?: 'docs' | 'site' };
  const ip = clientIp(c, deps.config.clientIp) ?? 'unknown';
  const limited = !cfg.publicChat || !!(take(deps, `assist:ip:${ip}`, ASSIST_BUDGETS.ip) || take(deps, 'assist:public', ASSIST_BUDGETS.public));
  const env = await envFor(deps, { surface: input.surface ?? 'docs', locale: normalizeLocale(input.lang), org: null, userId: null, limited });
  // No workspace here: only the docs, and never a follow-up's data.
  const { reply } = await answer(env, { ...input, mode: undefined });
  return c.json({ reply });
});

// ------------------------------------------------------------------ the customer portal


/** Whether the portal's chat shows at all: a model, and the company has not switched it off. */
export const portalAssistAvailable = (deps: Deps, org: OrgRow): boolean => !!providerOf(deps) && settingsOf(assistantSettingsOf(org), assistantConfig(deps)).enabled;

/** Mounted by portal.ts after its sign-in: the person is a customer of the company, reading their own requests. */
export async function portalAssist(
  c: Context<PortalEnv>,
  deps: Deps,
  portalDb: <T>(fn: (q: { query(sql: string, p?: unknown[]): Promise<Row[]> }) => Promise<T>) => Promise<T>,
): Promise<Response> {
  const org = c.get('org');
  const person = c.get('person');
  if (!person?.id) return fail('unauthenticated');
  const input = (await body(c as unknown as C, request)) as AssistRequest;
  const locale = c.get('locale');
  const limited = !!(take(deps, `assist:pp:${person.id}`, ASSIST_BUDGETS.person) || take(deps, `assist:c:${org.id}`, ASSIST_BUDGETS.company));
  const trace = emptyTrace();
  const tools: Tool[] = [
    {
      name: 'my_requests',
      description: 'The requests this customer can see in the portal: title, status, due date and how many replies, newest first (at most 25).',
      async execute() {
        if (!trace.data.includes('requests')) trace.data.push('requests');
        return portalDb(async (q) => {
          const [me] = await q.query('select portal_me() as me');
          const boards = ((me?.me?.boards ?? []) as { id: string; name: string }[]).slice(0, 10);
          const out: unknown[] = [];
          for (const b of boards) {
            const [r] = await q.query('select portal_tasks($1) as t', [b.id]);
            for (const t of ((r?.t ?? []) as Row[]).slice(0, 25)) out.push({ board: b.name, title: t.title, status: t.status, due: t.dueDate ?? null, replies: t.replies ?? 0, lastFromTeam: !!t.lastFromTeam });
          }
          return { total: out.length, requests: out.slice(0, 25) };
        });
      },
    },
  ];
  const env = await envFor(deps, {
    surface: 'portal',
    locale,
    org,
    userId: null,
    limited,
    who: { name: person.name, role: 'customer (portal)', company: org.name, customer: '', customers: '', currency: org.currency ?? 'USD', today: new Date().toISOString().slice(0, 10) },
    live: { tools, trace },
  });
  const { reply } = await answer(env, { ...input, mode: undefined });
  return c.json({ reply });
}

// ------------------------------------------------------------------ the support desk

/**
 * A first answer to a new help request, from the docs only, kept as an
 * internal note: a support person reads it, and sends it (or not). Nothing
 * reaches the customer by itself. Off when the company turned it off, or when
 * there is no model (a docs search as a note would only be noise).
 */
export async function deskFirstReply(deps: Deps, org: OrgRow, req: { id: string; subject: string; description: string }, locale: Locale): Promise<AssistReply | null> {
  const cfg = assistantConfig(deps);
  const settings = settingsOf(assistantSettingsOf(org), cfg);
  if (settings.deskFirstReply === 'off' || !settings.enabled || !providerOf(deps)) return null;
  const env = await envFor(deps, { surface: 'desk', locale, org, userId: null, limited: !!take(deps, `assist:c:${org.id}`, ASSIST_BUDGETS.company) });
  const question = `${req.subject}\n\n${req.description}`.slice(0, 2000);
  const { reply } = await answer(env, { question });
  return reply.engine === 'llm' && reply.kind === 'answer' ? reply : null;
}
