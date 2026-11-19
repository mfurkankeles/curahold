# 0018. Product e-mail goes through the Google Workspace SMTP relay; Resend stays wired as the alternative

- Status: Accepted
- Date: 2026-11-19
- Deciders: product owner

## Context

The company's own mail already runs on Google Workspace. A dedicated sending service is another subscription and
another processor. Cloudflare Workers have no Node mail library, but they have TCP sockets with STARTTLS.

## Decision

- `api/src/lib/smtpRelay.ts` speaks the few SMTP commands a relay needs over a Worker socket (port 587, STARTTLS,
  AUTH with a Workspace user's app password, because a Worker has no fixed address to allow-list). It is the default
  when `SMTP_RELAY_USER` is set (`EMAIL_PROVIDER=google_relay|resend|console`).
- Self-hosted installs use `SMTP_URL` with nodemailer: the same relay settings work.

## Alternatives considered

- Resend (already integrated): good deliverability tooling, but a new paid tier as volume grows.

## Consequences

- The relay's published daily recipient limit per user is the ceiling to watch; nearing it, or a deliverability drop,
  means switching `EMAIL_PROVIDER=resend` (an owner decision because it adds a paid service).
- SPF, DKIM and DMARC for the sending domain are part of go-live.
