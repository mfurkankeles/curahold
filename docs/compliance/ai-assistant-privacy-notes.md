# AI assistant — privacy notes for the KVKK / GDPR audit (draft, internal)

> **Draft for the audit and for legal review.** Items in [brackets] must be
> checked against the provider's signed terms before launch. Code references
> are to `api/src/assistant/` and `api/src/routes/assist.ts`.

## What it is
One server-side assistant answers every chat in the product: CuraAI in the app
(and its onboarding mode), the docs' "Ask", the customer portal's questions
box, and a first-reply draft on help requests (an internal note only Curahold
support sees). The model provider is Anthropic (Claude), called from our
server; the key never reaches a browser.

## What is sent to the provider, per question
- The question, and at most the last 6 turns of that chat (each cut to 1,500 characters).
- At most 4 sections of our own docs (public content).
- In the app: the asker's name, role key, company name, the company's word for "customer", today's date.
- Only if the model asks for it: results of **read-only** calls to our API made **as the asker** (customers, fields, tasks, a customer's last timeline entries). The same permissions, field rules and department walls apply as on screen; no other company's data can be reached.
- Portal: the customer's own requests (titles, status, due date, reply count). Desk drafts: the help request's subject and description.
- Public docs chat: the question only (no account, no workspace).

## What is not sent
- Anything while the company has the assistant off (Settings → Support), or when no key is configured: the docs search answers on the device (app) or on our server (docs), and the question goes nowhere else.
- Passwords, keys, files, other companies' data. Rate limits and monthly caps stop use beyond the company's limit (then the docs search answers).

## Roles and legal basis
- Company users and portal customers: the company is controller, Curahold is processor, the provider is a **sub-processor** (added to the sub-processor list and DPA Annex 1).
- Public docs chat: Curahold is controller for a question typed without an account (legitimate interest: answering it); nothing is stored beyond usage counters.
- **Cross-border transfer:** the provider processes in [the United States]. GDPR Chapter V: SCCs with the provider + transfer impact assessment [+ DPF if the provider is certified]. KVKK art. 9: standard contract with the provider and notification to the KVKK authority within 5 business days of signing; explicit consent only where no other basis applies.
- The sub-processor change notice period ([30] days) applies before switching the assistant on for existing customers.

## Retention
- **Our log** (`assistant_log`): the question, reply kind, cited doc addresses, cost — per company setting: don't keep / 7 / 30 (default) / 90 / 365 days; shortened retention deletes at once; nightly purge; deleted when the person is erased (api/src/lib/erasure.ts; the user row itself stays as an anonymised tombstone); readable by the person who asked and by people with the privacy permission; RLS per company.
- **Usage counters** (`assistant_usage`, `assistant_global`): numbers only (questions, tokens, cost) per company and month.
- **Answer cache** (`assistant_cache`): only answers that read no workspace data, per company (public docs: shared), 7 days.
- **Provider:** inputs/outputs retained per its commercial terms [~30 days for abuse monitoring; zero-retention option to be requested]; **not used for model training** [confirm in the signed commercial terms].

## Data-subject rights
- Access/portability: the person's own questions are in their personal-data export (`assistantQuestions`).
- Erasure: removing a person removes their log entries; a company can set retention to "don't keep".
- Objection: the company can switch the assistant off; the person can decline or withdraw consent at any time (the docs search remains, on the device).
- Consent: every chat surface (app, portal, public docs) asks before the first question reaches the server; the API refuses a question without a "yes" to the current notice version (`consent_required`; api/src/assistant/consent.ts, migration 0243). Each answer is recorded (who, when, version, locale) and in the activity log.

## Safety measures (TOMs)
- Read-only tools through the same API and permission checks as the screens; the model cannot write (tasks are proposed, created only by the person's click).
- Text from docs, data, tickets and history is passed as data; hidden instructions are refused (rules + model rules); a leaked-instruction marker voids a reply; replies may cite only sections they were given; money amounts not found in what was read are refused.
- Per-person, per-company, per-address rate limits; per-company and installation-wide monthly caps; company on/off; logs per company with RLS.

## Open items for the audit
- Sign the provider's commercial terms / DPA; record the transfer mechanism; file the KVKK notification.
- Default: off until an administrator turns it on (api/src/assistant/core.ts settingsOf; existing companies switched off by migration 0240, the demo stays on). Owner question on re-enabling companies that had chosen it: owner-questions.md [L2].
- Add the assistant to the privacy policy's sharing section and the cookie/consent texts if the public docs chat is offered to EU visitors without an account.
