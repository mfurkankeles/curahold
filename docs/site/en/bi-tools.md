---
title: Connect a BI tool
section: help
order: 8.5
summary: Power BI, Excel, Fabric, Tableau, Looker Studio, Qlik, Zoho Analytics and others, step by step, with an analytics key.
---
# Connect a BI tool

Curahold has one read-only **analytics feed** for BI tools. Power BI, Excel, Microsoft Fabric, Tableau, Qlik and Zoho Analytics read it as an **OData feed**; Looker Studio, scripts and other tools read the same data as **JSON or CSV**. Nothing in Curahold can be changed through it.

## Before you start

1. Open **Settings → Analytics and BI**. You need the permission to export data (administrators and managers have it).
2. Choose **New analytics key**. Give it a name (for example "Power BI sales dashboard"), choose the datasets and departments it may read, and an end date.
3. Copy the key now: it is shown only once. It starts with `chb_`.
4. Copy the address you need from the same page:
   - OData feed: `https://your-company.curahold.com/api/analytics/odata/`
   - JSON and CSV: `https://your-company.curahold.com/api/analytics/v1/`

When a tool asks how to sign in, choose **Basic**: type anything as the user name and paste the key as the password.

The key reads exactly what you see in Curahold: the same customers, boards and fields. A field your role cannot see is not even a column. If you leave the company or lose the export permission, the key stops. **Replace secret** gives the same key a new value; **Revoke** ends it at once.

## Datasets

| Dataset | What is in it |
| --- | --- |
| `Customers` | One row per customer, with every customer field you may see as its own column |
| `Renewals` | Customers with a renewal date: value, health and open renewal deals |
| `HealthHistory` | The health score of each customer on each day |
| `Opportunities` | Your pipeline: amount, stage, status, close date |
| `Tickets` | Support tickets |
| `Contacts` | Contacts at your customers |
| `Records…` | One dataset per record type you added (agreements, risks…) |
| `Boards`, `Tasks`, `TaskAssignees` | Boards, their tasks, and one row per task and assignee |
| `Sprints`, `SprintBurndown` | Sprints, and scope and remaining work per day |
| `People` | Name and role, to put names on owner and assignee ids |

Every dataset has `Id` and `ModifiedAt` (when the row last changed). Most also have `IsDeleted`: archived rows stay in the feed with `IsDeleted = true`, so a refresh can remove them from your reports. Join datasets on their id columns: `Tasks.CustomerId` → `Customers.Id`, `Tasks.BoardId` → `Boards.Id`, `OwnerId` → `People.Id`.

## Power BI

1. In Power BI Desktop choose **Get data → OData feed**.
2. Paste the OData address and choose **OK**.
3. Choose **Basic**. User name: anything. Password: your analytics key. Choose **Connect**.
4. Tick the datasets you want in the Navigator and choose **Load** (or **Transform data** to remove columns first).
5. After publishing, open the semantic model's **Settings → Data source credentials**, choose **Basic** again with the key, and turn on **scheduled refresh**.

If the Power BI service asks for a gateway for Basic sign-in, use the key as a **Web API key** instead: in **Transform data → Advanced editor** write the source as `OData.Feed("https://your-company.curahold.com/api/analytics/odata/Tasks", null, [ApiKeyName = "key", Implementation = "2.0"])`, then pick **Web API** and paste the key when Power BI asks.

**Large datasets.** For incremental refresh, put the range in the address so Curahold filters before sending:

```
let
    Start = DateTime.ToText(RangeStart, "yyyy-MM-ddTHH:mm:ss") & "Z",
    End = DateTime.ToText(RangeEnd, "yyyy-MM-ddTHH:mm:ss") & "Z",
    Source = OData.Feed("https://your-company.curahold.com/api/analytics/odata/Tasks?$filter=CreatedAt ge " & Start & " and CreatedAt lt " & End, null, [Implementation = "2.0"])
in
    Source
```

Then set the incremental refresh policy on the table as usual, and tick **Detect data changes** with the `ModifiedAt` column, so a period whose rows changed is read again.

## Excel

1. In Excel for Windows choose **Data → Get Data → From Other Sources → From OData Feed**.
2. Paste the OData address and choose **OK**.
3. Choose **Basic**, type any user name and paste the key as the password, then **Connect**.
4. Pick the datasets in the Navigator and choose **Load**.
5. **Data → Refresh All** fetches the latest data whenever you want it.

## Microsoft Fabric

1. In your workspace choose **New item → Dataflow Gen2**, then **Get data → OData**.
2. Paste the OData address. Under connection credentials choose **Basic**, any user name and the key as the password.
3. Pick the datasets, shape them if needed, and add a **data destination** (a lakehouse or warehouse).
4. **Publish**, then set a refresh schedule on the dataflow.

