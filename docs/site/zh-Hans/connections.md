---
title: 连接和 CRM
section: help
order: 8
summary: Slack、Teams 和 Google Chat；与 Salesforce、HubSpot 和电子表格同步。
---
# 连接和 CRM

Curahold 可以和团队已经在用的工具一起工作。在“设置”→ 连接 和“设置”→ 数据源 中管理连接。

## 聊天应用

连接 Slack、Microsoft Teams 或 Google Chat 后，通知会以私信形式发给相关人员，他们可以直接在消息中完成任务或重新打开任务。

## CRM 和电子表格

把客户、联系人和商机与 Salesforce、HubSpot、Microsoft Dynamics、Pipedrive、Zoho、Bitrix24、Freshsales、Zendesk Sell、Google Sheets 和 Excel 同步。打开 **“设置”→ CRM 和电子表格**，选择 **连接**。

1. **登录。** 你会被带到 CRM 自己的登录页面，批准 Curahold 可以读取和写入的内容。永远不需要在 Curahold 中输入密码。（Bitrix24、Freshsales 和 Zendesk Sell 改用密钥，见下文。）
2. **选择导入内容。** 勾选需要的对象，并指定每个对象在 Curahold 中对应什么：客户、联系人、商机、你们自己的记录类型，或看板上的任务。
3. **匹配字段。** Curahold 会为每个字段建议一个匹配；任何一项都可以修改，并且可以为每个字段选择只导入，还是两边保持一致。
4. **检查并开始。** 在任何内容发生变化之前，预览会显示将新增和更新多少条。

之后同步会每小时自动运行，在 Curahold 中所做的修改会立即写入 CRM。无法同步的内容会连同原因一起列出，可以重试。同一项内容在两边都被修改时，较新的修改生效；你也可以改为始终以 CRM 或 Curahold 为准（在连接的“设置”标签页中）。

建立连接需要管理连接的权限。人员按邮箱匹配，因此 CRM 中每个客户的负责人在 Curahold 中也是其负责人。

## Salesforce

导入：accounts、contacts、opportunities、tasks 以及你们的自定义对象。如需使用测试 org，请在连接前勾选 **Sandbox**。

**第一次需要由 Salesforce 管理员安装 Curahold。** Salesforce 会拦截未在你们 org 中安装的应用，所以在第一次登录之前，管理员要打开安装页面（选择“连接”时会显示链接）并批准。这个安装包不会添加任何代码、字段或对象：它只是让你们 org 中的人可以批准 Curahold。可以随时在 Setup → Installed Packages 中移除，Curahold 会立即失去访问权限。如果 Salesforce 提示应用未被允许，说明这一步还没有完成。进行连接的用户需要在 Salesforce 中拥有 API 访问权限（Enterprise 及以上版本已包含，Professional 版本需另购）。

## HubSpot

导入：companies、contacts、deals、tickets、tasks 和自定义对象。HubSpot 会询问要连接哪个账户，并列出 Curahold 可以读取和写入的内容；只有当你们的 HubSpot 套餐包含 contacts 和 deals 时，才会请求这两项。

## Microsoft Dynamics 365

导入：accounts、contacts、opportunities、cases、tasks 和自定义表。登录前需要填写你们组织的地址（形如 `https://yourcompany.crm4.dynamics.com`）。如果 Microsoft 显示“Need admin approval”，需要 Microsoft 365 管理员为你们组织批准 Curahold 一次。

## Pipedrive

导入：organizations、people、deals 和 activities。自定义字段的匹配方式与标准字段相同。

## Zoho CRM

导入：accounts、contacts、deals、cases、tasks 和自定义模块。Curahold 会自动找到你们的 Zoho 数据中心（美国、欧盟、印度、澳大利亚等）。

## Bitrix24、Freshsales 和 Zendesk Sell

这三个通过你在 CRM 中自己创建的密钥连接，所以没有登录页面，也不需要任何人批准。Curahold 会在你粘贴密钥的那一刻进行检查，加密保存，并且不会再次显示；删除连接后，密钥也随之删除。之后的步骤与其他 CRM 相同：选择导入内容、匹配字段，修改双向同步。

| CRM | 粘贴什么 | 在哪里找到 | 导入内容 |
| --- | --- | --- | --- |
| Bitrix24 | 入站 webhook 地址 | Developer resources → Other → Inbound webhook；授予 CRM 权限，以及用于匹配负责人的 Users 权限 | companies、contacts、deals |
| Freshsales | 你们的地址和 API 密钥 | 头像 → Settings → API settings | accounts、contacts、deals |
| Zendesk Sell | 访问令牌 | Settings → Integrations → OAuth → Access tokens | companies、people、deals |

值得了解：

- **密钥以创建者的身份工作。** Curahold 能看到的，就是此人在 CRM 中能看到的。请用能看到所有你想导入的客户的账户来创建密钥。
- **Bitrix24 中的邮箱、电话和网址** 在那边是列表。Curahold 读取第一个值，并在新建联系人或公司时填入，但之后绝不会改写这个列表。
- **Freshsales 通过“All accounts”“All contacts”和“All deals”视图读取。** 如果其中某个视图被重命名或删除，该列表就不会被读取，运行结果会如实说明，而不是只导入一部分。
- **Zendesk Sell 中的商机需要一家公司。** 在 Curahold 中创建的商机，会在那边创建在该客户的公司下。
- 这些连接器是新推出的。如果有内容没有按预期导入，请在产品的“帮助”中告诉我们。

## Google Sheets 和 Excel

电子表格是导入数据最简单的方式，适用于任何能导出电子表格的工具。按工作表逐个连接 Google 表格，或 OneDrive、SharePoint 中的 Excel 文件；每个工作表可以对应客户、联系人或你们自己的记录类型。选择用来识别每一行的列，这样某一行发生变化时会更新同一个客户，而不是再新增一个。

## 支持工具

Zendesk、Freshdesk、Intercom 和 Jira Service Management 通过地址和 API 密钥连接；工单会归到正确的客户下。Salesforce 和 Dynamics 的 cases 也可以映射为支持工单。详情：[支持工单](/docs/zh-Hans/support-tickets/)。


## 同步停止时 {#sync-stops}

连接的**状态**标签页会用简单的话说明发生了什么，下面附有该服务自己的消息。

| 显示的内容 | 该怎么做 |
| --- | --- |
| 服务要求 Curahold 放慢速度 | 无需操作。进度会保留，下一次每小时运行会继续。 |
| 不再接受 Curahold 的登录或密钥 | 按下面的步骤重新连接。 |
| 该帐户无权读取或修改某些内容 | 请该工具的管理员为帐户授予访问权限，然后点击**立即同步**。 |
| 无法连接 | 无需操作。Curahold 会在下一次每小时运行时重试。 |

重新连接：

1. 打开**设置 → CRM 和电子表格**。
2. 点击标有**需要处理**的连接。
3. 点击页面顶部的**重新连接**。
4. 登录与之前相同的帐户（或粘贴新密钥）并批准。
5. 点击**立即同步**。已匹配的字段保持不变。

要移除连接，请打开它，点击 **⋯** 并选择**移除**。同步会停止；已同步过来的客户、联系人和商机会留在 Curahold 中，另一个工具中不会删除任何内容。如果是会计软件，从中读取的余额、发票和付款会从客户页面移除。

## 你们自己的工具

要连接其他系统，请参阅 [API 密钥](/docs/zh-Hans/api-keys/)、[webhook](/docs/zh-Hans/webhooks/) 或 [连接 Claude 和 ChatGPT](/docs/zh-Hans/ai-assistants/)。
