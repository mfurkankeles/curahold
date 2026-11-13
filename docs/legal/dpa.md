# Data Processing Addendum (DRAFT)

> **⚠️ NON-BINDING DRAFT — NOT LEGAL ADVICE.** This is a reusable template with no
> legal validity as written. Complete every `[placeholder]`, attach the actual
> sub-processor list and security measures, and have the document reviewed and
> adapted by a qualified lawyer for Türkiye's **KVKK** (Law No. 6698) and the
> EU/EEA **GDPR** (Regulation 2016/679) **before** it is signed or relied upon.

This Data Processing Addendum ("DPA") forms part of the **Subscription
Agreement** between **[Company Legal Name]** ("Processor", "we") and the
**Customer** ("Controller", "you") and governs the Processor's processing of
personal data contained in Customer Data on the Controller's behalf.

If there is a conflict, this DPA prevails over the Subscription Agreement on data
protection matters. Terms not defined here have the meaning in the Subscription
Agreement, KVKK and GDPR.

## 1. Roles

The Controller determines the purposes and means of processing Customer Data.
The Processor processes personal data only as a **processor** (KVKK: "veri
işleyen") on the Controller's **documented instructions**, which include the
Subscription Agreement, this DPA, and use of the Service's features. The
Processor will inform the Controller if, in its opinion, an instruction breaches
KVKK or GDPR.

## 2. Subject-matter and details (GDPR Art. 28(3))

- **Subject-matter:** provision of the Curahold Service.
- **Duration:** the Subscription Term plus the post-termination period in Section 9.
- **Nature and purpose:** hosting, storage and processing of Customer Data to deliver work-management, CRM, customer-success and task features.
- **Types of personal data:** names, business contact details, roles, activity and notes about the Controller's own users and the customer contacts it records. **[Controller to confirm; no special-category data unless agreed in writing.]**
- **Categories of data subjects:** the Controller's staff and the individuals at the Controller's customers/accounts.

## 3. Processor obligations

The Processor will:
1. process personal data only on documented instructions, including for transfers;
2. ensure persons authorised to process are bound by confidentiality;
3. implement the technical and organisational measures in **Annex 2**;
4. respect the sub-processor conditions in Section 5;
5. assist the Controller, taking into account the nature of processing, to respond to data-subject requests (Section 6) and to meet its security, breach-notification and impact-assessment duties (Arts. 32–36 GDPR; corresponding KVKK duties);
6. at the Controller's choice, delete or return personal data after the end of services (Section 9);
7. make available information needed to demonstrate compliance and allow for and contribute to audits (Section 8).

## 4. Security

The Processor applies appropriate technical and organisational measures,
including those in **Annex 2** — at minimum: encryption in transit; **per-tenant
isolation enforced at the database (row-level security)**; access controls and
least privilege; logging and monitoring; regular backups; and secure software
development practices. Measures may be updated provided protection is not
reduced.

## 5. Sub-processors

5.1 The Controller gives **general authorisation** for the Processor to engage
sub-processors listed in **Annex 1**, each under a written contract imposing
data-protection obligations no less protective than this DPA.

5.2 The Processor will give at least **[30] days'** notice of an intended new or
replaced sub-processor (via **[sub-processors page URL]** or e-mail). The
Controller may object on reasonable data-protection grounds; if the parties
cannot resolve the objection, the Controller may terminate the affected part of
the Service.

5.3 The Processor remains responsible for its sub-processors' performance.

## 6. Data-subject requests

The Processor will, where legally permitted, promptly notify the Controller of a
request it receives from a data subject and will not respond itself except on
the Controller's instruction. The Service provides features (export, edit,
delete) that let the Controller fulfil access, rectification, erasure,
restriction and portability requests.

## 7. Personal-data breach

The Processor will notify the Controller **without undue delay** (and in any
event within **[72] hours** where feasible) after becoming aware of a personal-
data breach affecting Customer Data, with the information the Controller needs to
meet its own notification duties under KVKK and GDPR.

## 8. Audits

The Processor will make available compliance information and, on reasonable
notice and no more than **[once per year]** (or after a breach), allow audits by
the Controller or an independent auditor bound by confidentiality, which may be
satisfied by up-to-date third-party reports/certifications where available.

## 9. Return and deletion

On termination, the Processor will make Customer Data available for export for
**[30] days**, then delete or anonymise it within **[90] days**, unless storage is
required by law, in which case the Processor protects it and limits processing to
that purpose.

## 10. International transfers

Where the Processor transfers personal data outside Türkiye or the EEA, it relies
on a lawful mechanism — an adequacy decision, the EU **Standard Contractual
Clauses** (incorporated by reference where applicable), and the conditions of
Art. 9 KVKK for transfers abroad. **[Lawyer to select and attach the applicable
mechanism; confirm KVKK transfer basis.]** The production database is hosted in
**[hosting region, e.g. the European Union]**.

## 11. Liability and term

Liability under this DPA is subject to the limitations in the Subscription
Agreement, except where KVKK/GDPR mandate otherwise. This DPA remains in force
while the Processor processes Customer Data.

---

### Annex 1 — Sub-processors (template)

| Sub-processor | Service provided | Location | Transfer safeguard |
| --- | --- | --- | --- |
| [Hosting provider] | Application and database hosting | [region] | [adequacy / SCCs] |
| [E-mail provider] | Transactional e-mail delivery | [region] | [adequacy / SCCs] |
| [Payment processor] | Billing and payments | [region] | [adequacy / SCCs] |
| [Analytics provider] | Product/site analytics (consent-gated) | [region] | [adequacy / SCCs] |

*(Keep this list current and publish it at the sub-processors page.)*

### Annex 2 — Technical and organisational measures (template)

- Encryption of data in transit (TLS); encryption at rest where provided by the hosting platform.
- Multi-tenant isolation enforced at the database (row-level security), so one customer cannot access another's data.
- Role-based access control and least-privilege administration; unique accounts; audit logging.
- Backups with tested restore; environment separation; change management.
- Secure development, dependency management and vulnerability handling.
- Staff confidentiality undertakings and security awareness.
- Incident response and breach-notification procedures.

---

*Draft template v0 — complete the placeholders and annexes and obtain qualified KVKK/GDPR legal review before signing. This document has no legal effect as written.*
