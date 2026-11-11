// Cloudflare Workers entry. Static files (the React app) are served by the
// Workers assets binding; /api/* runs the Hono app. The database is Supabase
// Postgres (EU) reached through Hyperdrive; files go to an R2 bucket.
import { createApp } from './app';
import type { Config } from './context';
import { postgresDb } from './db/postgres';
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

export default {
  async fetch(req: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    // Hyperdrive pools connections; a client per request is the recommended use.
    const db = postgresDb(env.HYPERDRIVE.connectionString, { max: 1 });
    const app = createApp({
      db,
      email: new ResendEmail(env.RESEND_API_KEY, env.EMAIL_FROM),
      storage: new R2Storage(env.FILES),
      config: configFromEnv(env),
    });
    try {
      return await app.fetch(req);
    } finally {
      ctx.waitUntil(db.close());
    }
  },
};
