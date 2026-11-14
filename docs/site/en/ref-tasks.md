---
title: Reference: tasks and boards
section: reference
order: 22
summary: Tasks, subtasks, comments, files, time, boards and saved views.
---
# Reference: tasks and boards

A task lives on a board, in one of the board's columns (`status` is the column key). It can belong to a customer and to a record. Changing a task needs the `version` you last saw; see "Changes at the same time" in the API guide.

> This page is built from the product's own code, so it always matches what the API accepts. The shapes are in [Objects](/docs/en/ref-objects/).

## Every address

| | |
| --- | --- |
| `GET /boards` | The boards the person can see, with their columns and task fields. |
| `POST /boards` | Adds a board: its columns, who sees it, its task fields and request form. |
| `PATCH /boards/:id` | Changes a board. |
| `DELETE /boards/:id` | Archives a board with its tasks. |
| `GET /boards/:id/tasks` | The tasks of one board. |
| `POST /boards/:id/requests` | Sends a request through the board's form: it lands in the form's column, unassigned. |
| `POST /boards/:id/import` | Brings tasks in from rows of a file onto one board. |
| `GET /boards/:id/imports` | Your recent task imports onto a board, newest first. |
| `POST /task-imports/:id/undo` | Undoes an import of tasks: what nobody touched since is removed, and goes to the trash as one item (`trashId`). |
| `PUT /boards/:id/portal` | Opens a board to customers in the portal, or closes it (an administrator's decision). |
| `GET /tasks` | Tasks across boards. |
| `GET /calendar` | What falls on which day between `from` and `to` (at most 430 days): tasks by due date, meetings, calls and reviews that were held, renewals, and business reviews falling due. |
| `GET /calendars` | Whose calendars you may open besides your own: the teams and people that can be passed as `who`. |
| `GET /tasks/counts` | How many of the person's open tasks are overdue and how many are due today (by the company's clock). |
| `GET /tasks/similar` | Open tasks that look like one about to be added (same words, same customer or board), to avoid doubles. |
| `POST /tasks` | Adds a task. |
| `GET /tasks/:id` | One task with its comments, files, subtasks, links, time and history. |
| `PATCH /tasks/:id` | Changes a task. |
| `PATCH /tasks/:id/pm` | Sets a task's product-management fields: `issueType` (epic, story, task, bug, subtask, spike), `storyPoints` (0 or more, or null) and `epicId` (an epic on the same board, or null). |
| `GET /boards/:id/sprints` | The sprints of a board in order. |
| `POST /boards/:id/sprints` | Adds a sprint (`name`, optional `goal`, `startsOn`, `endsOn`). |
| `GET /boards/:id/backlog` | The board's top-level tasks that are in no sprint, in rank order. |
| `GET /boards/:id/epics` | The board's epics with the number of stories linked to each (`childCount`). |
| `GET /boards/:id/pm` | Whether product management (issue types, story points, epics, sprints, the backlog) is on for this board. |
| `PUT /boards/:id/pm` | Turns product management on or off for a board (`enabled`: true, false, or null to follow the board's columns). |
| `GET /sprints/:id` | One sprint. |
| `PATCH /sprints/:id` | Changes a sprint's name, goal or dates. |
| `PUT /sprints/:id/state` | Moves a sprint to `future`, `active` or `closed`. |
| `DELETE /sprints/:id` | Archives a sprint; its items return to the backlog. |
| `GET /sprints/:id/items` | The tasks in a sprint, in rank order. |
| `PUT /sprints/:id/items` | Puts tasks of the same board into the sprint (`taskIds`). |
| `DELETE /sprints/:id/items/:taskId` | Takes a task out of the sprint, back to the backlog. |
| `GET /sprints/:id/summary` | Current totals: points and items, done and in all, with counts by issue type. |
| `GET /sprints/:id/burndown` | A sprint's burndown: remaining story points and items by day, with a live point for today. |
| `DELETE /tasks/:id` | Moves a task to the trash with its subtasks, comments, time and files, where it stays for 30 days. |
| `POST /tasks/bulk` | Changes many tasks at once: column, assignee, due date, priority, archive. |
| `POST /undo/:id` | Puts back what a change to many tasks or customers replaced. |
| `POST /tasks/:id/comments` | Comments on a task. |
| `DELETE /comments/:id` | Deletes a comment you wrote on a task, with the files in it. |
| `POST /tasks/:id/files` | Attaches a file to a task (multipart upload, one file per request). |
| `GET /files/:id` | Downloads a file. |
| `DELETE /files/:id` | Deletes a file. |
| `POST /tasks/:id/links` | Links two tasks: one blocks the other, or they are related. |
| `DELETE /tasks/:id/links/:other` | Removes a link between two tasks. |
| `POST /tasks/:id/time` | Logs time on a task, in minutes, for a day. |
| `DELETE /time/:id` | Deletes a time entry of your own. |
| `POST /tasks/:id/checklist` | Adds steps to a task as subtasks, typed or from a checklist template. |
| `PUT /tasks/:id/watch` | Follows a task: you hear about its changes. |
| `DELETE /tasks/:id/watch` | Stops following a task. |
| `POST /tasks/:id/mute` | Stops or restarts comment notices for one task. |
| `PUT /tasks/:id/portal` | Shares a task with its customer in the portal, or stops sharing. |
| `GET /checklists` | Checklist templates. |
| `POST /checklists` | Saves a checklist template. |
| `DELETE /checklists/:id` | Deletes a checklist template. |
| `GET /views` | Your saved views of a board (filters, grouping, order). |
| `POST /views` | Saves a view. |
| `PATCH /views/:id` | Changes a saved view. |
| `DELETE /views/:id` | Deletes a saved view. |

## Details

### `GET /boards`

The boards the person can see, with their columns and task fields.

### `POST /boards`

Adds a board: its columns, who sees it, its task fields and request form.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | required | at least 1 characters; at most 80 characters |
| `visibility` | one of org \| team \| private | required |  |
| `teamId` | id | optional | may be null |
| `memberIds` | list of id | optional | at most 200 items |
| `columns` | list of object | optional | at least 1 items; at most 12 items |
| `notify` | list of object | optional | at most 5 items |
| `taskFields` | taskFieldsSchema | optional |  |
| `form` | object | optional | may be null |
| `archiveDays` | whole number | optional | at least 7; at most 3650; may be null |

### `PATCH /boards/:id`

Changes a board. Columns that still hold tasks cannot be removed.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | required | at least 1 characters; at most 80 characters |
| `visibility` | one of org \| team \| private | required |  |
| `teamId` | id | optional | may be null |
| `memberIds` | list of id | optional | at most 200 items |
| `columns` | list of object | optional | at least 1 items; at most 12 items |
| `notify` | list of object | optional | at most 5 items |
| `taskFields` | taskFieldsSchema | optional |  |
| `form` | object | optional | may be null |
| `archiveDays` | whole number | optional | at least 7; at most 3650; may be null |

### `DELETE /boards/:id`

Archives a board with its tasks.

**Needs:** a seat that can write

### `GET /boards/:id/tasks`

The tasks of one board. `q` searches titles, `archived=1` gives archived ones, `offset` pages through.

**Query:** `archived`, `q`, `offset`

### `POST /boards/:id/requests`

Sends a request through the board's form: it lands in the form's column, unassigned.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `title` | text | required | at least 1 characters; at most 300 characters |
| `description` | text | optional | at most 20000 characters |
| `accountId` | id | optional | may be null |
| `dueDate` | date (YYYY-MM-DD) | optional | may be null |
| `fields` | object (name → value) | optional |  |

### `POST /boards/:id/import`

Brings tasks in from rows of a file onto one board. Nobody is notified and no rules run.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `fileName` | text | optional | at most 200 characters |
| `rows` | list of object (name → value) | required | at least 1 items; at most MAX_TASK_ROWS items |
| `mapping` | object | required |  |
| `locale` | one of en \| tr | optional |  |
| `includeDone` | yes/no | optional |  |

### `GET /boards/:id/imports`

Your recent task imports onto a board, newest first.

### `POST /task-imports/:id/undo`

Undoes an import of tasks: what nobody touched since is removed, and goes to the trash as one item (`trashId`).

**Needs:** a seat that can write

### `PUT /boards/:id/portal`

Opens a board to customers in the portal, or closes it (an administrator's decision).

**Needs:** a seat that can write · permission `org.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `enabled` | yes/no | required |  |
| `intake` | text | required | at least 1 characters; at most 60 characters |
| `labels` | object (name → value) | optional | default {} |
| `fields` | list of one of PORTAL_FIELDS | optional | at most PORTAL_FIELDS.length items; default [] |

### `GET /tasks`

Tasks across boards. `assignee` takes a person id or `me`; `from` and `to` bound the due date; `board` narrows to one board.

**Query:** `assignee`, `from`, `to`, `span`, `board`

### `GET /calendar`

What falls on which day between `from` and `to` (at most 430 days): tasks by due date, meetings, calls and reviews that were held, renewals, and business reviews falling due. `who` is `me` (the default), `all` (everything you can see), `p:<person id>` or `t:<team id>`; the last two need the permission to see teammates' calendars and show only what you may already see.

**Query:** `from`, `to`, `who`

### `GET /calendars`

Whose calendars you may open besides your own: the teams and people that can be passed as `who`. Empty without the permission.

### `GET /tasks/counts`

How many of the person's open tasks are overdue and how many are due today (by the company's clock).

### `GET /tasks/similar`

Open tasks that look like one about to be added (same words, same customer or board), to avoid doubles.

**Query:** `title`, `boardId`, `accountId`

### `POST /tasks`

Adds a task. With `parentId` it is a subtask.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `boardId` | id | required |  |
| `parentId` | id | optional | may be null |
| `title` | text | required | at least 1 characters; at most 300 characters |
| `description` | text | optional | at most 20000 characters |
| `status` | text | optional | at most 24 characters |
| `assigneeIds` | list of id | optional | at most 10 items |
| `accountId` | id | optional | may be null |
| `dueDate` | date (YYYY-MM-DD) | optional | may be null |
| `priority` | one of low \| normal \| high \| urgent | optional |  |
| `position` | number | optional |  |
| `repeat` | object | optional | may be null |
| `fields` | object (name → value) | optional |  |
| `startDate` | date (YYYY-MM-DD) | optional | may be null |
| `recordId` | id | optional | may be null |

### `GET /tasks/:id`

One task with its comments, files, subtasks, links, time and history.

### `PATCH /tasks/:id`

Changes a task. Send `baseVersion`; if someone changed other fields meanwhile both changes are kept, if they changed the same field you get `409` with the latest task.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `baseVersion` | whole number | required | at least 1 |
| `title` | text | optional | at least 1 characters; at most 300 characters |
| `description` | text | optional | at most 20000 characters |
| `status` | text | optional | at most 24 characters |
| `assigneeIds` | list of id | optional | at most 10 items |
| `accountId` | id | optional | may be null |
| `dueDate` | date (YYYY-MM-DD) | optional | may be null |
| `priority` | one of low \| normal \| high \| urgent | optional |  |
| `position` | number | optional |  |
| `repeat` | object | optional | may be null |
| `fields` | object (name → value) | optional |  |
| `startDate` | date (YYYY-MM-DD) | optional | may be null |
| `recordId` | id | optional | may be null |

### `PATCH /tasks/:id/pm`

Sets a task's product-management fields: `issueType` (epic, story, task, bug, subtask, spike), `storyPoints` (0 or more, or null) and `epicId` (an epic on the same board, or null). Send `baseVersion`; a stale one gets `409` with the latest task.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `baseVersion` | whole number | required | at least 1 |
| `issueType` | one of ISSUE_TYPES | optional |  |
| `storyPoints` | number | optional | at least 0; at most 1000; may be null |
| `epicId` | id | optional | may be null |

### `GET /boards/:id/sprints`

The sprints of a board in order. `state` (future, active, closed) narrows the list.

**Query:** `state`

### `POST /boards/:id/sprints`

Adds a sprint (`name`, optional `goal`, `startsOn`, `endsOn`). It starts as `future`.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | required | at least 1 characters; at most 80 characters |
| `goal` | text | optional | at most 2000 characters |
| `startsOn` | date (YYYY-MM-DD) | optional | may be null |
| `endsOn` | date (YYYY-MM-DD) | optional | may be null |

### `GET /boards/:id/backlog`

The board's top-level tasks that are in no sprint, in rank order. `open=1` leaves out finished ones.

**Query:** `open`

### `GET /boards/:id/epics`

The board's epics with the number of stories linked to each (`childCount`).

### `GET /boards/:id/pm`

Whether product management (issue types, story points, epics, sprints, the backlog) is on for this board.

### `PUT /boards/:id/pm`

Turns product management on or off for a board (`enabled`: true, false, or null to follow the board's columns).

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `enabled` | yes/no | required | may be null |

### `GET /sprints/:id`

One sprint.

### `PATCH /sprints/:id`

Changes a sprint's name, goal or dates.

**Needs:** a seat that can write

Takes a body whose shape depends on what is sent; see the guide for this area.

### `PUT /sprints/:id/state`

Moves a sprint to `future`, `active` or `closed`. Only one sprint per board can be active (`409`, `reason: sprint_active`). When closing, `moveIncompleteTo` sends unfinished items to the backlog (null) or to another sprint.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `state` | one of SPRINT_STATES | required |  |
| `moveIncompleteTo` | id | optional | may be null |

### `DELETE /sprints/:id`

Archives a sprint; its items return to the backlog.

**Needs:** a seat that can write

### `GET /sprints/:id/items`

The tasks in a sprint, in rank order.

### `PUT /sprints/:id/items`

Puts tasks of the same board into the sprint (`taskIds`). A closed sprint takes none.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `taskIds` | list of id | required | at least 1 items; at most 200 items |

### `DELETE /sprints/:id/items/:taskId`

Takes a task out of the sprint, back to the backlog.

**Needs:** a seat that can write

### `GET /sprints/:id/summary`

Current totals: points and items, done and in all, with counts by issue type. Done means the status is a finished column.

### `GET /sprints/:id/burndown`

A sprint's burndown: remaining story points and items by day, with a live point for today.

### `DELETE /tasks/:id`

Moves a task to the trash with its subtasks, comments, time and files, where it stays for 30 days. Only its creator, or someone allowed to delete any task. The answer carries `trashId`.

**Needs:** a seat that can write

### `POST /tasks/bulk`

Changes many tasks at once: column, assignee, due date, priority, archive. The answer carries an undo id.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `ids` | list of id | required | at least 1 items; at most 500 items |
| `status` | text | optional | at most 24 characters |
| `addAssignee` | id | optional |  |
| `removeAssignee` | id | optional |  |
| `dueDate` | date (YYYY-MM-DD) | optional | may be null |
| `priority` | one of low \| normal \| high \| urgent | optional |  |
| `archived` | yes/no | optional |  |

### `POST /undo/:id`

Puts back what a change to many tasks or customers replaced.

**Needs:** a seat that can write

### `POST /tasks/:id/comments`

Comments on a task. `visibility: customer` shows it in the customer portal; `@name` mentions notify.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `body` | text | required | at most 10000 characters |
| `visibility` | one of internal \| customer | optional | default internal |
| `fileIds` | list of id | optional | at most 10 items |

### `DELETE /comments/:id`

Deletes a comment you wrote on a task, with the files in it.

### `POST /tasks/:id/files`

Attaches a file to a task (multipart upload, one file per request).

**Needs:** a seat that can write

### `GET /files/:id`

Downloads a file. `inline=1` asks the browser to show it instead of saving it.

**Query:** `inline`

### `DELETE /files/:id`

Deletes a file.

### `POST /tasks/:id/links`

Links two tasks: one blocks the other, or they are related.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `otherId` | id | required |  |
| `kind` | one of blocks \| blocked_by \| relates | required |  |

### `DELETE /tasks/:id/links/:other`

Removes a link between two tasks.

**Needs:** a seat that can write

**Query:** `kind`

### `POST /tasks/:id/time`

Logs time on a task, in minutes, for a day.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `minutes` | whole number | required | at least 1; at most 1440 |
| `day` | date (YYYY-MM-DD) | optional |  |
| `note` | text | optional | at most 500 characters |

### `DELETE /time/:id`

Deletes a time entry of your own.

**Needs:** a seat that can write

### `POST /tasks/:id/checklist`

Adds steps to a task as subtasks, typed or from a checklist template.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `templateId` | id | optional |  |
| `items` | list of text | optional | at most 50 items |

### `PUT /tasks/:id/watch`

Follows a task: you hear about its changes.

### `DELETE /tasks/:id/watch`

Stops following a task.

### `POST /tasks/:id/mute`

Stops or restarts comment notices for one task.

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `muted` | yes/no | required |  |

### `PUT /tasks/:id/portal`

Shares a task with its customer in the portal, or stops sharing.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `shared` | yes/no | required |  |

### `GET /checklists`

Checklist templates.

### `POST /checklists`

Saves a checklist template.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | required | at least 1 characters; at most 120 characters |
| `items` | list of text | required | at least 1 items; at most 50 items |

### `DELETE /checklists/:id`

Deletes a checklist template.

**Needs:** a seat that can write

### `GET /views`

Your saved views of a board (filters, grouping, order).

**Query:** `board`

### `POST /views`

Saves a view.

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `boardId` | id | optional | may be null |
| `name` | text | required | at least 1 characters; at most 80 characters |
| `filters` | object | required |  |
| `shared` | yes/no | optional |  |

### `PATCH /views/:id`

Changes a saved view.

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | optional | at least 1 characters; at most 80 characters |
| `filters` | object | optional |  |
| `shared` | yes/no | optional |  |

### `DELETE /views/:id`

Deletes a saved view.
