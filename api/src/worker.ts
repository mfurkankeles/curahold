// Cloudflare Workers entry. Static files (the React app) are served by the
// Workers assets binding; /api/* runs the Hono app. The database is Supabase
// Postgres (EU) reached through Hyperdrive; files go to an R2 bucket.
import { createApp } from './app';
import { readRawMail, takeMail } from './lib/helpThread';
import { assertOwnerConfigured, type BillingConfig, type Config } from './context';
import { postgresDb } from './db/postgres';
import { runScheduled } from './lib/scheduler';
import { teamConfigFrom } from './team/config';
import { scheduledTeamTick, TEAM_CRON } from './team/schedule';
import { R2Storage, ResendEmail, type EmailSender, type R2Like } from './lib/services';
import { ConsoleMailer } from './lib/mailer';
import { SmtpRelayEmail, mailProvider, relayOptions, workerSockets } from './lib/smtpRelay';
import { livePoker, liveUpgrade, platformUpgrade, type DONamespace } from './live/do';
import { PLATFORM_PATH } from './live/platform';
import { assistantConfigFrom } from './assistant/cost';
import { edgeAnswer } from './lib/botGuard';
import { retentionFrom } from './lib/retention';
import type { DocSection } from '../../shared/src/answers';

// The live channel's per-company room (wrangler.toml: durable_objects LIVE).
export { LiveRoomDO } from './live/do';

