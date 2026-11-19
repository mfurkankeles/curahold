---
title: freee (accounting)
section: help
order: 8.24
summary: Connect freee read only: open balances, overdue invoices and payments on each customer's page.
---
# freee (accounting)

Partners (取引先) and sales deals from freee Accounting.

## What is read

Customers (with tax number, email and web address where the program keeps them), invoices with their due date and what is still owed, and payments received. Curahold never writes to freee: it cannot create, change or delete anything there.

## Connecting

In **Settings → Data sources**, find **Accounting programs** and choose **Connect freee**. Then:

1. Sign in to freee and choose the company (事業所) to connect.
2. Allow access; Curahold only reads partners and sales deals.
3. Back here, start the first read and check the customers it could not match.

## Limits and timing

Curahold keeps to under one request a second. Partners are read whole each time (freee has no "changed since" filter for them); deals changed on or after the last run's day are read again. Amounts are in yen.

## If something goes wrong

If freee stops accepting the connection (a revoked key or sign-in), the connection is marked "Problem" in Settings → Connections and administrators are told once; choose **Reconnect** on its page. A rate-limit answer is not an error: the run stops, keeps its place and carries on next time.

## See also

- [Accounting programs](/docs/en/accounting/)
