# Personal-data breach runbook

Draft, 20 Nov 2026 (package l2-privacy, from the L1 privacy audit). **Not legal advice.** Every deadline marked
**[lawyer to confirm]** must be checked by counsel for the market before launch there; until then use the shortest
deadline that could apply. Technical incident handling (first 15 minutes, severities, rollback) is in
[docs/RUNBOOK.md](../RUNBOOK.md#on-call-basics); this page starts where an incident touches personal data.

## 1. Is it a personal-data breach?

A breach is any security event that leads to personal data being destroyed, lost, changed, disclosed or accessed
without authorisation — accidentally or on purpose. Examples: one company's data visible to another (always SEV1), a
leaked key with read access, a misdirected e-mail with customer data, a lost laptop with an export, a sub-processor's
breach that reaches our data. A blocked attempt with no data reached is a security event, not a breach, but it is
still written to the log (§5) with the reason.

**The clock starts at "aware"**: when the incident lead has a reasonable degree of certainty that personal data was
affected — not when the investigation ends. Record that moment.

## 2. Roles

| Role | Who | Does |
| --- | --- | --- |
| Incident lead | The platform owner (`PLATFORM_OWNER`), or the on-call engineer until reached | Declares the breach, sets the "aware" time, owns the clock and the log entry |
| Engineering | On-call engineer | Contains (revoke keys, rollback, close the door), preserves evidence (`error_log`, `audit_log`, Cloudflare logs), scopes companies and people |
| Legal counsel | External counsel per market **[to be appointed]** | Decides notifiable or not, signs off texts to authorities and people |
| Privacy contact / DPO | **[to be appointed — owner question]** | Contact point named in notices; keeps the log complete |
| Communication | Platform owner | Sends the notices to customers (controllers), answers them |

Curahold is mostly the **processor**: the customer company is the controller and notifies its authority and its people.
Our duty there is to tell the customer fast, with what they need. Curahold is the **controller** for its own data:
accounts' administrators as our customers, trial requests, website visitors, the console — then we notify ourselves.

## 3. Deadlines

| Law | To the customer (we are processor) | To the authority (we are controller) | To the people affected | Threshold |
| --- | --- | --- | --- | --- |
| Our DPA (all customers) | **48 hours** from aware (DPA §7) | — | — | Any breach of customer personal data |
| Türkiye — KVKK | Without delay (art. 12) | **72 hours** to the Kurul from aware (Board decision 2019/10) **[lawyer to confirm]** | As soon as possible after the authority | Any breach |
| EU / UK — GDPR | Without undue delay (Art. 33(2)) | **72 hours** to the lead supervisory authority (Art. 33(1)); late notice with reasons | Without undue delay when high risk (Art. 34) | Unless unlikely to result in a risk |
| India — DPDP Act + Rules 2025 | Without delay (contract) | Board: an intimation **without delay**, a detailed report within **72 hours** (Rule 7) **[lawyer to confirm; staged commencement]** | Each Data Principal **without delay** | Any breach |
| Singapore — PDPA | Without undue delay (s.26C) | PDPC **3 calendar days** after determining it notifiable; assessment within **30 days** of suspicion (PDPC guide, confirmed 20 Nov) | As soon as practicable, same time or after | 500+ people or significant harm |
| Malaysia — PDPA (2024 amendment) | Without delay (contract) | Commissioner within **72 hours** **[lawyer to confirm]** | Within **7 days** of notifying the Commissioner, if significant harm **[lawyer to confirm]** | Significant harm / scale (JPDP guideline) |
| UAE — PDPL (federal) | Without delay (contract) | Data Office **immediately** on becoming aware **[lawyer to confirm; executive regulation status unknown]** | Where it prejudices privacy **[lawyer to confirm]** | Prejudice to privacy, confidentiality or security |
| UAE — DIFC / ADGM | Without undue delay | DIFC: as soon as practicable; ADGM: **72 hours** **[lawyer to confirm]** | When high risk | Risk to rights |
| Saudi Arabia — PDPL | Without delay (contract) | SDAIA within **72 hours** of becoming aware **[lawyer to confirm]** | Without undue delay if harm is likely | Harm to people or their data |
| South Korea — PIPA | Without delay (contract) | PIPC within **72 hours** when 1,000+ people or sensitive data **[lawyer to confirm]** | Within **72 hours** **[lawyer to confirm]** | Any leak of personal information |
| Japan — APPI | Without delay (contract) | PPC: preliminary in **3–5 days**, final within **30 days** (60 for malicious) **[lawyer to confirm]** | Promptly | Sensitive data, financial harm, malicious, or 1,000+ people |

When several apply, run them in parallel and meet the earliest. The 48-hour promise to customers is ours whatever the law.

## 4. Steps

1. **Contain** (engineering): stop the leak first — revoke tokens (`api_tokens`, connections), roll back, block at Cloudflare,
   rotate secrets (RUNBOOK "Rotating secrets"). Do not delete evidence.
2. **Declare and log** (incident lead): set "aware", add the entry (§5) at once, even with unknowns; add corrections as you learn.
3. **Scope**: which companies (`org_id`), how many people, which kinds of data (names, e-mail, customer records, files, IP
   addresses), which countries (the company's country and its people's), which sub-processors.
4. **Assess** (counsel): notifiable per row of §3; likely consequences; high risk to people?
5. **Notify customers** within 48 hours with template A, even if facts are incomplete ("phased" notice; send more later).
6. **Notify authorities** where we are controller (template B), in the authority's own form where it has one (KVKK online form,
   PDPC form, SDAIA portal).
