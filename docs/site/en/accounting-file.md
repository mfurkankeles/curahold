---
title: Accounting: a file from any other program
section: help
order: 8.29
summary: Logo, Mikro, Tally, SAP Business One or any program: upload customers, invoices and payments as Excel or CSV.
---
# Accounting: a file from any other program

Programs without an open API — Logo, Mikro, Tally, SAP Business One and the rest — connect with a file. The figures then work exactly like a connected program's: the customer page, matching and the health score.

## Steps

1. In **Settings → Data sources → Accounting programs**, choose **Upload a file**.
2. On the **Upload** tab, download the **Template** for customers, invoices and payments.
3. Export the same from your program and put it in the template's columns (Excel or CSV; extra columns are ignored).
4. Upload customers first, then invoices, then payments.

## The columns

| File | Columns |
| --- | --- |
| Customers | customer_id, name, tax_id, email, website, currency, balance |
| Invoices | invoice_id, customer_id, number, issued_on, due_on, currency, total, balance, status |
| Payments | payment_id, customer_id, invoice_id, paid_on, amount, currency |

Dates as YYYY-MM-DD. `status` may be open, paid, void or draft (also ödendi, açık, iptal…); left empty, an invoice with something still owed counts as open.

## Fresher figures

Upload a new file whenever you want: it replaces the previous one of the same kind. Matches you made by hand are kept. A file is never sent anywhere else.
