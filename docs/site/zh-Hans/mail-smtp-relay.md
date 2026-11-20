---
title: 通过 Google Workspace 发送产品邮件（SMTP 中继）
section: developers
order: 11
summary: 面向管理员和运维人员——通过 Google Workspace SMTP 中继发送 Curahold 自身的邮件（登录链接、提醒、摘要）、托管服务与自托管的设置、限额，以及何时需要专用发信服务。
---
# 通过 Google Workspace 发送产品邮件（SMTP 中继）

> 面向管理员和运维人员。请先完成 DNS 指南：只有 SPF、DKIM、DMARC 都通过，中继才能良好投递。

Curahold 会发送登录链接、提醒、试用通知和摘要。普通 Gmail 邮箱不适合应用发信；Google 的 **SMTP 中继服务**正是为此设计，仍在 Google Workspace 内，无需其他邮件服务。

## 1. 开启中继

管理控制台 → 应用 → Google Workspace → Gmail → **路由** → **SMTP 中继服务** → 配置：

- **允许的发件人：**仅限我的网域中的地址。
- **身份验证：**勾选**要求 SMTP 身份验证**（托管服务运行在没有固定地址的服务器上，因此通过登录而不是白名单）。固定地址的自托管也可选“仅接受指定 IP 地址的邮件”。
- **加密：**勾选**要求 TLS 加密**。
- 保存。生效最多需要一小时。

## 2. 发信账号

选择登录中继的用户（所有者账号即可），开启两步验证并为其创建**应用专用密码**。把 `no-reply@` 设为该用户的别名。

## 3. 配置 Curahold

**托管（Cloudflare Workers）**——作为密钥设置（`wrangler secret put …`）：

| 设置 | 值 |
| --- | --- |
| `SMTP_RELAY_USER` | 第 2 步的用户，例如 `owner@example.com` |
| `SMTP_RELAY_PASSWORD` | 其应用专用密码 |
| `EMAIL_FROM` | `Curahold <no-reply@example.com>` |
| `EMAIL_PROVIDER` | `google_relay`（设置了上面两项时自动选择） |
| `SMTP_RELAY_HOST`、`SMTP_RELAY_PORT` | 仅在更改默认值 `smtp-relay.gmail.com`、`587` 时设置 |

代码路径：`api/src/lib/smtpRelay.ts`（587 端口 STARTTLS；Workers 上 25 端口关闭）。

**自托管**——在 `.env` 文件中：

```
SMTP_URL=smtp://owner%40example.com:APP-PASSWORD@smtp-relay.gmail.com:587
EMAIL_FROM=Curahold <no-reply@example.com>
```

然后重启应用。

## 4. 检查

退出登录并请求登录链接。邮件应来自 `no-reply@…`，且 SPF、DKIM、DMARC 显示 **PASS**。若没有收到，应用日志会写明失败的 SMTP 步骤。

## 5. 限额——何时需要专用发信服务

中继每个用户每天最多接受 **10,000 名收件人**（Google 公布的限额；请核实）。出现以下**任一**情况时，需要把产品邮件迁移到专用发信服务（由所有者决定，且需付费）：

- 每日产品邮件经常超过限额的**一半**（每天 5,000 名收件人）；
- 投递率下降：退信超过 **2%**、投诉接近 **0.1%**，或邮件进入垃圾箱；
- 需要逐封投递事件（webhook）或为不同邮件类型分开发信信誉；
- 计划**营销活动**——绝不通过中继发送。

切换只是一项设置：托管服务已内置专用服务的驱动（`EMAIL_PROVIDER=resend` 加 `RESEND_API_KEY`）。先把它加入子处理者页面，并提前 30 天通知管理员。

## 6. 邮件发不出去时 {#failures}

临时拒绝（`421`、`450`、`451` 或连接中断）会用新的连接再试一次。永久拒绝不会重试：`535`（应用专用密码已更改或撤销：新建一个并替换 `SMTP_RELAY_PASSWORD`）、`550 5.4.5`（每日上限）、`550 5.1.1`（地址不存在）。这时用户会看到用自己语言写的“暂时无法发送邮件。请几分钟后再试；如果一直这样，请告诉你的管理员。”，永远看不到中继服务器的应答；应答会连同 SMTP 步骤写入应用的错误日志。
