# Curahold threat model

Written 15 November 2026 (Tur 2, package "Güvenlik"). One section per surface: who attacks it, what they
want, and which control stops them, with the file or test that proves the control. Status words: **held**
(control in place and tested), **partial** (control in place, a gap named), **open** (no control yet).
The ASVS / API Top 10 pass that goes item by item is [asvs.md](asvs.md).

## Assets, in order of harm

1. One company's data reaching another company (customers, contacts, notes, tasks, files).
2. A person seeing or changing what their role does not allow (fields, private boards, admin settings).
3. Credentials: sessions, API keys, sealed CRM / chat / Jira / SSO secrets, webhook secrets.
4. Availability and cost: request floods, email bombing through invitations and sign-in links.
5. The integrity of records: silent overwrites, lost edits.

## Attackers

- **A1 Stranger** anywhere on the web: no account. Guesses addresses, floods sign-in, sends forged webhooks.
- **A2 Other company's user**: a real account at another company on the same service.
- **A3 Employee with a narrow role**: member, read-only seat, a custom role, an API key or AI connection of such a person.
- **A4 Customer's customer** (portal contact): signed in to the portal for one account.
- **A5 Content author**: anyone whose text ends up stored (a customer's email, a portal message, a CRM field, a comment) and is later shown to people or read by an AI assistant.
- **A6 Curahold staff** with desk or platform console access.
- **A7 Someone with infrastructure access** (leaked DB credential, compromised dependency, CI).

## 1. Company administrator screens (setup, settings, roles, SSO, billing, audit)

| Threat | Control | Proof | Status |
| --- | --- | --- | --- |
| A3 changes roles, SSO, fields, webhooks without the permission | `requirePerm` per handler + independent policy table | `tests/isolation-routes.test.ts` (every role × every address) | held |
| A2 reaches another company's settings by id | RLS on 76/76 tables; company from host name | `tests/isolation-routes.test.ts`, `tests/rls.test.ts` | held |
| A3 with `connections.manage` reads hidden fields through a webhook | payload filtered by the webhook creator's role | `tests/field-outs.test.ts` | held (fixed today) |
| SSO set up to a private address so the server calls inside the network (SSRF) | token/key URLs must be public https on the shared service | `tests/hardening.test.ts` | held (fixed today) |
| Admin locks everyone out with enforced SSO | server-side SSO enforcement; break-glass admin | `tests/sso.test.ts` | partial: no "test the connection" before enforcing |
| Admin actions not attributable | audit_log, admin-readable, exportable | `tests/privacy-admin.test.ts` | partial: audit rows are not write-once (owner role can change them) |
| A1 takes over an admin account | email link / code sign-in, device limit, session revoke | `tests/auth.test.ts` | **open**: no passkey or second factor for employees; no re-authentication before dangerous actions |

## 2. Employee screens (home, tasks, boards, customers, reports …)

| Threat | Control | Proof | Status |
| --- | --- | --- | --- |
| A3 sees a field hidden from their role via list, one record, search, export, report, API, AI connector, health "why", timeline, weekly email, whitespace table | `lib/fieldAccess.ts` applied at each way out | `tests/field-outs.test.ts`, `tests/views.test.ts`, `tests/report-builder.test.ts` | held (four leaks fixed today) |
| A3 on a read-only seat changes data | `requireWriter` + RLS `app_can_write()`; pinned list of self-service writes | matrix test `VIEWER_WRITES` | held |
| Two people overwrite each other's edit | versions on tasks, customers and records; same field → 409 with current value | `tests/versions.test.ts`, `scripts/quality/server.mts` | held (customers/records added today) |
| A5 stored XSS through comments, notes, names | React renders text; links only `http(s)` (`Thread.tsx`); emails escaped (`emailHtml.ts`) | `tests/text.test.ts` | held; CSP still allows inline *styles* (not scripts) — see asvs V14 |
| A5 uploads a page dressed as a picture | type checked by first bytes; inline only for checked pictures; `nosniff`; attachment otherwise | `tests/hardening.test.ts` | partial: downloads come from the app's own origin, not a separate files domain |
| A3 floods the API | per person / company / address budgets, 429 + Retry-After | `tests/ratelimit.test.ts` | held (per isolate on Workers, see SECURITY.md) |
| Private board seen by others | board visibility in RLS (`app_visible_boards`) | `tests/isolation.test.ts`, `tests/views.test.ts` | held |

## 3. Portal (the customer's customer)

| Threat | Control | Proof | Status |
| --- | --- | --- | --- |
| A4 reads another account's or company's requests | separate domain, own sessions, `curahold_portal` role that can call only `portal_*` functions | `tests/portal.test.ts`, `tests/isolation.test.ts` | held |
| A4 sees internal notes | portal functions return only shared fields and public comments | `tests/portal.test.ts` | held |
| Sign-in link reused or kept | links single use (`used_at`), expire, code attempts capped | `tests/portal-signin.test.ts` | held |
| A1 floods portal sign-in / email bombing | per-address and per-company buckets + DB count per email (`portal_rate`) | `tests/ratelimit.test.ts`, `tests/portal-signin.test.ts` | held |
| A4 uploads hostile files | same upload rules as the app | `tests/hardening.test.ts` | partial (as section 2) |

## 4. Product team screens (backlog, sprint, epic, roadmap, burndown)

| Threat | Control | Proof | Status |
| --- | --- | --- | --- |
| A2/A3 reach sprints, epics of boards they cannot see | sprints and tasks under board RLS | `tests/isolation-routes.test.ts`, `tests/pm.test.ts` | held |
| Jira credentials leak | sealed AES-256-GCM; basic-auth site pinned to `*.atlassian.net` | `tests/jira.test.ts` | held |
| Jira sync overwrites a local edit | queued sync with pending-change tracking | `tests/jira.test.ts`, `tests/pm-wave5d.test.ts` | partial: conflict policy per connection, not per field |

## 5. Curahold's own console (owner panel, platform console, support desk)

| Threat | Control | Proof | Status |
| --- | --- | --- | --- |
| A3 (any company admin) sees platform metrics | `requireOwner`: a named platform owner only, required at start | `tests/platform.test.ts`, matrix test (`/metrics`) | held |
| A6 reads a company's data at will | support grant given by the company, time-boxed, view or edit, logged in the company's audit trail; replay only with consent, 7 days | `tests/support.test.ts`, `tests/replay.test.ts` | partial: an admin may grant **edit**; the target says read-only |
| A6 account taken over | desk sign-in by emailed code, per-person staff keys | `tests/desk.test.ts` | **open**: no passkey / second factor for staff; desk on the same session machinery as the app |
| A6 action not attributable | staff email on every support session and audit entry | `tests/support.test.ts` | held |

## 6. Sales site, help centre, live demo

| Threat | Control | Proof | Status |
| --- | --- | --- | --- |
| Tracking without consent / third-party calls | no third-party requests (fonts included); consent before measurement | `tests/security.test.ts` (headers), site build checks | held |
| Demo shows real data | invented data only; `tests/leak.test.ts` blocks forbidden names | `tests/leak.test.ts` | held |
| Framing, script injection | CSP, `frame-ancestors 'none'`, HSTS on static files (`web/public/_headers`) | `tests/security.test.ts` | held |

## Cross-cutting

| Threat | Control | Status |
| --- | --- | --- |
| A5 prompt injection through stored text read by the AI connector | the connector acts with the person's rights only; writes need a write-enabled connection and land in the audit trail (`ai.changed`); every read result carries a note that the text is data, not instructions; the server instructions say the same (`tests/mcp-security.test.ts`) | held (as far as a server can; the assistant itself is outside Curahold) |
| Secrets and personal data in logs | `redact()` on error table and platform logs; replays mask every input and text (`web/src/lib/replay.ts`) | held (`tests/redact.test.ts`) |
| A7 SQL injection → `reset role` | parameterised queries; `db.system()` scan; no `FORCE RLS` yet | partial: SECURITY.md requirement 2 |
| A7 supply chain | lock file, `npm audit` 0 high/critical | partial: CI actions pinned to major versions, not SHAs; audit not blocking |
| Webhook / connector SSRF by DNS name that resolves to a private address | Workers cannot reach private networks; self-host relies on the host's egress firewall | partial (self-host) |
