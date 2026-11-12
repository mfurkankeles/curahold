# The fixed-address relay

Salesforce asks partner apps used by more than a couple of customers to renew
their tokens only from addresses it has been told about. Curahold runs on
Cloudflare Workers, which do not have one. This relay is the smallest thing
that fixes it: a single file, no dependencies, on a small server with a fixed
address. Only Salesforce's token requests go through it (about one an hour per
connected Salesforce); everything else still goes direct.

It is **off until you turn it on**. Nothing in Curahold needs it before the
Salesforce control is enforced for our app; the monthly cost of the server
(about $4–6, the same whether there are 5 seats or 5,000) starts only then.

## What it does and refuses

- `POST /` with the right `x-relay-key` and an `x-relay-target` that is
  Salesforce's token address (`https://…salesforce.com/services/oauth2/token`):
  the form body is sent on and the answer comes back unchanged.
- Any other address, method, body type or caller is refused (403, 405, 415, 401).
- Nothing is stored. The log has one line per request: time, Salesforce host,
  status. Never a body, a token or a key.
- `GET /health` answers `ok`, for an uptime check.

The relay does see refresh tokens and the app's client secret pass through, so
it must run on a server only you control, behind TLS, with a long random key.

## Setting it up (about 15 minutes)

1. Rent the smallest server with a fixed IPv4 address in a region near the
   Worker. Install Node 20 or newer and Caddy.
2. Copy `relay.mjs` to `/opt/curahold-relay/relay.mjs`.
3. Make a key of 32 or more random characters, for example `openssl rand -hex 32`.
4. `/etc/systemd/system/curahold-relay.service`:

   ```ini
   [Unit]
   Description=Curahold relay
   After=network.target

   [Service]
   Environment=PORT=8787
   Environment=RELAY_KEY=<the key>
   ExecStart=/usr/bin/node /opt/curahold-relay/relay.mjs
   Restart=always
   DynamicUser=yes
   NoNewPrivileges=yes
   ProtectSystem=strict

   [Install]
   WantedBy=multi-user.target
   ```

   Then `systemctl enable --now curahold-relay`.
5. Point a name at the server (for example `relay.<your domain>`) and let Caddy
   answer for it with a certificate. `/etc/caddy/Caddyfile`:

   ```
   relay.example.com {
       reverse_proxy 127.0.0.1:8787
   }
   ```

6. Close every port but 443 (and SSH from your own address) in the server's firewall.
7. On the Curahold server set two secrets: `SALESFORCE_RELAY_URL=https://relay.example.com/`
   and `SALESFORCE_RELAY_KEY=<the key>`.
8. In Salesforce, add the server's address to the app's allowed addresses for
   token renewal.

To check: `curl https://relay.example.com/health` answers `ok`, and the next
Salesforce sync shows a line in `journalctl -u curahold-relay`.

## If it is down

Salesforce connections cannot renew their tokens until it is back; nothing is
lost, the sync catches up on its next run. Other CRMs are not affected. An
uptime check on `/health` is worth the two minutes.
