# Standard security questionnaire answers (CAIQ-lite)

Ready answers for the security questionnaires prospects send, in the order most of them ask. Every answer is what the
code and the go-live guide do **today** (20 Nov 2026), with the place that proves it; "Planned" and "No" are said plainly.
Before sending, fill the [brackets] (company name and address, contacts) and re-check any line marked OPEN — it may have
changed. Not legal advice; the contract terms are in the DPA and the SLA.

Answers: **Yes** · **Partly** (what is missing is named) · **No** · **Planned** (with the trigger).

## 1. Company and governance

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 1.1 | Who provides the service? | [Company legal name], [address]. The company is being incorporated. | Terms §20 |
| 1.2 | Is there a named person responsible for security? | Yes: the owner. The AI team's Senior Security Engineer seat reviews code and runs the testing calendar; it only proposes, a person approves every outside action. | `shared/src/team/orgChart.ts`, `api/src/team/gate.ts` |
| 1.3 | Do you have written security policies? | Partly: drafts of information security, access control, incident response, vendor management, backup and DR, and change management exist and match the code; not yet formally adopted. | `docs/security/policies/` |
| 1.4 | Do you hold SOC 2, ISO 27001 or similar certifications? | No. The gap list says what each would take. | `docs/security/gap-list.md` |
| 1.5 | Has an independent penetration test been done? | No. Internal testing follows a weekly, monthly and quarterly calendar against our own staging copy. | `docs/security/testing-calendar.md` |
| 1.6 | Do you carry cyber insurance? | No. [owner decision] | — |

## 2. Data, hosting and residency

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 2.1 | Where is customer data stored? | In the European Union: the database in Supabase Central EU (Frankfurt); files in Cloudflare R2, location Europe. Self-host: wherever the customer runs it. | `docs/ENVIRONMENT.md` §1a, go-live guide steps 11–12 |
| 2.2 | Can we choose another region? | Partly: a separate deployment per region is possible (Gulf, Asia); one deployment serves one region. | `docs/ENVIRONMENT.md` §1a |
| 2.3 | Which sub-processors see our data? | The list with purposes and countries is published and generated from the data inventory; 30 days' notice and a right to object before a new one starts. | Sub-processors page, DPA §5 |
| 2.4 | What personal data do you process, and as what? | As processor: whatever the customer enters. As controller: accounts, billing, security logs, trial requests, consents. | Privacy notice, DPA Annex 1, `docs/compliance/data-inventory.md` |
| 2.5 | Do you sell or share data for advertising? | No sale. Website analytics and ad pixels run only after consent, and the pixels are switched off today. | Privacy notice, Cookies page |
| 2.6 | Can we export and delete our data? | Yes: export at any time; a company deletion runs 30 days after an administrator asks, with a deletion certificate; a person can be erased on their own. Backups are overwritten within 35 days (the R2 lifecycle rule that enforces this for the off-site copies is OPEN until go-live). | `api/src/lib/companyDeletion.ts`, `api/src/lib/retention.ts`, Terms §13 |
| 2.7 | Do you keep data after the contract ends? | 30 days for export, then deletion; invoices and the agreement record as the law requires. | DPA §9 |

## 3. Separation between customers

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 3.1 | How is one customer's data kept from another's? | Every company table carries `org_id` with row-level security in Postgres on `app_org()`, paired foreign keys `(org_id, id)`, and requests run inside a per-company transaction. A bug in a screen still cannot read another company's rows. | SECURITY.md "The isolation model", `db/migrations/` |
| 3.2 | Is that tested? | Yes: isolation suites on PGlite and on real Postgres 16 in every CI run; the CI gate fails if they fail. | `.github/workflows/ci.yml`, `tests/isolation*.test.ts`, `tests/rls.test.ts` |
| 3.3 | Can your staff see our data? | Only when your administrator grants support access, for the time chosen; every action is logged in your audit trail. | SECURITY.md, DPA §3 |

## 4. Identity and access (your users)

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 4.1 | Which sign-in methods? | Email link (no passwords), Google, Microsoft, SAML and OIDC single sign-on, SCIM provisioning. | `api/src/lib/sso.ts`, `api/src/lib/saml.ts`, `api/src/routes/scim.ts` |
| 4.2 | Multi-factor? | Yes: passkeys (WebAuthn) and an authenticator app (TOTP) with recovery codes; a company can require a second step of administrators or everyone. Sensitive actions need a sign-in from the last ten minutes. | SECURITY.md item 10 |
| 4.3 | Role-based access? | Yes: roles and permissions per company, field-level access, department walls enforced in SQL. | `lib/fieldAccess.ts`, `app_visible_boards` |
| 4.4 | Session and device controls? | Device limit per seat (2 by default), a code for a new device, sessions that can be revoked. | `MAX_DEVICES`, Settings → Devices |
| 4.5 | Audit log? | Yes: append-only in the database (no role can update or delete it), exportable with a running SHA-256. | SECURITY.md item 11 |

