# Curahold connector for Looker Studio

A Looker Studio community connector (Google Apps Script) that reads the
analytics feed's JSON face with an analytics key. Two files: `Code.gs` and
`appsscript.json`. It only calls `GET /api/analytics/v1/…` of the address the
person types, with their key as a Bearer token; it stores the address and key
in that person's own Apps Script user properties.

What the person does: open the connector link, type the company address
(`acme.curahold.com`) and an analytics key, pick a dataset (one table per data
source; blend them on their `Id` columns), optionally "Changed since".

Types: numbers become metrics; `Date` → YEAR_MONTH_DAY, `DateTimeOffset` →
YEAR_MONTH_DAY_SECOND (UTC); everything else is text. One data source reads at
most 200,000 rows (Apps Script's six-minute limit); a bigger dataset is
narrowed with "Changed since" or a key limited to fewer datasets.

## Deploying it (owner action, free)

Until this is done the docs call the connector "coming soon" and point to the
Google Sheets `IMPORTDATA` path.

1. With Curahold's own Google account: <https://script.google.com> → New
   project → name it `Curahold for Looker Studio`.
2. Project settings → tick "Show appsscript.json". Paste `appsscript.json` and
   `Code.gs` over the defaults. Replace `logoUrl`, `addonUrl` and `supportUrl`
   if the domain differs.
3. Deploy → New deployment → type "Add-on" is not needed: choose **Deploy →
   Test deployments** to try it, then **New deployment** for a versioned one.
   Copy the deployment id.
4. The direct link for customers is
   `https://lookerstudio.google.com/datasources/create?connectorId=<deployment id>`.
   Put it in `docs/site/*/bi-tools.md` (Looker Studio section) and drop the
   "coming soon" sentence.
5. Try it once with a demo company and a key limited to `Customers`: the
   Recent reads list in Settings → Analytics and BI shows the read with the tool
   "Looker Studio".

Listing it in the Looker Studio gallery ("Partner connector") needs Google's
OAuth app verification, hosted privacy, terms and support pages on Curahold's
domain, and a review request; no fee is documented. That is a later step.
