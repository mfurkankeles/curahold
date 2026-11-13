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

### `DELETE /accounts/:id`

Moves a customer to the trash together with its records, timeline and portal people; it can be put back for 30 days. Its tasks stay, without a customer. The answer carries `trashId`.

**Needs:** permission `accounts.manage`

### `POST /accounts/bulk`

Changes many customers at once: new owner, new team, archive or restore. The answer carries an undo id.

**Needs:** permission `accounts.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `ids` | list of id | required | at least 1 items; at most 2000 items |
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
| `locale` | one of en \| tr | optional |  |

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
