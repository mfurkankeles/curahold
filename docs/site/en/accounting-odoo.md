---
title: Odoo (accounting)
section: help
order: 8.23
summary: Connect Odoo read only: open balances, overdue invoices and payments on each customer's page.
---
# Odoo (accounting)

Customers, invoices and payments from Odoo Online, Odoo.sh or your own server.

## What is read

Customers (with tax number, email and web address where the program keeps them), invoices with their due date and what is still owed, and payments received. Curahold never writes to Odoo: it cannot create, change or delete anything there.

## Connecting

In **Settings → Data sources**, find **Accounting programs** and choose **Connect Odoo**. Then:

1. In Odoo, open your profile → Preferences → Account Security and create an API key.
2. Note your Odoo address and your login. On Odoo.sh or your own server, also the database name.
3. Enter them below. On Odoo Online, API access needs the Custom plan (Odoo's rule).

## Limits and timing

Odoo publishes no fixed limit; Curahold keeps to about two requests a second so a small server is never strained. Odoo 19 and later are read through the JSON-2 API; older versions through JSON-RPC (then the database name is needed). Changes are read every hour.

## If something goes wrong

If Odoo stops accepting the connection (a revoked key or sign-in), the connection is marked "Problem" in Settings → Connections and administrators are told once; choose **Reconnect** on its page. A rate-limit answer is not an error: the run stops, keeps its place and carries on next time.

## See also

- [Accounting programs](/docs/en/accounting/)
