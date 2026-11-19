# 0015. Bot and scraper protection from free layers: crawler policy, refusals, limits, human checks

- Status: Accepted
- Date: 2026-11-19
- Deciders: product owner, engineering

## Context

Public doors (trial request, sign-up, the public assistant, portal sign-in) attract scripted abuse that costs money
(model calls, mail) and data. AI crawlers copying the docs and product is a business risk. A paid bot-management
service is out of budget, and real people (including customers pointing their own AI at their own data) must never be
locked out.

## Decision

- One crawler list (`shared/src/compliance/crawlers.ts`) writes every `robots.txt` and drives the Worker's refusals
  (`api/src/lib/botGuard.ts`): search engines may read the sales site and docs; AI crawlers are refused on the app and
  API (403), except the AI connector's own doors and any request with an API key; company hosts, desk, portal and
  self-host say `Disallow: /`. TDM opt-out is published.
- `ROBOT_GUARD=strict` in production also refuses scripted HTTP tools and empty user agents on the public doors.
- Per-person, per-company and per-address rate limits (`lib/ratelimit.ts`); a scanner hitting many unknown addresses
  waits like any other limit; unusual traffic is written to the operator console's alerts.
- Public forms carry a honeypot and a fill-time check, plus Cloudflare Turnstile (free) when its keys are set
  (`lib/humanCheck.ts`). If Turnstile is unreachable the form is let through and logged; the limits still hold.
- Legal side: true notices only (©, ™ where used, copyright/trade secret) — never "patented" (no filing exists; a test
  forbids the word) — plus anti-scraping clauses in the terms and acceptable-use policy.

## Alternatives considered

- Paid bot management: monthly cost not justified before revenue.
- Blocking all automation: breaks customers' own integrations and AI connectors.

## Consequences

- A robot running a real browser with a browser's name gets through; the limits and alerts are the backstop.
- Known low findings: a fake `Bearer` header passes the AI-crawler refusal to public answers; scanners without a
  session are not counted by the unknown-address limit. Cloudflare's own free settings are listed in the RUNBOOK.
