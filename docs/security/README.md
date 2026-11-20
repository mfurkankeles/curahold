# Security and trust pack

What we hand a customer's security team, and the working documents behind it. Everything here describes what the code
and the go-live guide do; anything not done is marked OPEN, and nothing claims a certification Curahold does not hold.
The public summary is the sales site's trust page (`site/info/<lang>.ts` → `trust`), which offers this pack on request.

| Document | For | What it is |
| --- | --- | --- |
| [questionnaire.md](questionnaire.md) | Prospects' security reviews | Standard questionnaire answers (CAIQ-lite), each with the code or document that proves it |
| [gap-list.md](gap-list.md) | The owner | What SOC 2 and ISO 27001 would still need, area by area, and what closing each gap takes |
| [policies/](policies/) | Auditors, customers on request | Drafts to adopt: [information security](policies/information-security.md), [access control](policies/access-control.md), [incident response](policies/incident-response.md), [vendor management](policies/vendor-management.md), [backup and recovery](policies/backup-and-recovery.md), [change management](policies/change-management.md) |
| [testing-calendar.md](testing-calendar.md) | The Senior Security Engineer seat | Weekly, monthly, quarterly tests on our own code and staging copy, with `scripts/security/scan.ts` |
| [threat-model.md](threat-model.md) | Engineering | Assets, attackers and threats per surface |
| [asvs.md](asvs.md) | Engineering, auditors | ASVS Level 2 and API Security Top 10 status, with the open items |
| [../../SECURITY.md](../../SECURITY.md) | Everyone | The isolation model, controls, operational requirements and their status |
| [../ENVIRONMENT.md](../ENVIRONMENT.md#hosting-region) | Prospects, operators | Hosting region: EU by default, what Gulf and Asia deployments need |
| [../compliance/breach-runbook.md](../compliance/breach-runbook.md) | On-call | Personal-data breach steps and deadlines per country |

**Sharing.** The questionnaire answers and the policies may be shared with a prospect or customer who asks, after the
[brackets] are filled and the OPEN lines re-checked. The gap list, the threat model and the testing calendar's findings
are internal. Legal terms (DPA, SLA, privacy notice) are public in the help centre in every language.
