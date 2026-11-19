---
title: 会计软件
section: help
order: 8.2
summary: 只读连接会计软件：谁欠多少，显示在客户页面和健康分中。
---
# 会计软件

连接你的会计软件后，每个客户页面都会显示其欠款：未结余额、逾期金额和逾期天数、最近一次收款以及发票。逾期付款可以计入健康分。Curahold 只读取：绝不会向软件写入任何内容。

## 支持哪些软件

| 软件 | 连接方式 | 页面 |
| --- | --- | --- |
| Zoho Books | 使用 Zoho 登录 | [Zoho Books](/docs/zh-Hans/accounting-zohobooks/) |
| Xero | 使用 Xero 登录 | [Xero](/docs/zh-Hans/accounting-xero/) |
| Odoo | 地址、登录名和 API 密钥 | [Odoo](/docs/zh-Hans/accounting-odoo/) |
| freee | 使用 freee 登录 | [freee](/docs/zh-Hans/accounting-freee/) |
| Paraşüt | 公司编号、API 客户端和一位用户 | [Paraşüt](/docs/zh-Hans/accounting-parasut/) |
| QuickBooks Online | 使用 Intuit 登录 | [QuickBooks Online](/docs/zh-Hans/accounting-quickbooks/) |
| 其他软件（Logo、Mikro、Tally、SAP Business One…） | Excel 或 CSV 文件 | [文件](/docs/zh-Hans/accounting-file/) |

## 匹配客户

会计软件中的每个客户都会匹配到 Curahold 中的一个客户：先按税号，再按网址或邮箱域名，最后按名称（会忽略 Ltd.、A.Ş.、株式会社 等公司形式）。恰好只有一个客户符合时会自动匹配；没有或有多个符合时，会在连接的**匹配**标签页中等待。你可以在那里选择客户或将其排除。手动做的匹配会保留。

## 谁能看到数据

拥有**查看财务数据**权限的角色可以看到金额（初始为管理员和经理；可在 设置 → 角色 中更改）。其他能看到该客户的人只能在健康分中看到付款逾期了几天——永远看不到金额。

**财务**部门的成员无论角色如何也能看到金额，在 设置 → 部门 的**谁能在客户页面看到财务**中选中的部门也一样。关闭财务部门后，这项权限随之取消。

## 健康分中的逾期付款

开始首次读取时，可以勾选**把逾期付款计入健康分**。**按时付款**信号在没有逾期时给满分，在最早一张未付发票逾期 60 天时给 0 分；两个数字都可以在 设置 → 健康分 中修改。未与软件匹配的客户不计入。

## 连接状态

会计连接与其他连接一起显示在 设置 → 连接 中：正常、有问题或已暂停，以及上次正常工作的时间。