export interface Env {
  HYPERDRIVE: { connectionString: string };
  FILES: R2Like;
  /** The live channel: one Durable Object per company (live/do.ts). Unset: pages keep asking /api/pulse. */
  LIVE?: DONamespace;
  ASSETS: { fetch(req: Request): Promise<Response> };
  BASE_DOMAIN: string;
  CENTRAL_HOST: string;
  /** Curahold's own support desk; desk.<BASE_DOMAIN> when not set. */
  DESK_HOST?: string;
  /** Where security researchers write (security.txt): an address or https link. The owner sets it. */
  SECURITY_CONTACT?: string;
  AUTH_SECRET: string;
  /** Product mail: the Google Workspace SMTP relay (lib/smtpRelay.ts) when set, else Resend, else the log. */
  EMAIL_PROVIDER?: string;
  SMTP_RELAY_HOST?: string;
  SMTP_RELAY_PORT?: string;
  SMTP_RELAY_USER?: string;
  SMTP_RELAY_PASSWORD?: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  SINGLE_TENANT_SLUG?: string;
  MAX_DEVICES?: string;
  SECRETS_KEY?: string;
  SIGNUP_ENABLED?: string;
  SIGNUP_MODE?: string;
  SLACK_CLIENT_ID?: string;
  SLACK_CLIENT_SECRET?: string;
  SLACK_SIGNING_SECRET?: string;
  TEAMS_BOT_APP_ID?: string;
  TEAMS_BOT_APP_PASSWORD?: string;
  TEAMS_BOT_TENANT_ID?: string;
  GCHAT_PROJECT_NUMBER?: string;
  GCHAT_SA_EMAIL?: string;
  GCHAT_SA_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  SALESFORCE_CLIENT_ID?: string;
  SALESFORCE_CLIENT_SECRET?: string;
  /** https address of the fixed-address relay for Salesforce token requests, and the key it expects (24+ characters). */
  SALESFORCE_RELAY_URL?: string;
  SALESFORCE_RELAY_KEY?: string;
  /** https://login.salesforce.com/packaging/installPackage.apexp?p0=04t… */
  SALESFORCE_INSTALL_URL?: string;
  HUBSPOT_CLIENT_ID?: string;
  HUBSPOT_CLIENT_SECRET?: string;
  DYNAMICS_CLIENT_ID?: string;
  DYNAMICS_CLIENT_SECRET?: string;
  PIPEDRIVE_CLIENT_ID?: string;
  PIPEDRIVE_CLIENT_SECRET?: string;
  ZOHO_CLIENT_ID?: string;
  ZOHO_CLIENT_SECRET?: string;
  /** Atlassian OAuth 2.0 (3LO) app for Jira Cloud; without it Jira connects with an API token only. */
  JIRA_CLIENT_ID?: string;
  JIRA_CLIENT_SECRET?: string;
  /** Accounting programs signed in with OAuth (read only). Zoho Books uses the Zoho app above. */
  XERO_CLIENT_ID?: string;
  XERO_CLIENT_SECRET?: string;
  FREEE_CLIENT_ID?: string;
  FREEE_CLIENT_SECRET?: string;
  QUICKBOOKS_CLIENT_ID?: string;
  QUICKBOOKS_CLIENT_SECRET?: string;
  /** Live demo only: offer the pretend CRM. */
  DEMO_CRM?: string;
  /** Help requests go to Curahold's support desk: an address, and/or a signed webhook. */
  SUPPORT_EMAIL?: string;
  SUPPORT_WEBHOOK_URL?: string;
  /** Answers by email: the domain whose mail is routed to this worker (reply+<token>@…), and Curahold's own people's addresses, comma-separated. */
  SUPPORT_REPLY_DOMAIN?: string;
  SUPPORT_STAFF?: string;
  /** What a mail server's webhook must present to hand mail over (self-hosted mail; the worker's own email handler needs none). */
  SUPPORT_MAIL_KEY?: string;
  /** Support's key for entry links into a company that granted access (a secret, at least 24 characters). */
  STAFF_KEY?: string;
  /** Per-person support keys: "ada@x.com:<key>,bob@x.com:<key>" (each key at least 24 characters). */
  STAFF_KEYS?: string;
  /** The platform owner's email: who alone may see the whole-business metrics. Defaults to the first SUPPORT_STAFF address. */
  PLATFORM_OWNER?: string;
  /** The customer portal's own domain, e.g. curahold-portal.com (unset: no portal). */
  PORTAL_DOMAIN?: string;
  /** Billing through Paddle (all four set, or billing stays off). "sandbox" or "live". */
  PADDLE_ENV?: string;
  PADDLE_API_KEY?: string;
  PADDLE_WEBHOOK_SECRET?: string;
  PADDLE_CLIENT_TOKEN?: string;
  /** Price ids: {"team":{"month":"pri_…","year":"pri_…"},"business":{"month":"pri_…","year":"pri_…"}} */
  PADDLE_PRICES?: string;
  /** The assistant (api/src/assistant/cost.ts): the model's key (a secret), the model, the monthly caps in USD. Without a key the docs search answers. */
  ANTHROPIC_API_KEY?: string;
  ASSISTANT_PROVIDER?: string;
  ASSISTANT_MODEL?: string;
  ASSISTANT_GLOBAL_MONTHLY_USD?: string;
  ASSISTANT_COMPANY_MONTHLY_USD?: string;
  ASSISTANT_COMPANY_MAX_USD?: string;
  /** Other products' names the assistant turns away, comma-separated (kept out of the code). */
  ASSISTANT_BLOCKED_NAMES?: string;
  /** "0" closes the public docs chat. */
  ASSISTANT_PUBLIC_CHAT?: string;
  ASSISTANT_DESK_FIRST_REPLY_BASIS?: string;
  /** The AI team (api/src/team/config.ts): models, the monthly USD cap, and TEAM_SCHEDULER=off to stop its 10-minute clock. */
  TEAM_MONTHLY_USD?: string;
  TEAM_MODEL_DEEP?: string;
  TEAM_MODEL_STANDARD?: string;
  TEAM_MODEL_LIGHT?: string;
  TEAM_JUDGE_MODEL?: string;
  TEAM_SCHEDULER?: string;
  /** Ops alerts (lib/ops.ts): "off" stops them; OPS_ALERT_EMAIL=off keeps them in the console only. */
  OPS_ALERTS?: string;
  OPS_ALERT_EMAIL?: string;
  /** Web Push to the owner's phones (lib/webpush.ts): both keys from `npx tsx scripts/plan/vapid-keys.ts`; VAPID_SUBJECT optional. */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  /** Robots refused by name (lib/botGuard.ts): unset = strict; "crawlers" or "off". */
  ROBOT_GUARD?: string;
  /** "allow" lets AI answer/search robots read the documentation (crawler policy; default: blocked). */
  CRAWLERS_DOCS_AI?: string;
  /** Cloudflare Turnstile (free): the site key (public) and the secret key (a secret); TURNSTILE=off switches it off. */
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE?: string;
  /** "1" also sends the visitor's address to Turnstile's check (off: data minimisation). */
  TURNSTILE_SEND_IP?: string;
  /** Retention periods in days (lib/retention.ts; docs/ENVIRONMENT.md §6e): unset = the stated defaults. */
  RETENTION_TRIAL_REQUEST_DAYS?: string;
  RETENTION_CONSENT_DAYS?: string;
  RETENTION_SUPPORT_DAYS?: string;
  RETENTION_AUDIT_DAYS?: string;
  RETENTION_PRIVACY_REQUEST_DAYS?: string;
  COMPANY_DELETE_GRACE_DAYS?: string;
}

