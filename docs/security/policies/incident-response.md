# Incident response policy

> **Draft — owner to adopt.** Version 2026-11-20.draft1. The detailed steps for personal-data breaches are in
> `docs/compliance/breach-runbook.md`; operational incidents in `docs/RUNBOOK.md` ("On-call basics", "Common incidents").

## What counts

Anything that threatens the confidentiality, integrity or availability of customer data or the service: a suspected
leak between companies, unauthorised access, a lost or exposed secret, data loss or corruption, an outage, abuse of the
AI team or the assistant, a vulnerability reported from outside.

## Steps

1. **Report** at once — any person or seat, to the owner; outside reports arrive through the responsible-disclosure
   page and `security.txt`.
2. **Contain** — revoke the exposed key, pause the seat, block the route, stop writes if data is being corrupted
   (RUNBOOK "Restore procedure" step 1). Preserve evidence: do not clean up rows before reading `audit_log` and
   `error_log` (SECURITY.md).
3. **Assess** — what happened, which companies and data, how many people, since when; severity (critical, high,
   medium, low).
4. **Notify** — a breach of customer personal data: the affected customers **within 48 hours** of becoming aware
   (DPA §7), with what is known and updated as more is learned; authorities and individuals are the customer's decision
   as controller, except for data Curahold controls itself, where Curahold notifies within each law's deadline (breach
   runbook table). Status-page notice for outages.
5. **Recover** — fix, restore from backup if needed (RUNBOOK), verify isolation (`tests/rls.test.ts` on the restored
   database).
6. **Learn** — a post-mortem draft within 48 hours (what, impact, timeline, cause, what changes); a regression test for
   every security cause; the breach register updated.

## Records

The breach register (kept 5 years after closing [lawyer to confirm]), the post-mortems, and the notices sent with their
times. A tabletop exercise once a year, with notes (OPEN: not yet held).
