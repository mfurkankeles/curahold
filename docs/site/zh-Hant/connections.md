---
title: 連線與 CRM
section: help
order: 8
summary: Slack、Teams 與 Google Chat；與 Salesforce、HubSpot 和試算表同步。
---
# 連線與 CRM

Curahold 能和團隊已經在用的工具一起運作。在「設定」→ 連線 和「設定」→ 資料來源 中管理連線。

## 聊天 App

連接 Slack、Microsoft Teams 或 Google Chat 後，通知會以私訊送給相關人員，他們可以直接在訊息中完成或重新開啟任務。

## CRM 與試算表

把客戶、聯絡人和商機與 Salesforce、HubSpot、Microsoft Dynamics、Pipedrive、Zoho、Bitrix24、Freshsales、Zendesk Sell、Google Sheets 和 Excel 同步。開啟 **「設定」→ CRM 與試算表**，選擇 **連接**。

1. **登入。** 你會被帶到 CRM 自己的登入頁面，核准 Curahold 可以讀取和寫入的內容。絕不需要在 Curahold 中輸入密碼。（Bitrix24、Freshsales 和 Zendesk Sell 改用金鑰，見下文。）
2. **選擇匯入內容。** 勾選需要的物件，並指定每個物件在 Curahold 中是什麼：客戶、聯絡人、商機、你們自己的記錄類型，或看板上的任務。
3. **對應欄位。** Curahold 會為每個欄位建議對應方式；每一項都能更改，並可為每個欄位選擇只匯入，或兩邊保持一致。
4. **檢查並開始。** 在任何東西變動之前，預覽會顯示將新增和更新多少筆。

之後同步會每小時自動執行，在 Curahold 中所做的變更會立刻寫入 CRM。無法同步的項目會連同原因列出，並可重試。同一筆資料在兩邊都被修改時，較新的變更勝出；你也可以改成永遠以 CRM 或 Curahold 為準（連線的「設定」分頁）。

建立連線需要管理連線的權限。人員依電子郵件比對，所以 CRM 中每個客戶的負責人，在 Curahold 中也是它的負責人。

## Salesforce

匯入：accounts、contacts、opportunities、tasks 以及你們的自訂物件。如要使用測試 org，請在連接前勾選 **Sandbox**。

**第一次需要由 Salesforce 管理員安裝 Curahold。** Salesforce 會阻擋沒有安裝在你們 org 中的 App，所以第一次登入前，管理員要開啟安裝頁面（選擇「連接」時會顯示連結）並核准。這個套件不會加入任何程式碼、欄位或物件：它只是讓你們 org 中的人可以核准 Curahold。隨時都能在 Setup → Installed Packages 中移除，Curahold 會立刻失去存取權。如果 Salesforce 回應 App 未獲允許，表示這一步還沒完成。進行連接的使用者需要在 Salesforce 中具備 API 存取權（Enterprise 以上版本內含，Professional 版需加購）。

## HubSpot

匯入：companies、contacts、deals、tickets、tasks 和自訂物件。HubSpot 會詢問要連接哪個帳戶，並列出 Curahold 可以讀取和寫入的內容；只有在你們的 HubSpot 方案包含 contacts 和 deals 時，才會要求這兩項。

## Microsoft Dynamics 365

匯入：accounts、contacts、opportunities、cases、tasks 和自訂資料表。登入前要填寫你們組織的網址（看起來像 `https://yourcompany.crm4.dynamics.com`）。如果 Microsoft 顯示「Need admin approval」，需要 Microsoft 365 管理員為你們的組織核准 Curahold 一次。

## Pipedrive

匯入：organizations、people、deals 和 activities。自訂欄位的對應方式和標準欄位相同。

## Zoho CRM

匯入：accounts、contacts、deals、cases、tasks 和自訂模組。Curahold 會自動找到你們的 Zoho 資料中心（美國、歐盟、印度、澳洲等）。

## Bitrix24、Freshsales 與 Zendesk Sell

這三個用你在 CRM 中自己建立的金鑰連接，所以沒有登入頁面，也不需要任何人核准。Curahold 會在你貼上金鑰的當下檢查，加密保存，而且不會再顯示；移除連線後，金鑰也隨之消失。之後的步驟和其他 CRM 一樣：選擇匯入內容、對應欄位，變更會雙向同步。

| CRM | 要貼上什麼 | 在哪裡找到 | 匯入內容 |
| --- | --- | --- | --- |
| Bitrix24 | 傳入 webhook 網址 | Developer resources → Other → Inbound webhook；給它 CRM 權限，以及用來對應負責人的 Users 權限 | companies、contacts、deals |
| Freshsales | 你們的網址和 API 金鑰 | 大頭貼 → Settings → API settings | accounts、contacts、deals |
| Zendesk Sell | 存取權杖 | Settings → Integrations → OAuth → Access tokens | companies、people、deals |

值得知道：

- **金鑰以建立者的身分運作。** Curahold 看得到的，就是這個人在 CRM 中看得到的。請用能看到所有你想匯入的客戶的帳戶建立金鑰。
- **Bitrix24 中的電子郵件、電話和網址** 在那邊是清單。Curahold 會讀取第一個值，並在建立新聯絡人或公司時填入，但之後絕不會改寫這份清單。
- **Freshsales 透過「All accounts」、「All contacts」和「All deals」檢視讀取。** 如果其中某個檢視被重新命名或移除，該清單就不會被讀取，執行結果會照實說明，而不是只帶入一部分。
- **Zendesk Sell 中的交易需要一家公司。** 在 Curahold 中建立的交易，會在那邊建立在該客戶的公司底下。
- 這些連接器是新推出的。如果有東西沒有照你預期的方式匯入，請從產品中的「說明」告訴我們。

## Google Sheets 與 Excel

試算表是匯入資料最簡單的方式，任何能匯出試算表的工具都適用。逐一連接 Google 試算表的工作表，或 OneDrive、SharePoint 中的 Excel 檔案；每個工作表可以對應客戶、聯絡人或你們自己的記錄類型。選擇用來識別每一列的欄位，這樣某一列變動時會更新同一個客戶，而不是再新增一個。

## 支援工具

Zendesk、Freshdesk、Intercom 和 Jira Service Management 以網址和 API 金鑰連接；工單會歸到正確的客戶底下。Salesforce 和 Dynamics 的 cases 也能對應為支援工單。詳情：[支援工單](/docs/zh-Hant/support-tickets/)。

## 你們自己的工具

要連接其他系統，請參閱 [API 金鑰](/docs/zh-Hant/api-keys/)、[webhook](/docs/zh-Hant/webhooks/) 或 [連接 Claude 與 ChatGPT](/docs/zh-Hant/ai-assistants/)。
