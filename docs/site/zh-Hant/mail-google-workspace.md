---
title: 用 Google Workspace 在自己的網域上收發郵件
section: developers
order: 10
summary: 給管理員和維運人員——在 Google Workspace 上執行公司郵件所需的 DNS 記錄（MX、SPF、DKIM、DMARC）和信箱規劃。
---
# 用 Google Workspace 在自己的網域上收發郵件

> 給管理員和維運人員。Google 的畫面和限額會變動；以下數值依據截至 2026 年 11 月 19 日的 Google 管理員說明——操作時請在管理控制台中核對。

## 1. 信箱：少用席次，多用地址

Workspace 按使用者收費，因此使用者要少，其餘都用**別名**或**群組**：

| 地址 | 用途 | 方式 |
| --- | --- | --- |
| 您自己的地址 | 擁有者 | 使用者（1 個席次） |
| hello@、billing@、security@、social@ | 外部來信的信箱 | 擁有者的別名或群組 |
| support@ | 共用支援信箱 | 開啟「協作收件匣」的 Google 群組 |
| no-reply@ | 產品郵件的寄件者 | 登入轉送服務的使用者的別名（見下一篇） |

請先為每位使用者開啟**兩步驟驗證**。

## 2. DNS 記錄

在 DNS 服務商處新增（例如 Cloudflare：DNS → Records）。把 `example.com` 換成您的網域。

| 類型 | 名稱 | 值 | 作用 |
| --- | --- | --- | --- |
| MX | `@` | `smtp.google.com`，優先順序 1 | 網域郵件送到 Gmail |
| TXT | `@` | `v=spf1 include:_spf.google.com ~all` | SPF：允許 Google 代表網域寄信。只能有一筆 SPF 記錄——已有則合併 |
| TXT | `google._domainkey` | 管理控制台提供的金鑰 | DKIM：為每封郵件簽章 |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@example.com; adkim=s; aspf=s` | DMARC：告訴收件方如何處理驗證失敗的郵件 |

**DKIM：**管理控制台 → 應用程式 → Google Workspace → Gmail → 驗證電子郵件 → 產生新記錄（2048 位元，選取器 `google`）→ 發布 TXT 記錄 → 回到控制台點選**開始驗證**。

**DMARC 分三步：**先用 `p=none` 並閱讀 2–4 週報告；再改為 `p=quarantine`；只剩自己的寄件方時改為 `p=reject`。發布前先建立 `dmarc@` 地址。

## 3. 檢查

寄一封郵件到外部地址，開啟後選擇**顯示原始郵件**：SPF、DKIM、DMARC 都應為 **PASS**。

## 4. 大量寄送規則

Gmail 等大型信箱服務商要求大量寄件者：同時具備 SPF、DKIM 和 DMARC，行銷郵件提供一鍵取消訂閱，檢舉率遠低於 0.3%。切勿從個人信箱寄送行銷郵件；行銷需要收件人同意（見隱私聲明）。