/** Paddle settings, when all of them are there; otherwise billing is off. */
export function billingFromEnv(env: Pick<Env, 'PADDLE_ENV' | 'PADDLE_API_KEY' | 'PADDLE_WEBHOOK_SECRET' | 'PADDLE_CLIENT_TOKEN' | 'PADDLE_PRICES'>): BillingConfig | undefined {
  if (!env.PADDLE_API_KEY || !env.PADDLE_WEBHOOK_SECRET || !env.PADDLE_CLIENT_TOKEN || !env.PADDLE_PRICES) return undefined;
  const prices = JSON.parse(env.PADDLE_PRICES) as BillingConfig['prices'];
  for (const plan of ['team', 'business'] as const) {
    if (!prices[plan]?.month || !prices[plan]?.year) throw new Error(`PADDLE_PRICES needs ${plan}.month and ${plan}.year`);
  }
  return { provider: 'paddle', env: env.PADDLE_ENV === 'live' ? 'live' : 'sandbox', apiKey: env.PADDLE_API_KEY, webhookSecret: env.PADDLE_WEBHOOK_SECRET, clientToken: env.PADDLE_CLIENT_TOKEN, prices };
}

const CRM_ENV = ['SALESFORCE', 'HUBSPOT', 'DYNAMICS', 'PIPEDRIVE', 'ZOHO', 'JIRA', 'XERO', 'FREEE', 'QUICKBOOKS'] as const;

function crmClients(env: Env) {
  const out: NonNullable<Config['connectors']['crm']> = {};
  for (const name of CRM_ENV) {
    const id = env[`${name}_CLIENT_ID`];
    const secret = env[`${name}_CLIENT_SECRET`];
    if (id && secret) out[name.toLowerCase() as keyof typeof out] = { clientId: id, clientSecret: secret };
  }
  return out;
}

/**
 * The installation's Config from Worker environment variables and secrets (every key in docs/ENVIRONMENT.md), with
 * safe defaults and caps. Throws at start for a short AUTH_SECRET, incomplete Paddle prices, or no platform owner on a
 * multi-company install (fail closed).
 */
