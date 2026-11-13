---
title: Reference: keys, webhooks and the inbound address
section: reference
order: 26
summary: What Settings → Developers does, for completeness.
---
# Reference: keys, webhooks and the inbound address

These are what the Settings → Developers page calls. A key cannot create or delete keys: making one needs a person signed in in the browser. Webhooks and the inbound address can be managed with a key that may write, by someone allowed to manage connections.

> This page is built from the product's own code, so it always matches what the API accepts. The shapes are in [Objects](/docs/en/ref-objects/).

## Every address

| | |
| --- | --- |
| `GET /dev/keys` | Your keys and connected apps; with `scope=all`, everyone's (for people who manage people). |
| `POST /dev/keys` | Makes a key (in the browser only). |
| `DELETE /dev/keys/:id` | Revokes a key or a connected app. |
| `GET /dev/webhooks` | The company's webhooks with their recent deliveries. |
| `POST /dev/webhooks` | Adds a webhook: an address and the events it wants. |
| `PATCH /dev/webhooks/:id` | Changes a webhook, pauses it or starts it again. |
| `DELETE /dev/webhooks/:id` | Deletes a webhook. |
| `POST /dev/webhooks/:id/test` | Sends a sample event now and reports what the receiver answered. |
| `GET /dev/inbound` | Whether the inbound ticket address is on, and when it was last used. |
| `POST /dev/inbound` | Turns the inbound address on (or replaces it); the address is shown once. |
| `DELETE /dev/inbound` | Turns the inbound address off. |
| `GET /dev-hooks` | Whether the GitHub and GitLab webhooks are on, with their addresses. |
| `POST /dev-hooks/:provider` | Turns the `github` or `gitlab` webhook on, or replaces its secret. |
| `DELETE /dev-hooks/:provider` | Turns the webhook off. |
| `POST /inbound/dev/:provider` | Where GitHub (`github`, signed with `X-Hub-Signature-256`) and GitLab (`gitlab`, with `X-Gitlab-Token`) send their events. |
| `GET /tasks/:id/dev` | The branches, pull requests and commits linked to a task, with their state and checks, and a one-line summary. |
| `GET /boards/:id/dev-links` | The development summary of every task on a board that has links. |
| `DELETE /dev-links/:id` | Removes one link from a task. |

## Details

### `GET /dev/keys`

Your keys and connected apps; with `scope=all`, everyone's (for people who manage people).

**Query:** `scope`

### `POST /dev/keys`

Makes a key (in the browser only). The key is shown once.

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | required | at least 1 characters; at most 80 characters |
| `canWrite` | yes/no | optional | default false |
| `expiresInDays` | whole number | optional | at least 1; at most 730; may be null; default 365 |

### `DELETE /dev/keys/:id`

Revokes a key or a connected app.

### `GET /dev/webhooks`

The company's webhooks with their recent deliveries.

**Needs:** permission `connections.manage`

### `POST /dev/webhooks`

Adds a webhook: an address and the events it wants. The signing secret is shown once.

**Needs:** permission `connections.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `url` | text | required | at most 500 characters |
| `events` | list of one of WEBHOOK_EVENTS | required | at least 1 items |

### `PATCH /dev/webhooks/:id`

Changes a webhook, pauses it or starts it again.

**Needs:** permission `connections.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `active` | yes/no | optional |  |
| `events` | list of one of WEBHOOK_EVENTS | optional | at least 1 items |

### `DELETE /dev/webhooks/:id`

Deletes a webhook.

**Needs:** permission `connections.manage`

### `POST /dev/webhooks/:id/test`

Sends a sample event now and reports what the receiver answered.

**Needs:** permission `connections.manage`

### `GET /dev/inbound`

Whether the inbound ticket address is on, and when it was last used.

**Needs:** permission `connections.manage`

### `POST /dev/inbound`

Turns the inbound address on (or replaces it); the address is shown once.

**Needs:** permission `connections.manage`

### `DELETE /dev/inbound`

Turns the inbound address off.

**Needs:** permission `connections.manage`

### `GET /dev-hooks`

Whether the GitHub and GitLab webhooks are on, with their addresses. Needs permission to manage connections.

**Needs:** permission `connections.manage`

### `POST /dev-hooks/:provider`

Turns the `github` or `gitlab` webhook on, or replaces its secret. The address and the secret are shown; branches, pull requests and commits that name a task (`CURA-` and the first 8 characters of its id) are linked to it.

**Needs:** permission `connections.manage`

### `DELETE /dev-hooks/:provider`

Turns the webhook off. Links already made stay.

**Needs:** permission `connections.manage`

### `POST /inbound/dev/:provider`

Where GitHub (`github`, signed with `X-Hub-Signature-256`) and GitLab (`gitlab`, with `X-Gitlab-Token`) send their events. Not for people.

### `GET /tasks/:id/dev`

The branches, pull requests and commits linked to a task, with their state and checks, and a one-line summary.

### `GET /boards/:id/dev-links`

The development summary of every task on a board that has links.

### `DELETE /dev-links/:id`

Removes one link from a task.

**Needs:** a seat that can write
