---
title: Connect your own tool
section: developers
order: 8
summary: Keep Curahold in step with a system that is not on the list of connections.
---
# Connect your own tool

Curahold connects to the common CRMs, spreadsheets and support desks itself (Settings → CRMs). For everything else, in-house systems included, the same result takes a small script and the API. This page shows the patterns that work.

## Which way does the data go?

| You want | Use |
| --- | --- |
| Customers from your system into Curahold | [Import as an upsert](#customers-in-keyed-by-your-own-id) |
| Support tickets from your desk | [`PUT /tickets`](#tickets-in) |
| Calls, emails or meetings logged elsewhere | [`POST /accounts/{id}/activities`](#activities-in) |
| Tasks opened by another system | `POST /tasks` with an `Idempotency-Key` |
| Changes in Curahold sent to your system | [Webhooks](#changes-out) |
| No code at all | [Zapier, Make and spreadsheets](#without-code) |

## Customers in, keyed by your own id

`POST /accounts/import` takes rows and a mapping from your column names to Curahold's fields. Name the column that holds **your** id as `externalId`: a row whose id Curahold has seen before updates that customer, a new id adds one. Sending the same rows again changes nothing, so the script can run every hour.

```bash
curl -X POST $CURAHOLD/accounts/import \
  -H "Authorization: Bearer $CURAHOLD_KEY" -H "Content-Type: application/json" \
  -d '{
    "rows": [
      { "id": "C-1041", "company": "Harborline Bank", "owner": "ada@yourcompany.com", "arr": 126000, "renews": "2027-03-01" },
      { "id": "C-1042", "company": "Northfield Foods", "owner": "mert@yourcompany.com", "arr": 48000, "renews": "2027-06-15" }
    ],
    "mapping": {
      "name": "company",
      "externalId": "id",
      "owner": "owner",
      "fields": { "arr": "arr", "renewal_date": "renews" }
    }
  }'
```

The answer counts what was created, updated and skipped, lists rows that could not be read (`errors`) and owners it could not find (`unmatchedOwners`). Up to 5,000 rows per request; send larger sets in parts. The key's owner needs the permission to manage customers and to see all of them.

Field keys on the left of `fields` are the ones in `org.accountFields` of `GET /me`. Owners are matched by email, then by name.

An import can be undone for 30 days: `POST /imports/{batch}/undo` with the `batch` of the answer.

## Tickets in

One call per ticket, addressed by your desk's name and the ticket's id there. Sending it again updates the same ticket; only what you send changes.

```bash
curl -X PUT $CURAHOLD/tickets/helpdesk/48213 \
  -H "Authorization: Bearer $CURAHOLD_KEY" -H "Content-Type: application/json" \
  -d '{"subject":"Export fails for large files","status":"open","priority":"high","account":{"name":"Harborline Bank"},"openedAt":"2026-11-10"}'
```

If your desk can call a web address but cannot send a header, turn on the inbound address in Settings → Developers and post the same body there; the secret is part of the address.

## Activities in

A call, an email or a meeting that happened in another tool belongs on the customer's timeline:

```bash
curl -X POST $CURAHOLD/accounts/<customer id>/activities \
  -H "Authorization: Bearer $CURAHOLD_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: call-2026-11-10-7781" \
  -d '{"kind":"call","body":"Walked through the renewal quote; legal review next week.","happenedAt":"2026-11-10T14:30:00Z"}'
```

Use something stable from your side as the `Idempotency-Key` (the call's own id), so a run that is repeated does not log it twice. Keys are remembered for two days.

## Changes out

Add a [webhook](/docs/en/webhooks/) for the events you care about. Each message carries the thing as it looks now, so most receivers need no second request. Messages can arrive twice and out of order: drop repeats by `id`, and let the newer `occurredAt` win.

## Both ways

When the same thing can change on both sides:

1. Keep a table of pairs on your side: your id ↔ Curahold's id.
2. Read before you write. For tasks, send the `version` you read as `baseVersion`; a `409` means someone changed it meanwhile and carries the current task.
3. Do not echo: when your own change comes back to you as a webhook, compare it with what you sent and stop there.
4. Send every change with an `Idempotency-Key`, so a retry after a dropped connection is harmless.

## Without code

- **Zapier, Make, n8n and similar:** use their generic "HTTP request" and "webhook" steps with an API key. A Curahold webhook starts the flow; an HTTP step with `Authorization: Bearer chk_…` writes back.
- **Spreadsheets:** Google Sheets and Excel connect directly in Settings → CRMs; any tool that can export to a sheet can be kept in step that way.
- **CSV:** every list in Curahold has an import that remembers its mapping.

## What to keep in mind

- A key acts as a person. Give the integration its own person with the narrowest role that does the job, so its changes are easy to recognise in the history.
- Dates are `YYYY-MM-DD` and mean the company's own day; moments are ISO 8601 in UTC.
- Every address and field is in the [reference](/docs/en/ref-customers/); every error code in [errors](/docs/en/ref-errors/).
