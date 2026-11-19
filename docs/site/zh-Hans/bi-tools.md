---
title: 连接 BI 工具
section: help
order: 8.5
summary: 用分析密钥一步步连接 Power BI、Excel、Fabric、Tableau、Looker Studio、Qlik、Zoho Analytics 等工具。
---
# 连接 BI 工具

Curahold 为 BI 工具提供一个只读的**分析数据源**。Power BI、Excel、Microsoft Fabric、Tableau、Qlik 和 Zoho Analytics 以 **OData 数据源**的形式读取它；Looker Studio、脚本和其他工具则以 **JSON 或 CSV** 获取同样的数据。通过它无法修改 Curahold 中的任何内容。

下文中的菜单名称取自各工具的英文界面，使用中文界面时请选择对应的项。

## 开始之前

1. 打开 **设置 → 分析与 BI**。你需要拥有导出数据的权限（管理员和经理默认拥有）。
2. 选择 **新建分析密钥**。起一个名字（例如“Power BI 销售仪表板”），选择它可以读取的数据集和部门，以及到期日期。
3. 立即复制密钥：它只显示一次，以 `chb_` 开头。
4. 在同一页面复制所需的地址：
   - OData 数据源：`https://your-company.curahold.com/api/analytics/odata/`
   - JSON 和 CSV：`https://your-company.curahold.com/api/analytics/v1/`

当工具询问登录方式时，选择 **Basic**：用户名随便填，密码粘贴密钥。

密钥读取的内容与你在 Curahold 中看到的完全一致：同样的客户、看板和字段。你的角色看不到的字段连列都不会出现。如果你离开公司或失去导出权限，密钥即停止工作。**更换密文** 会给同一个密钥一个新值；**撤销** 会立即使它失效。

## 数据集

| 数据集 | 内容 |
| --- | --- |
| `Customers` | 每位客户一行，你能查看的每个客户字段各占一列 |
| `Renewals` | 有续约日期的客户：金额、健康度和未结续约商机 |
| `HealthHistory` | 每位客户每天的健康评分 |
| `Opportunities` | 销售管道：金额、阶段、状态、预计成交日期 |
| `Tickets` | 支持工单 |
| `Contacts` | 客户方的联系人 |
| `Records…` | 你添加的每种记录类型各一个数据集（合同、风险等） |
| `Boards`、`Tasks`、`TaskAssignees` | 看板、其中的任务，以及每个任务与负责人组合一行 |
| `Sprints`、`SprintBurndown` | 迭代，以及每天的范围和剩余工作 |
| `People` | 姓名和角色，用来给负责人 ID 配上名字 |

每个数据集都有 `Id` 和 `ModifiedAt`（该行最后一次变更的时间）。大多数还带有 `IsDeleted`：已归档的行会以 `IsDeleted = true` 留在数据源中，刷新时就能把它们从报表中去掉。请用 ID 列关联数据集：`Tasks.CustomerId` → `Customers.Id`，`Tasks.BoardId` → `Boards.Id`，`OwnerId` → `People.Id`。

## Power BI

1. 在 Power BI Desktop 中选择 **Get data → OData feed**。
2. 粘贴 OData 地址并选择 **OK**。
3. 选择 **Basic**。用户名：任意。密码：你的分析密钥。选择 **Connect**。
4. 在导航器中勾选需要的数据集，选择 **Load**（如需先删掉一些列，选 **Transform data**）。
5. 发布后，在语义模型的 **Settings → Data source credentials** 中再次选择 **Basic** 并填入密钥，然后开启 **scheduled refresh**。

如果 Power BI 服务要求 Basic 登录必须通过网关，请改用 **Web API key**：在 **Transform data → Advanced editor** 中把源写成 `OData.Feed("https://your-company.curahold.com/api/analytics/odata/Tasks", null, [ApiKeyName = "key", Implementation = "2.0"])`，Power BI 询问时选择 **Web API** 并粘贴密钥。

**大型数据集。** 做增量刷新时，把时间范围写进地址，Curahold 会在发送前先过滤：

```
let
    Start = DateTime.ToText(RangeStart, "yyyy-MM-ddTHH:mm:ss") & "Z",
    End = DateTime.ToText(RangeEnd, "yyyy-MM-ddTHH:mm:ss") & "Z",
    Source = OData.Feed("https://your-company.curahold.com/api/analytics/odata/Tasks?$filter=ModifiedAt ge " & Start & " and ModifiedAt lt " & End, null, [Implementation = "2.0"])
in
    Source
```

然后照常为该表设置增量刷新策略。

## Excel

1. 在 Windows 版 Excel 中选择 **Data → Get Data → From Other Sources → From OData Feed**。
2. 粘贴 OData 地址并选择 **OK**。
3. 选择 **Basic**，用户名任意，密码粘贴密钥，然后选择 **Connect**。
4. 在导航器中选择数据集，再选 **Load**。
5. 随时用 **Data → Refresh All** 获取最新数据。

## Microsoft Fabric

1. 在工作区中选择 **New item → Dataflow Gen2**，再选择 **Get data → OData**。
2. 粘贴 OData 地址。在连接凭据中选择 **Basic**：用户名任意，密码填密钥。
3. 选择数据集，按需整理，并添加一个 **data destination**（湖仓或仓库）。
4. 选择 **Publish**，然后为数据流设置刷新计划。

