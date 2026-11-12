---
title: API reference
section: developers
order: 3
summary: Customers, records, tasks, comments, search and home-page endpoints, with examples.
---
# API reference

Every endpoint lives under `https://yourcompany.tendwell.com/api`, takes JSON and returns JSON. Authenticate with an [API key](/docs/en/api-keys/).

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
curl -X POST https://yourcompany.tendwell.com/api/accounts \
  -H "Authorization: Bearer $TENDWELL_KEY" -H "Content-Type: application/json" \
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
curl -X POST https://yourcompany.tendwell.com/api/tasks \
  -H "Authorization: Bearer $TENDWELL_KEY" -H "Content-Type: application/json" \
  -d '{"boardId":"…","title":"Send the renewal proposal","dueDate":"2027-01-15","priority":"high","accountId":"…"}'
```

Task fields: `title`, `description`, `status` (a column key), `assigneeIds` (up to 10), `accountId`, `dueDate`, `priority` (`low`, `normal`, `high`, `urgent`), `repeat` (`{ "every": 1, "unit": "week", "from": "due" }`).

### Changes at the same time

Send the `version` of the task you read as `baseVersion` in `PATCH /tasks/{id}`. If the task changed meanwhile you get `409` with the current task; apply your change to it and send again.

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
