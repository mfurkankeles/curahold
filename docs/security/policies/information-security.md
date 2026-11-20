# Information security policy

> **Draft — owner to adopt.** Version 2026-11-20.draft1. It describes what Curahold's system enforces and what its
> operators do; lines marked OPEN are not done yet. The other policies in this folder hang off this one.

## Purpose and scope

Keep customer data safe, correct and separate between companies, and keep the service available. In scope: the hosted
service (app, customer portal, API, help centre, sales site), its staging copy, the repository and CI, the operators'
accounts at every provider, and Curahold's internal AI team. Self-hosted installs are the customer's to secure, with the
self-host notes (SECURITY.md requirement #14).

## Priorities

When goals conflict, in this order (QUALITY.md): data safety and correctness — no loss, no wrong data, no leak between
companies — then speed, simplicity, real-time, design, feature count. A change that weakens tenant isolation, a guard
test or the AI approval gate is never traded for anything below it.

## Roles

| Role | Does |
| --- | --- |
| Owner | Approves policies, deploys, access to providers, spending, and every outside action proposed by the AI team; receives incident escalations |
| Senior Security Engineer (AI seat) | Reviews every agent-written branch and new dependency, runs the testing calendar, triages alerts, proposes fixes; never acts outside the repository on its own (`api/src/team/gate.ts`) |
| Every person or seat with access | Follows these policies, reports suspected incidents at once |

## Classification

| Class | Examples | Handling |
| --- | --- | --- |
| Public | Sales site, help centre, legal pages | Published; no personal data |
| Internal | Runbooks, this folder, threat model | Repository access only |
| Customer confidential | Everything a company keeps in Curahold, portal data, support recordings | Only through the product's permissions; staff only with the customer's consent; never in tickets, logs, chats or test fixtures (`tests/leak.test.ts`) |
| Secret | Keys, tokens, passphrases, `AUTH_SECRET`, `SECRETS_KEY`, backup passphrase | Worker secrets or the password manager only; never in git, `[vars]`, logs or messages; rotated per the runbook |

## Rules that apply everywhere

- Every company table carries `org_id` with row-level security; requests run inside the company's transaction; a
  `db.system()` statement always names `org_id` from a trusted source (CLAUDE.md).
- Least privilege for people, seats and API keys; a second step on every operator account (access-control policy).
- Encryption in transit everywhere; secrets sealed or stored as provider secrets; backups encrypted.
- No real customer or personal data outside production — demo and tests use invented data only.
- No new paid service, outside API or runtime dependency without the owner's approval (vendor-management policy).
- Changes reach production only through the CI gate and the owner's go-ahead (change-management policy).
- Incidents follow the incident-response policy; personal-data breaches the breach runbook.

## Review

Yearly, after a serious incident, and when the scope changes (a new region, a new kind of data, the first employee).
