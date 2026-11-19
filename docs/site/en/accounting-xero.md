---
title: Xero (accounting)
section: help
order: 8.22
summary: Connect Xero read only: open balances, overdue invoices and payments on each customer's page.
---
# Xero (accounting)

Customers, sales invoices and payments from Xero.

## What is read

Customers (with tax number, email and web address where the program keeps them), invoices with their due date and what is still owed, and payments received. Curahold never writes to Xero: it cannot create, change or delete anything there.

## Connecting

In **Settings → Data sources**, find **Accounting programs** and choose **Connect Xero**. Then:

1. Sign in to Xero and pick the organisation to connect.
2. Allow read access to contacts and transactions; Curahold cannot change anything in Xero.
3. Back here, start the first read and check the customers it could not match.

## Limits and timing

Xero allows 60 calls a minute and a daily allowance per organisation (1,000 on Xero's free developer tier). Curahold paces itself below both and carries on in the next run when the day's allowance is reached. Changes are read every hour.

## If something goes wrong

If Xero stops accepting the connection (a revoked key or sign-in), the connection is marked "Problem" in Settings → Connections and administrators are told once; choose **Reconnect** on its page. A rate-limit answer is not an error: the run stops, keeps its place and carries on next time.

## See also

- [Accounting programs](/docs/en/accounting/)
