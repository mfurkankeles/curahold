// Local server on Node: embedded Postgres, demo company, emails printed to
// the console. `npm run dev` starts it next to the Vite dev server;
// `SERVE_STATIC=1` also serves the built app (used by the browser tests).
//
// Open http://demo.localhost:5173 (dev) — Chrome and Firefox resolve
// *.localhost to this machine, so company subdomains work locally too.
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { createApp } from './app';
import { createPortalApp } from './portal';
import type { Config, Deps } from './context';
import { migrate } from './db/migrate';
import { loadMigrations } from './db/migrations-fs';
import { createMemoryPg, pgliteDb } from './db/pglite';
import { runScheduled } from './lib/scheduler';
import { MemoryEmail, MemoryStorage } from './lib/services';
import { seedDemo } from '../../scripts/seed-demo';
import { seedOwnerPlan } from '../../scripts/seed-owner-plan';
import { attachLive } from './live/node';
import { assistantConfigFrom } from './assistant/cost';
import { teamConfigFrom } from './team/config';

/**
 * Starts the whole product on one machine with an in-memory database and demo data (`npm run dev`, `start:local`):
 * migrations, seed, API, static app and live updates.
 */
export async function startLocal(opts: { port: number; publicPort: number; serveStatic: boolean; quiet?: boolean; staffKey?: string; supportStaff?: string[]; locale?: 'en' | 'tr'; signupMode?: 'request' | 'instant'; fetch?: typeof fetch; connectors?: Config['connectors']; oauth?: Config['oauth'] }) {
  const pg = await createMemoryPg();
  const db = pgliteDb(pg);
  await migrate(db, loadMigrations());
  // English unless asked (DEMO_LOCALE=tr for a Turkish sample company).
  const demo = await seedDemo(db, { locale: opts.locale ?? (['en', 'tr'] as const).find((l) => l === process.env.DEMO_LOCALE) ?? 'en' });
  // The owner console's investor side, with invented sample data (never in production).
  await seedOwnerPlan(db);
  const email = new MemoryEmail();
  const origSend = email.send.bind(email);
  email.send = async (m) => {
    await origSend(m);
    if (!opts.quiet) console.log(`\n✉️  to ${m.to}\n   ${m.subject}\n${m.text.replace(/^/gm, '   ')}\n`);
  };
  const config: Config = {
    baseDomain: 'localhost',
    scheme: 'http',
    publicPort: opts.publicPort,
    // The demo and the browser tests fill the company through the API at machine speed: ten times the budgets.
    clientIp: 'socket',
    limitScale: 10,
    centralHost: 'app.localhost',
    // Curahold's own support desk, on a host of its own (desk.localhost, as desk.curahold.com).
    deskHost: 'desk.localhost',
    authSecret: 'local-development-secret-not-for-production-use',
    devExposeTokens: true,
    devOrgHeader: true,
    maxDevices: 2,
    sessionDays: 30,
    oauth: opts.oauth ?? {},
    signupEnabled: true,
    // The trial request form unless asked for the earlier instant sign-up (SIGNUP_MODE=instant).
    signupMode: opts.signupMode ?? (process.env.SIGNUP_MODE === 'instant' ? 'instant' : 'request'),
    connectors: opts.connectors ?? { demoCrm: true },
    // Who may sign in to the support desk (desk.localhost); the code is shown on the screen here.
    support: { email: 'support@curahold.localhost', staff: opts.supportStaff ?? ['desk@curahold.localhost'] },
    // Customers' portal: demo.portal.localhost (another site than demo.localhost, as in production).
    portalDomain: 'portal.localhost',
    staffKey: opts.staffKey,
    // The assistant: a model only when a key is in the environment; otherwise the docs search answers.
    assistant: assistantConfigFrom(process.env),
    team: teamConfigFrom(process.env),
    // Phone alerts for the owner, when a VAPID key pair is in the environment (scripts/plan/vapid-keys.ts).
    push:
      process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
        ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, subject: process.env.VAPID_SUBJECT || 'mailto:desk@curahold.localhost' }
        : undefined,
  };
  const storage = new MemoryStorage();
  const docsDir = join(import.meta.dirname, '..', '..', 'dist', 'web', 'docs');
  const deps: Deps = { db, email, storage, config, ...(opts.fetch ? { fetch: opts.fetch } : {}), assistant: { docs: async (lang) => JSON.parse(readFileSync(join(docsDir, lang, 'answers.json'), 'utf8')) } };
  const api = createApp(deps);
  const root = new Hono();
  root.route('/', api);
  const portal = new Hono();
  portal.route('/', createPortalApp({ db, email, storage, config, ...(opts.fetch ? { fetch: opts.fetch } : {}) }));
  if (opts.serveStatic) {
    const dist = join(import.meta.dirname, '..', '..', 'dist', 'web');
    const index = readFileSync(join(dist, 'index.html'), 'utf8');
    root.use('/assets/*', serveStatic({ root: dist }));
    // The docs are plain files; /docs/tr/api-keys/ is that folder's index.html.
    root.get('/docs', (c) => c.redirect('/docs/'));
    root.use('/docs/*', serveStatic({ root: dist }));
    root.use('/llms.txt', serveStatic({ root: dist }));
    root.use('/icons/*', serveStatic({ root: dist }));
    root.use('/sw.js', serveStatic({ root: dist }));
    root.get('*', (c) => c.html(index));
    const portalDist = join(import.meta.dirname, '..', '..', 'dist', 'portal');
    if (existsSync(join(portalDist, 'index.html'))) {
      const portalIndex = readFileSync(join(portalDist, 'index.html'), 'utf8');
      portal.use('/assets/*', serveStatic({ root: portalDist }));
      portal.get('*', (c) => c.html(portalIndex));
    }
  }
  // The portal's own domain gets the portal, and nothing else.
  const isPortal = (req: Request) => (req.headers.get('host') ?? new URL(req.url).host).split(':')[0].endsWith(`.${config.portalDomain}`);
  const server = serve({ fetch: (req: Request, env: unknown) => (isPortal(req) ? portal.fetch(req, env) : root.fetch(req, env)), port: opts.port });
  // The live channel: /api/live on the same port; the database says when to look.
  const live = await attachLive(server as unknown as import('node:http').Server, {
    db,
    config,
    listen: async (onOrg) => pg.listen('curahold_live', onOrg),
  });
  // Curahold's console's room is told by the app after a write (app.ts); a company's, by Postgres.
  deps.live = { platform: () => live.platform() };
  // Hourly jobs (digests, automations); on Workers this is the cron trigger.
  const timer = setInterval(() => runScheduled({ db, email, storage, config, ...(opts.fetch ? { fetch: opts.fetch } : {}) }).catch(() => undefined), 3600_000);
  timer.unref();
  if (!opts.quiet) {
    console.log(`Curahold API on http://localhost:${opts.port}`);
    console.log(`Demo company: http://demo.localhost:${opts.publicPort}  (sign in as ${demo.adminEmail})`);
  }
  return { server, db, email, demo, config, live };
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const serveStaticFiles = process.env.SERVE_STATIC === '1';
  const port = Number(process.env.PORT ?? 8787);
  await startLocal({ port, publicPort: serveStaticFiles ? port : 5173, serveStatic: serveStaticFiles });
}
