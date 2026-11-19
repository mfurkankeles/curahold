---
title: Accounting programs
section: help
order: 8.2
summary: Read-only connections to accounting programs: who owes what, on the customer page and in the health score.
---
# Accounting programs

Connect your accounting program and each customer's page shows what they owe: the open balance, what is overdue and for how long, the last payment and the invoices. Late payments can count in the health score. Curahold only reads: nothing is ever written to the program.

## Which programs

| Program | How it connects | Page |
| --- | --- | --- |
| Zoho Books | Sign in with Zoho | [Zoho Books](/docs/en/accounting-zohobooks/) |
| Xero | Sign in with Xero | [Xero](/docs/en/accounting-xero/) |
| Odoo | Address, login and API key | [Odoo](/docs/en/accounting-odoo/) |
| freee | Sign in with freee | [freee](/docs/en/accounting-freee/) |
| Paraşüt | Company number, API client and a user | [Paraşüt](/docs/en/accounting-parasut/) |
| QuickBooks Online | Sign in with Intuit | [QuickBooks Online](/docs/en/accounting-quickbooks/) |
| Any other (Logo, Mikro, Tally, SAP Business One…) | An Excel or CSV file | [A file](/docs/en/accounting-file/) |

## Matching customers

Each customer in the accounting program is matched to one customer in Curahold: first by tax number, then by web address or email domain, then by name (company forms such as Ltd., A.Ş. or 株式会社 are ignored). When exactly one customer fits, the match is made; when none or several fit, it waits on the **Matching** tab of the connection. There you can choose the customer, or leave it out. Matches you make by hand are kept.

## Who sees the figures

Amounts are shown to roles with **See finance figures** (administrators and managers to start with; change it in Settings → Roles). Everyone else who sees the customer sees only, inside the health score, how many days a payment is late — never an amount.

People in the **Finance** department see the amounts too, whatever their role, and so do the departments chosen under **Who sees Finance on the customer page** in Settings → Departments. Switching Finance off takes this away.

## Late payments in the health score

When you start the first read you can tick **Count late payments in the health score**. The signal **Payments on time** gives full points when nothing is overdue and none when the oldest unpaid invoice is 60 days late; both numbers can be changed in Settings → Health score. Customers not matched to the program are left out of it.

## Connection health

Accounting connections appear in Settings → Connections with the others: working, a problem, or paused, and when they last worked.
