// Cloudflare Workers entry. Static files (the React app) are served by the
// Workers assets binding; /api/* runs the Hono app. The database is Supabase
// Postgres (EU) reached through Hyperdrive; files go to an R2 bucket.
import { createApp } from './app';
import { readRawMail, takeMail } from './lib/helpThread';
import type { BillingConfig, Config } from './context';
import { postgresDb } from './db/postgres';
import { runScheduled } from './lib/scheduler';
import { R2Storage, ResendEmail, type R2Like } from './lib/services';

export interface Env {
  HYPERDRIVE: { connectionString: string };
  FILES: R2Like;
  ASSETS: { fetch(req: Request): Promise<Response> };
  BASE_DOMAIN: string;
  CENTRAL_HOST: string;
  /** Curahold's own support desk; desk.<BASE_DOMAIN> when not set. */
  DESK_HOST?: string;
  AUTH_SECRET: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  SINGLE_TENANT_SLUG?: string;
  MAX_DEVICES?: string;
  SECRETS_KEY?: string;
  SIGNUP_ENABLED?: string;
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
  /** The customer portal's own domain, e.g. curahold-portal.com (unset: no portal). */
  PORTAL_DOMAIN?: string;
  /** Billing through Paddle (all four set, or billing stays off). "sandbox" or "live". */
  PADDLE_ENV?: string;
  PADDLE_API_KEY?: string;
  PADDLE_WEBHOOK_SECRET?: string;
  PADDLE_CLIENT_TOKEN?: string;
  /** Price ids: {"team":{"month":"pri_…","year":"pri_…"},"business":{"month":"pri_…","year":"pri_…"}} */
  PADDLE_PRICES?: string;
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

const CRM_ENV = ['SALESFORCE', 'HUBSPOT', 'DYNAMICS', 'PIPEDRIVE', 'ZOHO'] as const;

function crmClients(env: Env) {
  const out: NonNullable<Config['connectors']['crm']> = {};
  for (const name of CRM_ENV) {
    const id = env[`${name}_CLIENT_ID`];
    const secret = env[`${name}_CLIENT_SECRET`];
    if (id && secret) out[name.toLowerCase() as keyof typeof out] = { clientId: id, clientSecret: secret };
  }
  return out;
}

export function configFromEnv(env: Env): Config {
  const portalDomain = env.PORTAL_DOMAIN || undefined;
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) throw new Error('AUTH_SECRET must be at least 32 characters');
  return {
    baseDomain: env.BASE_DOMAIN,
    scheme: 'https',
    centralHost: env.CENTRAL_HOST,
    deskHost: env.DESK_HOST || undefined,
    singleTenantSlug: env.SINGLE_TENANT_SLUG || undefined,
    authSecret: env.AUTH_SECRET,
    devExposeTokens: false,
    devOrgHeader: false,
    maxDevices: Number(env.MAX_DEVICES) || 2,
    sessionDays: 30,
    signupEnabled: env.SIGNUP_ENABLED !== '0' && !env.SINGLE_TENANT_SLUG,
    secretsKey: env.SECRETS_KEY || undefined,
    portalDomain,
    billing: billingFromEnv(env),
    support: {
      email: env.SUPPORT_EMAIL || undefined,
      webhookUrl: env.SUPPORT_WEBHOOK_URL || undefined,
      replyDomain: env.SUPPORT_REPLY_DOMAIN || undefined,
      mailKey: env.SUPPORT_MAIL_KEY || undefined,
      staff: (env.SUPPORT_STAFF || '').split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean),
    },
    staffKey: env.STAFF_KEY && env.STAFF_KEY.length >= 24 ? env.STAFF_KEY : undefined,
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
}

export type Ctx = { waitUntil(p: Promise<unknown>): void };

export function depsFor(env: Env, ctx: Ctx) {
  // Hyperdrive pools connections; a client per request is the recommended use.
  const db = postgresDb(env.HYPERDRIVE.connectionString, { max: 1 });
  const pending: Promise<unknown>[] = [];
  return {
    db,
    pending,
    deps: {
      db,
      email: new ResendEmail(env.RESEND_API_KEY, env.EMAIL_FROM),
      storage: new R2Storage(env.FILES),
      config: configFromEnv(env),
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
    } catch (e) {
      console.error('[curahold] mail failed', e);
    } finally {
      ctx.waitUntil(Promise.allSettled(pending).then(() => db.close()));
    }
  },
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url);
    const toWorker = url.pathname.startsWith('/api/') || url.pathname === '/mcp' || url.pathname.startsWith('/oauth/') || url.pathname.startsWith('/.well-known/');
    if (!toWorker) return env.ASSETS.fetch(req);
    const { db, deps, pending } = depsFor(env, ctx);
    const app = createApp(deps);
    try {
      return await app.fetch(req);
    } finally {
      // Close the client only after background work (deliveries) is done.
      ctx.waitUntil(Promise.allSettled(pending).then(() => db.close()));
    }
  },

  // Cron trigger (wrangler.toml): digests, scheduled automations, retries.
  async scheduled(_event: unknown, env: Env, ctx: Ctx) {
    const { db, deps } = depsFor(env, ctx);
    ctx.waitUntil(runScheduled(deps).finally(() => db.close()));
  },
};
