# Vendor management policy

> **Draft — owner to adopt.** Version 2026-11-20.draft1. Lines marked OPEN are not done yet.

## The list is code

Every provider that stores or receives personal data is an entry in `shared/src/compliance/dataInventory.ts`
(`SUBPROCESSORS`), with its purpose in eleven languages, its countries, when it is used (always, only with AI on, only
when a company turns a sign-in on, …) and its transfer safeguards. The public Sub-processors page and the trial form's
consent texts are generated from it, so they cannot drift from the truth (`tests/compliance.test.ts`).

## Before a new vendor

1. **Owner approval** — no new paid service, outside API or runtime dependency without it (CLAUDE.md); options and
   costs written down first.
2. **Security check** — their own SOC 2 or ISO 27001 report or equivalent, where data is held, retention, whether
   inputs are used for training (AI providers: must be no, in writing).
3. **Contract** — duties at least as protective as our DPA, flowed down; the transfer safeguard for each country (DPA
   Annex 4); for Türkiye, the KVKK standard contract signed in Turkish and notified within 5 business days (OPEN: to do
   for the current vendors).
4. **Inventory and notice** — the entry in `dataInventory.ts`, the generated pages regenerated, and **30 days' notice**
   to customers' administrators before the vendor starts processing their data, with the right to object (DPA §5).

## Tools customers connect

CRMs, help desks, accounting, chat and the like are connected by the customer, under the customer's own agreement with
that vendor; they are not our sub-processors (Terms §10) and do not go through this policy.

## Yearly review

Per vendor: still needed, still where we said, its latest audit report filed, contract and transfer documents current,
any incident of theirs that touched us. Leavers removed from the inventory and their data deleted.
