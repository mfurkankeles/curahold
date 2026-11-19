# Warehouse export (BigQuery, Snowflake) — design note, not built

Status: later step (research R2, build order step 5). Today Curahold's BigQuery
and Snowflake adapters (`api/src/sync/adapters/bigquery.ts`, `snowflake.ts`) are
**inbound only**; nothing is written to a warehouse. This note fixes the shape so
the build is small when it comes.

## Why
Looker (LookML), Metabase and Superset read databases only; some customers want
Curahold next to their other data. The analytics feed covers every tool that
reads OData or JSON; the export covers the rest.

## Shape
- **Same rows as the feed.** The export runs `catalog()` + `readPage()` from
  `api/src/lib/analytics.ts` as the person who set it up (their row-level
  security and field rules), so it can never hold more than that person's
  analytics key would. One table per dataset, same column names and types
  (Edm → BigQuery: STRING, NUMERIC, FLOAT64, INT64, BOOL, DATE, TIMESTAMP;
  Snowflake: VARCHAR, NUMBER, FLOAT, BOOLEAN, DATE, TIMESTAMP_TZ).
- **Incremental, by ModifiedAt.** Each run reads `ModifiedAt ≥ last watermark − 5 min`
  (the feed's delta token) and MERGEs on `Id` (BigQuery `MERGE` from a load job into a
  staging table; Snowflake `MERGE` from a stage). `IsDeleted` rows stay as tombstones;
  hard deletes are caught by a weekly full reload of each table.
- **Auth reused.** Google service-account JWT and Snowflake key-pair JWT already
  exist in the adapters; the customer gives a dataset/schema and credentials in
  Settings → Analytics and BI (sealed like other connection secrets).
- **Schedule.** The existing scheduler (`lib/scheduler.ts`), hourly by default,
  one company at a time, with the analytics daily row budget counting exported rows.
- **Audit.** One `analytics.export` activity line per run (tables, rows, duration);
  runs listed with the feed's pulls.
- **Self-hosted (5b).** A documented set of read-only SQL views over the same
  columns, for installs that own their database.

## Not decided (owner)
Which plans include it; whether exported rows count against the same daily
budget; Snowflake before or after BigQuery (research: BigQuery first).
