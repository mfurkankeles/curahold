---
title: 會計：來自其他軟體的檔案
section: help
order: 8.29
summary: Logo、Mikro、Tally、SAP Business One 或任何軟體：以 Excel 或 CSV 上傳客戶、發票和收款。
---
# 會計：來自其他軟體的檔案

沒有開放 API 的軟體——Logo、Mikro、Tally、SAP Business One 等——透過檔案連接。之後數據的用法與已連接的軟體完全相同：客戶頁面、配對和健康分數。

## 步驟

1. 在**設定 → 資料來源 → 會計軟體**中選擇**上傳檔案**。
2. 在**上傳**分頁中，下載客戶、發票和收款的**範本**。
3. 從你的軟體匯出相同內容，並依範本的欄位整理（Excel 或 CSV；多餘的欄位會被忽略）。
4. 先上傳客戶，再上傳發票，最後上傳收款。

## 欄位

| 檔案 | 欄位 |
| --- | --- |
| 客戶 | customer_id, name, tax_id, email, website, currency, balance |
| 發票 | invoice_id, customer_id, number, issued_on, due_on, currency, total, balance, status |
| 收款 | payment_id, customer_id, invoice_id, paid_on, amount, currency |

日期格式為 YYYY-MM-DD。`status` 可以是 open、paid、void 或 draft；留空時，仍有欠款的發票視為未結。

## 更新的數據

隨時上傳新檔案：它會取代同類的上一個檔案。手動做的配對會保留。檔案不會被傳送到其他任何地方。
