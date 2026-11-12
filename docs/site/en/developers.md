---
title: Developer overview
section: developers
order: 1
summary: Ways to connect to Curahold, authentication and the ground rules.
---
# Developer overview

There are four ways to connect your own tools to Curahold. All follow one rule: **a request is always made as a person**, and that person's role, customer access and field rules apply unchanged.

| Way | For | Identity |
| --- | --- | --- |
| [REST API](/docs/en/api-reference/) | Your scripts, Zapier, Make, reports | Personal API key (`chk_…`) |
| [Webhooks](/docs/en/webhooks/) | Hear about changes in your own system | Signed messages (HMAC-SHA256) |
| [AI connector (MCP)](/docs/en/mcp-and-oauth/) | Claude, ChatGPT and other assistants | OAuth 2.1 |
| [OAuth apps](/docs/en/mcp-and-oauth/#oauth-for-your-own-app) | Apps other people will use | OAuth 2.1 + PKCE |

## Where to start

| If you want to | Read |
| --- | --- |
| Make a first request in five minutes | [Quickstart](/docs/en/quickstart/) |
| Understand how the API thinks, with examples | [API guide](/docs/en/api-reference/) |
| Look up an address, field by field | Reference: [customers](/docs/en/ref-customers/), [records](/docs/en/ref-records/), [tasks and boards](/docs/en/ref-tasks/), [people and search](/docs/en/ref-people/), [pages and reports](/docs/en/ref-pages/), [automations](/docs/en/ref-automation/), [objects](/docs/en/ref-objects/), [errors](/docs/en/ref-errors/) |
| Keep a system of your own in step | [Connect your own tool](/docs/en/connect-your-own-tool/) |
| Be told when something changes | [Webhooks](/docs/en/webhooks/) |
| Let an AI assistant or your own app act for a person | [AI connector and OAuth](/docs/en/mcp-and-oauth/) |

The reference pages are built from the product's own code on every release, so they always match what the API accepts.

## Addresses

Every company has its own address. Replace `yourcompany` in the examples with yours.

```text
API     https://yourcompany.curahold.com/api
MCP     https://yourcompany.curahold.com/mcp
OAuth   https://yourcompany.curahold.com/.well-known/oauth-authorization-server
Docs    https://yourcompany.curahold.com/docs/
```

## What is open and what is not

Open: customers, records (contacts, opportunities, your own kinds), tasks, comments, boards, people, home-page data and search. Webhooks report changes to these.

Not open: company settings and roles cannot be changed with API keys, a key cannot create another key, and OAuth consent is only ever given by the person in their browser. The product's own code and database are never exposed; everything the API does is something the app can do.

## Errors

Errors always look the same:

```json
{ "error": "read_only_token", "message": "This key or app can only read." }
```

| Status | Meaning |
| --- | --- |
| 400 | What you sent is not valid (`validation`, `bad_webhook_url`) |
| 401 | No key, a wrong one, or expired or revoked |
| 403 | This person or key may not do that (`forbidden`, `read_only_token`, `read_only_seat`, `field_locked`) |
| 404 | Not there, or this person cannot see it |
| 409 | The task changed since you read it; try again on the current version |

`message` follows the request language: send `x-curahold-locale: en` or `tr`.

## Limits

- List endpoints return at most 500 items; page with `limit` and `offset`.
- A company can have up to 20 webhooks.
- Search returns at most 6 results of each kind.
- Event-driven use is expected: use webhooks rather than polling for changes.
