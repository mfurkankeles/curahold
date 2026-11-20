---
title: 透過 Google Workspace 寄送產品郵件（SMTP 轉送）
section: developers
order: 11
summary: 給管理員和維運人員——透過 Google Workspace SMTP 轉送服務寄送 Curahold 自身的郵件（登入連結、提醒、摘要）、託管服務與自行架設的設定、限額，以及何時需要專用寄信服務。
---
# 透過 Google Workspace 寄送產品郵件（SMTP 轉送）

> 給管理員和維運人員。請先完成 DNS 指南：只有 SPF、DKIM、DMARC 都通過，轉送服務才能順利投遞。

Curahold 會寄送登入連結、提醒、試用通知和摘要。一般 Gmail 信箱不適合應用程式寄信；Google 的 **SMTP 轉送服務**正是為此設計，仍在 Google Workspace 內，不需其他郵件服務。

## 1. 開啟轉送服務

管理控制台 → 應用程式 → Google Workspace → Gmail → **轉送** → **SMTP 轉送服務** → 設定：

- **允許的寄件者：**僅限我的網域中的地址。
- **驗證：**勾選**需要 SMTP 驗證**（託管服務執行在沒有固定位址的伺服器上，因此以登入取代白名單）。固定位址的自行架設也可選「僅接受指定 IP 位址的郵件」。
- **加密：**勾選**需要 TLS 加密**。
- 儲存。最多需要一小時生效。

## 2. 寄信帳戶

選擇登入轉送服務的使用者（擁有者帳戶即可），開啟兩步驟驗證並為其建立**應用程式密碼**。把 `no-reply@` 設為該使用者的別名。

## 3. 設定 Curahold

**託管（Cloudflare Workers）**——設為密鑰（`wrangler secret put …`）：

| 設定 | 值 |
| --- | --- |
| `SMTP_RELAY_USER` | 第 2 步的使用者，例如 `owner@example.com` |
| `SMTP_RELAY_PASSWORD` | 其應用程式密碼 |
| `EMAIL_FROM` | `Curahold <no-reply@example.com>` |
| `EMAIL_PROVIDER` | `google_relay`（設定了上面兩項時自動選擇） |
| `SMTP_RELAY_HOST`、`SMTP_RELAY_PORT` | 僅在變更預設值 `smtp-relay.gmail.com`、`587` 時設定 |

程式碼路徑：`api/src/lib/smtpRelay.ts`（587 埠 STARTTLS；Workers 上 25 埠關閉）。

**自行架設**——在 `.env` 檔案中：

```
SMTP_URL=smtp://owner%40example.com:APP-PASSWORD@smtp-relay.gmail.com:587
EMAIL_FROM=Curahold <no-reply@example.com>
```

然後重新啟動應用程式。

## 4. 檢查

登出並要求登入連結。郵件應來自 `no-reply@…`，且 SPF、DKIM、DMARC 顯示 **PASS**。若沒有收到，應用程式記錄會寫明失敗的 SMTP 步驟。

## 5. 限額——何時需要專用寄信服務

轉送服務每位使用者每天最多接受 **10,000 位收件人**（Google 公布的限額；請核實）。出現以下**任一**情況時，需要把產品郵件移到專用寄信服務（由擁有者決定，且需付費）：

- 每日產品郵件經常超過限額的**一半**（每天 5,000 位收件人）；
- 投遞率下降：退信超過 **2%**、檢舉接近 **0.1%**，或郵件進入垃圾郵件匣；
- 需要逐封投遞事件（webhook）或為不同郵件類型分開寄信信譽；
- 計畫**行銷活動**——絕不透過轉送服務寄送。

切換只是一項設定：託管服務已內建專用服務的驅動程式（`EMAIL_PROVIDER=resend` 加上 `RESEND_API_KEY`）。請先把它加入子處理者頁面，並提前 30 天通知管理員。

## 6. 郵件寄不出去時 {#failures}

暫時拒絕（`421`、`450`、`451` 或連線中斷）會用新的連線再試一次。永久拒絕不會重試：`535`（應用程式密碼已變更或撤銷：建立新的並替換 `SMTP_RELAY_PASSWORD`）、`550 5.4.5`（每日上限）、`550 5.1.1`（地址不存在）。這時使用者會看到用自己語言寫的「目前無法寄出電子郵件。請幾分鐘後再試；如果一直這樣，請告訴你的管理員。」，永遠看不到轉送伺服器的回應；回應會連同 SMTP 步驟寫入應用程式的錯誤記錄。