## 5. Identity and access (our side)

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 5.1 | How do your operators sign in? | The support desk and the platform console need a second step (emailed code and app); support keys are per person (`STAFF_KEYS`). | SECURITY.md item 10 and "Known operational requirements" #4 |
| 5.2 | Least privilege on infrastructure? | Partly: secrets only as Worker secrets; a separate database login for requests that does not own the tables is OPEN. | SECURITY.md requirements #2, #5 |
| 5.3 | Access reviews? | Planned: quarterly, in the testing calendar. | `docs/security/testing-calendar.md` |
| 5.4 | Branch protection and code review? | Partly: every change goes through the CI gate and a review by another seat; branch protection in the git host is OPEN. | SECURITY.md requirement #15 |

## 6. Encryption

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 6.1 | In transit? | TLS 1.2 or later; HSTS on HTTPS answers. | `api/src/lib/headers.ts` |
| 6.2 | At rest? | By the database and file-storage providers [confirm the provider settings at go-live]; connector credentials are additionally sealed with AES-256-GCM under `SECRETS_KEY`; backup files are encrypted with AES-256 (openssl, PBKDF2). | `docs/ENVIRONMENT.md` §1, `scripts/backup/backup.ts` |
| 6.3 | Key management? | Secrets are Worker secrets, never in code or `[vars]`; rotation steps in the runbook; a re-seal tool for connector credentials after a key change is OPEN. | `docs/RUNBOOK.md` "Rotating secrets" |

## 7. Application security

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 7.1 | Secure development? | Every change: typecheck, lint, the full test suite on two databases, isolation suites, a leak scan, builds and the production dependency audit, all required by the CI gate. Every agent-written branch gets an AppSec review. | `.github/workflows/ci.yml`, `docs/security/testing-calendar.md` |
| 7.2 | OWASP / ASVS? | Mapped against ASVS Level 2 and the API Security Top 10, with open items listed. | `docs/security/asvs.md` |
| 7.3 | Threat model? | Yes, per surface. | `docs/security/threat-model.md` |
| 7.4 | Browser protections? | Content-Security-Policy, X-Frame-Options DENY, nosniff, a strict referrer policy; bot protection with Cloudflare Turnstile on public forms; request limits per address, person and company. | `api/src/lib/headers.ts`, `api/src/lib/ratelimit.ts`, SECURITY.md |
| 7.5 | Dependency vulnerabilities? | `npm audit` (high/critical, production) blocks CI; weekly lockfile and secret scans; monthly front-end library scan. | `scripts/security/scan.ts` |
| 7.6 | Vulnerability disclosure? | A responsible-disclosure page and `/.well-known/security.txt` (its contact is set before go-live). | `docs/site/en/responsible-disclosure.md`, `SECURITY_CONTACT` |

## 8. Logging, monitoring, incidents

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 8.1 | Security logs and retention? | Sign-ins, devices and activity, kept 12 months. | Privacy notice table |
| 8.2 | Monitoring and alerting? | Planned at go-live: uptime checks, alerts and a status page (go-live guide step 24). | `docs/go-live/README.tr.md` |
| 8.3 | Incident response plan? | Yes: a written breach runbook and a register; customers told within 48 hours of our becoming aware of a breach of their data. | `docs/compliance/breach-runbook.md`, DPA §7 |

## 9. Continuity and backups

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 9.1 | Backups? | Supabase daily backups; a scripted, encrypted weekly copy to a second place (the off-site routine is OPEN until go-live). | `docs/RUNBOOK.md` "Backups and restore" |
| 9.2 | Restore tested? | Yes on a local Postgres 16 (19 Nov 2026: 1.29 million rows restored and verified, row-level security checked); quarterly drills are in the calendar; a drill against a production copy follows go-live. | `scripts/backup/restore-drill.ts` |
| 9.3 | RPO / RTO? | Proposed in the SLA: RPO [24] hours, RTO [8] hours. Point-in-time recovery is switched on with the first paying customer. | SLA §4, RUNBOOK |
| 9.4 | Availability commitment? | Proposed [99.5]% a month on paid plans, with service credits. | SLA §1–2 |

## 10. AI features

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 10.1 | Is AI on by default? | No. An administrator turns it on per company, and each person accepts a notice before the first answer (enforced by the API). | `api/src/assistant/`, privacy notice |
| 10.2 | Is our data used to train models? | No — not by us, not by the model provider (bound in writing). | Terms §11, DPA §5 |
| 10.3 | What is sent? | The question and the minimum context for the answer; conversation logs kept as the company chooses (30 days by default). | Privacy notice table |
| 10.4 | Can AI act on its own? | No. Assistant tools are read-only and run as the person asking; Curahold's internal AI team only proposes, and a person approves every outside action. | `api/src/team/gate.ts`, `tests/team-redteam.test.ts` |

## 11. Vendors and people

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 11.1 | How do you choose and bind sub-processors? | Chosen for their security; written contracts at least as protective as the DPA; reviewed yearly; transfer safeguards per country. | `docs/security/policies/vendor-management.md`, DPA Annex 4 |
| 11.2 | Staff confidentiality? | Everyone who can reach customer data is bound to confidentiality; access removed on leaving. | DPA §3, Annex 2 |
| 11.3 | Physical security? | Curahold runs no data centre or server room; physical security is the hosting providers'. | Sub-processors page |
