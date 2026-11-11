---
title: Security and privacy
section: help
order: 9
summary: Company separation, sessions, the activity log, exporting and erasing personal data.
---
# Security and privacy

## Companies cannot see each other

Every query runs under row-level security rules in the database. One company's data cannot be read from another company's address, API or connector in any way. Role and field rules are enforced in the same layer.

## Sessions and devices

Sessions are bound to the device; a copied cookie does not work on another machine. Going over the device limit signs the oldest session out. See and end your sessions in Your settings → Devices.

## Activity log

Sign-ins, changes to people and roles, connections, API keys, webhooks and personal-data actions are written to the activity log, in Settings → Activity log.

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
| Undo data for imports | 30 days |
| Webhook delivery records | 7 days |
| Revoked API keys | 30 days |

## Stored secrets

Credentials for CRM and chat connections, and webhook signing secrets, are stored encrypted. Of API keys only a digest is kept: the key itself is shown once and can never be seen again.
