# Access control policy

> **Draft — owner to adopt.** Version 2026-11-20.draft1. Lines marked OPEN are not done yet.

## Customers' users (enforced by the product)

- Sign-in without passwords: email link, Google, Microsoft, SAML or OIDC single sign-on; SCIM for provisioning.
- Second step: passkeys or an authenticator app with recovery codes; a company can require it of administrators or of
  everyone, checked on the server at every sign-in.
- Recent re-authentication (ten minutes) for roles, SSO/SCIM, API keys, personal exports and erasure, removing a person
  and exporting the audit trail.
- Roles and permissions per company, checked in the route and, where it matters, in SQL; field access for who reads and
  changes each field; department walls in SQL.
- One seat, one person; a device limit per seat and a code for each new device.
- Portal users see only what their company shared with them, on a separate domain and database role.

## Curahold's operators

- Each operator has their own accounts — no shared logins. Support keys are per person (`STAFF_KEYS`); the shared key is
  not used in production.
- The support desk and the platform console need a second step (emailed code and app).
- Support enters a customer's workspace only when that company's administrator grants access, for the time chosen;
  every action is written to the company's audit trail.
- Provider accounts (Cloudflare, Supabase, registrar, GitHub, Google Workspace, Paddle, the AI provider) use a second
  step and the fewest people possible. OPEN: an inventory of these accounts with their 2FA status.
- Infrastructure least privilege: secrets only as Worker secrets; OPEN: a separate database login for requests that does
  not own the tables (SECURITY.md requirement #2).

## The AI team

Seats read only the data their card allows (`shared/src/team/orgChart.ts` tools and permissions), never a customer's
workspace, and propose; only the owner's approval runs an outside action (`api/src/team/gate.ts`). A seat that tries to
reach beyond its card is paused and reviewed.

## Joiners, movers, leavers

- Joiner: accounts created with the role the work needs, the second step set up the first day, the confidentiality
  undertaking signed.
- Mover: access re-cut to the new role the same day.
- Leaver: every account and support key removed the same day; shared secrets they knew rotated (runbook "Rotating
  secrets").

## Reviews

Quarterly (testing calendar): every operator and provider account, every support key, every API key of Curahold's own
workspace; anything unused or unexplained is removed.
