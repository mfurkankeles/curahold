---
title: QuickBooks Online（会计）
section: help
order: 8.26
summary: 以只读方式连接 QuickBooks Online：在每个客户页面上查看未结余额、逾期发票和收款。
---
# QuickBooks Online（会计）

来自 QuickBooks Online 的客户、发票和收款。

## 读取哪些内容

客户（以及软件中保存的税号、邮箱和网址）、带到期日和未付金额的发票，以及收到的款项。Curahold 绝不会写入 QuickBooks Online：它无法在那里创建、更改或删除任何内容。

## 连接

在**设置 → 数据源**中找到**会计软件**，选择**连接 QuickBooks Online**。然后：

1. 登录 Intuit 并选择要连接的 QuickBooks 公司。
2. 允许访问会计数据；Curahold 只读取客户、发票和收款。
3. 回到这里后，开始首次读取，并检查未能匹配的客户。

## 限制与时间

Intuit 允许每家公司每分钟 500 次请求，并对超出免费层级的读取向应用开发者收费，因此 Curahold 只请求自上次运行以来的变更，每页 1,000 条。每小时读取一次变更，每天完整读取一次。

## 出现问题时

如果 QuickBooks Online 不再接受连接（密钥或登录被撤销），该连接会在 设置 → 连接 中标记为"有问题"，并通知管理员一次；在其页面上选择**重新连接**。速率限制的回复不是错误：本次运行会停下、记住位置，下次继续。

## 另请参阅

- [会计软件](/docs/zh-Hans/accounting/)
