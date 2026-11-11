---
title: Customer portal
section: help
order: 12
summary: Opening boards to your customers; how they open requests and reply, and what they can never see.
---
# Customer portal

The customer portal opens chosen boards to your customers' people. They sign in at their own address (e.g. `acme.tendwell-portal.com`), see what is open for their company and where it stands, open new requests and reply.

## What a customer sees, and never sees

| Sees | Never sees |
|---|---|
| Their own company's tasks **shared with them** | Any task of another customer |
| Title, description, status (with the name you chose for the column) | Internal notes and internal comments |
| Comments written as **Reply to customer** | Your team, roles, other people |
| The details you allow on the board (due date, priority, who is working on it) | Customer fields, deals, health score, records |
| | Other boards, other companies, Tendwell itself |

The portal runs on a separate domain: the app's sessions, cookies and API cannot be reached from it at all. The database role behind portal requests can read no table; it can only call the portal functions, which return data for the signed-in person's own company.

## Turning it on (administrators)

1. **Settings → Customer portal → Customer portal is on.** The address your customers sign in at is shown there.
2. In the **settings of the board** you want to open → **Customer portal**:
   - **Open this board to customers**
   - **New requests land in:** pick a column. A new request is assigned to the customer's owner.
   - **What customers read for each column:** "Being reviewed" instead of "Waiting for legal", say. Left empty, the column's own name shows.
   - **Details customers see:** due date, priority, who is working on it.

Private boards cannot be opened. Turning the switch off closes the portal for everyone, at once.

## Inviting people

From **Settings → Customer portal → People who can sign in**, or the **Customer portal** section on a customer's page: a name and an email, then **Invite**. The customer's owner and administrators can invite.

- There are no passwords: people sign in with a link sent to their email. An invitation works for 7 days, a sign-in link for 30 minutes, each once.
- An address that belongs to someone in your company cannot be invited; the portal is for customers.
- **Switch off** ends their access and open sessions at once.

## Sharing tasks and replying

- Requests a customer opens are shared on their own.
- To show a task your team opened, tick **Shared with the customer** in the task panel (the task needs a customer, on a board that is open).
- On a shared task, choose **Internal note** (the default) or **Reply to customer** when you comment. Replies to the customer are marked with an orange line and "Customer sees", and are emailed to them.
- What customers write shows with a "Customer" label and reaches the task's assignees as a notification.
- When a task's customer changes, sharing is switched off on its own: one customer's conversation never moves to another.

## Limits

Each person can open up to 30 requests and write 200 replies a day. A sign-in link can be asked for up to 5 times an hour, and the sign-in form never tells whether an address has access.
