---
title: Security and privacy
section: help
order: 10
summary: Company separation, sessions, the activity log, exporting and erasing personal data.
---
# Security and privacy

## Companies cannot see each other

Every query runs under row-level security rules in the database. One company's data cannot be read from another company's address, API or connector in any way. Role and field rules are enforced in the same layer.

## Sessions and devices

Sessions are bound to the device; a copied cookie does not work on another machine. Going over the device limit signs the oldest session out. See and end your sessions in Your settings → Devices.

## Passkeys and the second step

Besides the emailed link, you can sign in with a **passkey** (fingerprint, face or device PIN) and add a **second step**: an authenticator app, with ten one-time recovery codes for a lost phone. Set them up in **My devices → Sign-in security**, where you can also sign out every other device at once. An administrator can require a second step of administrators or of everyone in **Settings → Sign-in**; it is checked on the server at every sign-in. People who sign in with single sign-on are not asked again: the identity provider does it. Nobody is locked out: an administrator can reset someone's second step, and a self-hosted install has a reset in the server's environment (`RESET_SECOND_STEP`).

Changing roles, single sign-on or SCIM, making an API key, exporting or erasing personal data, removing a person and exporting the activity log ask you to confirm it is you (passkey, app code or an emailed code) when your sign-in is more than ten minutes old.

## What is kept on the device

So that you can read without a connection, the app keeps a copy of the lists you last saw in the browser's own storage (your tasks, boards, customers, the inbox; not attachments, not settings). The copy stays on that device and in that browser and is sent nowhere. It is removed when you sign out, or at the first connection after your session was ended on the server. On a shared computer, sign out when you are done.

## Activity log

Sign-ins, second steps, changes to people and roles, connections, API keys, webhooks and personal-data actions are written to the activity log, in Settings → Activity log. An entry is never changed, and not even the database role the application uses can remove one; after 12 months the nightly clean-up lets it go (the database refuses to remove anything newer than 90 days). **Export the log** downloads it with a running SHA-256 fingerprint; the final fingerprint is written to the log too, so a copy can be checked later.

## Customer portal

The customer portal runs on a separate domain with its own sessions and cookie. The database role behind portal requests has no privileges on any table; it can only call functions that return the shared data of the signed-in person's own company. Details: [Customer portal](/docs/en/customer-portal/).

## Curahold support's access

Curahold support only comes into a company with a person's consent: they tick the box on a help request and choose for how long (24 hours to 7 days). Support sees what that person sees and can only look: it can never change anything. Access ends when the chosen time is up and can be closed at any moment. Every visit, and what support reads while it lasts, is written to the activity log with the support person's name. Administrators can limit this to administrators or turn it off in **Settings → Security → Support access**. Details: [Getting help](/docs/en/getting-help/).

## Personal data

In Settings → People, a person's menu offers:

- **Download their data:** everything about that person in one file.
- **Erase their personal data:** name and email are removed; the work they did stays, anonymised. Hand their customers and open tasks to someone else first.
- **Erasing** also removes what they asked CuraAI, their notifications, chat links, passkeys and second steps, session recordings, and mentions of their address or full name in the AI team's notes. Kept, because the law asks for it: invoices, the record of who accepted the terms for the company, and consent records without the address (only its fingerprint).
- **People at your customers** (Settings → Customer portal → People who can sign in): an administrator who manages privacy can **Download data** or **Erase personal data**. Erasing deletes the portal account itself; what they wrote stays without their name.

### Deleting the whole company

An administrator can ask, in **Settings → Company → Delete the company**, by typing the company's address. Nothing is deleted for 30 days: the company works as usual, you can still export, and any administrator can cancel. Then everything goes for good, files and connection keys included, and a deletion certificate is kept that lists what was removed (no names or addresses). Invoices stay, as tax law requires. Backups roll off on the hosting provider's schedule.

### Requests about personal data

In **Settings → Company → Requests about personal data**, people with the privacy permission log every request a person makes about their data: access, correction, erasure, restriction, objection, portability or withdrawn consent, with the law that applies. The due date comes from that law (for example 30 days under KVKK and the GDPR, 10 under Korea’s PIPA), and an overdue request is marked in red with an icon. Mark it answered or refused once it is done; each change is in the activity log. The export and erase actions on the person do the work itself.

## How long things are kept

| Data | Kept for |
| --- | --- |
| Notifications | 90 days |
| Ended sessions | 90 days |
| Sync history | 90 days |
| Deleted customers, records, tasks and the rest, in the [trash](/docs/en/trash/) | 30 days, then erased with their files; an administrator can erase sooner |
| Undo data for imports | 30 days |
| Webhook delivery records | 7 days |
| Error records (what broke, where — never request contents) | 30 days |
| Revoked API keys | 30 days |
| Activity log | 12 months |
| Help requests, their messages and files | 24 months after the last change |
| Questions to CuraAI | As your company chose (30 days unless changed) |
| A deleted company | 30 days after the request, then erased |

## Stored secrets

Credentials for CRM and chat connections, and webhook signing secrets, are stored encrypted. Of API keys only a digest is kept: the key itself is shown once and can never be seen again.

## Single sign-on (SSO) and SCIM {#sso}

In Settings → **Single sign-on (SSO)**: choose the **Protocol**, give your identity provider the values under **Give your identity provider these details**, fill in **Your identity provider's details**, save, then press **Test sign-in**. A test signs nobody in and does not switch SSO on. **Require SSO for this company** can be turned on only after a test with exactly the saved details has passed, and with a backup administrator who has a passkey or an authenticator app.

When a test does not pass, it says why:

- the client secret was refused (it was renewed at the provider): paste the new one into **Client secret** and save;
- the signature did not match (the provider renewed its key or certificate): for SAML, paste the new one into **IdP signing certificate**; OpenID Connect picks up a new key by itself;
- the answer was for another app or out of date: check **Issuer**, **Client ID** and the provider's clock;
- the provider could not be reached: check **Token endpoint** and **JWKS URL**, then wait a minute.

People signing in see only that their provider did not complete the sign-in, and land back on the sign-in page.

**SCIM provisioning**: **Generate token** shows the token once; give it to the provider with the **SCIM base URL**. A person deactivated there loses every session and API key at once, and a rename arrives too. Generating a new token stops the old one at once.
