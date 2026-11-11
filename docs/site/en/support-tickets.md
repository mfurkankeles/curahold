---
title: Support tickets (Zendesk, Freshdesk, any tool)
section: developers
order: 5
summary: Connecting support tools, Salesforce and Dynamics cases, and sending tickets through the API or an inbound address.
---
# Support tickets

Support tickets in Tendwell are records of the **Support ticket** kind, each under a customer. They show on the customer page and timeline, feed customer fields such as open tickets, and count in the health score as the **Support load** signal.

There are three ways to bring them in:

| Way | For |
| --- | --- |
| Ready connection | Zendesk, Freshdesk, Intercom, Jira Service Management |
| CRM cases | Salesforce Case and Dynamics 365 Case (incident) |
| API or inbound address | Any other tool: your own helpdesk, forms, Zapier or Make |

## Ready connections

Settings → CRMs and spreadsheets → **Support tools**. Paste the tool's address and an API key you create in the tool. Tendwell tries the key straight away and stores it encrypted. No app registration, no approval.

| Tool | You need | Comes over |
| --- | --- | --- |
| Zendesk | Address, agent email, API token | Tickets, organizations |
| Freshdesk | Address, API key | Tickets, companies |
| Intercom | Region, access token | Conversations, companies |
| Jira Service Management | Atlassian address, agent email, API token | Service desk requests, organizations |

These connections **only read**. Nothing changed in Tendwell is written to the support tool.

### How the customer is found

1. The ticket's organization (or company), once it has been matched to a customer.
2. An organization matches a customer in Tendwell with the same **name** or **web address**.
3. A ticket with no organization goes to the customer whose web address is the requester's **email domain**. Public email providers such as Gmail or Outlook are not used.

By default only **existing customers** are linked: an organization that matches nobody is not added as a new customer, and a ticket whose customer cannot be found is left out. A matched organization's name never renames the customer in Tendwell.

States and priorities fold into Tendwell's own:

| Tendwell | Examples |
| --- | --- |
| Open | new, open, Working, Escalated |
| Waiting | pending, hold, snoozed, Waiting for customer |
| Solved | solved, resolved, Problem Solved, done |
| Closed | closed, cancelled, merged |

Priorities: Low, Normal, High and Urgent. Values like "Highest", "Critical" and "P1" become Urgent.

## Salesforce and Dynamics cases

In a connected Salesforce or Dynamics 365 sync, switch on the **Case** object and map it to **Support tickets**. Subject, status, priority, origin, the opened and closed dates and the customer are matched for you.

## Sending through the API

With an [API key](/docs/en/api-keys/) that can make changes, send the same ticket as often as you like. The first time creates it; after that it updates:

```bash
curl -X PUT https://yourcompany.tendwell.com/api/tickets/my-helpdesk/4711 \
  -H "Authorization: Bearer $TENDWELL_KEY" -H "Content-Type: application/json" \
  -d '{
    "subject": "Report export fails",
    "status": "open",
    "priority": "high",
    "requester": "selin@quillfield.example",
    "openedAt": "2026-11-11T09:30:00Z",
    "url": "https://help.example.com/t/4711",
    "account": { "domain": "quillfield.example" }
  }'
```

In the address, `my-helpdesk` names the source (lower case, digits, hyphens) and `4711` is the ticket's id there.

| Field | Required | Note |
| --- | --- | --- |
| `subject` | Yes | The ticket's title |
| `status` | No | Any text; folded as in the table above |
| `priority` | No | Any text |
| `openedAt`, `solvedAt` | No | ISO 8601 or `YYYY-MM-DD` |
| `requester` | No | The requester's email; also helps find the customer |
| `channel` | No | Email, phone, chat… |
| `url` | No | The ticket's `https` address in its tool |
| `account` | No | `{ "id" }`, `{ "domain" }` or `{ "name" }` |

The customer is found by, in order: `account.id`, `account.domain`, the requester's email domain, `account.name`. If none fits, the answer is `400` and nothing is saved.

## Inbound address (webhook)

For tools that cannot add authentication of their own: Settings → Developers → **Support tickets from other tools** → **Create an address**. The address is shown once and works as a password. Add `source` and `externalId` to the body and send the same fields:

```bash
curl -X POST "https://yourcompany.tendwell.com/api/inbound/tickets/<token>" \
  -H "Content-Type: application/json" \
  -d '{ "source": "forms", "externalId": "77", "subject": "Feature request", "account": { "name": "Velto Mobility" } }'
```

| Answer | Meaning |
| --- | --- |
| `201` / `200` | Created / updated |
| `400` | The body is not valid |
| `404` | Wrong or turned-off address |
| `422` | No customer matches |

Replacing the address retires the old one at once.

> **Tip:** Zendesk triggers and webhooks, or Freshdesk automations, can post to this address too. Do not use it together with the ready connection for the same tool, or tickets appear twice.
