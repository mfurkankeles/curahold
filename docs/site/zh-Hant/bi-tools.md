---
title: 連接 BI 工具
section: help
order: 8.5
summary: 用分析金鑰一步步連接 Power BI、Excel、Fabric、Tableau、Looker Studio、Qlik、Zoho Analytics 等工具。
---
# 連接 BI 工具

Curahold 為 BI 工具提供一個唯讀的**分析資料來源**。Power BI、Excel、Microsoft Fabric、Tableau、Qlik 和 Zoho Analytics 以 **OData 資料來源**的形式讀取它；Looker Studio、指令碼和其他工具則以 **JSON 或 CSV** 取得同樣的資料。透過它無法修改 Curahold 中的任何內容。

下文中的選單名稱取自各工具的英文介面，使用中文介面時請選擇對應的項目。

## 開始之前

1. 開啟 **設定 → 分析與 BI**。你需要擁有匯出資料的權限（管理員和經理預設擁有）。
2. 選擇 **新增分析金鑰**。取一個名稱（例如「Power BI 銷售儀表板」），選擇它可以讀取的資料集和部門，以及到期日。
3. 立即複製金鑰：它只會顯示一次，以 `chb_` 開頭。
4. 在同一頁面複製需要的網址：
   - OData 資料來源：`https://your-company.curahold.com/api/analytics/odata/`
   - JSON 與 CSV：`https://your-company.curahold.com/api/analytics/v1/`

當工具詢問登入方式時，選擇 **Basic**：使用者名稱隨意填寫，密碼貼上金鑰。

金鑰讀取的內容與你在 Curahold 中看到的完全一致：同樣的客戶、看板與欄位。你的角色看不到的欄位連欄都不會出現。如果你離開公司或失去匯出權限，金鑰就會停止運作。**更換密文** 會給同一把金鑰一個新值；**撤銷** 會立即讓它失效。

## 資料集

| 資料集 | 內容 |
| --- | --- |
| `Customers` | 每位客戶一列，你能檢視的每個客戶欄位各占一欄 |
| `Renewals` | 有續約日期的客戶：金額、健康度與未結續約商機 |
| `HealthHistory` | 每位客戶每天的健康評分 |
| `Opportunities` | 銷售管道：金額、階段、狀態、預計成交日 |
| `Tickets` | 支援工單 |
| `Contacts` | 客戶端的聯絡人 |
| `Records…` | 你新增的每種記錄類型各一個資料集（合約、風險等） |
| `Boards`、`Tasks`、`TaskAssignees` | 看板、其中的任務，以及每個任務與負責人組合一列 |
| `Sprints`、`SprintBurndown` | 衝刺，以及每天的範圍與剩餘工作 |
| `People` | 姓名與角色，用來替負責人 ID 配上名字 |

每個資料集都有 `Id` 和 `ModifiedAt`（該列最後一次變更的時間）。多數還帶有 `IsDeleted`：已封存的列會以 `IsDeleted = true` 留在資料來源中，重新整理時就能把它們從報表移除。請用 ID 欄關聯資料集：`Tasks.CustomerId` → `Customers.Id`，`Tasks.BoardId` → `Boards.Id`，`OwnerId` → `People.Id`。

## Power BI

1. 在 Power BI Desktop 中選擇 **Get data → OData feed**。
2. 貼上 OData 網址並選擇 **OK**。
3. 選擇 **Basic**。使用者名稱：任意。密碼：你的分析金鑰。選擇 **Connect**。
4. 在導覽器中勾選需要的資料集，選擇 **Load**（若要先刪掉部分欄位，選 **Transform data**）。
5. 發佈後，在語意模型的 **Settings → Data source credentials** 中再次選擇 **Basic** 並填入金鑰，然後開啟 **scheduled refresh**。

如果 Power BI 服務要求 Basic 登入必須透過閘道，請改用 **Web API key**：在 **Transform data → Advanced editor** 中把來源寫成 `OData.Feed("https://your-company.curahold.com/api/analytics/odata/Tasks", null, [ApiKeyName = "key", Implementation = "2.0"])`，Power BI 詢問時選擇 **Web API** 並貼上金鑰。

**大型資料集。** 進行累加式重新整理時，把時間範圍寫進網址，Curahold 會在傳送前先篩選：

```
let
    Start = DateTime.ToText(RangeStart, "yyyy-MM-ddTHH:mm:ss") & "Z",
    End = DateTime.ToText(RangeEnd, "yyyy-MM-ddTHH:mm:ss") & "Z",
    Source = OData.Feed("https://your-company.curahold.com/api/analytics/odata/Tasks?$filter=CreatedAt ge " & Start & " and CreatedAt lt " & End, null, [Implementation = "2.0"])
in
    Source
```

接著照常為該資料表設定累加式重新整理原則，並以 `ModifiedAt` 欄勾選 **Detect data changes**，這樣有列變更的期間會重新讀取。

## Excel

1. 在 Windows 版 Excel 中選擇 **Data → Get Data → From Other Sources → From OData Feed**。
2. 貼上 OData 網址並選擇 **OK**。
3. 選擇 **Basic**，使用者名稱任意，密碼貼上金鑰，然後選擇 **Connect**。
4. 在導覽器中選擇資料集，再選 **Load**。
5. 隨時用 **Data → Refresh All** 取得最新資料。

## Microsoft Fabric

1. 在工作區中選擇 **New item → Dataflow Gen2**，再選擇 **Get data → OData**。
2. 貼上 OData 網址。在連線認證中選擇 **Basic**：使用者名稱任意，密碼填金鑰。
3. 選擇資料集，視需要整理，並新增一個 **data destination**（Lakehouse 或倉儲）。
4. 選擇 **Publish**，然後為資料流程設定重新整理排程。