export function configFromEnv(env: Env): Config {
  const portalDomain = env.PORTAL_DOMAIN || undefined;
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) throw new Error('AUTH_SECRET must be at least 32 characters');
  const config: Config = {
    baseDomain: env.BASE_DOMAIN,
    scheme: 'https',
    centralHost: env.CENTRAL_HOST,
    deskHost: env.DESK_HOST || undefined,
    securityContact: env.SECURITY_CONTACT || undefined,
    singleTenantSlug: env.SINGLE_TENANT_SLUG || undefined,
    // The in-app console (/platform, /metrics) only where the operator is the company: a single-company install.
    inAppConsole: !!env.SINGLE_TENANT_SLUG,
    authSecret: env.AUTH_SECRET,
    // Request limits key on Cloudflare's own client-address header (lib/ratelimit.ts).
    clientIp: 'cf',
    // Robots refused by name, the public doors included (lib/botGuard.ts); ROBOT_GUARD=crawlers|off relaxes it.
    robotGuard: env.ROBOT_GUARD === 'off' ? 'off' : env.ROBOT_GUARD === 'crawlers' ? 'crawlers' : 'strict',
    crawlers: { docsAiAnswers: env.CRAWLERS_DOCS_AI === 'allow' },
    // Cloudflare Turnstile on the public forms when both keys are set and TURNSTILE is not "off" (lib/humanCheck.ts).
    turnstile: env.TURNSTILE !== 'off' && env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY ? { siteKey: env.TURNSTILE_SITE_KEY, secretKey: env.TURNSTILE_SECRET_KEY, sendIp: env.TURNSTILE_SEND_IP === '1' } : undefined,
    devExposeTokens: false,
    devOrgHeader: false,
    maxDevices: Number(env.MAX_DEVICES) || 2,
    sessionDays: 30,
    signupEnabled: env.SIGNUP_ENABLED !== '0' && !env.SINGLE_TENANT_SLUG,
    signupMode: env.SIGNUP_MODE === 'instant' ? 'instant' : 'request',
    secretsKey: env.SECRETS_KEY || undefined,
    portalDomain,
    billing: billingFromEnv(env),
    assistant: assistantConfigFrom(env as unknown as Record<string, string | undefined>),
    team: teamConfigFrom(env as unknown as Record<string, string | undefined>),
    ops: { alerts: env.OPS_ALERTS !== 'off', email: env.OPS_ALERT_EMAIL !== 'off' },
    push:
      env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
        ? { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || `mailto:${(env.PLATFORM_OWNER || 'owner@localhost').trim()}` }
        : undefined,
    retention: retentionFrom(env as unknown as Record<string, string | undefined>),
    support: {
      email: env.SUPPORT_EMAIL || undefined,
      webhookUrl: env.SUPPORT_WEBHOOK_URL || undefined,
      replyDomain: env.SUPPORT_REPLY_DOMAIN || undefined,
      mailKey: env.SUPPORT_MAIL_KEY || undefined,
      staff: (env.SUPPORT_STAFF || '').split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean),
    },
    staffKey: env.STAFF_KEY && env.STAFF_KEY.length >= 24 ? env.STAFF_KEY : undefined,
    staffKeys: Object.fromEntries(
      (env.STAFF_KEYS || '')
        .split(',')
        .map((p: string) => p.trim())
        .filter(Boolean)
        .map((p: string) => [p.slice(0, p.indexOf(':')).trim().toLowerCase(), p.slice(p.indexOf(':') + 1).trim()] as const)
        .filter(([e, k]: readonly [string, string]) => e.includes('@') && k.length >= 24),
    ),
    owner:
      (env.PLATFORM_OWNER || '').trim().toLowerCase() ||
      (env.SUPPORT_STAFF || '').split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean)[0] ||
      undefined,
    connectors: {
      ...(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET && env.SLACK_SIGNING_SECRET
        ? { slack: { clientId: env.SLACK_CLIENT_ID, clientSecret: env.SLACK_CLIENT_SECRET, signingSecret: env.SLACK_SIGNING_SECRET } }
        : {}),
      ...(env.TEAMS_BOT_APP_ID && env.TEAMS_BOT_APP_PASSWORD && env.TEAMS_BOT_TENANT_ID
        ? { teams: { appId: env.TEAMS_BOT_APP_ID, appPassword: env.TEAMS_BOT_APP_PASSWORD, tenantId: env.TEAMS_BOT_TENANT_ID } }
        : {}),
      ...(env.GCHAT_PROJECT_NUMBER && env.GCHAT_SA_EMAIL && env.GCHAT_SA_KEY
        ? { gchat: { projectNumber: env.GCHAT_PROJECT_NUMBER, serviceAccountEmail: env.GCHAT_SA_EMAIL, privateKey: env.GCHAT_SA_KEY.replace(/\\n/g, '\n') } }
        : {}),
      crm: crmClients(env),
      ...(env.SALESFORCE_RELAY_URL && /^https:\/\//.test(env.SALESFORCE_RELAY_URL) && (env.SALESFORCE_RELAY_KEY ?? '').length >= 24
        ? { salesforceRelay: { url: env.SALESFORCE_RELAY_URL, key: env.SALESFORCE_RELAY_KEY! } }
        : {}),
      ...(env.SALESFORCE_INSTALL_URL && /^https:\/\/login\.salesforce\.com\/packaging\/installPackage\.apexp\?p0=04t[0-9A-Za-z]{12,15}$/.test(env.SALESFORCE_INSTALL_URL)
        ? { salesforceInstallUrl: env.SALESFORCE_INSTALL_URL }
        : {}),
      demoCrm: env.DEMO_CRM === '1',
    },
    oauth: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : {}),
      ...(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET
        ? { microsoft: { clientId: env.MICROSOFT_CLIENT_ID, clientSecret: env.MICROSOFT_CLIENT_SECRET } }
        : {}),
    },
  };
  // No owner configured on a multi-company install: refuse to run (the owner sees every company's numbers).
  assertOwnerConfigured(config);
  return config;
}

export type Ctx = { waitUntil(p: Promise<unknown>): void };

/**
 * The request's dependencies on Workers: database through Hyperdrive (one client per request, as recommended),
 * storage on R2, mail, live rooms, help docs and the clock.
 */
export function depsFor(env: Env, ctx: Ctx) {
  // Hyperdrive pools connections; a client per request is the recommended use.
  const db = postgresDb(env.HYPERDRIVE.connectionString, { max: 1 });
  const pending: Promise<unknown>[] = [];
  return {
    db,
    pending,
    deps: {
      db,
      email: emailFor(env),
      storage: new R2Storage(env.FILES),
      config: configFromEnv(env),
      live: livePoker(env),
      // The docs' sections, as the docs build wrote them, from the site's own files.
      assistant: { docs: (lang: string) => env.ASSETS.fetch(new Request(`https://assets.local/docs/${lang}/answers.json`)).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))) as Promise<DocSection[]> },
      defer: (p: Promise<unknown>) => {
        pending.push(p);
        ctx.waitUntil(p);
      },
    },
  };
}

