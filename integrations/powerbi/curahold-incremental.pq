// Power Query (M) for a Curahold dataset with incremental refresh in Power BI.
//
// 1. Power BI Desktop: Transform data → Manage parameters → add RangeStart and
//    RangeEnd (type Date/Time), as Power BI's incremental refresh requires.
// 2. New source → Blank query → Advanced editor → paste this, change the
//    address and the dataset (Tasks here).
// 3. Sign in with Basic (any user name, the analytics key as the password).
// 4. Close & apply, then set the table's incremental refresh policy and tick
//    "Detect data changes" with the ModifiedAt column.
//
// Partitions are by CreatedAt (a row never moves between them); ModifiedAt tells
// Power BI which older partitions changed and must be read again. The range is
// put into the feed address, so Curahold filters before sending (an OData
// DateTimeOffset literal, in UTC). Datasets without CreatedAt (HealthHistory,
// SprintBurndown: use Day; TaskAssignees: refresh whole) are small enough to
// read in full.
let
    Address = "https://your-company.curahold.com/api/analytics/odata/",
    Dataset = "Tasks",
    Start = DateTime.ToText(RangeStart, "yyyy-MM-ddTHH:mm:ss") & "Z",
    End = DateTime.ToText(RangeEnd, "yyyy-MM-ddTHH:mm:ss") & "Z",
    Source = OData.Feed(
        Address & Dataset & "?$filter=CreatedAt ge " & Start & " and CreatedAt lt " & End,
        null,
        [Implementation = "2.0"]
    )
in
    Source
