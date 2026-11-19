---
title: 会计：来自其他软件的文件
section: help
order: 8.29
summary: Logo、Mikro、Tally、SAP Business One 或任何软件：以 Excel 或 CSV 上传客户、发票和收款。
---
# 会计：来自其他软件的文件

没有开放 API 的软件——Logo、Mikro、Tally、SAP Business One 等——通过文件连接。之后数据的用法与已连接的软件完全相同：客户页面、匹配和健康分。

## 步骤

1. 在**设置 → 数据源 → 会计软件**中选择**上传文件**。
2. 在**上传**标签页中，下载客户、发票和收款的**模板**。
3. 从你的软件中导出相同内容，并按模板的列整理（Excel 或 CSV；多余的列会被忽略）。
4. 先上传客户，再上传发票，最后上传收款。

## 列

| 文件 | 列 |
| --- | --- |
| 客户 | customer_id, name, tax_id, email, website, currency, balance |
| 发票 | invoice_id, customer_id, number, issued_on, due_on, currency, total, balance, status |
| 收款 | payment_id, customer_id, invoice_id, paid_on, amount, currency |

日期格式为 YYYY-MM-DD。`status` 可以是 open、paid、void 或 draft；留空时，仍有欠款的发票视为未结。

## 更新的数据

随时上传新文件：它会替换同类的上一个文件。手动做的匹配会保留。文件不会被发送到其他任何地方。