7. **Notify people** where required (template C), in their language.
8. **Close**: post-mortem within 3 working days (RUNBOOK), actions tracked, the log entry completed with what was notified when.

## 5. The breach log

Every breach — notified or not — is recorded in `incident_log` (migration 0244, append-only, Curahold's own, unreachable through
the product):

```sh
DATABASE_URL=… npx tsx scripts/compliance/incident.ts add --by <you> --severity sev1 --detected <ISO> --aware <ISO> \
  --summary "…" --kinds email,name --companies 1 --people 40 --laws kvkk,gdpr \
  --notified '[{"to":"customer","at":"<ISO>"},{"to":"KVKK","at":"<ISO>"}]' --actions "…"
DATABASE_URL=… npx tsx scripts/compliance/incident.ts list
```

A correction is a new entry with `--corrects <ref>`. Not notified? Say why in `--not-notified-reason`.

## 6. Templates

Fill every bracket; never guess a number — say "under investigation" and send an update.

**A. To the customer (controller)** — subject: "Security incident affecting your Curahold data — [ref]"

> We are writing to tell you about a security incident that affects personal data Curahold processes for [company].
> What happened: [one paragraph, plain words]. When: started [time], we became aware on [time] (UTC).
> Data concerned: [kinds], about [n or "under investigation"] people, [which features]. What we did: [containment].
> Likely consequences: [assessment]. What we suggest you do: [steps]. Your own duties: you may have to notify your
> authority (for example within 72 hours under KVKK or the GDPR) and the people concerned; we will help with the facts.
> Contact: [privacy contact, e-mail, phone]. We will update you by [time].

**B. To an authority** (where Curahold is controller) — use the authority's form; the content is the same as A plus: the
controller's details, the DPO or contact, the categories and approximate numbers of people and records, the measures taken
and proposed, and, if late, the reasons for the delay.

**C. To the people affected** — subject: "About your data at Curahold"

> We are telling you about an incident that affected your [kinds of data]. What happened: [plain words]. What it may mean
> for you: [consequences]. What we have done: [measures]. What you can do: [steps, e.g. watch for phishing, change password].
> Questions: [contact]. We are sorry this happened.

## 7. Company deletion and backups

A company's purge (lib/companyDeletion.ts) does not reach backups; they roll off on the database provider's schedule
(RUNBOOK "Backups and restore"). A restore after a purge must re-run the purge for every company in `company_deletions`
with `purged_at` set before the restored database goes back into service.
