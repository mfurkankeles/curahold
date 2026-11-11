// Cloudflare Workers entry. Static files (the React app) are served by the
// Workers assets binding; /api/* runs the Hono app. The database is Supabase
// Postgres (EU) reached through Hyperdrive; files go to an R2 bucket.
import { createApp } from './app';
import type { Config } from './context';
import { postgresDb } from './db/postgres';
import { runScheduled } from './lib/scheduler';
import { R2Storage, ResendEmail, type R2Like } from './lib/services';

export interface Env {
  HYPERDRIVE: { connectionString: string };
  FILES: R2Like;
  ASSETS: { fetch(req: Request): Promise<Response> };
  BASE_DOMAIN: string;
  CENTRAL_HOST: string;
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
}

export function configFromEnv(env: Env): Config {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) throw new Error('AUTH_SECRET must be at least 32 characters');
  return {
    baseDomain: env.BASE_DOMAIN,
    scheme: 'https',
    centralHost: env.CENTRAL_HOST,
    singleTenantSlug: env.SINGLE_TENANT_SLUG || undefined,
    authSecret: env.AUTH_SECRET,
    devExposeTokens: false,
    devOrgHeader: false,
    maxDevices: Number(env.MAX_DEVICES) || 2,
    sessionDays: 30,
    signupEnabled: env.SIGNUP_ENABLED !== '0' && !env.SINGLE_TENANT_SLUG,
    secretsKey: env.SECRETS_KEY || undefined,
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

type Ctx = { waitUntil(p: Promise<unknown>): void };

function depsFor(env: Env, ctx: Ctx) {
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
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
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
