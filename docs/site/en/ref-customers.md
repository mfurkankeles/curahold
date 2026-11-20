---
title: Reference: customers
section: reference
order: 20
summary: Customers, their fields, timeline, meetings and health score.
---
# Reference: customers

A customer (an "account" in the addresses) is the company you look after. Its own fields live in `fields`, keyed by the field keys your administrator defined. A person only ever gets the customers their role lets them see.

> This page is built from the product's own code, so it always matches what the API accepts. The shapes are in [Objects](/docs/en/ref-objects/).

## Every address

| | |
| --- | --- |
| `GET /accounts` | Lists customers. |
| `POST /accounts` | Adds a customer. |
| `GET /accounts/:id` | One customer, with every field the person may see. |
| `PATCH /accounts/:id` | Changes a customer: name, owner, team, fields, review rhythm, or archives and restores it. |
| `DELETE /accounts/:id` | Moves a customer to the trash together with its records, timeline and portal people; it can be put back for 30 days. |
| `POST /accounts/bulk` | Changes many customers at once: new owner, new team, archive or restore. |
| `POST /accounts/import` | Brings in customers from rows of a file (CSV or Excel read on your side), with a mapping from column to field. |
| `GET /imports` | Recent customer imports, newest first. |
| `POST /imports/:id/undo` | Undoes an import within 30 days: removes what it added and puts back what it changed. |
| `PUT /account-fields` | Replaces the list of customer fields (an administrator's job): keys, labels in each language, types, options, who may see and edit each one. |
| `GET /accounts/whitespace` | Which customers have which products and which do not: records of one type counted per customer and per option of a field. |
| `GET /accounts/:id/timeline` | Everything that happened with a customer, newest first: notes, calls, meetings, emails, finished tasks, changes. |
| `POST /accounts/:id/activities` | Logs a note, call, meeting or email on the timeline. |
| `GET /accounts/:id/flow` | The flow between departments for one customer: its owner in each department, the product work it waits for (title, status, sprint end, department; the board only when you can open it), promises made to it and its hand-over cards. |
| `PUT /accounts/:id/team` | Sets (or, with `userId: null`, clears) who owns the customer in one department. |
| `POST /accounts/:id/promises` | Writes down a promise made to the customer (`body`, optionally `recordId`, `activityId`, `dueDate`). |
| `PATCH /promises/:id` | Changes a promise, or marks it kept (`kept: true`). |
| `DELETE /promises/:id` | Deletes a promise. |
| `GET /handovers` | Hand-over cards you can see, newest first: open ones, or every one with `status=all`. |
| `GET /handovers/:id` | One hand-over card in full: stakeholders and their stance, open promises, product requests still waiting, close and renewal dates, the customer's annual value (when you may see that field) and who may take it over. |
| `POST /handovers` | Prepares the hand-over card of a deal by hand (`sourceKind`: `record` or `task`, `sourceId`). |
| `PATCH /handovers/:id` | Edits an open card's summary or suggested playbook, or puts it away (`status: dismissed`). |
| `POST /handovers/:id/confirm` | Confirms the hand-over: `ownerId` becomes the customer's owner in the taking-over department, the playbook (`planId`, or the suggested one) is put on, and the owner is told. |
| `GET /stories/linkable` | Product work a customer request can be linked to (`q` searches titles): title, status and how many customers already wait for it, plus Product's intake boards for a new request. |
| `POST /request-links` | Links a customer's request to a story (`storyId`, `accountId`, `source`: account, ticket, meeting, portal or task, optional `sourceId` and `note`). |
| `DELETE /request-links/:id` | Removes a link. |
| `PATCH /request-links/:id` | Edits the drafted "it shipped" message kept with the link. |
| `POST /request-links/:id/told` | Marks that the customer has been told the work shipped (you sent the message yourself). |
| `POST /request-links/:id/close-portal` | Closes the customer's portal request behind the link: it moves to done, which sends the portal's own message and asks the customer to confirm. |
| `GET /flow/settings` | The company's flow settings: whether a won deal gets its hand-over card, the playbook it suggests and where "tell the customer" tasks go. |
| `PUT /flow/settings` | Changes those settings (`handover`, `handoverPlanId`, `loopBoardId`). |
| `POST /assist/draft` | A draft from the assistant (or from the template, with no model or over the cap): `handover_note`, `shipped_message` or `meeting_promises`. |
| `PATCH /activities/:id` | Changes a logged activity, or pins it to the top. |
| `DELETE /activities/:id` | Moves a logged activity to the trash, where it stays for 30 days. |
| `GET /accounts/:id/meetings` | A customer's meetings, reviews and calls with their next steps. |
| `POST /accounts/:id/meetings` | Logs a meeting with who was there, what was said and the next steps; each next step becomes a task on the chosen board. |
| `POST /activities/:id/next-steps` | Adds more next steps to a meeting already logged. |
| `GET /accounts/:id/planned` | A customer's meetings still to come (`upcoming`) and a short tail of those recently held, postponed or cancelled (`past`). |
| `POST /accounts/:id/planned` | Plans a meeting: its type, when it starts, who is invited from both sides, the agenda and whether it repeats. |
| `PATCH /planned/:id` | Changes a meeting still to come — its time, type, people, agenda or repeat. |
| `POST /planned/:id/hold` | Marks it held: writes the logged meeting on the timeline and links the two. |
| `POST /planned/:id/postpone` | Postpones it with a reason (it is kept, not deleted); optionally plans a fresh one for a new day. |
| `POST /planned/:id/cancel` | Cancels it with a reason — it stays on the record as cancelled; nothing is deleted. |
| `GET /meeting-types` | The meeting types this company has saved, each with its own name and agenda prompt. |
| `PUT /meeting-types` | Saves the company's meeting types (an administrator's job). |
| `GET /accounts/:id/health` | The health score with what moved it and its trend over the last 90 days. |
| `GET /accounts/:id/finance` | From the connected accounting program: the open balance and what is overdue per currency, the oldest days late, the last payment and the latest invoices. |
| `GET /health/config` | How the health score is worked out for this company. |
| `POST /health/preview` | What a new health setting would give before saving it: how many customers in each band and the lowest ones. |
| `PUT /health/config` | Saves the health score settings and recomputes every customer. |
| `GET /accounts/:id/time` | Time logged on a customer's tasks: in all, in the last 30 days, and by person. |
| `POST /accounts/:id/plans` | Puts a playbook on a customer: every step becomes a task, dated from the start day or back from the renewal date. |
| `GET /renewals/links` | For a list of customers: each one's open renewal opportunity and its agreements. |
| `PUT /rhythm` | Targets, how often customers are reviewed and when nudges go out: one company setting. |
| `POST /rollups/recompute` | Recomputes the customer fields that are summed up from records (after their definition changed). |

