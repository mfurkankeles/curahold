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
import type { Config } from './context';
import { migrate } from './db/migrate';
import { loadMigrations } from './db/migrations-fs';
import { createMemoryPg, pgliteDb } from './db/pglite';
import { runScheduled } from './lib/scheduler';
import { MemoryEmail, MemoryStorage } from './lib/services';
import { seedDemo } from '../../scripts/seed-demo';

export async function startLocal(opts: { port: number; publicPort: number; serveStatic: boolean; quiet?: boolean; staffKey?: string }) {
  const db = pgliteDb(await createMemoryPg());
  await migrate(db, loadMigrations());
  const demo = await seedDemo(db);
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
    centralHost: 'app.localhost',
    authSecret: 'local-development-secret-not-for-production-use',
    devExposeTokens: true,
    devOrgHeader: true,
    maxDevices: 2,
    sessionDays: 30,
    oauth: {},
    signupEnabled: true,
    connectors: { demoCrm: true },
    support: { email: 'support@tendwell.localhost' },
    // Customers' portal: demo.portal.localhost (another site than demo.localhost, as in production).
    portalDomain: 'portal.localhost',
    staffKey: opts.staffKey,
  };
  const storage = new MemoryStorage();
  const api = createApp({ db, email, storage, config });
  const root = new Hono();
  root.route('/', api);
  const portal = new Hono();
  portal.route('/', createPortalApp({ db, email, storage, config }));
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
  const server = serve({ fetch: (req: Request) => (isPortal(req) ? portal.fetch(req) : root.fetch(req)), port: opts.port });
  // Hourly jobs (digests, automations); on Workers this is the cron trigger.
  const timer = setInterval(() => runScheduled({ db, email, storage, config }).catch(() => undefined), 3600_000);
  timer.unref();
  if (!opts.quiet) {
    console.log(`Tendwell API on http://localhost:${opts.port}`);
    console.log(`Demo company: http://demo.localhost:${opts.publicPort}  (sign in as ${demo.adminEmail})`);
  }
  return { server, db, email, demo, config };
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const serveStaticFiles = process.env.SERVE_STATIC === '1';
  const port = Number(process.env.PORT ?? 8787);
  await startLocal({ port, publicPort: serveStaticFiles ? port : 5173, serveStatic: serveStaticFiles });
}
