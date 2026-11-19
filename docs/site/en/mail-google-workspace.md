---
title: E-mail on your domain with Google Workspace
section: developers
order: 10
summary: For administrators and operators — the DNS records (MX, SPF, DKIM, DMARC) and the mailbox plan for running a company's own mail on Google Workspace.
---
# E-mail on your domain with Google Workspace

> For administrators and operators. Google's screens and limits change; the values below were checked against Google's admin help as known on 19 Nov 2026 — confirm them in the Admin console as you go.

## 1. Mailboxes: few seats, many addresses

Workspace is paid per user, so keep users few and give everything else an **alias** or a **group**:

| Address | What it is | How |
| --- | --- | --- |
| your own address | the owner | user (1 seat) |
| hello@, billing@, security@, social@ | inboxes people write to | aliases of the owner, or groups |
| support@ | shared support inbox | Google Group with "collaborative inbox" on |
| no-reply@ | sender of the product's e-mails | alias of a user that authenticates to the relay (next guide) |

Turn on **2-Step Verification** for every user before anything else.

## 2. DNS records

Add these at your DNS host (for example Cloudflare: DNS → Records). Replace `example.com` with your domain.

| Type | Name | Value | Why |
| --- | --- | --- | --- |
| MX | `@` | `smtp.google.com`, priority 1 | Mail for the domain goes to Gmail |
| TXT | `@` | `v=spf1 include:_spf.google.com ~all` | SPF: Google may send for the domain. One SPF record only — merge if one exists |
| TXT | `google._domainkey` | the key the Admin console gives you | DKIM: signs every message |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@example.com; adkim=s; aspf=s` | DMARC: tells receivers what to do with mail that fails |

**DKIM:** Admin console → Apps → Google Workspace → Gmail → Authenticate email → Generate new record (2048-bit, selector `google`) → publish the TXT record → back in the console, **Start authentication**.

**DMARC in three steps:** start with `p=none` and read the reports for 2–4 weeks; then `p=quarantine`; then `p=reject` once only your own senders appear. Create the `dmarc@` address (alias or group) before you publish.

## 3. Check it

Send a message to an outside address, open it, choose **Show original**: SPF, DKIM and DMARC must all say **PASS**. Google's Check MX tool (toolbox) checks the records.

## 4. Rules for sending in bulk

Gmail and other large mailbox providers require, from anyone who sends a lot: SPF **and** DKIM **and** DMARC, a one-click unsubscribe in marketing mail, and a spam-complaint rate kept well under 0.3%. Never send marketing mail from a personal mailbox; marketing needs the recipient's permission (see the Privacy notice).
