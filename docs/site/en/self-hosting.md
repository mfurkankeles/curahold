---
title: Running Curahold on your own server
section: developers
order: 7
summary: One company on your own machine: what you need, the settings, the first sign-in, HTTPS, backups and updates.
---
# Running Curahold on your own server

Some companies keep their tools inside their own walls. Curahold runs there too: one company, your own Postgres database, attachments on your own disk and mail through your own mail server. Nothing is sent to Curahold, and there is no subscription: everything is open.

## What you need

- A Linux machine with Docker. Two processors, 2 GB of memory and 20 GB of disk are plenty for a few hundred people.
- An address for it, such as `curahold.example.com`, and a web server with HTTPS in front (Caddy, nginx or Traefik).
- A mail server (SMTP) for sign-in links, reminders and summaries.

## Install

1. Get the Curahold package from your Curahold contact and unpack it on the machine.
2. Copy `selfhost.env.example` to `.env` and fill it in (see the settings below).
3. Run `docker compose up -d`. The first start takes a few minutes: it builds the app, prepares the database and creates your company.
4. Send your address to `127.0.0.1:8080` from your HTTPS web server. With Caddy, this is all it takes:

```
curahold.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

5. Open your address and sign in with the administrator's email address. The link arrives by email; until mail is set up, it is in the output of `docker compose logs app`.

From there, setting up works as on curahold.com: invite your team, add your customers, connect your chat app.

## The settings

| Setting | What it is |
| --- | --- |
| `PUBLIC_URL` | The address people open, exactly as in the browser, e.g. `https://curahold.example.com` |
| `AUTH_SECRET` | 32 or more random characters, e.g. from `openssl rand -base64 48`. Keep it secret: changing it signs everyone out |
| `DB_PASSWORD` | The database password (letters and digits) |
| `COMPANY_NAME`, `ADMIN_EMAIL`, `ADMIN_NAME` | Your company and its first administrator, created on the first start |
| `LOCALE`, `TIMEZONE`, `CURRENCY` | `en` or `tr`; e.g. `Europe/Istanbul`; e.g. `USD` |
| `SMTP_URL`, `EMAIL_FROM` | Your mail server, e.g. `smtp://user:password@mail.example.com:587`, and the sender, e.g. `Curahold <curahold@example.com>` |
| `PORTAL_DOMAIN` | Optional: the customer portal's own address, e.g. `portal.example.com`. Send it to the same `127.0.0.1:8080` |

Google and Microsoft sign-in, the chat apps and the CRMs use the same settings as on curahold.com; your Curahold contact has the list.

## Backups

Your data lives in two places: the database and the attachments.

```
docker compose exec -T db pg_dump -U curahold curahold > curahold-$(date +%F).sql
docker compose cp app:/data/files ./attachments-$(date +%F)
```

Keep the copies on another machine, and try a restore now and then.

## Updating

Unpack the new package over the old one (keep your `.env`), then run `docker compose up -d --build`. The database is brought up to date when the app starts; take a backup first.

## Good to know

- Plans and billing do not apply on your own server: everything is open.
- Without Docker: Node 22 and Postgres 16 or newer. Build with `npm ci && npm run build && npm run build:server`, then start `node dist/server/selfhost.mjs` with the same settings in the environment and `DATABASE_URL` pointing at your database. On the first start, the database user must be allowed to create roles.
- For your monitoring: `/api/health` on your address answers `{"ok":true}` while the app is up.
