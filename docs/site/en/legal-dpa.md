---
title: Data processing agreement
section: legal
order: 4
summary: How Curahold processes personal data on a customer's behalf — roles, instructions, security (Annex 2), sub-processors and change notice, breach notice, audits, deletion, transfers abroad (Annex 4: EU SCCs, UK, KVKK standard contract and other riders) and AI.
---
# Data processing agreement (DPA)

> **Draft — lawyer approval required.** Version 2026-11-21.draft3. Part of the Terms of service; a signable copy is available on request. Not legal advice.

This agreement between the Customer and **[Company legal name]** ("Curahold") applies whenever Curahold processes personal data for the Customer. It meets GDPR / UK GDPR art. 28, KVKK art. 12 and the processor terms of the other laws in Annex 4. It prevails over the Terms of service on personal data.

## 1. Roles

- For Customer data, the **Customer is the controller** (or a processor for its own client) and **Curahold is the processor**.
- For its own purposes — accounts, billing, security logs, product-usage statistics, the trial-request form, marketing permissions — **Curahold is a separate controller**, as set out in its Privacy notice and KVKK notice. Those purposes are not processing on the Customer's behalf.
- Annex 1 describes the processing.

## 2. Instructions

Curahold processes Customer personal data only on the Customer's documented instructions — these terms, the Customer's use and settings of the Service, and written requests — including for transfers abroad, unless the law requires otherwise (Curahold then tells the Customer first, unless the law forbids it). Curahold tells the Customer at once if it thinks an instruction breaks data-protection law.

## 3. Confidentiality and staff

Everyone at Curahold who can reach Customer data is bound to confidentiality. Support access is granted by a Customer administrator, is limited in time, and every action during it is logged.

## 4. Security

Curahold keeps the technical and organisational measures in **Annex 2** and reviews them at least yearly. It may improve them but not lower the overall protection.

## 5. Sub-processors

- The Customer gives a general authorisation for the sub-processors on the **Sub-processors** page (Annex 3), which names each one, its purpose and its countries.
- Curahold gives **at least 30 days' notice** by e-mail to administrators and on that page before a new sub-processor starts. An administrator may **object** within that time on reasonable data-protection grounds; if Curahold cannot meet the objection, the Customer may end the affected service with a refund of prepaid fees for the rest of the term.
- Curahold binds each sub-processor in writing to duties at least as protective as these and stays responsible for them. For AI model providers this includes a written commitment that **inputs and outputs are not used to train models** and a stated retention period.

## 6. Help with people's requests and with assessments

The Service lets administrators find, correct, export and erase a person's data (Settings → People). Curahold passes on any request it receives directly and helps, as reasonably needed, with requests, data-protection impact assessments, prior consultations and the Customer's duty to inform employees.

## 7. Personal-data breaches

- Curahold tells the Customer **without undue delay and no later than 48 hours** after becoming aware of a breach affecting Customer data, so the Customer can meet its own deadline (72 hours in Türkiye, the EU/UK, Saudi Arabia, Egypt, Qatar, Korea and ADGM; "immediately" in Israel and China; 3 calendar days in Singapore).
- The notice says what happened, which data and roughly how many people are affected, the likely consequences, what has been done and is planned, and whom to contact; it is updated as more is known.
- Curahold keeps a breach register and a response plan (KVKK Board Decision 2019/10). Notifying authorities and people is the Customer's decision, except for data Curahold controls itself.

## 8. Audits

Curahold gives the information needed to show compliance: this DPA, Annex 2, its sub-processor list, answers to a reasonable security questionnaire and, when available, independent audit reports. If that is not enough, the Customer may audit **at most once a year**, with **30 days'** notice, during business hours, at its own cost, through an auditor bound to confidentiality, without access to other customers' data. A regulator's audit is always allowed.

## 9. Return and deletion

The Customer can export its data at any time. At the end of the agreement Curahold keeps it **30 days** for export, then deletes it; backups are overwritten within **35 days**. Curahold confirms deletion in writing on request. Data the law requires Curahold to keep is kept only for that purpose and time.

## 10. Transfers abroad

Personal data is transferred outside the Customer's country only with the safeguards in **Annex 4** for that country. Where the Customer and Curahold are in different countries the rider for the Customer's country applies; the rider for each sub-processor applies down the chain.

## 11. AI features

