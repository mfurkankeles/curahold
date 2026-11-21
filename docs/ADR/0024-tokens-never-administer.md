# 0024. API keys and app tokens never administer; they can be limited to areas

- Status: Accepted
- Date: 2026-11-21
- Deciders: engineering (security audit H1)

## Context

An API key or an OAuth app token acted as its person with the person's whole role; only read versus write could be
chosen. `requireFresh()` — the "confirm it is you" step in front of roles, SSO and SCIM, erasure, exports and company
deletion — let every token straight through. So an app an administrator connected with "write", or anyone holding a
stolen key, could point the company at an identity provider it controls, enable it and sign in as every person; it
could also change roles, erase people and open a company deletion. Only a few routes refused tokens one by one.

## Decision

- One list in `api/src/lib/tokenScope.ts` closes addresses to every token, checked in the person middleware before
  any route runs: `/admin`, `/sso`, `/billing`, `/dev` (keys and analytics keys; outgoing webhooks stay open because automation
  platforms subscribe them with a key), code-host and incoming hook
  configuration, `/connections`, the person's own security, sessions, confirmation and data export, support access,
  agreements and consent, setup, the console and session recordings. The answer is `403 session_required`.
- One rule for everything else (review S1, 21 Nov): the administrator-level permissions (`ADMIN_PERMS` in
  `shared/src/model.ts`: org, people, teams, audit, privacy, customer settings, automations, connections) are withheld
  from every token. The route's `requirePerm` answers `session_required`, inline checks see the permission missing,
  and row security refuses it too: `app_has_perm` reads `app.withheld` (migration 0259). So assistant and portal
  settings, departments and their people, meeting types, record types, health settings, imports and every future
  route that asks for such a permission are for a signed-in person, wherever their path is. The only exception is
  `connections.manage` on `/dev/webhooks` (below). `tests/token-scope.test.ts` calls every such route with an
  administrator's writing key.
- `requireFresh()` refuses a token (`session_required`) instead of passing it, so a new dangerous route that forgets the
  list is still closed.
- A key (`areas` on `POST /api/dev/keys`) or an app (`scope=work:write customers:read`) may be limited to areas, each
  read or write: `work`, `customers`, `reports`, `people`, `webhooks`. Outside them: `403 token_scope`; `GET /api/me` always works.
  No areas means every area, as before. Approving an app for reading only turns its write grants into reads.
- `tests/token-scope.test.ts` calls the dangerous addresses with an administrator's writing key and checks that every
  API address is either session-only, in an area, or on the short list of public doors. An area an app asks for that
  does not exist is refused (`invalid_scope`), never widened.

## Alternatives considered

- Refusing tokens in each route: what existed; it missed most administration routes. A path list in one place is
  checked by a test against every route.
- An explicit `admin` scope for machine administration: not needed by any integration today; it can be added later
  as a scope chosen on the consent screen and at key creation, with the second step in front of it.
- Per-permission scopes: finer, but every new permission would need consent words in eleven languages. Four areas
  cover what integrations ask for.

## Consequences

- Customer imports, bulk changes, customer deletion and automations are no longer reachable with a key (they need
  `accounts.manage` or `automations.manage`); a narrow, explicit grant can be added later if an integration needs one.
- Integrations that managed connections with a key must be set up by a person in the app; the help pages (API keys,
  MCP and OAuth) say so. Subscribing outgoing webhooks keeps working with a key (the Zapier and Make apps do it), with
  `connections.manage` as before and the creator's visibility on every delivery (audit M4).
- The area picker is in the API only; the key form and the consent screen still offer read or write. A screen for
  areas needs words in every dictionary and is a follow-up.
- Every new API path segment must be classified in `tokenScope.ts`; the test fails otherwise.
