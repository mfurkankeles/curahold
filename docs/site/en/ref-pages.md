---
title: Reference: home pages, dashboards and reports
section: developers
order: 24
summary: The data behind home pages and dashboards, and the report builder.
---
# Reference: home pages, dashboards and reports

Home pages and dashboards are made of cards; `GET /pages/:id/data` gives what each card shows for the person asking. Reports are questions over customers, tasks, records and activities; run one without saving it, or keep it.

> This page is built from the product's own code, so it always matches what the API accepts. The shapes are in [Objects](/docs/en/ref-objects/).

## Every address

| | |
| --- | --- |
| `GET /pages` | Home pages; with `kind=dashboard` the dashboards. |
| `GET /pages/:id` | One page: its cards and layout. |
| `GET /pages/:id/data` | What the page's cards show for the person asking. |
| `POST /pages/preview` | What cards would show before the page is saved. |
| `POST /pages` | Adds a page. |
| `POST /pages/from-template` | Adds a ready-made dashboard as a page of your own. |
| `PATCH /pages/:id` | Changes a page. |
| `PUT /pages/order` | Sets the order of the pages. |
| `DELETE /pages/:id` | Deletes a page. |
| `GET /reports/work` | Work at a glance: open, overdue, due this week and unassigned, by board and by person. |
| `GET /reports/person/:id` | One person at a glance: what they finished, what is late, what is coming, who they look after. |
| `GET /reports/catalog` | What a report can be built from: the sources, their fields and the ready-made reports. |
| `POST /reports/run` | Runs a report definition and returns its rows. |
| `GET /reports/saved` | The saved reports the person can see. |
| `GET /reports/saved/:id` | One saved report with its definition. |
| `POST /reports/saved` | Saves a report. |
| `PATCH /reports/saved/:id` | Changes a saved report. |
| `DELETE /reports/saved/:id` | Deletes a saved report. |

## Details

### `GET /pages`

Home pages; with `kind=dashboard` the dashboards.

**Query:** `kind`

### `GET /pages/:id`

One page: its cards and layout.

### `GET /pages/:id/data`

What the page's cards show for the person asking. A dashboard can be narrowed with `person` (an id or `me`) or `team`.

**Query:** `person`, `team`

### `POST /pages/preview`

What cards would show before the page is saved.

**Needs:** permission `org.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `cards` | list of object | required | at most 24 items |

### `POST /pages`

Adds a page.

**Needs:** permission `org.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | required | at least 1 characters; at most 80 characters |
| `kind` | one of home \| dashboard | optional |  |
| `cards` | list of object | optional | at most 24 items |
| `homeFor` | list of text | optional | at most 50 items |
| `sharedWith` | list of text | optional | at most 50 items |
| `filters` | object | optional |  |

### `POST /pages/from-template`

Adds a ready-made dashboard as a page of your own.

**Needs:** permission `org.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `template` | text | required | at most 40 characters |
| `name` | text | optional | at least 1 characters; at most 80 characters |

### `PATCH /pages/:id`

Changes a page.

**Needs:** permission `org.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | optional | at least 1 characters; at most 80 characters |
| `kind` | one of home \| dashboard | optional |  |
| `cards` | list of object | optional | at most 24 items |
| `homeFor` | list of text | optional | at most 50 items |
| `sharedWith` | list of text | optional | at most 50 items |
| `filters` | object | optional |  |

### `PUT /pages/order`

Sets the order of the pages.

**Needs:** permission `org.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `ids` | list of id | required | at most 200 items |

### `DELETE /pages/:id`

Deletes a page.

**Needs:** permission `org.manage`

### `GET /reports/work`

Work at a glance: open, overdue, due this week and unassigned, by board and by person. `board` narrows to one board.

**Query:** `board`

### `GET /reports/person/:id`

One person at a glance: what they finished, what is late, what is coming, who they look after.

### `GET /reports/catalog`

What a report can be built from: the sources, their fields and the ready-made reports.

### `POST /reports/run`

Runs a report definition and returns its rows. Nothing is kept.

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `def` | object | required |  |
| `resolve` | yes/no | optional |  |

### `GET /reports/saved`

The saved reports the person can see.

### `GET /reports/saved/:id`

One saved report with its definition.

### `POST /reports/saved`

Saves a report.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | required | at least 1 characters; at most 120 characters |
| `description` | text | optional | at most 500 characters |
| `def` | object | required |  |
| `shared` | yes/no | optional |  |

### `PATCH /reports/saved/:id`

Changes a saved report.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | optional | at least 1 characters; at most 120 characters |
| `description` | text | optional | at most 500 characters |
| `def` | object | optional |  |
| `shared` | yes/no | optional |  |

### `DELETE /reports/saved/:id`

Deletes a saved report.

**Needs:** a seat that can write
