---
title: Product e-mail through Google Workspace (SMTP relay)
section: developers
order: 11
summary: For administrators and operators — sending Curahold's own e-mails (sign-in links, reminders, summaries) through the Google Workspace SMTP relay, the settings for the hosted service and for self-hosting, the limits, and when a dedicated sending service becomes necessary.
---
# Product e-mail through Google Workspace (SMTP relay)

> For administrators and operators. Do the DNS guide first (*E-mail on your domain with Google Workspace*): the relay only delivers well when SPF, DKIM and DMARC pass.

Curahold sends sign-in links, reminders, trial notices and summaries. A normal Gmail mailbox is not meant for an application's mail; Google's **SMTP relay service** is. It stays inside Google Workspace, so no other mail service is needed.

## 1. Turn on the relay

Admin console → Apps → Google Workspace → Gmail → **Routing** → **SMTP relay service** → Configure:

- **Allowed senders:** only addresses in my domains.
- **Authentication:** tick **Require SMTP Authentication** (the hosted service runs on servers without a fixed address, so it signs in instead of being allow-listed). Self-hosting on a fixed address may use "Only accept mail from the specified IP addresses" instead.
- **Encryption:** tick **Require TLS encryption**.
- Save. It can take up to an hour to work.

## 2. The sending account

Pick the user that will sign in to the relay (the owner is enough), with 2-Step Verification on, and create an **app password** for it (Google account → Security → App passwords). Add `no-reply@` as an alias of that user, so the product’s mail comes from your own domain.

## 3. Tell Curahold

**Hosted (Cloudflare Workers)** — set as secrets (`wrangler secret put …`):

| Setting | Value |
| --- | --- |
| `SMTP_RELAY_USER` | the user from step 2, e.g. `owner@example.com` |
| `SMTP_RELAY_PASSWORD` | its app password |
| `EMAIL_FROM` | `Curahold <no-reply@example.com>` |
| `EMAIL_PROVIDER` | `google_relay` (chosen automatically when the two above are set) |
| `SMTP_RELAY_HOST`, `SMTP_RELAY_PORT` | only to change the defaults `smtp-relay.gmail.com`, `587` |

The code path is `api/src/lib/smtpRelay.ts` (STARTTLS on port 587; port 25 is closed on Workers).

**Self-hosted** — in the `.env` file:

```
SMTP_URL=smtp://owner%40example.com:APP-PASSWORD@smtp-relay.gmail.com:587
EMAIL_FROM=Curahold <no-reply@example.com>
```

(`%40` stands for the at sign of the user name.) Restart the app.

## 4. Check it

Sign out and ask for a sign-in link. The message must arrive from `no-reply@…`, and **Show original** must show SPF, DKIM and DMARC **PASS**. If nothing arrives, the app's log names the SMTP step that failed (greeting, starttls, auth, rcpt to…).

## 5. Limits — and when a dedicated sending service becomes necessary

The relay accepts up to **10,000 recipients a day per user** (Google's published limit; check the admin help, it changes). Move the product's mail to a dedicated sending service — a decision for the owner, and a paid one — when **any** of these happens:

- daily product mail regularly passes about **half the limit** (5,000 recipients a day);
- deliverability drops: bounces above **2%**, spam complaints near **0.1%**, or mail starts landing in spam;
- you need per-message delivery events (webhooks) or separate sending reputations for different kinds of mail;
- you plan **marketing campaigns** — never through the relay.

Switching is a setting: the hosted service already has a driver for a dedicated service (`EMAIL_PROVIDER=resend` with `RESEND_API_KEY`). Add it to the Sub-processors page and give administrators 30 days' notice first.
