---
title: Reference: onboarding plans
section: reference
order: 27
summary: The company's own getting-started plan, the plans it runs for its customers, their templates and the shared progress report.
---
# Reference: onboarding plans

An onboarding plan is shared by two sides: `vendor` (Curahold on the company's own plan; the company on a customer's plan) and `customer`. Its steps sit in phases, wait for each other (`dependsOn`) and many complete themselves from what the product sees (`signal`). Every change answers with the whole plan again, worked out by the server: weighted completion, whose turn it is, stall flags, health signals with their sources. Reading a plan moves it on from those signals first.

> This page is built from the product's own code, so it always matches what the API accepts. The shapes are in [Objects](/docs/en/ref-objects/).

## Every address

| | |
| --- | --- |
| `GET /onboarding/self` | The company's own getting-started plan. |
| `GET /onboarding/self/summary` | Only the headline of that plan: weighted completion and the next step. |
| `GET /onboarding/settings` | The company's onboarding settings: open a draft plan when a deal is won (`fromHandover`, off until switched on), the template it opens (`templateId`: a template's id, a built-in key, or `ask` to choose each time), and optional rules (`rules`: a customer field and value → a template, first match wins). |
| `PUT /onboarding/settings` | Changes those settings (whoever may change company settings). |
| `GET /onboarding-plans` | Every customer plan you may see, with progress, waiting days and stall flags. |
| `POST /onboarding-plans` | Opens a plan for a customer (`accountId`) from a template (`templateId`: a template id or a built-in key; the company's default otherwise). |
| `GET /onboarding-plans/:id` | One plan, whole: steps, people of both sides, goals, shared issues, the data-mapping table, sites, before/after figures, health signals and, on the company's own plan, the setup tests' state. |
| `PATCH /onboarding-plans/:id` | Changes a plan's name, status, owner, welcome text, hand-over note, target day or whether the customer sees it in the portal (`portalVisible`). |
| `POST /onboarding-plans/:id/finish` | Finishes the plan: today's health score and figures are kept as its baseline, and a plan that lived in Onboarding gives Customer Success a hand-over card (`handoverId`). |
| `GET /onboarding-plans/:id/report` | The progress report built from the plan: completion, phases, who is waited on, the next three steps, open issues, data rules, setup tests, goals and figures. |
| `POST /onboarding-plans/:id/share` | Makes a read-only link to that report (`url`; the secret is shown once). |
| `DELETE /onboarding-plans/:id/share` | Closes the report's link. |
| `GET /share/onboarding/:secret` | The shared report, with no sign-in: only what the report shows, no notes and no contact details. |
| `POST /onboarding-plans/:id/steps` | Adds a step of your own (`title`, `phase`, `side`, optionally `dueOn`, `after`, `required`). |
| `PATCH /onboarding-steps/:id` | Changes a step: status, owner (`ownerId`) or the customer's person (`personId`), dates, delay reason, words, required. |
| `DELETE /onboarding-steps/:id` | Deletes a step; steps that waited for it no longer do. |
| `PUT /onboarding-plans/:id/phases` | The plan's phases in order (`phases`: `key` and `name`; leave `key` out for a new one, which then needs a name). |
| `PUT /onboarding-plans/:id/steps/order` | Puts steps in a phase in this order (`phase`, `ids`); a step from another phase moves into it. |
| `POST /onboarding-plans/:id/template` | A won customer's draft that waits for its template (`ask`): makes it again from the template chosen (`templateId`). |
| `POST /onboarding-steps/:id/answer` | A step's short form: `values` for the customer fields the step names are written to the customer's record, then the step is done. |
| `POST /onboarding-steps/:id/files` | Adds a file to a step (multipart `file`); it is a file like any other and downloads from `GET /files/:id`. |
| `POST /onboarding-steps/:id/request` | The step waits for product work: links it to a story (`storyId`) as one more customer request, which Product's backlog counts. |
| `POST /onboarding-plans/:id/people` | Adds a person to one side (`side`, `name`, `role`, `duty`, `contact`, optionally `userId`). |
| `PATCH /onboarding-people/:id` | Changes a person of the plan. |
| `DELETE /onboarding-people/:id` | Removes a person from the plan. |
| `POST /onboarding-plans/:id/goals` | Adds a goal (`title`, `priority`, `targetOn`, optionally `proofUrl`). |
| `PATCH /onboarding-goals/:id` | Changes a goal; `status: done` records the day it was reached. |
| `DELETE /onboarding-goals/:id` | Deletes a goal. |
| `POST /onboarding-plans/:id/issues` | Raises a shared issue: topic, details, whose move it is (`side`), type, urgency, due day, the step it concerns. |
| `PATCH /onboarding-issues/:id` | Changes an issue, passes it to the other side or resolves it (`status: resolved`). |
| `POST /onboarding-issues/:id/ticket` | Links the issue to the customer's support ticket (`recordId`, or `null` to unlink). |
| `DELETE /onboarding-issues/:id` | Deletes an issue. |
| `POST /onboarding-plans/:id/fields` | Adds a row to the data-mapping table: field, target, type, required, example, what was received. |
| `PATCH /onboarding-fields/:id` | Changes a row, records what was received (`received`; the four rules run on it), or ticks it: `checked` (the customer says it looks right) and `verified` (your side checked it). |
| `DELETE /onboarding-fields/:id` | Deletes a row of the data-mapping table. |
| `POST /onboarding-plans/:id/sites` | Adds a site to a rollout (`name`, `region`, `stages`). |
| `PATCH /onboarding-sites/:id` | Changes a site, or where it stands in a phase (`stages: { "<phase>": "todo\|doing\|done\|na" }`). |
| `DELETE /onboarding-sites/:id` | Removes a site. |
| `PATCH /onboarding-metrics/:id` | A before/after figure: `baseline` (the old way), `current`, `target`, and whether higher is better. |
| `GET /onboarding-templates` | The built-in templates (to copy) and the company's own, with how often each was used and finished. |
| `POST /onboarding-templates` | Makes a template: from a built-in one (`from: "standard"`), a copy of the company's own (`from: <id>`), a running plan (`fromPlan`) or written out (`blueprint`). |
| `PATCH /onboarding-templates/:id` | Changes a template's name, summary or steps; plans already made from it keep theirs. |
| `DELETE /onboarding-templates/:id` | Puts a template away. |

## Details

### `GET /onboarding/self`

The company's own getting-started plan. An administrator's first visit opens it; anyone in the company may read it.

### `GET /onboarding/self/summary`

Only the headline of that plan: weighted completion and the next step.

### `GET /onboarding/settings`

The company's onboarding settings: open a draft plan when a deal is won (`fromHandover`, off until switched on), the template it opens (`templateId`: a template's id, a built-in key, or `ask` to choose each time), and optional rules (`rules`: a customer field and value → a template, first match wins). Reminders by e-mail are each person's own choice (`prefs.events.onboarding`).