## Details

### `GET /accounts`

Lists customers. `q` searches by name, `owner` takes a person id or `me`, `archived=1` gives the archived ones, `limit` and `offset` page through. `signals=1` adds overdue and stuck work counts.

**Query:** `q`, `owner`, `archived`, `limit`, `offset`, `signals`

### `POST /accounts`

Adds a customer.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | required | at least 1 characters; at most 200 characters |
| `ownerId` | id | optional | may be null |
| `teamId` | id | optional | may be null |
| `fields` | object (name → value) | optional |  |
| `currency` | text | optional | may be null |

### `GET /accounts/:id`

One customer, with every field the person may see.

### `PATCH /accounts/:id`

Changes a customer: name, owner, team, fields, review rhythm, or archives and restores it. Only the fields you send change.

**Needs:** a seat that can write · for some changes: permission `accounts.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | optional | at least 1 characters; at most 200 characters |
| `ownerId` | id | optional | may be null |
| `teamId` | id | optional | may be null |
| `fields` | object (name → value) | optional |  |
| `archived` | yes/no | optional |  |
| `reviewDays` | whole number | optional | at least 0; at most 730; may be null |
| `currency` | text | optional | may be null |
| `baseVersion` | whole number | optional | at least 1 |

### `DELETE /accounts/:id`

Moves a customer to the trash together with its records, timeline and portal people; it can be put back for 30 days. Its tasks stay, without a customer. The answer carries `trashId`.

**Needs:** permission `accounts.manage`

### `POST /accounts/bulk`

Changes many customers at once: new owner, new team, archive or restore. The answer carries an undo id.

**Needs:** permission `accounts.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `ids` | list of id | required | at least 1 items; at most 500 items |
| `ownerId` | id | optional | may be null |
| `teamId` | id | optional | may be null |
| `archived` | yes/no | optional |  |

