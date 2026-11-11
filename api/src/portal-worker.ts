// Cloudflare Workers entry for the customer portal, a separate Worker on its
// own domain (*.tendwell-portal.com; wrangler.portal.toml). Static files are
// the portal's own small app (dist/portal); only /papi/* runs here. The app's
// API, sessions and cookies are not reachable from this domain at all.
import { createPortalApp } from './portal';
import { depsFor, type Ctx, type Env } from './worker';

export default {
  async fetch(req: Request, env: Env & { ASSETS: { fetch(req: Request): Promise<Response> } }, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/papi/')) return env.ASSETS.fetch(req);
    const { db, deps, pending } = depsFor(env, ctx);
    try {
      return await createPortalApp(deps).fetch(req);
    } finally {
      ctx.waitUntil(Promise.allSettled(pending).then(() => db.close()));
    }
  },
};