export default {
  /**
   * Mail sent to the reply domain (Cloudflare Email Routing → this worker):
   * an answer to a help request, from the person who asked or from Curahold's
   * own team. Anything else is dropped without an answer.
   */
  async email(message: { from: string; to: string; raw: ReadableStream<Uint8Array> }, env: Env, ctx: Ctx): Promise<void> {
    const { db, deps, pending } = depsFor(env, ctx);
    try {
      const raw = await new Response(message.raw).arrayBuffer();
      const outcome = await takeMail(deps, await readRawMail(raw, { from: message.from, to: message.to }));
      if (!outcome.taken) console.log('[curahold] mail not taken:', outcome.reason);
      // An answer by email moves a request: the console hears it like any other.
      else if (deps.live?.platform) pending.push(deps.live.platform().catch(() => undefined));
    } catch (e) {
      console.error('[curahold] mail failed', e);
    } finally {
      ctx.waitUntil(Promise.allSettled(pending).then(() => db.close()));
    }
  },
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url);
    const toWorker = url.pathname.startsWith('/api/') || url.pathname === '/mcp' || url.pathname.startsWith('/oauth/') || url.pathname.startsWith('/.well-known/') || url.pathname === '/robots.txt';
    if (!toWorker) return env.ASSETS.fetch(req);
    // robots.txt and the TDM reservation, per host, with no database (lib/botGuard.ts).
    const early = edgeAnswer(req, { centralHost: env.CENTRAL_HOST, singleTenantSlug: env.SINGLE_TENANT_SLUG || undefined, crawlers: { docsAiAnswers: env.CRAWLERS_DOCS_AI === 'allow' } });
    if (early) return early;
    // A live socket: checked by its ticket, handed to the company's room; no database, no app.
    if (url.pathname === '/api/live') return liveUpgrade(req, env, configFromEnv(env));
    // The console's live room (desk host only), the same way.
    if (url.pathname === PLATFORM_PATH) return platformUpgrade(req, env, configFromEnv(env));
    const { db, deps, pending } = depsFor(env, ctx);
    const app = createApp(deps);
    try {
      return await app.fetch(req);
    } finally {
      // Close the client only after background work (deliveries) is done.
      ctx.waitUntil(Promise.allSettled(pending).then(() => db.close()));
    }
  },

  // Cron triggers (wrangler.toml): hourly — digests, scheduled automations, retries;
  // every 10 minutes — the AI team's clock, which stops at once without a key or when switched off.
  async scheduled(event: { cron?: string }, env: Env, ctx: Ctx) {
    if (cronJob(event?.cron) === 'team') {
      const config = configFromEnv(env);
      // No key or switched off: not even a database connection.
      if (config.team?.scheduler === 'off' || !config.assistant?.apiKey || config.assistant.provider === 'off') return;
      const { db, deps } = depsFor(env, ctx);
      ctx.waitUntil(
        scheduledTeamTick(deps)
          .then((r) => r.status === 'ran' && console.log('[curahold] team tick', JSON.stringify({ woke: r.woke.length, ran: r.woke.filter((w) => w.ran).length })))
          .catch((e) => console.error('[curahold] team tick failed', e))
          .finally(() => db.close()),
      );
      return;
    }
    const { db, deps } = depsFor(env, ctx);
    // The hourly jobs change bills (seats) and trials: the console hears it after them.
    ctx.waitUntil(
      runScheduled(deps)
        .then(() => deps.live?.platform?.().catch(() => undefined))
        .finally(() => db.close()),
    );
  },
};

/** Which job a cron event is for: the AI team's 10-minute clock, or the hourly jobs (any other or no cron). */
export function cronJob(cron: string | undefined): 'team' | 'hourly' {
  return cron === TEAM_CRON ? 'team' : 'hourly';
}

/** The product's mail path (owner's choice: Google Workspace; see lib/smtpRelay.ts). */
export function emailFor(env: Env): EmailSender {
  const p = mailProvider(env);
  if (p === 'google_relay') return new SmtpRelayEmail(relayOptions(env), workerSockets);
  if (p === 'resend') return new ResendEmail(env.RESEND_API_KEY, env.EMAIL_FROM);
  return new ConsoleMailer();
}
