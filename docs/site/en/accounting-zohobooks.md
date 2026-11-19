---
title: Zoho Books (accounting)
section: help
order: 8.21
summary: Connect Zoho Books read only: open balances, overdue invoices and payments on each customer's page.
---
# Zoho Books (accounting)

Customers, invoices and payments from Zoho Books, in every Zoho data centre.

## What is read

Customers (with tax number, email and web address where the program keeps them), invoices with their due date and what is still owed, and payments received. Curahold never writes to Zoho Books: it cannot create, change or delete anything there.

## Connecting

In **Settings → Data sources**, find **Accounting programs** and choose **Connect Zoho Books**. Then:

1. Sign in with the Zoho account that can see your Zoho Books organisation.
2. Allow Curahold to read contacts, invoices and payments. It asks for read access only.
3. Back here, start the first read and check the customers it could not match.

## Limits and timing

Zoho allows 100 requests a minute per organisation and a daily allowance by your Zoho Books plan (1,000 a day on the free plan). Curahold stays under both and carries on in the next run if the day's allowance is used up. Changes are read every hour; a full read once a day.

## If something goes wrong

If Zoho Books stops accepting the connection (a revoked key or sign-in), the connection is marked "Problem" in Settings → Connections and administrators are told once; choose **Reconnect** on its page. A rate-limit answer is not an error: the run stops, keeps its place and carries on next time.

## See also

- [Accounting programs](/docs/en/accounting/)
