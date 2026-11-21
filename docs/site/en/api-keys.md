---
title: API keys
section: developers
order: 2
summary: Making a personal key, read or write rights, expiry and revoking.
---
# API keys

An API key is a password that works as one person. Everyone makes their own; an admin cannot make keys for someone else.

## Making a key

1. In Curahold, open **Your settings**.
2. Under **API keys and connected apps**, choose **New API key**.
3. Name it, tick **Can make changes** if it needs to, and choose how long it is valid (30, 90 or 365 days, or no end date).
4. The key starts with `chk_` and is shown **only once**. Keep it in a password manager.

## Using it

Send it in the `Authorization` header of every request:

```bash
curl https://yourcompany.curahold.com/api/me \
  -H "Authorization: Bearer chk_..."
```

Requests with a key are handled as requests by the key's owner: the same customers are visible, the same fields are closed.

## Read and write

- **Read only** (the default): `GET` requests work; anything else returns `403 read_only_token`.
- **Reads and changes:** can create and update tasks, customers and records. People on a viewer seat cannot make writing keys.

A key can never: make another key, give an app OAuth consent, or use "See it as them".

## What only a signed-in person can do

Whatever a key or an app was allowed, it gets `403 session_required` on administration (roles, people, removing someone
or exporting their data, company deletion, domains, the activity log, security settings), single sign-on and SCIM,
billing, API keys, connected chat apps and CRMs, your own sign-in security and sessions, and support
access. The same goes for anything that needs an administrator's permission (company, people and teams, the
activity log, privacy, customer settings and imports, automations, connections), wherever it is: those need you,
signed in, and some ask you to confirm it is you. The one exception is subscribing a webhook (`/api/dev/webhooks`).

## Limiting a key to areas

A key made through the API (`POST /api/dev/keys`) can carry `areas`, each read or write: `work` (boards, tasks, pages,
automations), `customers` (customers, records, tickets, the portal, onboarding), `reports` (reports, search, exports,
analytics) `people` (the people list and your own profile) and `webhooks` (subscribing outgoing webhooks, as automation
platforms do). For example `"areas": ["work:write", "customers:read"]`.
Anything outside them returns `403 token_scope`; `GET /api/me` always works. A write grant needs **Can make changes**.
Without `areas` a key reaches every area.

## Revoking and oversight

- See your keys in Your settings and **Revoke** any of them; it stops working at once.
- Admins who manage people see every key and connected app in the company under Settings → Developers, and can revoke them.
- Each key shows when it was last used. Making and revoking keys is written to the activity log.
- When someone leaves and is deactivated, their keys stop working too.

> **Security:** Keep keys out of code; use an environment variable. If one may have leaked, revoke it and make a new one. Curahold does not keep the key itself, only a digest of it.