### `PUT /onboarding/settings`

Changes those settings (whoever may change company settings).

**Needs:** a seat that can write · permission `org.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `fromHandover` | yes/no | optional |  |
| `templateId` | text | optional | at most 60 characters; may be null |
| `rules` | list of object | optional | at most MAX_TEMPLATE_RULES items |

### `GET /onboarding-plans`

Every customer plan you may see, with progress, waiting days and stall flags. `account` narrows to one customer, `open=1` to the running ones.

**Query:** `account`, `open`

### `POST /onboarding-plans`

Opens a plan for a customer (`accountId`) from a template (`templateId`: a template id or a built-in key; the company's default otherwise). One running plan per customer.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `accountId` | id | required |  |
| `templateId` | text | optional | at most 60 characters; may be null |
| `name` | text | optional | at least 1 characters; at most 160 characters |
| `ownerId` | id | optional | may be null |
| `startOn` | date (YYYY-MM-DD) | optional |  |

### `GET /onboarding-plans/:id`

One plan, whole: steps, people of both sides, goals, shared issues, the data-mapping table, sites, before/after figures, health signals and, on the company's own plan, the setup tests' state.

### `PATCH /onboarding-plans/:id`

Changes a plan's name, status, owner, welcome text, hand-over note, target day or whether the customer sees it in the portal (`portalVisible`).

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | optional | at least 1 characters; at most 160 characters |
| `status` | one of draft \| active \| paused \| cancelled | optional |  |
| `ownerId` | id | optional | may be null |
| `welcome` | text | optional | at most 4000 characters |
| `note` | text | optional | at most 8000 characters |
| `targetOn` | date (YYYY-MM-DD) | optional | may be null |
| `portalVisible` | yes/no | optional |  |

### `POST /onboarding-plans/:id/finish`

Finishes the plan: today's health score and figures are kept as its baseline, and a plan that lived in Onboarding gives Customer Success a hand-over card (`handoverId`).

**Needs:** a seat that can write

### `GET /onboarding-plans/:id/report`

The progress report built from the plan: completion, phases, who is waited on, the next three steps, open issues, data rules, setup tests, goals and figures.

### `POST /onboarding-plans/:id/share`

Makes a read-only link to that report (`url`; the secret is shown once). Sharing again replaces the old link.

**Needs:** a seat that can write

### `DELETE /onboarding-plans/:id/share`

Closes the report's link.

**Needs:** a seat that can write

### `GET /share/onboarding/:secret`

The shared report, with no sign-in: only what the report shows, no notes and no contact details.

### `POST /onboarding-plans/:id/steps`

Adds a step of your own (`title`, `phase`, `side`, optionally `dueOn`, `after`, `required`).

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `title` | text | required | at least 1 characters; at most 200 characters |
| `body` | text | optional | at most 2000 characters; default  |
| `phase` | text | required |  |
| `side` | one of vendor \| customer \| both | required |  |
| `dueOn` | date (YYYY-MM-DD) | optional | may be null |
| `after` | list of text | optional | at most 10 items; default [] |
| `required` | yes/no | optional | default true |

### `PATCH /onboarding-steps/:id`

Changes a step: status, owner (`ownerId`) or the customer's person (`personId`), dates, delay reason, words, required. A step the product completes by itself cannot be ticked by hand (`400`), nor one still waiting for another (`409`).

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `status` | one of todo \| doing \| done \| blocked \| skipped | optional |  |
| `ownerId` | id | optional | may be null |
| `personId` | id | optional | may be null |
| `startOn` | date (YYYY-MM-DD) | optional | may be null |
| `dueOn` | date (YYYY-MM-DD) | optional | may be null |
| `delayReason` | text | optional | at most 500 characters |
| `title` | text | optional | at least 1 characters; at most 200 characters |
| `body` | text | optional | at most 2000 characters |
| `required` | yes/no | optional |  |

### `DELETE /onboarding-steps/:id`

Deletes a step; steps that waited for it no longer do.

**Needs:** a seat that can write

### `PUT /onboarding-plans/:id/phases`

The plan's phases in order (`phases`: `key` and `name`; leave `key` out for a new one, which then needs a name). Renames, reorders, adds or removes phases of this plan only, never its template. A phase that still has steps cannot be removed (`409`).

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `phases` | list of object | required | at least 1 items; at most MAX_PHASES items |

### `PUT /onboarding-plans/:id/steps/order`

Puts steps in a phase in this order (`phase`, `ids`); a step from another phase moves into it.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `phase` | text | required |  |
| `ids` | list of id | required | at least 1 items; at most 200 items |

### `POST /onboarding-plans/:id/template`

A won customer's draft that waits for its template (`ask`): makes it again from the template chosen (`templateId`). Answers with the new plan.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `templateId` | text | required | at least 1 characters; at most 60 characters |

### `POST /onboarding-steps/:id/answer`

A step's short form: `values` for the customer fields the step names are written to the customer's record, then the step is done.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `values` | object (name → value) | required |  |

### `POST /onboarding-steps/:id/files`

Adds a file to a step (multipart `file`); it is a file like any other and downloads from `GET /files/:id`.

**Needs:** a seat that can write

### `POST /onboarding-steps/:id/request`

The step waits for product work: links it to a story (`storyId`) as one more customer request, which Product's backlog counts.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `storyId` | id | required |  |
| `note` | text | optional | at most 2000 characters |

### `POST /onboarding-plans/:id/people`

Adds a person to one side (`side`, `name`, `role`, `duty`, `contact`, optionally `userId`).

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `side` | one of SIDES | required |  |
| `name` | text | required | at least 1 characters; at most 120 characters |
| `role` | one of ROLES | optional | default other |
| `duty` | text | optional | at most 300 characters; default  |
| `contact` | text | optional | at most 200 characters; default  |
| `userId` | id | optional | may be null |

### `PATCH /onboarding-people/:id`

Changes a person of the plan. Only the fields you send change.

**Needs:** a seat that can write

Takes a body whose shape depends on what is sent; see the guide for this area.

### `DELETE /onboarding-people/:id`

Removes a person from the plan.

**Needs:** a seat that can write

### `POST /onboarding-plans/:id/goals`

Adds a goal (`title`, `priority`, `targetOn`, optionally `proofUrl`).

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `title` | text | required | at least 1 characters; at most 200 characters |
| `priority` | one of GOAL_PRIORITIES | optional | default must |
| `status` | one of GOAL_STATUSES | optional | default planned |
| `targetOn` | date (YYYY-MM-DD) | optional | may be null |
| `doneOn` | date (YYYY-MM-DD) | optional | may be null |
| `proofUrl` | text | optional | at most 500 characters; may be null |

### `PATCH /onboarding-goals/:id`

Changes a goal; `status: done` records the day it was reached.

**Needs:** a seat that can write

Takes a body whose shape depends on what is sent; see the guide for this area.

### `DELETE /onboarding-goals/:id`

Deletes a goal.

**Needs:** a seat that can write

### `POST /onboarding-plans/:id/issues`

Raises a shared issue: topic, details, whose move it is (`side`), type, urgency, due day, the step it concerns.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `title` | text | required | at least 1 characters; at most 200 characters |
| `body` | text | optional | at most 4000 characters; default  |
| `side` | one of SIDES | optional | default vendor |
| `type` | one of ISSUE_TYPES | optional | default question |
| `urgency` | one of URGENCIES | optional | default normal |
| `dueOn` | date (YYYY-MM-DD) | optional | may be null |
| `stepId` | id | optional | may be null |

### `PATCH /onboarding-issues/:id`

Changes an issue, passes it to the other side or resolves it (`status: resolved`).

**Needs:** a seat that can write

Takes a body whose shape depends on what is sent; see the guide for this area.

### `POST /onboarding-issues/:id/ticket`

Links the issue to the customer's support ticket (`recordId`, or `null` to unlink). The ticket is not copied; when it is solved the issue is resolved.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `recordId` | id | required | may be null |

### `DELETE /onboarding-issues/:id`

Deletes an issue. A failed setup test's issue cannot be deleted (`409`): it is resolved when the test passes.

**Needs:** a seat that can write

### `POST /onboarding-plans/:id/fields`

Adds a row to the data-mapping table: field, target, type, required, example, what was received.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | required | at least 1 characters; at most 120 characters |
| `target` | text | optional | at most 120 characters; default  |
| `type` | one of FIELD_TYPES | optional | default text |
| `required` | yes/no | optional | default false |
| `example` | text | optional | at most 300 characters; default  |
| `received` | text | optional | at most 300 characters; may be null |
| `proofUrl` | text | optional | at most 500 characters; may be null |

### `PATCH /onboarding-fields/:id`

Changes a row, records what was received (`received`; the four rules run on it), or ticks it: `checked` (the customer says it looks right) and `verified` (your side checked it).

**Needs:** a seat that can write

Takes a body whose shape depends on what is sent; see the guide for this area.

### `DELETE /onboarding-fields/:id`

Deletes a row of the data-mapping table.

**Needs:** a seat that can write

### `POST /onboarding-plans/:id/sites`

Adds a site to a rollout (`name`, `region`, `stages`).

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | required | at least 1 characters; at most 120 characters |
| `region` | text | optional | at most 80 characters; default  |
| `stages` | value | optional | default {} |

### `PATCH /onboarding-sites/:id`

Changes a site, or where it stands in a phase (`stages: { "<phase>": "todo|doing|done|na" }`).

**Needs:** a seat that can write

Takes a body whose shape depends on what is sent; see the guide for this area.

### `DELETE /onboarding-sites/:id`

Removes a site.

**Needs:** a seat that can write

### `PATCH /onboarding-metrics/:id`

A before/after figure: `baseline` (the old way), `current`, `target`, and whether higher is better.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `title` | text | optional | at least 1 characters; at most 120 characters |
| `unit` | text | optional | at most 20 characters |
| `baseline` | n | required |  |
| `current` | n | required |  |
| `target` | n | required |  |
| `better` | one of up \| down | optional |  |

### `GET /onboarding-templates`

The built-in templates (to copy) and the company's own, with how often each was used and finished.

### `POST /onboarding-templates`

Makes a template: from a built-in one (`from: "standard"`), a copy of the company's own (`from: <id>`), a running plan (`fromPlan`) or written out (`blueprint`).

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | required | at least 1 characters; at most 120 characters |
| `summary` | text | optional | at most 1000 characters; default  |
| `kind` | one of self \| client | optional |  |
| `from` | text | optional | at most 60 characters |
| `fromPlan` | id | optional |  |
| `blueprint` | object | optional |  |

### `PATCH /onboarding-templates/:id`

Changes a template's name, summary or steps; plans already made from it keep theirs.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | optional | at least 1 characters; at most 120 characters |
| `summary` | text | optional | at most 1000 characters |
| `blueprint` | object | optional |  |

### `DELETE /onboarding-templates/:id`

Puts a template away.

**Needs:** a seat that can write