### `POST /accounts/import`

Brings in customers from rows of a file (CSV or Excel read on your side), with a mapping from column to field. Existing customers are matched by name or by their id in the source.

**Needs:** permission `accounts.manage` · permission `accounts.view_all`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `fileName` | text | optional | at most 200 characters |
| `rows` | list of object (name → value) | required | at most MAX_IMPORT_ROWS items |
| `mapping` | object | required |  |
| `newFields` | list of object | optional | at most 40 items |
| `runAutomations` | yes/no | optional |  |
| `locale` | one of en \| tr \| ar \| he \| fa \| zh-Hans \| zh-Hant \| ja \| ko \| hi \| ms | optional |  |

### `GET /imports`

Recent customer imports, newest first.

**Needs:** permission `accounts.manage`

### `POST /imports/:id/undo`

Undoes an import within 30 days: removes what it added and puts back what it changed. The customers it added go to the trash as one item (`trashId`).

**Needs:** permission `accounts.manage`

### `PUT /account-fields`

Replaces the list of customer fields (an administrator's job): keys, labels in each language, types, options, who may see and edit each one.

**Needs:** permission `accounts.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `fields` | list of fieldSchema | required | at most 150 items |

### `GET /accounts/whitespace`

Which customers have which products and which do not: records of one type counted per customer and per option of a field.

**Query:** `type`, `field`

### `GET /accounts/:id/timeline`

Everything that happened with a customer, newest first: notes, calls, meetings, emails, finished tasks, changes. `before` and `limit` page through.

**Query:** `before`, `limit`

### `POST /accounts/:id/activities`

Logs a note, call, meeting or email on the timeline.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `kind` | one of ACTIVITY_KINDS | optional | default note |
| `body` | text | required | at least 1 characters; at most 20000 characters |
| `happenedAt` | date and time | optional |  |
| `contactIds` | list of id | optional | at most 20 items |
| `pinned` | yes/no | optional |  |

### `GET /accounts/:id/flow`

The flow between departments for one customer: its owner in each department, the product work it waits for (title, status, sprint end, department; the board only when you can open it), promises made to it and its hand-over cards.

### `PUT /accounts/:id/team`

Sets (or, with `userId: null`, clears) who owns the customer in one department. Account managers, the department's leads and the customer's owner may.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `departmentId` | id | required |  |
| `userId` | id | required | may be null |

### `POST /accounts/:id/promises`

Writes down a promise made to the customer (`body`, optionally `recordId`, `activityId`, `dueDate`). The hand-over card lists the open ones.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `body` | text | required | at least 1 characters; at most 500 characters |
| `recordId` | id | optional | may be null |
| `activityId` | id | optional | may be null |
| `dueDate` | date (YYYY-MM-DD) | optional | may be null |

### `PATCH /promises/:id`

Changes a promise, or marks it kept (`kept: true`).

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `body` | text | optional | at least 1 characters; at most 500 characters |
| `kept` | yes/no | optional |  |
| `dueDate` | date (YYYY-MM-DD) | optional | may be null |

### `DELETE /promises/:id`

Deletes a promise. The answer carries it, so it can be written back.

**Needs:** a seat that can write

### `GET /handovers`

Hand-over cards you can see, newest first: open ones, or every one with `status=all`.

**Query:** `status`

### `GET /handovers/:id`

One hand-over card in full: stakeholders and their stance, open promises, product requests still waiting, close and renewal dates, the customer's annual value (when you may see that field) and who may take it over.

### `POST /handovers`

Prepares the hand-over card of a deal by hand (`sourceKind`: `record` or `task`, `sourceId`). Once per deal; a won deal gets one by itself.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `sourceKind` | one of record \| task | required |  |
| `sourceId` | id | required |  |

### `PATCH /handovers/:id`

Edits an open card's summary or suggested playbook, or puts it away (`status: dismissed`).

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `summary` | text | optional | at most 8000 characters |
| `planId` | id | optional | may be null |
| `status` | one of open \| dismissed | optional |  |

### `POST /handovers/:id/confirm`

Confirms the hand-over: `ownerId` becomes the customer's owner in the taking-over department, the playbook (`planId`, or the suggested one) is put on, and the owner is told.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `ownerId` | id | required |  |
| `planId` | id | optional | may be null |
| `summary` | text | optional | at most 8000 characters |

### `GET /stories/linkable`

Product work a customer request can be linked to (`q` searches titles): title, status and how many customers already wait for it, plus Product's intake boards for a new request.

**Query:** `q`

### `POST /request-links`

Links a customer's request to a story (`storyId`, `accountId`, `source`: account, ticket, meeting, portal or task, optional `sourceId` and `note`). The same request twice is one link.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `storyId` | id | required |  |
| `accountId` | id | required |  |
| `source` | one of REQUEST_SOURCES | required |  |
| `sourceId` | id | optional | may be null |
| `note` | text | optional | at most 2000 characters |

### `DELETE /request-links/:id`

Removes a link.

**Needs:** a seat that can write

### `PATCH /request-links/:id`

Edits the drafted "it shipped" message kept with the link.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `draft` | text | required | at most 8000 characters |

### `POST /request-links/:id/told`

Marks that the customer has been told the work shipped (you sent the message yourself).

**Needs:** a seat that can write

### `POST /request-links/:id/close-portal`

Closes the customer's portal request behind the link: it moves to done, which sends the portal's own message and asks the customer to confirm. Finishing the story never does this by itself.

**Needs:** a seat that can write

### `GET /flow/settings`

The company's flow settings: whether a won deal gets its hand-over card, the playbook it suggests and where "tell the customer" tasks go.

### `PUT /flow/settings`

Changes those settings (`handover`, `handoverPlanId`, `loopBoardId`). Needs the right to manage automations.

**Needs:** a seat that can write · permission `automations.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `handover` | yes/no | optional |  |
| `handoverPlanId` | id | optional | may be null |
| `loopBoardId` | id | optional | may be null |

### `POST /assist/draft`

A draft from the assistant (or from the template, with no model or over the cap): `handover_note`, `shipped_message` or `meeting_promises`. Nothing is saved.

**Needs:** a seat that can write

Takes a body whose shape depends on what is sent; see the guide for this area.

### `PATCH /activities/:id`

Changes a logged activity, or pins it to the top.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `kind` | one of ACTIVITY_KINDS | optional |  |
| `body` | text | optional | at most 20000 characters |
| `happenedAt` | date and time | optional |  |
| `contactIds` | list of id | optional | at most 20 items |
| `pinned` | yes/no | optional |  |
| `title` | text | optional | at most 300 characters |
| `minutes` | whole number | optional | at least 1; at most 1440; may be null |
| `userIds` | list of id | optional | at most 30 items |

### `DELETE /activities/:id`

Moves a logged activity to the trash, where it stays for 30 days. The answer carries `trashId`.

**Needs:** a seat that can write

### `GET /accounts/:id/meetings`

A customer's meetings, reviews and calls with their next steps. `kind` narrows to one kind, `before` pages back.

**Query:** `kind`, `before`

### `POST /accounts/:id/meetings`

Logs a meeting with who was there, what was said and the next steps; each next step becomes a task on the chosen board.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `kind` | one of MEETING_KINDS | optional | default meeting |
| `title` | text | optional | at most 300 characters; default  |
| `body` | text | optional | at most 20000 characters; default  |
| `happenedAt` | date and time | optional |  |
| `minutes` | whole number | optional | at least 1; at most 1440; may be null |
| `contactIds` | list of id | optional | at most 30 items |
| `userIds` | list of id | optional | at most 30 items |
| `nextSteps` | list of object | optional | at most 20 items |
| `boardId` | id | optional |  |

### `POST /activities/:id/next-steps`

Adds more next steps to a meeting already logged.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `steps` | list of object | required | at least 1 items; at most 20 items |
| `boardId` | id | required |  |

### `GET /accounts/:id/planned`

A customer's meetings still to come (`upcoming`) and a short tail of those recently held, postponed or cancelled (`past`).

### `POST /accounts/:id/planned`

Plans a meeting: its type, when it starts, who is invited from both sides, the agenda and whether it repeats. It is not on the timeline until it is held.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `kind` | one of MEETING_KINDS | optional | default meeting |
| `typeLabel` | text | optional | at most 80 characters; default  |
| `title` | text | optional | at most 300 characters; default  |
| `agenda` | text | optional | at most 20000 characters; default  |
| `startsAt` | date and time | required |  |
| `minutes` | whole number | optional | at least 1; at most 1440; may be null |
| `contactIds` | list of id | optional | at most 30 items |
| `userIds` | list of id | optional | at most 30 items |
| `repeat` | one of MEETING_REPEATS | optional | default none |

### `PATCH /planned/:id`

Changes a meeting still to come — its time, type, people, agenda or repeat.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `kind` | one of MEETING_KINDS | optional |  |
| `typeLabel` | text | optional | at most 80 characters |
| `title` | text | optional | at most 300 characters |
| `agenda` | text | optional | at most 20000 characters |
| `startsAt` | date and time | optional |  |
| `minutes` | whole number | optional | at least 1; at most 1440; may be null |
| `contactIds` | list of id | optional | at most 30 items |
| `userIds` | list of id | optional | at most 30 items |
| `repeat` | one of MEETING_REPEATS | optional |  |

### `POST /planned/:id/hold`

Marks it held: writes the logged meeting on the timeline and links the two. If it repeats, the next one is planned. Next steps can be agreed in the same go.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `body` | text | optional | at most 20000 characters; default  |
| `happenedAt` | date and time | optional |  |
| `minutes` | whole number | optional | at least 1; at most 1440; may be null |
| `nextSteps` | list of object | optional | at most 20 items |
| `boardId` | id | optional |  |

### `POST /planned/:id/postpone`

Postpones it with a reason (it is kept, not deleted); optionally plans a fresh one for a new day.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `reason` | text | optional | at most 2000 characters; default  |
| `startsAt` | date and time | optional |  |

### `POST /planned/:id/cancel`

Cancels it with a reason — it stays on the record as cancelled; nothing is deleted.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `reason` | text | optional | at most 2000 characters; default  |

### `GET /meeting-types`

The meeting types this company has saved, each with its own name and agenda prompt.

### `PUT /meeting-types`

Saves the company's meeting types (an administrator's job).

