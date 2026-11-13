# 0007. Live updates: one Durable Object per company, with polling fallback

- Status: Accepted (not built; polling is the current behaviour)
- Date: 2026-11-12
- Deciders: product owner

## Context

Target: another person's change (card move, comment, notification, a chat action) appears without a page refresh in at
most one second (p95). Today the web app polls `GET /api/pulse`, which is cheap and scoped per board / customer but takes
up to about 30 seconds to show a change. An idle connection must cost roughly nothing, to protect the margin.

## Decision

- Hosted: **one Cloudflare Durable Object per company with WebSocket Hibernation**, so idle sockets cost ~0.
- Self-host: the same client interface over **Node WebSocket + Postgres `LISTEN/NOTIFY`**.
- Networks that block WebSockets **fall back to today's polling**.
- The channel carries **no data**, only "this record changed" signals with a per-company, monotonically increasing
  change number. Clients batch signals briefly and fetch through the normal API with the normal permission checks, so
  the live channel cannot leak data. After a disconnect the client resumes from its last change number and pulls what it missed.
- Interim step already shipped: the pulse is **scoped** (boards and accounts follow only their own changes).

## Alternatives considered

- **Server-sent events or long polling from the Worker.** Holds a Worker invocation open per client; cost scales with idle users.
- **A third-party realtime service (priced per connection or message).** QUALITY.md forbids per-seat third-party fees.
- **Shorter polling interval.** Linear cost growth and still not under one second.

## Consequences

- Adds a Cloudflare-specific component and a second implementation for self-host; both must satisfy one interface and one test suite.
- Requires a per-company change counter written in the same transaction as the change (fits the outbox design in 0006).
- Until built, do not promise "real-time" in marketing copy; say "updates within about 30 seconds".
