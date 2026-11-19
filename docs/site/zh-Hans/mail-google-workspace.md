---
title: 用 Google Workspace 在自己的域名上收发邮件
section: developers
order: 10
summary: 面向管理员和运维人员——在 Google Workspace 上运行公司邮件所需的 DNS 记录（MX、SPF、DKIM、DMARC）和邮箱规划。
---
# 用 Google Workspace 在自己的域名上收发邮件

> 面向管理员和运维人员。Google 的界面和限额会变化；以下数值依据截至 2026 年 11 月 19 日的 Google 管理员帮助——操作时请在管理控制台中核对。

## 1. 邮箱：少用席位，多用地址

Workspace 按用户收费，因此用户要少，其余都用**别名**或**群组**：

| 地址 | 用途 | 方式 |
| --- | --- | --- |
| 您自己的地址 | 所有者 | 用户（1 个席位） |
| hello@、billing@、security@、social@ | 外部来信的邮箱 | 所有者的别名或群组 |
| support@ | 共享支持邮箱 | 开启“协作收件箱”的 Google 群组 |
| no-reply@ | 产品邮件的发件人 | 登录中继的用户的别名（见下一篇） |

先为每个用户开启**两步验证**。

## 2. DNS 记录

在 DNS 服务商处添加（例如 Cloudflare：DNS → Records）。把 `example.com` 换成您的域名。

| 类型 | 名称 | 值 | 作用 |
| --- | --- | --- | --- |
| MX | `@` | `smtp.google.com`，优先级 1 | 域名邮件投递到 Gmail |
| TXT | `@` | `v=spf1 include:_spf.google.com ~all` | SPF：允许 Google 代表域名发信。只能有一条 SPF 记录——已有则合并 |
| TXT | `google._domainkey` | 管理控制台给出的密钥 | DKIM：为每封邮件签名 |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@example.com; adkim=s; aspf=s` | DMARC：告诉收件方如何处理验证失败的邮件 |

**DKIM：**管理控制台 → 应用 → Google Workspace → Gmail → 验证电子邮件 → 生成新记录（2048 位，选择器 `google`）→ 发布 TXT 记录 → 返回控制台点击**开始身份验证**。

**DMARC 分三步：**先用 `p=none` 并阅读 2–4 周报告；再改为 `p=quarantine`；只剩自己的发件方时改为 `p=reject`。发布前先建好 `dmarc@` 地址。

## 3. 检查

向外部地址发一封邮件，打开后选择**显示原始邮件**：SPF、DKIM、DMARC 都应为 **PASS**。

## 4. 批量发送规则

Gmail 等大型邮箱服务商要求大量发信者：同时具备 SPF、DKIM 和 DMARC，营销邮件提供一键退订，投诉率远低于 0.3%。切勿从个人邮箱发送营销邮件；营销需要收件人许可（见隐私声明）。
