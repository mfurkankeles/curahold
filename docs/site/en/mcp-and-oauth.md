---
title: AI connector (MCP) and OAuth
section: developers
order: 6
summary: The MCP server, its tools, the OAuth 2.1 flow and connecting your own app.
---
# AI connector (MCP) and OAuth

Tendwell runs a server that any assistant speaking the Model Context Protocol (MCP) can connect to: Claude, ChatGPT and others. For the user side, see [Connecting Claude and ChatGPT](/docs/en/ai-assistants/).

## The server

```text
Address     https://yourcompany.tendwell.com/mcp
Transport   Streamable HTTP (JSON-RPC 2.0, POST)
Auth        OAuth 2.1, Bearer access token
```

A request without a token gets `401` with this header; MCP clients start the consent flow from it by themselves:

```http
WWW-Authenticate: Bearer resource_metadata="https://yourcompany.tendwell.com/.well-known/oauth-protected-resource"
```

## Tools

| Tool | Does | Writes |
| --- | --- | --- |
| `search` | Finds customers, tasks, records and people; returns ids for `fetch` | No |
| `fetch` | Everything about an `account:…`, `task:…` or `record:…` id; for a customer, its timeline and health score with reasons too | No |
| `list_accounts` | Customers and their fields; by name or "mine" | No |
| `list_tasks` | Tasks; the person's own by default, with a date range | No |
| `portfolio_summary` | The data behind the person's home-page cards; for summaries and presentations | No |
| `create_task` | Opens a task. Board and customer by name; people by email or name | Yes |
| `add_note` | Logs a note, call, meeting or email on a customer's timeline | Yes |
| `update_task` | Moves a task to a column or finishes it, changes date and priority, adds a comment | Yes |

Writing tools are listed only if the person ticked **Also allow changes** on the consent screen and has a full seat. Every tool call goes through the API the app uses; role, customer access and field rules apply unchanged.

## The OAuth 2.1 flow

Most MCP clients do this by themselves. If you are writing your own:

1. **Discovery:** `GET /.well-known/oauth-protected-resource`, then `GET /.well-known/oauth-authorization-server`.
2. **Registration (RFC 7591):** `POST /oauth/register` with `client_name` and `redirect_uris`. Redirect addresses must be `https`, or loopback (`http://127.0.0.1`, `http://localhost`). The answer carries a `client_id`; there is no client secret.
3. **Authorisation:** send the person to `GET /oauth/authorize` with `response_type=code`, `client_id`, `redirect_uri`, `code_challenge` (S256), `code_challenge_method=S256`, `state` and, optionally, `scope=read write`.
4. The person sees Tendwell's consent screen, signs in and approves. The browser returns to `redirect_uri?code=…&state=…`.
5. **Token:** `POST /oauth/token` with `grant_type=authorization_code`, `code`, `client_id`, `redirect_uri`, `code_verifier`.
6. **Refresh:** access tokens last 1 hour. Refresh with `grant_type=refresh_token`; each refresh returns a new refresh token and retires the old one. A refresh token unused for 90 days lapses.

```bash
curl -X POST https://yourcompany.tendwell.com/oauth/token \
  -d grant_type=authorization_code -d code=… -d client_id=twc_… \
  -d redirect_uri=https://yourapp.example/callback -d code_verifier=…
```

## OAuth for your own app

Use the same flow for an app other people will use. Your app calls the REST API (`/api/...`) with the access token and works as the person who approved it. They can disconnect it any time in their settings; an admin can in Settings → Developers.

## Cost

The assistant runs on the person's own Claude or ChatGPT plan. Tendwell only provides the data and charges nothing extra for AI.
