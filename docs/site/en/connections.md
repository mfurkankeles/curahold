---
title: Connections and CRM
section: help
order: 8
summary: Slack, Teams and Google Chat; syncing with Salesforce, HubSpot and spreadsheets.
---
# Connections and CRM

Curahold works alongside the tools your team already uses. Manage connections in Settings → Connections and Settings → Data sources.

## Chat apps

With Slack, Microsoft Teams or Google Chat connected, notifications reach people as direct messages, and they can finish or reopen a task from the message itself.

## CRM and spreadsheets

Sync customers, contacts and opportunities with Salesforce, HubSpot, Microsoft Dynamics, Pipedrive, Zoho, Bitrix24, Freshsales, Zendesk Sell, Google Sheets and Excel. Open **Settings → CRMs and spreadsheets** and choose **Connect**.

1. **Sign in.** You are taken to the CRM's own sign-in page and approve what Curahold may read and write. No password is ever typed into Curahold. (Bitrix24, Freshsales and Zendesk Sell take a key instead; see below.)
2. **Pick what comes over.** Tick the objects you need and say what each one is in Curahold: customers, contacts, opportunities, a record type of your own, or tasks on a board.
3. **Match the fields.** Curahold suggests a match for each field; change any of them, and choose per field whether it only comes in or is kept the same on both sides.
4. **Check and start.** The preview shows how many would be added and updated before anything changes.

After that the sync runs by itself every hour, and a change made in Curahold is written to the CRM straight away. Whatever could not sync is listed with its reason and can be retried. When the same thing changed on both sides, the newer change wins; you can make the CRM or Curahold always win instead (the connection's Settings tab).

Connecting needs the permission to manage connections. People are matched by email, so each customer's owner in the CRM becomes its owner in Curahold.

## Salesforce

Comes over: accounts, contacts, opportunities, tasks and your custom objects. Tick **Sandbox** before connecting to use a test org.

If Salesforce answers that the app is not allowed, your Salesforce administrator has to allow Curahold first: Salesforce blocks apps an administrator has not installed or approved. Ask them to approve it, then connect again. The user who connects needs API access in Salesforce (included in Enterprise and above, an add-on in Professional).

## HubSpot

Comes over: companies, contacts, deals, tickets, tasks and custom objects. HubSpot asks which account to connect and lists what Curahold may read and write; contacts and deals are asked for only if your HubSpot plan has them.

## Microsoft Dynamics 365

Comes over: accounts, contacts, opportunities, cases, tasks and custom tables. Before signing in you give your organisation's address (it looks like `https://yourcompany.crm4.dynamics.com`). If Microsoft shows "Need admin approval", a Microsoft 365 administrator has to approve Curahold for your organisation once.

## Pipedrive

Comes over: organizations, people, deals and activities. Custom fields are matched like the standard ones.

## Zoho CRM

Comes over: accounts, contacts, deals, cases, tasks and custom modules. Curahold finds your Zoho data centre (US, EU, India, Australia…) by itself.

## Bitrix24, Freshsales and Zendesk Sell

These three connect with a key you create in the CRM itself, so there is no sign-in page and nothing for anyone to approve. Curahold checks the key the moment you paste it, stores it encrypted, and never shows it again; remove the connection and the key is gone. Everything after that is the same as for the other CRMs: you pick what comes over, match the fields, and changes go both ways.

| CRM | What to paste | Where to find it | Comes over |
| --- | --- | --- | --- |
| Bitrix24 | the inbound webhook address | Developer resources → Other → Inbound webhook; give it the CRM permission, and Users so owners can be matched | companies, contacts, deals |
| Freshsales | your address and the API key | your profile picture → Settings → API settings | accounts, contacts, deals |
| Zendesk Sell | an access token | Settings → Integrations → OAuth → Access tokens | companies, people, deals |

Good to know:

- **A key acts as the person who made it.** Curahold sees what that person sees in the CRM. Create the key with an account that can see every customer you want here.
- **Email, phone and web address in Bitrix24** are lists there. Curahold reads the first one and fills it in when it creates a new contact or company, but never rewrites the list afterwards.
- **Freshsales is read through its "All accounts", "All contacts" and "All deals" views.** If one of them has been renamed or removed, that list is not read and the run says so, instead of bringing only part of it.
- **A deal in Zendesk Sell needs a company.** A deal made in Curahold is created there under the customer's company.
- These connectors are new. If something does not come over the way you expect, write to us from Help in the product.

## Google Sheets and Excel

A spreadsheet is the simplest way to bring data in, and it works for any tool that can export one. Connect a Google Sheet, or an Excel file in OneDrive or SharePoint, tab by tab; each tab can be customers, contacts or a record type of your own. Pick the column that identifies a row, so a row that changes updates the same customer instead of adding a second one.

## Support tools

Zendesk, Freshdesk, Intercom and Jira Service Management connect with an address and an API key; tickets land under the right customer. Salesforce and Dynamics cases can be mapped as support tickets too. Details: [Support tickets](/docs/en/support-tickets/).

## Your own tools

To connect another system, see [API keys](/docs/en/api-keys/), [webhooks](/docs/en/webhooks/) or [AI assistants](/docs/en/ai-assistants/).
