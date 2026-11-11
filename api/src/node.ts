// Local server on Node: embedded Postgres, demo company, emails printed to
// the console. `npm run dev` starts it next to the Vite dev server;
// `SERVE_STATIC=1` also serves the built app (used by the browser tests).
//
// Open http://demo.localhost:5173 (dev) — Chrome and Firefox resolve
// *.localhost to this machine, so company subdomains work locally too.
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { createApp } from './app';
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
    staffKey: opts.staffKey,
  };
  const api = createApp({ db, email, storage: new MemoryStorage(), config });
  const root = new Hono();
  root.route('/', api);
  if (opts.serveStatic) {
    const dist = join(import.meta.dirname, '..', '..', 'dist', 'web');
    const index = readFileSync(join(dist, 'index.html'), 'utf8');
    root.use('/assets/*', serveStatic({ root: dist }));
    // The docs are plain files; /docs/tr/api-keys/ is that folder's index.html.
    root.get('/docs', (c) => c.redirect('/docs/'));
    root.use('/docs/*', serveStatic({ root: dist }));
    root.use('/llms.txt', serveStatic({ root: dist }));
    root.get('*', (c) => c.html(index));
  }
  const server = serve({ fetch: root.fetch, port: opts.port });
  // Hourly jobs (digests, automations); on Workers this is the cron trigger.
  const timer = setInterval(() => runScheduled({ db, email, storage: new MemoryStorage(), config }).catch(() => undefined), 3600_000);
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
