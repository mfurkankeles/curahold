---
title: Paraşüt (accounting)
section: help
order: 8.25
summary: Connect Paraşüt read only: open balances, overdue invoices and payments on each customer's page.
---
# Paraşüt (accounting)

Customers, sales invoices and payments from Paraşüt.

## What is read

Customers (with tax number, email and web address where the program keeps them), invoices with their due date and what is still owed, and payments received. Curahold never writes to Paraşüt: it cannot create, change or delete anything there.

## Connecting

In **Settings → Data sources**, find **Accounting programs** and choose **Connect Paraşüt**. Then:

1. Ask Paraşüt support for API access for your company; they send a client ID and a client secret.
2. Your company number is in the address bar after uygulama.parasut.com/.
3. Enter them with a Paraşüt user's email and password. The password is used once to get a key and is not stored.

## Limits and timing

Paraşüt allows about 10 requests every 10 seconds and returns 25 rows a page; it has no "changed since" filter, so each run reads the lists whole. For a small business this is a few dozen pages. Amounts are read in the invoice's currency (TRY, USD, EUR, GBP).

## If something goes wrong

If Paraşüt stops accepting the connection (a revoked key or sign-in), the connection is marked "Problem" in Settings → Connections and administrators are told once; choose **Reconnect** on its page. A rate-limit answer is not an error: the run stops, keeps its place and carries on next time.

## See also

- [Accounting programs](/docs/en/accounting/)
