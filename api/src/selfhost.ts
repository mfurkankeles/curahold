// Curahold on your own server: one company, your own Postgres, files on disk,
// mail through your SMTP server (or, to start, written to the log). On start it
// brings the database up to date, creates the company the first time, serves
// the app and its help pages, and runs the hourly jobs. No billing: everything
// is open.
//
// Docker: Dockerfile and docker-compose.yml at the top of the repository.
// Settings (environment):
//   PUBLIC_URL      the address people open, e.g. https://curahold.example.com (required)
//   DATABASE_URL    postgres://user:password@host:5432/curahold (required)
//   AUTH_SECRET     32+ random characters (required)
//   ADMIN_EMAIL     the first administrator; needed on the first start
//   ADMIN_NAME, COMPANY_NAME, COMPANY_SLUG, LOCALE (en | tr), TIMEZONE, CURRENCY
//   SMTP_URL        smtp://user:password@mail.example.com:587 (without it, mail goes to the log)
//   EMAIL_FROM      "Curahold <curahold@example.com>"
//   FILES_DIR       where attachments are kept (default ./data/files)
//   PORT            default 8080
//   …and any of the optional sign-in and connector settings from the README.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createTransport, type Transporter } from 'nodemailer';
import { normalizeLocale } from '../../shared/src/i18n';
import { createApp } from './app';
import type { Config } from './context';
import { migrate } from './db/migrate';
import { loadMigrations } from './db/migrations-fs';
import { postgresDb } from './db/postgres';
import type { Db } from './db';
import { createOrg } from './lib/orgs';
import { runScheduled } from './lib/scheduler';
import type { EmailMessage, EmailSender, Storage } from './lib/services';
import { createPortalApp } from './portal';
import { configFromEnv, type Env } from './worker';

// ---------------------------------------------------------------- mail

/** Mail through the company's own SMTP server. */
export class SmtpEmail implements EmailSender {
  private transport: Transporter;
  constructor(
    url: string,
    private from: string,
  ) {
    this.transport = createTransport(url);
  }
  async send(m: EmailMessage) {
    await this.transport.sendMail({ from: this.from, to: m.to, subject: m.subject, text: m.text, html: m.html });
  }
}

/** No SMTP yet: mail is written to the log, so the first sign-in link can be copied from there. */
export class LogEmail implements EmailSender {
  async send(m: EmailMessage) {
    console.log(`\n[curahold] mail to ${m.to}: ${m.subject}\n${m.text}\n`);
  }
}

// ---------------------------------------------------------------- files

/** Attachments on disk: each file beside a small note of its type. */
export class DiskStorage implements Storage {
  constructor(private dir: string) {}
  /** Keys are made by the server (company id / file id); anything else is refused. */
  private path(key: string) {
    if (!/^[A-Za-z0-9/_.-]{1,300}$/.test(key) || key.split('/').some((p) => p === '..' || p === '.' || p === '')) throw new Error(`bad file key ${key}`);
    return join(this.dir, key);
  }
  async put(key: string, data: ArrayBuffer, mime: string) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, new Uint8Array(data));
    await writeFile(`${p}.mime`, mime);
  }
  async get(key: string) {
    const p = this.path(key);
    if (!existsSync(p)) return null;
    const buf = await readFile(p);
    const mime = existsSync(`${p}.mime`) ? (await readFile(`${p}.mime`, 'utf8')).trim() : 'application/octet-stream';
    return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, mime };
  }
  async delete(key: string) {
    const p = this.path(key);
    await rm(p, { force: true });
    await rm(`${p}.mime`, { force: true });
  }
}

// ---------------------------------------------------------------- settings

/** The server's settings from its environment (the same names as the hosted service, where they apply). */
export function selfHostConfig(env: Record<string, string | undefined>): Config {
  if (!env.PUBLIC_URL) throw new Error('PUBLIC_URL is needed, e.g. https://curahold.example.com');
  const url = new URL(env.PUBLIC_URL);
  const slug = (env.COMPANY_SLUG || 'company').toLowerCase();
  const base = configFromEnv({ ...(env as unknown as Env), BASE_DOMAIN: url.hostname, CENTRAL_HOST: url.hostname, SINGLE_TENANT_SLUG: slug });
  return {
    ...base,
    scheme: url.protocol === 'http:' ? 'http' : 'https',
    publicPort: url.port ? Number(url.port) : undefined,
    signupEnabled: false,
    // Your own server: no subscription, everything open.
    billing: undefined,
  };
}