AI features process data only when an administrator has switched them on and send only the minimum needed. Questions are kept as the Customer's administrator chose (not at all, 7, 30 by default, 90 or 365 days); answers are not kept, except that an answer drawn only from the documentation may be reused for 7 days. No Customer data, prompt or output is used to train a model, by Curahold or by its AI sub-processor. Under the KVKK an AI provider abroad is a transfer covered by Annex 4, not by consent alone.

**AI assistants the Customer's users connect.** A user can connect their own AI assistant to the Service through Curahold's connector (MCP). The assistant acts as that user, with that user's permissions, and changes data only where the user allowed changes when connecting it. What the assistant reads leaves the Service on the Customer's instruction (Terms of service, section 10) and goes to the AI company the user chose; that company is not Curahold's sub-processor, and its retention and any use for training follow the Customer's or the user's own agreement with it. Administrators can see and disconnect connected apps in the developer settings.

## 12. Liability, term

This DPA follows the liability clause of the Terms of service (the higher cap for data-protection breaches applies), unless the transfer clauses in Annex 4 say otherwise. It lasts as long as Curahold processes Customer personal data.

---

## Annex 1 — Details of the processing

| Item | Description |
| --- | --- |
| Subject and duration | Providing the Service during the agreement and the 30-day export period |
| Nature | Hosting, storing, organising, displaying, transmitting, searching, exporting and deleting; AI answers when switched on |
| Purpose | Running the Service for the Customer |
| Data subjects | The Customer's users, its own customers and their contacts, portal users, and anyone the Customer records |
| Personal data | Identity and contact details, job details, notes, tasks, files, messages, activity records, and anything the Customer enters |
| Special categories | None, unless agreed in writing (the Acceptable use policy forbids them otherwise); no children's data |
| Frequency | Continuous |

## Annex 2 — Technical and organisational measures (TOMs)

Source: SECURITY.md in the product.

1. **Tenant separation:** every company's rows are separated in the database by row-level security; a test suite checks that one company never sees another's data.
2. **Encryption:** TLS 1.2+ in transit; encryption at rest by the database and file-storage providers; secrets kept outside the code.
3. **Access control:** roles and permissions per company; single sign-on, two-factor and passkeys; device limit per seat; support access only when an administrator grants it, time-boxed and logged.
4. **Logging:** append-only activity log; security logs kept 12 months.
5. **Availability:** backups at least daily, restore tests at least quarterly [confirm with the hosting set-up]; recovery targets in the SLA.
6. **Vulnerability management:** dependency and static checks on every change; regular security tests; responsible-disclosure page and security.txt.
7. **Incident response:** written plan; 48-hour notice to customers (section 7); breach register.
8. **Staff:** confidentiality undertakings; least-privilege access; access removed on leaving.
9. **Sub-processors:** chosen for their security; bound in writing; reviewed yearly.
10. **Deletion:** export at any time; deletion 30 days after the end; backups overwritten in 35 days.
11. **Privacy by default:** analytics and advertising off until consent; support session recording off by default; per-person analytics limited to roles that need them.

## Annex 3 — Sub-processors

The current list is the **Sub-processors** page, generated from Curahold's data inventory.

## Annex 4 — Transfer riders

Attach the rider for the Customer's country (to be completed by the lawyer):

| Customer in | Rider |
| --- | --- |
| EU / EEA | EU standard contractual clauses (Decision 2021/914), module 2 (controller → processor), module 3 down the chain, docking clause; law and courts of [EU member state]; transfer impact assessment kept on file |
| United Kingdom | UK Addendum to the EU SCCs (or the IDTA) |
| Switzerland | Swiss addendum to the SCCs |
| **Türkiye** | **The KVKK Authority's standard contract** for the roles that apply (controller → processor where Curahold is abroad; processor → processor between Curahold and each foreign sub-processor) — in Turkish, unchanged except the optional clauses, **signed separately** (it cannot be incorporated by reference) and **notified to the Authority within 5 business days** of the last signature |
| Saudi Arabia | SDAIA standard contractual clauses + transfer risk assessment |
| UAE — DIFC / ADGM | DIFC / ADGM standard clauses |
| Israel | The items of reg. 15 of the Data Security Regulations 2017 |
| Korea | PIPA outsourcing terms; overseas-transfer items disclosed |
| Japan | Entrustment with supervision; measures equivalent to the APPI, checked periodically (art. 28) |
| Singapore | Data-intermediary terms; comparable protection on transfer (s. 26) |
| China | Standard contract or certification — the Customer's own filing if it exports from China |