資料管線的 **Copy activity** 也能透過 OData 連接器和 Basic 登入讀取同一資料來源。

## Tableau

1. 在 Tableau Desktop 中選擇 **Connect → To a Server → OData**。
2. 伺服器欄位貼上某一個資料集的網址，例如 `https://your-company.curahold.com/api/analytics/odata/Customers`。
3. 選擇 **Use username and password**：使用者名稱任意，密碼填金鑰。選擇 **Sign In**。
4. Tableau 以**資料擷取（extract）**方式讀取 OData。為每個需要的資料集再新增一個 OData 連線，並依 ID 欄建立關聯。
5. 發佈到 Tableau Cloud 或 Server 時內嵌認證，並設定擷取重新整理排程。

## Looker Studio

Looker Studio 需要連接器才能讀取這類資料來源。**Curahold 自己的 Looker Studio 連接器即將推出。** 在此之前可以這樣做：

1. 在新的 Google 試算表的 A1 儲存格輸入：`=IMPORTDATA("https://your-company.curahold.com/api/analytics/v1/Customers.csv?limit=5000&key=你的金鑰")`。
2. 在 Looker Studio 中選擇 **Create → Data source → Google Sheets**，指向該試算表。
3. 為此單獨建立一把金鑰，只開放試算表需要的資料集：能編輯試算表的人都能在公式中看到金鑰。如果試算表分享範圍過大，請在 Curahold 中撤銷該金鑰。

你也可以透過 **CRM 與試算表**（設定 → CRM 與試算表）讓一份試算表保持最新，再於 Looker Studio 使用它。

## Qlik

1. 在 Qlik Sense 或 Qlik Cloud 中選擇 **Add data → OData**（或 **Create new connection → OData**）。
2. 貼上 OData 網址，驗證方式選擇 **Basic**：使用者名稱任意，密碼填金鑰。
3. 選擇資料集並載入；在應用程式設定中安排重新載入排程。

Qlik 的 REST 連接器也能使用 JSON 網址（`…/api/analytics/v1/Customers.json`），搭配 Basic 登入與依 `next` 欄位的「next URL」分頁。

## Zoho Analytics

1. 選擇 **Create → New Workspace → Web URL / Feeds**（從網路資料來源匯入）。
2. 貼上某一個資料集的網址：OData 網址（`…/api/analytics/odata/Customers`）或 CSV 網址（`…/api/analytics/v1/Customers.csv`）。
3. 驗證選擇 **Basic**：使用者名稱任意，密碼填金鑰。
4. 分頁方式選擇 **next page URL**：OData 用 `@odata.nextLink`，JSON 用 `next`。
5. 設定匯入的重複頻率。

## Metabase / Superset

Metabase 和 Superset 讀取的是資料庫，而不是網路資料來源。直接連線將透過 Curahold 即將推出的**資料倉儲匯出**（匯出到 BigQuery 或 Snowflake）實現。在此之前，如果你的環境允許上傳檔案，可以上傳從 `…/api/analytics/v1/<資料集>.csv` 下載的 CSV。

## 其他工具與指令碼

JSON 與 CSV 網址支援以下參數：

| 參數 | 意義 |
| --- | --- |
| `limit` | 每頁列數，最多 5000（預設 1000） |
| `page` 或 `offset` | 依頁碼或依列分頁 |
| `cursor` | 上一頁的 `next` 值（大型資料集最快） |
| `since` | 只傳回在此日期或時間之後變更的列，例如 `2026-11-01` |
| `fields` | 只傳回這些欄，例如 `Id,Name,ModifiedAt` |
| `filter`、`orderby` | 與 OData 的 `$filter`、`$orderby` 相同的運算式 |
| `count=1` | 同時傳回總列數 |

金鑰可以作為 Basic 密碼傳送，也可以用 `Authorization: Bearer chb_…` 傳送。JSON 頁面的格式為 `{ "dataset": "Tasks", "rows": [...], "next": "…" }`；CSV 頁面在 `Link` 回應標頭中提供下一頁網址。Domo、SAP Analytics Cloud、Quick BI、FineBI 等工具也能以同樣方式讀取 JSON 或 OData 網址。

OData 資料來源支援 `$select`、`$filter`（`eq ne gt ge lt le`、`and`、`or`、`not`、`contains`、`startswith`、`endswith`）、`$orderby`、`$top`、`$skip`、`$count` 和 `/$count`。不支援 `$expand`：請用 ID 欄關聯資料集。

## 重新整理與限制

- 大型資料集按每頁 1,000 列傳回；BI 工具會自動跟隨下一頁連結。
- **只取變更：** 依 `ModifiedAt` 篩選（`$filter=ModifiedAt ge 2026-11-01T00:00:00Z`），或在 JSON 中使用 `since`。加上 `Prefer: odata.track-changes` 標頭時，最後一頁還會提供 `@odata.deltaLink`，之後用它只取得變更部分。
- 每把金鑰每秒約可發出兩次請求，每家公司有每日列數額度。超過時資料來源會傳回 429，並告知何時可以重試。
- 每次讀取都會被記錄（誰、用哪把金鑰、哪個資料集、多少列），顯示在設定的 **最近的讀取** 中。

## 發生問題時

- **401 / 工具一再要求認證：** 金鑰錯誤、已撤銷或已過期；或是在必須填寫使用者名稱的工具裡留空了，請隨意填一個。
- **403：** 金鑰擁有者已不再具有匯出資料的權限。
- **某個資料集傳回 404：** 金鑰僅限其他資料集或部門，或該資料集的欄位對擁有者的角色不可見。
- **附說明的 400：** 查詢用到了資料來源不支援的內容，說明中會指出是什麼。