/** The company, the first time (with its first administrator). */
export async function ensureCompany(db: Db, env: Record<string, string | undefined>, slug: string): Promise<'created' | 'there'> {
  const [found] = await db.system((q) => q.query('select id from orgs where slug = $1', [slug]));
  if (found) return 'there';
  if (!env.ADMIN_EMAIL) throw new Error('ADMIN_EMAIL is needed on the first start: it becomes the first administrator');
  await createOrg(db, {
    slug,
    name: env.COMPANY_NAME || 'Our company',
    locale: normalizeLocale(env.LOCALE || 'en'),
    timezone: env.TIMEZONE || 'UTC',
    currency: env.CURRENCY || 'USD',
    template: 'customer_success',
    admin: { email: env.ADMIN_EMAIL.trim().toLowerCase(), name: env.ADMIN_NAME || env.ADMIN_EMAIL.split('@')[0] },
  });
  return 'created';
}

// ---------------------------------------------------------------- start

export async function startSelfHost(env: Record<string, string | undefined> = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is needed');
  const config = selfHostConfig(env);
  const root = env.APP_ROOT ?? process.cwd();
  const db = postgresDb(env.DATABASE_URL, { max: Number(env.DB_POOL || 10) });
  await migrate(db, loadMigrations(join(root, 'db', 'migrations')));
  const slug = config.singleTenantSlug!;
  if ((await ensureCompany(db, env, slug)) === 'created') console.log(`[curahold] company "${slug}" created; sign in at ${env.PUBLIC_URL} with ${env.ADMIN_EMAIL}`);

  const email: EmailSender = env.SMTP_URL ? new SmtpEmail(env.SMTP_URL, env.EMAIL_FROM || `Curahold <curahold@${new URL(env.PUBLIC_URL!).hostname}>`) : new LogEmail();
  const storage = new DiskStorage(env.FILES_DIR || join(root, 'data', 'files'));
  const deps = { db, email, storage, config };

  const app = new Hono();
  app.route('/', createApp(deps));
  // The app, its help pages and its icons, from the build (dist/web).
  const web = join(root, 'dist', 'web');
  const index = readFileSync(join(web, 'index.html'), 'utf8');
  app.use('/assets/*', serveStatic({ root: web }));
  app.get('/docs', (c) => c.redirect('/docs/'));
  app.use('/docs/*', serveStatic({ root: web }));
  for (const p of ['/llms.txt', '/icons/*', '/sw.js']) app.use(p, serveStatic({ root: web }));
  // An address the API does not know is an error, not the app's page.
  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));
  app.get('*', (c) => c.html(index));

  // The customer portal, on its own domain when PORTAL_DOMAIN is set.
  const portal = new Hono();
  if (config.portalDomain) {
    portal.route('/', createPortalApp(deps));
    const pweb = join(root, 'dist', 'portal');
    if (existsSync(join(pweb, 'index.html'))) {
      const pindex = readFileSync(join(pweb, 'index.html'), 'utf8');
      portal.use('/assets/*', serveStatic({ root: pweb }));
      portal.get('*', (c) => c.html(pindex));
    }
  }
  // One company: the portal is the PORTAL_DOMAIN address itself (context.ts, portalUrl).
  const isPortal = (req: Request) => !!config.portalDomain && (req.headers.get('host') ?? new URL(req.url).host).split(':')[0] === config.portalDomain;

  const port = Number(env.PORT || 8080);
  const server = serve({ fetch: (req: Request) => (isPortal(req) ? portal.fetch(req) : app.fetch(req)), port });
  // Hourly jobs: summaries, automations, renewals, syncs, cleaning up.
  const tick = () => runScheduled(deps).catch((e) => console.error('[curahold] scheduled jobs failed', e));
  const timer = setInterval(tick, 3600_000);
  setTimeout(tick, 60_000).unref();
  console.log(`[curahold] listening on :${port} for ${env.PUBLIC_URL}${env.SMTP_URL ? '' : ' (no SMTP_URL: mail goes to this log)'}`);

  const stop = () => {
    clearInterval(timer);
    server.close();
    void db.close?.();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  return { server, db, config, stop };
}

// Started as a program (node dist/server/selfhost.mjs), not imported by a test.
if (process.argv[1] && /selfhost\.(m?js|ts)$/.test(process.argv[1])) {
  startSelfHost().catch((e) => {
    console.error('[curahold]', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