A data pipeline's **Copy activity** can read the same feed with its OData connector and Basic sign-in.

## Tableau

1. In Tableau Desktop choose **Connect → To a Server → OData**.
2. As the server, paste the address of one dataset, for example `https://your-company.curahold.com/api/analytics/odata/Customers`.
3. Choose **Use username and password**: any user name, the key as the password. Choose **Sign In**.
4. Tableau reads OData as an **extract**. Add another OData connection for each dataset you want and relate them on their id columns.
5. When you publish to Tableau Cloud or Server, embed the credentials and set an extract refresh schedule.

## Looker Studio

Looker Studio needs a connector to read a feed like this. **Curahold's own Looker Studio connector is coming soon.** Until then:

1. In a new Google Sheet, write in cell A1: `=IMPORTDATA("https://your-company.curahold.com/api/analytics/v1/Customers.csv?limit=5000&key=YOUR-KEY")`.
2. In Looker Studio choose **Create → Data source → Google Sheets** and pick that sheet.
3. Make a key only for this, limited to the datasets the sheet needs: anyone who can edit the sheet can see the key in the formula. Revoke it in Curahold if the sheet is shared too widely.

You can also keep a sheet up to date with **CRMs and spreadsheets** (Settings → CRMs and spreadsheets) and use that sheet in Looker Studio.

## Qlik

1. In Qlik Sense or Qlik Cloud choose **Add data → OData** (or **Create new connection → OData**).
2. Paste the OData address, choose **Basic** authentication, any user name and the key as the password.
3. Pick the datasets and load them; schedule the reload in the app's settings.

Qlik's REST connector also works with the JSON address (`…/api/analytics/v1/Customers.json`), with Basic sign-in and "next URL" paging on the `next` field.

## Zoho Analytics

1. Choose **Create → New Workspace → Web URL / Feeds** (import from a web feed).
2. Paste the address of one dataset: the OData address (`…/api/analytics/odata/Customers`) or the CSV one (`…/api/analytics/v1/Customers.csv`).
3. Under authentication choose **Basic**: any user name, the key as the password.
4. For paging choose **next page URL**: `@odata.nextLink` for OData, `next` for JSON.
5. Set how often the import repeats.

## Metabase / Superset

Metabase and Superset read databases, not web feeds. A direct connection comes with Curahold's **warehouse export** (to BigQuery or Snowflake), which is coming soon. Until then, upload a CSV from `…/api/analytics/v1/<dataset>.csv` where your setup allows file uploads.

## Other tools and scripts

The JSON and CSV address takes:

| Option | Meaning |
| --- | --- |
| `limit` | Rows per page, up to 5000 (1000 by default) |
| `page` or `offset` | Page by number or by row |
| `cursor` | The `next` value of the previous page (fastest for big datasets) |
| `since` | Only rows changed at or after this date or time, e.g. `2026-11-01` |
| `fields` | Only these columns, e.g. `Id,Name,ModifiedAt` |
| `filter`, `orderby` | The same expressions as OData `$filter` and `$orderby` |
| `count=1` | Also return the total number of rows |

Send the key as Basic (password) or as `Authorization: Bearer chb_…`. A JSON page looks like `{ "dataset": "Tasks", "rows": [...], "next": "…" }`; CSV pages give the next address in the `Link` header. Tools such as Domo, SAP Analytics Cloud, Quick BI and FineBI read the JSON or OData address the same way.

The OData feed understands `$select`, `$filter` (`eq ne gt ge lt le`, `and`, `or`, `not`, `contains`, `startswith`, `endswith`), `$orderby`, `$top`, `$skip`, `$count` and `/$count`. It does not offer `$expand`: join datasets on their id columns instead.

## Refreshing and limits

- Big datasets come in pages of 1,000 rows; BI tools follow the next-page link on their own.
- **Changes only:** filter on `ModifiedAt` (`$filter=ModifiedAt ge 2026-11-01T00:00:00Z`) or use `since` in JSON. With the header `Prefer: odata.track-changes`, the last page also gives a `@odata.deltaLink` that later returns only what changed.
- Each key can make about two requests a second, and each company has a daily row budget. Over it, the feed answers 429 and says when to try again.
- Every read is written down (who, which key, which dataset, how many rows) and shown under **Recent reads** in Settings.

## When something goes wrong

- **401 / the tool asks for credentials again:** the key is wrong, revoked or past its end date, or the user name field was left empty in a tool that needs one: type anything there.
- **403:** the key's owner no longer has the permission to export data.
- **404 for a dataset:** the key is limited to other datasets or departments, or the dataset's fields are closed to the owner's role.
- **400 with a message:** the query uses something the feed does not support; the message names it.
