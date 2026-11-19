# Legal texts — where they live

The legal texts have one source: the documentation site, in every language it is published in.

| Text | Source |
| --- | --- |
| Terms of service, SLA, acceptable use, order form | `docs/site/<lang>/legal-terms.md`, `legal-sla.md`, `legal-aup.md`, `legal-order-form.md` |
| Data processing agreement and its annexes | `docs/site/<lang>/legal-dpa.md` |
| Privacy notice | `docs/site/<lang>/legal-privacy.md` |
| KVKK notice (Türkiye) | `docs/site/<lang>/legal-kvkk.md` |
| Cookie policy (generated from the code) | `docs/site/<lang>/legal-cookies.md`, `shared/src/compliance/storage.ts` |
| Sub-processors (generated) | `docs/site/<lang>/legal-subprocessors.md`, `shared/src/compliance/dataInventory.ts` |

The first drafts that used to sit in this folder (v0: a DPA with a 72-hour notice, privacy and cookie policies naming advertising
pixels as on, a subscription agreement) contradicted those texts and were removed on 20 Nov 2026 (L1 audit, package l2-privacy); git
history keeps them. Internal compliance notes (records of processing, VERBİS preparation, the AI assistant's privacy notes, the breach
runbook) are in `docs/compliance/`. Every legal text is a draft until counsel approves it.
