# DPIA draft — AI assistant, AI team, support session recording; transfer impact assessment outline

Draft, 20 Nov 2026 (package l2-privacy, from the L1 audit doc-fix 5). **Taslak — avukat onayı gerekli.** GDPR Art. 35 / KVKK good
practice. Customers are controllers for the assistant and recordings in their workspace; this document is also the template we
give them (DPA Annex). Code references are the source of truth for what the system does.

## 1. Screening — why an assessment

| Criterion (EDPB WP248) | Assistant | AI team | Session recording |
| --- | --- | --- | --- |
| New technology (LLM) | yes | yes | no |
| Transfer outside EU/TR | yes (US provider) | yes | no (same hosting) |
| Systematic monitoring | no | no | limited (screens of the interface, opt-in) |
| Data about vulnerable people / special categories | not intended; may appear in free text | not intended | masked fields only |
| Large scale | per company, capped | Curahold-internal | short (7 days) |

Two or more criteria → an assessment is advisable for the assistant and the AI team; recording is assessed for completeness.

## 2. Description

- **Assistant (CuraAI, portal chat, docs chat)** — `api/src/assistant/`, `api/src/routes/assist.ts`. Sends the question, the last
  6 turns, the asker's name/role/company and the results of read-only tools that run as the asker to the AI provider; the reply is
  checked (sources, money amounts, instruction leaks). Off per company until an administrator turns it on (migration 0240); each
  person accepts a notice first (migration 0243, `consent_required` in the API). Log kept per company choice (0–365 days, default 30),
  erased with the person. No training by the provider [confirm in the signed terms].
- **AI team** — `api/src/team/`. Curahold's internal agents; propose only; an operator approves every outside action
  (`api/src/team/gate.ts`). Memory can mention customers' contacts; mentions of an erased person are redacted (`lib/erasure.ts`).
- **Session recording** — `shared/src/replay.ts`. Off by default; every input masked; 7-day retention; tied to a help request.

## 3. Necessity and proportionality

Purpose limitation (answers only), minimisation (6 turns, tools read only what the asker may see, docs-only on public surfaces),
storage limitation (retention above, nightly purge `lib/retention.ts`), transparency (notice before first question, privacy notice
row, sub-processor list), choice (company switch, personal consent, withdraw any time, docs search as the equal alternative).

## 4. Risks and measures

| Risk | Likelihood / severity | Measures in place | Residual |
| --- | --- | --- | --- |
| Data from another company in an answer | low / high | tools run as the asker through the same API, row security, isolation tests (`tests/isolation*.test.ts`) | low |
| The model repeats instructions or invents numbers | medium / medium | canary check, money-amount check, sources must be given sections (`core.ts`) | low |
| Personal data reaches the provider without a basis | low / high | default off, per-person consent enforced by the API, notice versioned | low |
| Provider keeps or trains on data | unknown / high | contract terms [to confirm: retention, no training, SCCs, KVKK art. 9 contract] | **open — owner/lawyer** |
| Special-category data typed into a question | medium / high | notice says what is sent; no special-category purpose; company can switch off | medium — guidance to customers |
| Recording captures typed content | low / medium | every field masked; opt-in; 7 days | low |
| AI team acts outside its remit | low / high | proposal-only, human approval gate, red-team tests (`tests/team-redteam.test.ts`) | low |

## 5. Transfer impact assessment (outline, for counsel)

For each foreign recipient (`shared/src/compliance/dataInventory.ts` SUBPROCESSORS): the transfer tool (EU SCCs 2021/914 module
2/3 or DPF; KVKK art. 9 standard contract, notified within 5 business days; MY contract route, review every 3 years), the
destination's laws on public-authority access (US: FISA 702 / EO 12333; DPF redress), supplementary measures (encryption in
transit and at rest, minimisation, short retention, no training), and the conclusion. Not completed: needs counsel and the signed
provider terms (owner-questions.md [L2], L1 owner items 2–3).

## 6. Sign-off

DPO / privacy contact: [to be appointed] · Counsel: [to be appointed] · Review: on any change of provider, model, data sent, or
retention; at least yearly.