**Needs:** permission `org.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `types` | list of object | required | at most 40 items |

### `GET /accounts/:id/health`

The health score with what moved it and its trend over the last 90 days.

### `GET /accounts/:id/finance`

From the connected accounting program: the open balance and what is overdue per currency, the oldest days late, the last payment and the latest invoices. Needs "See finance figures"; `finance` is null when no program is connected.

**Needs:** permission `finance.view`

### `GET /health/config`

How the health score is worked out for this company.

**Needs:** permission `accounts.manage`

### `POST /health/preview`

What a new health setting would give before saving it: how many customers in each band and the lowest ones.

**Needs:** permission `accounts.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `config` | object | required |  |

### `PUT /health/config`

Saves the health score settings and recomputes every customer.

**Needs:** a seat that can write · permission `accounts.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `config` | object | required |  |

### `GET /accounts/:id/time`

Time logged on a customer's tasks: in all, in the last 30 days, and by person.

### `POST /accounts/:id/plans`

Puts a playbook on a customer: every step becomes a task, dated from the start day or back from the renewal date.

**Needs:** a seat that can write · plan: `playbooks`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `planId` | id | required |  |
| `start` | date (YYYY-MM-DD) | optional |  |

### `GET /renewals/links`

For a list of customers: each one's open renewal opportunity and its agreements.

**Query:** `accounts`

### `PUT /rhythm`

Targets, how often customers are reviewed and when nudges go out: one company setting.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `targets` | object | optional |  |
| `reviewDays` | whole number | optional | at least 0; at most 730 |
| `staleDays` | whole number | optional | at least 0; at most 365 |
| `escalateDays` | whole number | optional | at least 0; at most 90 |
| `renewal` | object | optional |  |

### `POST /rollups/recompute`

Recomputes the customer fields that are summed up from records (after their definition changed).

**Needs:** permission `accounts.manage`