数据管道的 **Copy activity** 也可以通过 OData 连接器和 Basic 登录读取同一数据源。

## Tableau

1. 在 Tableau Desktop 中选择 **Connect → To a Server → OData**。
2. 服务器处粘贴某一个数据集的地址，例如 `https://your-company.curahold.com/api/analytics/odata/Customers`。
3. 选择 **Use username and password**：用户名任意，密码填密钥。选择 **Sign In**。
4. Tableau 以**数据提取（extract）**方式读取 OData。为每个需要的数据集再添加一个 OData 连接，并按 ID 列建立关系。
5. 发布到 Tableau Cloud 或 Server 时嵌入凭据，并设置提取刷新计划。

## Looker Studio

Looker Studio 需要连接器才能读取这类数据源。**Curahold 自己的 Looker Studio 连接器即将推出。** 在此之前可以这样做：

1. 在新的 Google 表格的 A1 单元格中输入：`=IMPORTDATA("https://your-company.curahold.com/api/analytics/v1/Customers.csv?limit=5000&key=你的密钥")`。
2. 在 Looker Studio 中选择 **Create → Data source → Google Sheets**，指向该表格。
3. 为此单独创建一个密钥，只开放表格需要的数据集：能编辑表格的人都能在公式里看到密钥。如果表格共享范围过大，请在 Curahold 中撤销该密钥。

你也可以通过 **CRM 和电子表格**（设置 → CRM 和电子表格）让一张表格保持最新，再在 Looker Studio 中使用它。

## Qlik

1. 在 Qlik Sense 或 Qlik Cloud 中选择 **Add data → OData**（或 **Create new connection → OData**）。
2. 粘贴 OData 地址，认证方式选择 **Basic**：用户名任意，密码填密钥。
3. 选择数据集并加载；在应用设置中安排重新加载计划。

Qlik 的 REST 连接器也可以使用 JSON 地址（`…/api/analytics/v1/Customers.json`），配合 Basic 登录和基于 `next` 字段的 “next URL” 分页。

## Zoho Analytics

1. 选择 **Create → New Workspace → Web URL / Feeds**（从网络数据源导入）。
2. 粘贴某一个数据集的地址：OData 地址（`…/api/analytics/odata/Customers`）或 CSV 地址（`…/api/analytics/v1/Customers.csv`）。
3. 认证选择 **Basic**：用户名任意，密码填密钥。
4. 分页方式选择 **next page URL**：OData 用 `@odata.nextLink`，JSON 用 `next`。
5. 设置导入的重复频率。

## Metabase / Superset

Metabase 和 Superset 读取的是数据库，而不是网络数据源。直接连接将通过 Curahold 即将推出的**数据仓库导出**（导出到 BigQuery 或 Snowflake）实现。在此之前，如果你的环境允许上传文件，可以上传从 `…/api/analytics/v1/<数据集>.csv` 下载的 CSV。

## 其他工具和脚本

JSON 和 CSV 地址支持以下参数：

| 参数 | 含义 |
| --- | --- |
| `limit` | 每页行数，最多 5000（默认 1000） |
| `page` 或 `offset` | 按页码或按行分页 |
| `cursor` | 上一页的 `next` 值（大型数据集最快） |
| `since` | 只返回在此日期或时间之后变更的行，例如 `2026-11-01` |
| `fields` | 只返回这些列，例如 `Id,Name,ModifiedAt` |
| `filter`、`orderby` | 与 OData 的 `$filter`、`$orderby` 相同的表达式 |
| `count=1` | 同时返回总行数 |

密钥可以作为 Basic 密码发送，也可以用 `Authorization: Bearer chb_…` 发送。JSON 页面的格式为 `{ "dataset": "Tasks", "rows": [...], "next": "…" }`；CSV 页面在 `Link` 响应头中给出下一页地址。Domo、SAP Analytics Cloud、Quick BI、FineBI 等工具也可用同样方式读取 JSON 或 OData 地址。

OData 数据源支持 `$select`、`$filter`（`eq ne gt ge lt le`、`and`、`or`、`not`、`contains`、`startswith`、`endswith`）、`$orderby`、`$top`、`$skip`、`$count` 和 `/$count`。不支持 `$expand`：请用 ID 列关联数据集。

## 刷新与限制

- 大型数据集按每页 1,000 行返回；BI 工具会自动跟随下一页链接。
- **只取变更：** 按 `ModifiedAt` 过滤（`$filter=ModifiedAt ge 2026-11-01T00:00:00Z`），或在 JSON 中使用 `since`。带上 `Prefer: odata.track-changes` 请求头时，最后一页还会给出 `@odata.deltaLink`，之后用它只获取变更部分。
- 每个密钥每秒约可发出两次请求，每家公司有每日行数额度。超出时数据源返回 429，并告知何时可以重试。
- 每次读取都会被记录（谁、用哪个密钥、哪个数据集、多少行），显示在设置的 **最近的读取** 中。

## 出现问题时

- **401 / 工具反复要求凭据：** 密钥错误、已撤销或已过期；或者在必须填写用户名的工具里把用户名留空了，请随便填一个。
- **403：** 密钥所有者已不再拥有导出数据的权限。
- **某个数据集返回 404：** 密钥仅限其他数据集或部门，或者该数据集的字段对所有者的角色不可见。
- **带说明的 400：** 查询用到了数据源不支持的内容，说明中会指出是什么。
