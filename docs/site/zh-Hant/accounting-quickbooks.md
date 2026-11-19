---
title: QuickBooks Online（會計）
section: help
order: 8.26
summary: 以唯讀方式連接 QuickBooks Online：在每個客戶頁面上檢視未結餘額、逾期發票和收款。
---
# QuickBooks Online（會計）

來自 QuickBooks Online 的客戶、發票和收款。

## 讀取哪些內容

客戶（以及軟體中儲存的統一編號、電子郵件和網址）、含到期日和未付金額的發票，以及收到的款項。Curahold 絕不會寫入 QuickBooks Online：它無法在那裡建立、變更或刪除任何內容。

## 連接

在**設定 → 資料來源**中找到**會計軟體**，選擇**連接 QuickBooks Online**。然後：

1. 登入 Intuit 並選擇要連接的 QuickBooks 公司。
2. 允許存取會計資料；Curahold 只讀取客戶、發票和收款。
3. 回到這裡後，開始首次讀取，並檢查未能配對的客戶。

## 限制與時間

Intuit 允許每家公司每分鐘 500 次請求，並對超出免費層級的讀取向應用程式開發者收費，因此 Curahold 只請求自上次執行以來的變更，每頁 1,000 筆。每小時讀取一次變更，每天完整讀取一次。

## 發生問題時

如果 QuickBooks Online 不再接受連接（金鑰或登入被撤銷），該連接會在 設定 → 連接 中標示為「有問題」，並通知管理員一次；在其頁面上選擇**重新連接**。速率限制的回覆不是錯誤：本次執行會停下、記住位置，下次繼續。

## 另請參閱

- [會計軟體](/docs/zh-Hant/accounting/)
