---
title: QuickBooks Online (accounting)
section: help
order: 8.26
summary: Connect QuickBooks Online read only: open balances, overdue invoices and payments on each customer's page.
---
# QuickBooks Online (accounting)

Customers, invoices and payments from QuickBooks Online.

## What is read

Customers (with tax number, email and web address where the program keeps them), invoices with their due date and what is still owed, and payments received. Curahold never writes to QuickBooks Online: it cannot create, change or delete anything there.

## Connecting

In **Settings → Data sources**, find **Accounting programs** and choose **Connect QuickBooks Online**. Then:

1. Sign in to Intuit and choose the QuickBooks company to connect.
2. Allow access to accounting data; Curahold reads customers, invoices and payments only.
3. Back here, start the first read and check the customers it could not match.

## Limits and timing

Intuit allows 500 requests a minute per company and charges app makers for reads above its free tier, so Curahold asks only for what changed since the last run, in pages of 1,000. Changes are read every hour; a full read once a day.

## If something goes wrong

If QuickBooks Online stops accepting the connection (a revoked key or sign-in), the connection is marked "Problem" in Settings → Connections and administrators are told once; choose **Reconnect** on its page. A rate-limit answer is not an error: the run stops, keeps its place and carries on next time.

## See also

- [Accounting programs](/docs/en/accounting/)
