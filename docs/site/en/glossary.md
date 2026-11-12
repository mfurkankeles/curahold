---
title: Glossary for developers
section: developers
order: 9
summary: The words the API and these docs use, each in a sentence.
---
# Glossary for developers

The words the API and these docs use, in alphabetical order. The product lets a company rename "customer" (to partner, client, member…); the API always says `account`.

## API key

A secret that lets a script act as the person who made it. It starts with `chk_`, is shown once, and can be read-only or allowed to make changes. See [API keys](/docs/en/api-keys/).

## Automation

A rule that acts on its own: when something happens and the conditions hold, it opens tasks, notifies people or changes a field. It fires once per occasion.

## Board

Where tasks live. A board has columns, people who can see it, its own task fields and, if switched on, a request form.

## Column and status

A column of a board. A task's `status` is the key of the column it is in; a column can mark its tasks as done.

## Company address

Every company has its own address, `https://yourcompany.curahold.com`. The API, the docs and the AI connector all live under it.

## Customer (account)

The company you look after. In addresses and fields it is `account`. Its own fields are in `fields`, under keys an administrator defined.

## External id and source

The id a customer, record or ticket has in the system it came from, and the name of that system. Together they let the same thing be updated instead of added twice.

## Field key

The stable name of a customer or record field (`renewal_date`, `arr`). Labels can change and are translated; keys do not change.

## Health score

A number from 0 to 100 for a customer, worked out from signals such as overdue work, time since the last touch and open tickets. See [Timeline and health score](/docs/en/timeline-and-health/).

## Idempotency key

A value you send in the `Idempotency-Key` header with a change. The same key sent again gets the first answer back and nothing is done twice. Keys are remembered for two days.

## Permission and role

A role is a named set of permissions (`accounts.manage`, `users.manage`…). Every request is checked against the role of the person behind it, in the database itself.

## Playbook

A reusable plan: a list of tasks with days counted from a start date or back from a renewal date.

## Record and record type

Anything kept under a customer: a contact, an opportunity, a support ticket, or a kind the company defined. A record type says which fields its records have.

## Seat

What a person can do at all: a full seat sees and changes, a viewer seat only sees. A key made by a viewer cannot make changes.

## Signing secret

The secret a webhook's messages are signed with (`whsec_…`), shown once when the webhook is added. See [Webhooks](/docs/en/webhooks/).

## Task

One piece of work on a board, with people, a due date, a priority and optionally a customer and a record. A task with a `parentId` is a subtask.

## Version and baseVersion

Every task carries a `version` that grows with each change. Send the version you read as `baseVersion` when you change the task: if someone changed the same field meanwhile, you get `409` with the latest task instead of overwriting them.

## Webhook

A message Curahold sends to your address when something changes, so you do not have to keep asking.
