# 0021. The desk's draft first reply asks the model only with the requester's consent

- Status: Accepted (safe default; the legal basis is an open owner/lawyer question)
- Date: 2026-11-21
- Deciders: product owner (pending), engineering

## Context

When a company has CuraAI's AI answers on and "Draft a first reply on our help requests" ticked, a new help request's
subject and description were sent to the AI provider to draft an internal note for Curahold support
(`deskFirstReply`, api/src/routes/assist.ts). Every chat door asks the person first and the server refuses a question
without a "yes" (MASTER-RULES 13, ADR 0014); the AI drafts route got the same check in the last release. This path did
not: the person who wrote the request never saw the assistant's notice, and their words still reached the provider on
the strength of the company's switch alone. An independent review flagged it (20 Nov).

## Decision

We ask the model for the draft only when the person who wrote the request has said yes to the notice in force
(`assistant_consents`, read as that person through row security). Otherwise support answers without a draft; nothing
of the request leaves Curahold. The operator can make the company's switch the basis instead with
`ASSISTANT_DESK_FIRST_REPLY_BASIS=company`; a company cannot choose this itself. The settings card says which rule
holds under the checkbox.

## Alternatives considered

- Company switch as the basis (the old behaviour): legally defensible only if the DPA and a DPIA line say so and the
  company has told its staff; until a lawyer confirms, it sends a person's words abroad without their own choice.
- Ask the requester on the help form ("May CuraAI draft a first answer?"): one more question on a form people use
  when something is broken, and the same notice text would have to be shown there in full; possible later.
- A docs-search draft without the model: the search results as a note were judged noise when the feature was built.

## Consequences

Fewer drafts: only people who accepted CuraAI get one, so support writes more first answers itself. No data leaves
without a person's choice. Revisit when the owner and a lawyer decide the basis (owner-questions, "help first reply");
switching is one setting, no migration.
