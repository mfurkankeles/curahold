---
title: Reference: people, search and notifications
section: reference
order: 23
summary: Who you are, your colleagues, search, notifications and the calendar feed.
---
# Reference: people, search and notifications

Every request is made as a person. `GET /me` says who that is, what they may do and which company this is; start there.

> This page is built from the product's own code, so it always matches what the API accepts. The shapes are in [Objects](/docs/en/ref-objects/).

## Every address

| | |
| --- | --- |
| `GET /me` | The person behind the key: name, role, permissions, seat, language; and the company: name, time zone, currency, the word it uses for "customer", its customer fields. |
| `PATCH /me` | Changes your own name, language, notification choices and screen preferences. |
| `GET /me/start` | What is left of the person's first steps in the product. |
| `GET /me/sessions` | Where you are signed in: devices and when each was last used. |
| `DELETE /me/sessions/:id` | Signs one of your devices out. |
| `GET /me/delivery` | Where this person can get notifications: email, or a chat app the company connected. |
| `GET /me/calendar` | Whether you have a calendar feed address. |
| `POST /me/calendar` | Makes a secret calendar address for your tasks; asking again replaces it. |
| `DELETE /me/calendar` | Turns the calendar address off. |
| `GET /calendar/:file` | The calendar feed itself (iCalendar): open tasks with a due date. |
| `GET /people` | Everyone in the company with their team memberships, and the teams. |
| `GET /search` | Searches customers, tasks, records, boards and people by name (`q`, at least two letters). |
| `GET /notifications` | Your notifications, newest first. |
| `GET /notifications/count` | How many are unread. |
| `POST /notifications/read` | Marks notifications as read: some, or all. |
| `GET /pulse` | A cheap "has anything I can see changed?" check: the moment of the newest change. |

## Details

### `GET /me`

The person behind the key: name, role, permissions, seat, language; and the company: name, time zone, currency, the word it uses for "customer", its customer fields.

### `PATCH /me`

Changes your own name, language, notification choices and screen preferences.

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `name` | text | optional | at least 1 characters; at most 120 characters |
| `locale` | one of en \| tr | optional | may be null |
| `onboarded` | yes/no | optional |  |
| `prefs` | object | optional |  |

### `GET /me/start`

What is left of the person's first steps in the product.

### `GET /me/sessions`

Where you are signed in: devices and when each was last used.

### `DELETE /me/sessions/:id`

Signs one of your devices out.

### `GET /me/delivery`

Where this person can get notifications: email, or a chat app the company connected.

### `GET /me/calendar`

Whether you have a calendar feed address.

### `POST /me/calendar`

Makes a secret calendar address for your tasks; asking again replaces it.

### `DELETE /me/calendar`

Turns the calendar address off.

### `GET /calendar/:file`

The calendar feed itself (iCalendar): open tasks with a due date. The secret is the file name; no key is sent.

### `GET /people`

Everyone in the company with their team memberships, and the teams.

### `GET /search`

Searches customers, tasks, records, boards and people by name (`q`, at least two letters). Turkish letters match as people expect: `i`, `ı` and `İ` find each other.

**Query:** `q`

### `GET /notifications`

Your notifications, newest first. `unread=1` narrows, `before` pages back.

**Query:** `filter`, `unread`, `limit`, `before`

### `GET /notifications/count`

How many are unread.

### `POST /notifications/read`

Marks notifications as read: some, or all.

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `ids` | list of id | optional | at most 100 items |
| `all` | yes/no | optional |  |
| `unread` | yes/no | optional |  |

### `GET /pulse`

A cheap "has anything I can see changed?" check: the moment of the newest change. Ask it before reloading lists.
