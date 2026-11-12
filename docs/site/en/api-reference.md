---
title: API guide
section: developers
order: 3
summary: Customers, records, tasks, comments, search and home-page endpoints, with examples.
---
# API guide

Every endpoint lives under `https://yourcompany.curahold.com/api`, takes JSON and returns JSON. Authenticate with an [API key](/docs/en/api-keys/).

## You and your company

| Endpoint | Does |
| --- | --- |
| `GET /me` | The key's owner, their role and permissions, and the company's customer fields |
| `GET /people` | People and teams in the company |
| `GET /search?q=…` | Search customers, tasks, records, boards and people |

## Customers

| Endpoint | Does |
| --- | --- |
| `GET /accounts` | List. `q` (name), `owner` (`me` or a person id), `limit`, `offset` |
| `GET /accounts/{id}` | One customer and its tasks |
| `POST /accounts` | New customer: `name`, `ownerId`, `teamId`, `fields` |
| `PATCH /accounts/{id}` | Change it: only the fields you send change |

```bash
curl -X POST https://yourcompany.curahold.com/api/accounts \
  -H "Authorization: Bearer $CURAHOLD_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Harborline Bank","fields":{"renewal_date":"2027-03-01","arr":126000,"health":"watch"}}'
```

Field keys (`renewal_date`, `arr` …) are listed in `org.accountFields` in the `GET /me` answer. Sending a field your role cannot change returns `403 field_locked`.

## Records (contacts, opportunities, your own kinds)

| Endpoint | Does |
| --- | --- |
| `GET /record-types` | Kinds of record and their fields |
| `GET /records` | List. `type` (`contact`, `opportunity` or a type id), `account`, `q`, `limit`, `offset` |
| `GET /records/{id}` | One record |
| `POST /records` | New record: `typeId`, `accountId`, `name`, `fields` |
| `PATCH /records/{id}` | Change it |

## Tasks

| Endpoint | Does |
| --- | --- |
| `GET /boards` | Boards you can see, with their columns |
| `GET /tasks` | Tasks. `assignee=me`, `from` and `to` (due date, `YYYY-MM-DD`) |
| `GET /boards/{id}/tasks` | A board's tasks |
| `GET /tasks/{id}` | A task with its subtasks, comments and files |
| `POST /tasks` | New task |
| `PATCH /tasks/{id}` | Change it; `baseVersion` is required |
| `POST /tasks/{id}/comments` | Comment: `body` |

```bash
curl -X POST https://yourcompany.curahold.com/api/tasks \
  -H "Authorization: Bearer $CURAHOLD_KEY" -H "Content-Type: application/json" \
  -d '{"boardId":"…","title":"Send the renewal proposal","dueDate":"2027-01-15","priority":"high","accountId":"…"}'
```

Task fields: `title`, `description`, `status` (a column key), `assigneeIds` (up to 10), `accountId`, `dueDate`, `priority` (`low`, `normal`, `high`, `urgent`), `repeat` (`{ "every": 1, "unit": "week", "from": "due" }`).

### Changes at the same time

Send the `version` of the task you read as `baseVersion` in `PATCH /tasks/{id}`. If the task changed meanwhile you get `409` with the current task; apply your change to it and send again.

### Sending a change only once

A connection can drop after your request arrived but before you saw the answer. To retry without doing the work twice, send an `Idempotency-Key` header with every `POST`, `PATCH`, `PUT` or `DELETE`: any text of your own, 8 to 200 characters (a UUID is fine), different for each change.

```bash
curl -X POST https://acme.curahold.com/api/tasks \
  -H "Authorization: Bearer chk_..." \
  -H "Idempotency-Key: 3f1c9a52-7a0e-4f0b-9a57-6f2d1c0b8e11" \
  -H "Content-Type: application/json" \
  -d '{"boardId":"…","title":"Send the renewal quote"}'
```

Send the same request with the same key again and you get the first answer back, with the header `Idempotent-Replayed: true`; nothing is done a second time. The same key on a different request is refused with `422` (`repeat_mismatch`). Keys are yours alone and are kept for two days.

## Timeline and health score

| Endpoint | Does |
| --- | --- |
| `GET /accounts/{id}/timeline` | The customer's timeline, newest first. `before` (the `next` of the previous answer) and `limit` |
| `POST /accounts/{id}/activities` | Log an entry: `kind` (`note`, `call`, `meeting`, `email`, `review` for a business review), `body`, optional `happenedAt`, `contactIds`, `pinned` |
| `PATCH /activities/{id}` | Change it (its writer, or someone who manages customers) |
| `DELETE /activities/{id}` | Delete it |
| `GET /accounts/{id}/health` | The score, its band, the points of each signal, and the last 90 days of scores |

The score itself is in the customer's `health_score` field.

A customer also carries `reviewDays` (days between business reviews; `null` follows the company's rhythm, `0` is none; set it with `PATCH /accounts/{id}`) and `lastReviewAt` (the latest activity of kind `review`). The company's rhythm and targets are in `GET /me` under `org.rhythm`.

## Home-page data

| Endpoint | Does |
| --- | --- |
| `GET /pages` | Pages you can see, and your home page (`homeId`) |
| `GET /pages/{id}/data` | The worked-out data of every card on a page |

This is the shortest way to reports and presentations: cards are already worked out within what the person may see.

## Dates and money

Dates are `YYYY-MM-DD`, times ISO 8601 (UTC). Money comes as a number in the company's currency.

## Lists and pages

Lists take `limit` and `offset` (customers and records) or hand back a `next` value to send as `before` (timeline, notifications, meetings). Ask for what you can use: the default page is small on purpose, and a search (`q`) is quicker than reading everything and filtering yourself.

Text search folds letters the way people expect: `istanbul`, `İstanbul` and `ISTANBUL` find each other, and so do `i`, `ı`, `ş`/`s` and the rest of the Turkish alphabet.

## What "today" means

Dates such as a due date are plain days (`YYYY-MM-DD`). Whether a task is overdue is decided by the **company's** time zone (in `org.timezone` of `GET /me`), not the server's and not the caller's.

## Errors

An error is always `{ "error": "<code>", "message": "<a sentence>" }`. Decide by the code, show the sentence. The full list is on the [errors](/docs/en/ref-errors/) page.

## Every address

This page explains the ideas. The reference lists every address with its fields, built from the product's own code:
[customers](/docs/en/ref-customers/) · [records](/docs/en/ref-records/) · [tasks and boards](/docs/en/ref-tasks/) · [people, search and notifications](/docs/en/ref-people/) · [pages and reports](/docs/en/ref-pages/) · [automations and playbooks](/docs/en/ref-automation/) · [keys and webhooks](/docs/en/ref-developer-settings/) · [objects](/docs/en/ref-objects/) · [errors](/docs/en/ref-errors/) · [what is not in the API](/docs/en/ref-internal/)
