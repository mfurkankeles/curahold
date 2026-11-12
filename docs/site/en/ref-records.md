---
title: Reference: records
section: developers
order: 21
summary: Contacts, opportunities, tickets and the kinds you define yourself.
---
# Reference: records

A record is anything kept under a customer: a contact, an opportunity, a support ticket, or a kind your company defined (contracts, products, risks). Each kind has its own fields; a record carries them in `fields`.

> This page is built from the product's own code, so it always matches what the API accepts. The shapes are in [Objects](/docs/en/ref-objects/).

## Every address

| | |
| --- | --- |
| `GET /record-types` | The kinds of record this company keeps, with their fields. |
| `POST /record-types` | Defines a new kind of record. |
| `PATCH /record-types/:id` | Changes a kind: its name, fields, list columns, order; or archives it. |
| `DELETE /record-types/:id` | Deletes a kind that has no records left; with records in it the answer is `type_not_empty`. |
| `GET /records` | Lists records of one kind (`type`), of one customer (`account`), or both. |
| `GET /records/:id` | One record. |
| `POST /records` | Adds a record of a kind, under a customer. |
| `PATCH /records/:id` | Changes a record; only the fields you send change. |
| `DELETE /records/:id` | Deletes a record with its comments and files. |
| `POST /records/:id/comments` | Comments on a record; `@name` mentions notify. |
| `DELETE /record-comments/:id` | Deletes your own comment on a record. |
| `POST /records/:id/files` | Attaches a file to a record (multipart upload, one file per request). |
| `POST /records/:id/plans` | Puts a playbook on a deal or any record: its tasks belong to the record and its customer. |
| `PUT /tickets/:source/:externalId` | Creates or updates one support ticket by your own system's name and id. |
| `POST /inbound/tickets/:token` | The same as above for a system that cannot send a key: the secret is in the address (Settings → Developers). |

## Details

### `GET /record-types`

The kinds of record this company keeps, with their fields.

### `POST /record-types`

Defines a new kind of record.

**Needs:** permission `accounts.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `kind` | one of RECORD_KINDS | optional | default custom |
| `key` | text | optional |  |
| `name` | object | optional |  |
| `fields` | list of fieldSchema | optional | at most 150 items |

### `PATCH /record-types/:id`

Changes a kind: its name, fields, list columns, order; or archives it.

**Needs:** permission `accounts.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | object | optional |  |
| `fields` | list of fieldSchema | optional | at most 150 items |
| `position` | whole number | optional | at least 0; at most 1000 |
| `archived` | yes/no | optional |  |
| `columns` | list of text | optional | at most 20 items; may be null |

### `DELETE /record-types/:id`

Deletes a kind that has no records left; with records in it the answer is `type_not_empty`.

**Needs:** permission `accounts.manage`

### `GET /records`

Lists records of one kind (`type`), of one customer (`account`), or both. `q` searches by name, `owner` by person, `limit` and `offset` page through.

**Query:** `type`, `account`, `q`, `owner`, `archived`, `limit`, `offset`

### `GET /records/:id`

One record. `full=1` adds its comments, files and linked tasks.

**Query:** `full`

### `POST /records`

Adds a record of a kind, under a customer.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `typeId` | id | required |  |
| `accountId` | id | optional | may be null |
| `parentId` | id | optional | may be null |
| `name` | text | optional | at least 1 characters; at most 300 characters |
| `ownerId` | id | optional | may be null |
| `fields` | object (name → value) | optional |  |
| `currency` | text | optional | may be null |

### `PATCH /records/:id`

Changes a record; only the fields you send change.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | optional | at least 1 characters; at most 300 characters |
| `accountId` | id | optional | may be null |
| `parentId` | id | optional | may be null |
| `ownerId` | id | optional | may be null |
| `fields` | object (name → value) | optional |  |
| `archived` | yes/no | optional |  |
| `currency` | text | optional | may be null |

### `DELETE /records/:id`

Deletes a record with its comments and files.

**Needs:** permission `accounts.manage`

### `POST /records/:id/comments`

Comments on a record; `@name` mentions notify.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `body` | text | required | at most 10000 characters |
| `fileIds` | list of id | optional | at most 10 items |

### `DELETE /record-comments/:id`

Deletes your own comment on a record.

### `POST /records/:id/files`

Attaches a file to a record (multipart upload, one file per request).

**Needs:** a seat that can write

### `POST /records/:id/plans`

Puts a playbook on a deal or any record: its tasks belong to the record and its customer.

**Needs:** a seat that can write · plan: `playbooks`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `planId` | id | required |  |
| `start` | date (YYYY-MM-DD) | optional |  |

### `PUT /tickets/:source/:externalId`

Creates or updates one support ticket by your own system's name and id. Sending it again only changes what you send.

**Needs:** a seat that can write

### `POST /inbound/tickets/:token`

The same as above for a system that cannot send a key: the secret is in the address (Settings → Developers).
