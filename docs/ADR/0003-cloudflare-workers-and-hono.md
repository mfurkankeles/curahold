# 0003. Cloudflare Workers + Hono as the runtime

- Status: Accepted
- Date: 2026-11-12
- Deciders: product owner

> Note: this repository contains **no Netlify configuration**. Curahold is deployed to Cloudflare Workers; nothing in
> this repo builds or deploys to Netlify.

## Context

The product serves many small companies on their own subdomains, with spiky, mostly idle traffic, and must keep the
cost per seat tiny. We want one HTTP framework that works on an edge runtime *and* on plain Node (self-host, tests,
local development) with Web-standard `Request`/`Response`, so a single code path serves all shapes (0001).

## Decision

- **Hono** is the web framework. `createApp(deps)` in `api/src/app.ts` builds one app; entry points adapt it:
  `worker.ts` (Cloudflare), `portal-worker.ts` (customer portal, a second Worker on a separate domain),
  `selfhost.ts` and `node.ts` (Node via `@hono/node-server`).
- **Cloudflare Workers** host the API with `nodejs_compat`; static assets (`dist/web`, `dist/portal`) are served by the
  Workers assets binding, so only `/api/*`, `/mcp`, `/oauth/*` and `/.well-known/*` invoke the Worker. Attachments go to R2.
  The hourly cron trigger runs the scheduler (`wrangler.toml`).
- **Web-standard APIs only** in shared server code (Web Crypto, `fetch`, `Request`). Node-only modules stay in the Node entry files.
- The **customer portal is a separate Worker on a separate registrable domain** so no cookie, storage or code is shared with the app.
- **Deploys are manual** (`npm run build && npx wrangler deploy`) and happen only on the product owner's go-ahead. CI never deploys.

## Alternatives considered

- **Netlify Functions/Edge.** Fine for static sites; no equivalent of Hyperdrive, R2 and cron-in-the-same-platform at our
  cost point, and per-invocation credits would be the cost model we are trying to avoid.
- **Express/Fastify on a container platform.** Always-on cost per instance; no per-company scale-to-zero.
- **Next.js full-stack.** Ties the API to a UI framework and to a host; self-host would be harder.

## Consequences

- No long-lived in-process state: anything that must survive between requests lives in Postgres (hence DB-backed
  idempotency keys, outbox, sync state). In-memory caches are optimisations only.
- Workers limit CPU time and have no native TCP, so DB access depends on Hyperdrive/`postgres.js`, and heavy jobs
  (large syncs, reports) must be chunked and resumable.
- WebSockets for live updates need Durable Objects (see 0007), which is a Cloudflare-specific piece with a Node substitute for self-host.
- The portal and the app are two deployments with the same secrets; remember to deploy both after shared-code changes.
