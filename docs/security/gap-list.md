# SOC 2 and ISO 27001: what exists and what is missing

A working list, not a readiness claim: Curahold holds **no** certification or attestation today and does not say
otherwise anywhere. For each area it names what the code and the documents already do, what an auditor would still
miss, and what closing it takes. Written 20 Nov 2026 against SOC 2 (Trust Services Criteria 2017, revised points of
focus 2022) and ISO/IEC 27001:2022 with its Annex A. Decisions marked **owner** are his: scope, timing and money.

## The decision first (owner)

- **Which one, and when.** SOC 2 Type I, then Type II after a 3–12 month observation window, is what US and many
  international buyers ask for; ISO 27001 is what European and Turkish enterprise buyers more often ask for. Both need
  an outside auditor or certification body and, in practice, compliance software to collect evidence. Neither fits
  before the company exists and has paying customers; a common trigger is the first enterprise deal that asks.
- **Cost (to be priced when the time comes; no figures here).** Auditor or certification body fees, an annual
  surveillance audit, a penetration test by an outside firm, and the time to run the controls below.

## Organisation and governance (SOC 2 CC1–CC3 · ISO clauses 4–6, A.5.1–A.5.4)

| Exists | Missing | To close it |
| --- | --- | --- |
| Priorities in QUALITY.md; hard rules in CLAUDE.md; a named owner; the AI team with defined seats and an approval gate | An ISMS scope statement, a risk register with owners and treatment, a statement of applicability, management review minutes, formally adopted policies | Adopt the policy drafts in `policies/`; write the scope (the hosted service, its staging copy, the operators' accounts); turn the threat model into a risk register; a yearly management review |
| Threat model per surface; ASVS Level 2 sheet | Risk assessment method and yearly re-assessment on record | Add likelihood × impact and an owner to each threat; review quarterly (testing calendar) |

## People (CC1.4, CC2.2 · A.6)

| Exists | Missing | To close it |
| --- | --- | --- |
| Confidentiality duty in the DPA; access removed on leaving (DPA Annex 2) | Signed confidentiality undertakings, security awareness training records, background-check policy, a joiner/mover/leaver checklist | A one-page undertaking per person with access; a short yearly training with a record; the checklist in the access-control policy |

## Access control (CC6.1–CC6.3 · A.5.15–A.5.18, A.8.2–A.8.5)

| Exists | Missing | To close it |
| --- | --- | --- |
| Customer side: roles, field access, department walls in SQL, SSO/SCIM, passkeys and TOTP, required second step, recent re-auth for sensitive actions, device limit | — | — |
| Operator side: second step for the desk and the console, per-person `STAFF_KEYS`, support access only with the customer's consent, time-boxed and logged | Separate database login for requests (SECURITY.md #2, OPEN); 2FA enforced on every provider account (Cloudflare, Supabase, registrar, GitHub, Google Workspace, Paddle) and evidence of it; quarterly access reviews on record | Role separation migration and deployment; a provider-account inventory with 2FA status; the review in the quarterly calendar |

## Change management (CC8.1 · A.8.25–A.8.33)

| Exists | Missing | To close it |
| --- | --- | --- |
| CI gate requiring typecheck, lint, tests on two databases, isolation suites, leak scan, i18n, builds, Docker, dependency audit; review by a second seat; append-only migrations; no deploy without the owner | Branch protection enforced in the git host (SECURITY.md #15, OPEN); a record linking each production deploy to its approval; segregation of the person who writes from the person who deploys | Turn on branch protection with the CI gate required; keep the deploy approval in the release notes or the console; the change-management policy |

## Operations, monitoring and vulnerabilities (CC4, CC7.1–CC7.2 · A.8.7–A.8.16)

| Exists | Missing | To close it |
| --- | --- | --- |
| Security logs 12 months; append-only audit trail; rate limits; bot protection; weekly/monthly/quarterly security scans; responsible disclosure | Production monitoring and alerting with on-call evidence (go-live step 24); an outside penetration test; vulnerability tickets with SLA tracking on record | Go-live step 24; a yearly outside test of the staging copy; findings tracked as tasks with due dates (testing calendar "Findings") |

## Incidents (CC7.3–CC7.5 · A.5.24–A.5.28)

| Exists | Missing | To close it |
| --- | --- | --- |
| Breach runbook, register, 48-hour customer notice, per-country authority deadlines | A rehearsed tabletop exercise on record; post-incident reviews on record | One tabletop a year with notes; the post-mortem template from the runbook used for every incident |

## Continuity and backups (A1.2–A1.3 · A.5.29–A.5.30, A.8.13–A.8.14)

| Exists | Missing | To close it |
| --- | --- | --- |
| Supabase daily backups; encrypted scripted backups; a restore drill script, rehearsed locally on 19 Nov 2026; RPO/RTO proposed in the SLA | The weekly off-site copy routine and the 35-day lifecycle rule (OPEN until go-live); a drill against a production copy on record; point-in-time recovery (deferred to the first paying customer, owner decision); a written business-continuity plan | Go-live steps 25–26; quarterly drills on record; the backup and DR policy |

## Vendors (CC9.2 · A.5.19–A.5.23)

| Exists | Missing | To close it |
| --- | --- | --- |
| Sub-processor inventory in code, generated public list, 30-day notice, DPA flow-down, transfer safeguards per country | Each vendor's own SOC 2 / ISO report collected and reviewed yearly; KVKK standard contracts signed and notified (to do); a vendor risk rating | The vendor-management policy's yearly review, with the reports filed |

## Confidentiality and privacy (C1, P-series · A.5.31–A.5.36, A.8.10–A.8.12)

| Exists | Missing | To close it |
| --- | --- | --- |
| Data inventory, records of processing, DPA, privacy notices in eleven languages, consent records, deletion with certificates, privacy by default | Lawyer approval of every legal text; a data-classification scheme written down; a log of privacy requests with due dates (planned: privacy re-check, item 10) | Counsel's review; a one-page classification (public, internal, customer confidential, secret) in the information-security policy; the requests log |

## Physical and environmental (CC6.4 · A.7)

Inherited from the hosting providers (no own premises hold data). Auditors accept this with the providers' own reports
(carve-out method) — collect them under "Vendors".
