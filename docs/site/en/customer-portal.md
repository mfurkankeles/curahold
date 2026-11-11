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

- An invitation works once, for 7 days. After that, people sign in whichever ways the company allows (below).
- An address that belongs to someone in your company cannot be invited; the portal is for customers.
- **Switch off** ends their access and open sessions at once.

## Ways to sign in

In **Settings → Customer portal → How customers sign in**, choose the ways that suit your customers:

| Way | How it works |
|---|---|
| **Email code and link** | One email with a six-digit code and a link, each working once for 30 minutes. The code lets someone read the email on their phone and sign in on their computer. |
| **Google** | Their company Google account. If their company closes the account, the portal is closed to them too. |
| **Microsoft** | Their Microsoft 365 account. The first Microsoft sign-in is confirmed once with an emailed code; after that the account itself is recognised. |
| **Passkey** | Fingerprint, face or device PIN. The safest way; people add one on **Your account** after a first sign-in. A passkey works only on that portal's address, never on a look-alike site. |
| **Password** | For customers who ask for one (off by default). At least 10 characters; five wrong tries lock it for 15 minutes; "Forgot your password?" resets it by email. |

- **Stay signed in for:** 1, 7, 30 (the default) or 90 days.
- **Sign-in notice:** after a sign-in with Google, Microsoft, a passkey or a password, the person gets a "new sign-in" email (can be switched off).
- Switching a way off ends the sessions opened with it; a shorter stay ends older sessions. At least one way in (email, Google, Microsoft or password) must stay on.
- The sign-in form never tells whether an address has access, and an address gets at most 5 emails an hour.
- On **Your account**, people add passkeys, set their password, unlink Google/Microsoft or sign out everywhere.

## Sharing tasks and replying

- Requests a customer opens are shared on their own.
- To show a task your team opened, tick **Shared with the customer** in the task panel (the task needs a customer, on a board that is open).
- On a shared task, choose **Internal note** (the default) or **Reply to customer** when you comment. Replies to the customer are marked with an orange line and "Customer sees", and are emailed to them.
- What customers write shows with a "Customer" label and reaches the task's assignees as a notification.
- When a task's customer changes, sharing is switched off on its own: one customer's conversation never moves to another.

## Limits

Each person can open up to 30 requests and write 200 replies a day.
