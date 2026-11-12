---
title: Reference: automations and playbooks
section: reference
order: 25
summary: Rules that act on their own, and reusable plans of tasks.
---
# Reference: automations and playbooks

An automation is a rule: when something happens (a date comes near, a task moves, a customer goes quiet) and the conditions hold, do something (open tasks, notify, change a field). Each rule fires once per occasion. A playbook is a reusable plan of dated tasks.

> This page is built from the product's own code, so it always matches what the API accepts. The shapes are in [Objects](/docs/en/ref-objects/).

## Every address

| | |
| --- | --- |
| `GET /automations` | The company's rules with when each last ran. |
| `POST /automations` | Adds a rule. |
| `PATCH /automations/:id` | Changes a rule, or switches it on and off. |
| `DELETE /automations/:id` | Deletes a rule. |
| `GET /automations/:id/runs` | What a rule did, newest first. |
| `POST /automations/preview` | What a rule would act on today. |
| `POST /automations/:id/run` | Runs a scheduled rule now instead of waiting for the next hour; it still fires once per occasion. |
| `GET /plans` | Playbooks: reusable plans of tasks. |
| `POST /plans` | Adds a playbook. |
| `PATCH /plans/:id` | Changes a playbook. |
| `DELETE /plans/:id` | Deletes a playbook. |

## Details

### `GET /automations`

The company's rules with when each last ran.

### `POST /automations`

Adds a rule.

**Needs:** permission `automations.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | required | at least 1 characters; at most 120 characters |
| `enabled` | yes/no | required |  |
| `trigger` | value | required |  |
| `conditions` | list of object | required | at most 10 items |
| `action` | value | required |  |
| `preset` | text | optional | at most 40 characters; may be null |

### `PATCH /automations/:id`

Changes a rule, or switches it on and off.

**Needs:** permission `automations.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | optional | at least 1 characters; at most 120 characters |
| `enabled` | yes/no | optional |  |
| `trigger` | value | optional |  |
| `conditions` | list of object | optional | at most 10 items |
| `action` | value | optional |  |

### `DELETE /automations/:id`

Deletes a rule.

**Needs:** permission `automations.manage`

### `GET /automations/:id/runs`

What a rule did, newest first.

**Needs:** permission `automations.manage`

### `POST /automations/preview`

What a rule would act on today. Changes nothing.

**Needs:** permission `automations.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `trigger` | value | required |  |
| `conditions` | list of object | required | at most 10 items |

### `POST /automations/:id/run`

Runs a scheduled rule now instead of waiting for the next hour; it still fires once per occasion.

**Needs:** permission `automations.manage`

### `GET /plans`

Playbooks: reusable plans of tasks.

### `POST /plans`

Adds a playbook.

**Needs:** permission `org.manage` · plan: `playbooks`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | required | at least 1 characters; at most 120 characters |
| `description` | text | optional | at most 500 characters |
| `boardId` | id | required |  |
| `column` | text | optional | at most 24 characters; may be null |
| `anchor` | one of start \| renewal \| close | optional |  |
| `tasks` | list of object | required | at least 1 items; at most 40 items |

### `PATCH /plans/:id`

Changes a playbook.

**Needs:** permission `org.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | required | at least 1 characters; at most 120 characters |
| `description` | text | optional | at most 500 characters |
| `boardId` | id | required |  |
| `column` | text | optional | at most 24 characters; may be null |
| `anchor` | one of start \| renewal \| close | optional |  |
| `tasks` | list of object | required | at least 1 items; at most 40 items |

### `DELETE /plans/:id`

Deletes a playbook. Tasks it already opened stay.

**Needs:** permission `org.manage`
