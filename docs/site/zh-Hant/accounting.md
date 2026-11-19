---
title: 會計軟體
section: help
order: 8.2
summary: 唯讀連接會計軟體：誰欠多少，顯示在客戶頁面和健康分數中。
---
# 會計軟體

連接你的會計軟體後，每個客戶頁面都會顯示其欠款：未結餘額、逾期金額和逾期天數、最近一次收款以及發票。逾期付款可以計入健康分數。Curahold 只讀取：絕不會向軟體寫入任何內容。

## 支援哪些軟體

| 軟體 | 連接方式 | 頁面 |
| --- | --- | --- |
| Zoho Books | 使用 Zoho 登入 | [Zoho Books](/docs/zh-Hant/accounting-zohobooks/) |
| Xero | 使用 Xero 登入 | [Xero](/docs/zh-Hant/accounting-xero/) |
| Odoo | 網址、登入名稱和 API 金鑰 | [Odoo](/docs/zh-Hant/accounting-odoo/) |
| freee | 使用 freee 登入 | [freee](/docs/zh-Hant/accounting-freee/) |
| Paraşüt | 公司編號、API 用戶端和一位使用者 | [Paraşüt](/docs/zh-Hant/accounting-parasut/) |
| QuickBooks Online | 使用 Intuit 登入 | [QuickBooks Online](/docs/zh-Hant/accounting-quickbooks/) |
| 其他軟體（Logo、Mikro、Tally、SAP Business One…） | Excel 或 CSV 檔案 | [檔案](/docs/zh-Hant/accounting-file/) |

## 配對客戶

會計軟體中的每個客戶都會配對到 Curahold 中的一個客戶：先依統一編號，再依網址或電子郵件網域，最後依名稱（會忽略 Ltd.、A.Ş.、株式会社 等公司形式）。恰好只有一個客戶符合時會自動配對；沒有或有多個符合時，會在連接的**配對**分頁中等待。你可以在那裡選擇客戶或將其排除。手動做的配對會保留。

## 誰能看到數據

擁有**檢視財務數據**權限的角色可以看到金額（起初為管理員和經理；可在 設定 → 角色 中變更）。其他能看到該客戶的人只能在健康分數中看到付款逾期了幾天——永遠看不到金額。

## 健康分數中的逾期付款

開始首次讀取時，可以勾選**把逾期付款計入健康分數**。**準時付款**訊號在沒有逾期時給滿分，在最早一張未付發票逾期 60 天時給 0 分；兩個數字都可以在 設定 → 健康分數 中修改。未與軟體配對的客戶不計入。

## 連接狀態

會計連接與其他連接一起顯示在 設定 → 連接 中：正常、有問題或已暫停，以及上次正常運作的時間。
