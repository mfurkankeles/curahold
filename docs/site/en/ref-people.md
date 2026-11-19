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
| `GET /me/export` | Downloads everything Curahold holds about you as one file (your right of access and portability); asks you to confirm it is you, at most three times a day, and each download is written to the activity log. |
| `GET /me/start` | What is left of the person's first steps in the product. |
| `GET /me/sessions` | Where you are signed in: devices and when each was last used. |
| `DELETE /me/sessions/:id` | Signs one of your devices out. |
| `POST /me/sessions/sign-out-others` | Signs out every device but this one. |
| `GET /me/security` | Your second step: authenticator app, passkeys, recovery codes left, and whether your company requires one. |
| `POST /me/security/totp` | Starts setting up an authenticator app (browser session only). |
| `POST /me/security/totp/confirm` | Confirms the app with its first code; answers with ten one-time recovery codes. |
| `DELETE /me/security/totp` | Removes the authenticator app and its recovery codes. |
| `POST /me/security/recovery-codes` | Makes a new set of recovery codes; the old ones stop working. |
| `POST /me/security/passkeys/options` | Options for adding a passkey (WebAuthn). |
| `POST /me/security/passkeys` | Adds the passkey the browser made. |
| `DELETE /me/security/passkeys/:id` | Removes one of your passkeys. |
| `POST /me/confirm/options` | How you can confirm it is you before a sensitive change. |
| `POST /me/confirm/email` | Emails a confirmation code (only without a second step). |
| `POST /me/confirm` | Confirms it is you, for ten minutes of sensitive changes. |
| `GET /me/delivery` | Where this person can get notifications: email, or a chat app the company connected. |
| `GET /me/calendar` | Whether you have a calendar feed address. |
| `POST /me/calendar` | Makes a secret calendar address for your tasks; asking again replaces it. |
| `DELETE /me/calendar` | Turns the calendar address off. |
| `GET /calendar/:file` | The calendar feed itself (iCalendar): open tasks with a due date. |
| `GET /people` | Everyone in the company with their team memberships, and the teams. |
| `GET /departments` | The company's departments in the customer's order (`inside_sales`, `sales`, `onboarding`, `success`, `product`, `finance`), each with `enabled` (part of the plan), its leads and members. |
| `PATCH /departments/:id` | Switches a department on or off (`enabled`) or sets which departments see its band on the customer page (`bandView`, null for all). |
| `PUT /departments/:id/people` | Replaces a department's `leadIds` and `memberIds` at once (people managers). |
| `PUT /departments/:id/members/:userId` | Adds one person with `role` `lead` or `member`, or changes their role. |
| `DELETE /departments/:id/members/:userId` | Takes one person out of a department. |
| `GET /departments/desks` | Boards in other departments that take requests through their form, with the form and the fields it asks. |
| `GET /departments/moves` | Where each board went when departments came in, and why (`sprints`, `name`, `company`), and the people who could see a board before and are not yet members (`suggestions`). |
| `POST /departments/moves/accept` | Makes the suggested people members of their departments (`ids` from `suggestions`). |
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
| `locale` | one of en \| tr \| ar \| he \| fa \| zh-Hans \| zh-Hant \| ja \| ko | optional | may be null |
| `onboarded` | yes/no | optional |  |
| `prefs` | object | optional |  |

### `GET /me/export`

Downloads everything Curahold holds about you as one file (your right of access and portability); asks you to confirm it is you, at most three times a day, and each download is written to the activity log.

### `GET /me/start`

What is left of the person's first steps in the product.

### `GET /me/sessions`

Where you are signed in: devices and when each was last used.

### `DELETE /me/sessions/:id`

Signs one of your devices out.

### `POST /me/sessions/sign-out-others`

Signs out every device but this one.

### `GET /me/security`

Your second step: authenticator app, passkeys, recovery codes left, and whether your company requires one.

### `POST /me/security/totp`

Starts setting up an authenticator app (browser session only).

### `POST /me/security/totp/confirm`

Confirms the app with its first code; answers with ten one-time recovery codes.

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `code` | text | required |  |

### `DELETE /me/security/totp`

Removes the authenticator app and its recovery codes.

### `POST /me/security/recovery-codes`

Makes a new set of recovery codes; the old ones stop working.

### `POST /me/security/passkeys/options`

Options for adding a passkey (WebAuthn).

### `POST /me/security/passkeys`

Adds the passkey the browser made.

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `challengeId` | text | required | at most 40 characters |
| `response` | object (name → value) | required |  |
| `name` | text | optional | at most 80 characters |

### `DELETE /me/security/passkeys/:id`

Removes one of your passkeys.

### `POST /me/confirm/options`

How you can confirm it is you before a sensitive change.

### `POST /me/confirm/email`

Emails a confirmation code (only without a second step).

### `POST /me/confirm`

Confirms it is you, for ten minutes of sensitive changes.

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `code` | text | optional |  |
| `emailCode` | text | optional |  |
| `recoveryCode` | text | optional | at least 8 characters; at most 20 characters |
| `passkey` | object | optional |  |

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

### `GET /departments`

The company's departments in the customer's order (`inside_sales`, `sales`, `onboarding`, `success`, `product`, `finance`), each with `enabled` (part of the plan), its leads and members. Switched-off ones only for administrators.

### `PATCH /departments/:id`

Switches a department on or off (`enabled`) or sets which departments see its band on the customer page (`bandView`, null for all). Administrators only; one department always stays on.

**Needs:** a seat that can write · permission `org.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `enabled` | yes/no | optional |  |
| `bandView` | list of one of DEPARTMENT_KEYS | optional | at most 4 items; may be null |

### `PUT /departments/:id/people`

Replaces a department's `leadIds` and `memberIds` at once (people managers).

**Needs:** a seat that can write · permission `users.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `leadIds` | list of id | required | at most 50 items |
| `memberIds` | list of id | required | at most 5000 items |

### `PUT /departments/:id/members/:userId`

Adds one person with `role` `lead` or `member`, or changes their role. A department's lead may add members; making a lead needs a people manager.

**Needs:** a seat that can write

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `role` | one of lead \| member | required |  |

### `DELETE /departments/:id/members/:userId`

Takes one person out of a department.

**Needs:** a seat that can write

### `GET /departments/desks`

Boards in other departments that take requests through their form, with the form and the fields it asks. Send one with `POST /boards/:id/requests` and `fromTaskId` to link it to your own task; the other board stays closed to you.

### `GET /departments/moves`

Where each board went when departments came in, and why (`sprints`, `name`, `company`), and the people who could see a board before and are not yet members (`suggestions`). Administrators only.

**Needs:** permission `org.manage`

### `POST /departments/moves/accept`

Makes the suggested people members of their departments (`ids` from `suggestions`).

**Needs:** a seat that can write · permission `org.manage`

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `ids` | list of id | required | at least 1 items; at most 1000 items |

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
