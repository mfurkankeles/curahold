---
title: Security and privacy
section: help
order: 10
summary: Company separation, sessions, the activity log, exporting and erasing personal data.
---
# Security and privacy

## Companies cannot see each other

Every query runs under row-level security rules in the database. One company's data cannot be read from another company's address, API or connector in any way. Role and field rules are enforced in the same layer.

## Sessions and devices

Sessions are bound to the device; a copied cookie does not work on another machine. Going over the device limit signs the oldest session out. See and end your sessions in Your settings → Devices.

## What is kept on the device

So that you can read without a connection, the app keeps a copy of the lists you last saw in the browser's own storage (your tasks, boards, customers, the inbox; not attachments, not settings). The copy stays on that device and in that browser and is sent nowhere. It is removed when you sign out, or at the first connection after your session was ended on the server. On a shared computer, sign out when you are done.

## Activity log

Sign-ins, changes to people and roles, connections, API keys, webhooks and personal-data actions are written to the activity log, in Settings → Activity log.

## Customer portal

The customer portal runs on a separate domain with its own sessions and cookie. The database role behind portal requests has no privileges on any table; it can only call functions that return the shared data of the signed-in person's own company. Details: [Customer portal](/docs/en/customer-portal/).

## Curahold support's access

Curahold support only comes into a company with a person's consent: they tick the box on a help request and choose for how long (24 hours to 7 days). Support sees what that person sees and, by default, can only look; only administrators can allow changes. Access can be closed at any moment. Every visit, and every change made with permission, is written to the activity log with the support person's name. Administrators can limit this to administrators or turn it off in **Settings → Security → Support access**. Details: [Getting help](/docs/en/getting-help/).

## Personal data

In Settings → People, a person's menu offers:

- **Download their data:** everything about that person in one file.
- **Erase their personal data:** name and email are removed; the work they did stays, anonymised. Hand their customers and open tasks to someone else first.

## How long things are kept

| Data | Kept for |
| --- | --- |
| Notifications | 90 days |
| Ended sessions | 90 days |
| Sync history | 90 days |
| Deleted customers, records, tasks and the rest, in the [trash](/docs/en/trash/) | 30 days, then erased with their files; an administrator can erase sooner |
| Undo data for imports | 30 days |
| Webhook delivery records | 7 days |
| Revoked API keys | 30 days |

## Stored secrets

Credentials for CRM and chat connections, and webhook signing secrets, are stored encrypted. Of API keys only a digest is kept: the key itself is shown once and can never be seen again.
