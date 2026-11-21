# OWASP ASVS 4.0.3 Level 2 and OWASP API Security Top 10 (2023) — Curahold

Pass of 15 November 2026. Each line: **pass** / **fail** / **partial** / **n.a.**, with the file or test that
proves it. Requirements are grouped by ASVS chapter; where a chapter's requirements share one control they
share one line, and the ASVS ids it covers are listed. "Fixed today" marks a failure found and closed in this
pass. Every remaining **fail** or **partial** is listed again at the end with what closing it takes.

## API Security Top 10 (2023)

| # | Risk | Result | Proof |
| --- | --- | --- | --- |
| API1 | Broken object level authorisation | pass | RLS on every company table (`tests/rls.test.ts`); every id-taking address called by another company (`tests/isolation-routes.test.ts`); portal by functions only (`tests/portal.test.ts`) |
| API2 | Broken authentication | pass (closed 15 Nov, second pass) | sign-in links/codes single use, hashed, expiring, rate-limited (`tests/auth.test.ts`, `tests/ratelimit.test.ts`); passkeys, TOTP second step, company requirement, fresh confirmation (`tests/identity.test.ts`); staff second step on desk and console (`tests/desk.test.ts`, `tests/platform.test.ts`) |
| API3 | Broken object property level authorisation | pass (fixed today) | field rules on every way out (`tests/field-outs.test.ts`); writes to hidden/locked fields refused (`tests/views.test.ts`); four leaks fixed: health "why", AI connector, webhooks, weekly email, whitespace |
| API4 | Unrestricted resource consumption | pass (fixed today) | budgets per address/person/company and per door (`api/src/lib/ratelimit.ts`, `tests/ratelimit.test.ts`); file size cap (`lib/upload.ts`); list limits; import size cap |
| API5 | Broken function level authorisation | pass | every role × every address (`tests/isolation-routes.test.ts`, "every role × every address") |
| API6 | Unrestricted access to sensitive business flows | pass | invitations capped per company per hour in the database (migration 0050); sign-up, sign-in, help requests counted (`tests/ratelimit.test.ts`, `tests/help.test.ts`) |
| API7 | Server side request forgery | pass | webhooks, chat webhooks, keyed CRMs and SSO refuse local/private/IPv6-literal hosts, https only (`tests/hardening.test.ts`); on self-host every outbound name is resolved and each address (and redirect hop) checked (`api/src/lib/outbound.ts`, `tests/outbound.test.ts`); Workers' network does not reach private addresses. Residual: DNS rebinding between check and connect on self-host (egress firewall recommended) |
| API8 | Security misconfiguration | pass | CSP, HSTS, nosniff, frame-ancestors, referrer and permissions policy on API and static files (`tests/security.test.ts`); dev switches hard-coded off in the Worker entry |
| API9 | Improper inventory management | pass | the route list is read from the code (`scripts/docs/routes.ts`); the developer reference and the matrix test fail on an unclassified address |
| API10 | Unsafe consumption of APIs | pass | CRM/Jira/chat answers validated and treated as data; stored text from them is escaped on output; AI connector marks stored text as data (`tests/mcp-security.test.ts`) |

## ASVS Level 2

### V1 Architecture, design and threat modelling
| Ids | Result | Proof |
| --- | --- | --- |
| 1.1.1–1.1.7 secure SDLC, threat model, security stories | pass | `docs/security/threat-model.md`, this file, `SECURITY.md`; tests gate CI |
| 1.2.x authentication architecture, least-privileged components | partial | request roles `curahold_app` / `curahold_portal`, server work as `curahold_system` (owns nothing), row security forced (0254, ADR 0023); the operator still has to split the API login from the owner (SECURITY.md requirement 2) |
| 1.4.x access control architecture: enforced at a trusted service layer, single mechanism | pass | `requirePerm`/`requireWriter` + Postgres RLS; matrix test |
| 1.5.x input/output architecture | pass | zod schemas on every body (`api/src/lib/validate.ts`); output escaped by React / `emailHtml.ts` |
| 1.6.x cryptographic architecture, key management | partial | AES-256-GCM sealing with HKDF from `SECRETS_KEY`; no re-seal tool for key rotation (RUNBOOK) |
| 1.7.x logging architecture | pass | `error_log` + platform logs, both masked (`lib/errlog.ts`, `tests/redact.test.ts`) |
| 1.8.x data protection | pass | personal-data export/erasure in product (`tests/privacy-admin.test.ts`); retention jobs |
| 1.14.x configuration: segregated components, CI | pass | CI read-only, no secrets; actions pinned to commit SHAs (`.github/workflows/*.yml`) |

### V2 Authentication
| Ids | Result | Proof |
| --- | --- | --- |
| 2.1.x passwords | n.a. (app) / pass (portal) | the app has no passwords; portal passwords: weak-password check, hashed (`tests/portal-signin.test.ts`) |
| 2.2.1 anti-automation | pass (fixed today) | `tests/ratelimit.test.ts`, existing DB counts per email |
| 2.2.2–2.2.3 notifications of auth events | partial | sessions listed, other devices signed out in one step, second-step changes in the audit trail; no email on new sign-in (not now) |
| 2.2.4–2.2.7 phishing-resistant / multi-factor | pass (closed 15 Nov) | passkeys with user verification; TOTP + recovery codes; a company can require it; staff need it (`tests/identity.test.ts`, `tests/desk.test.ts`, `tests/platform.test.ts`) |
| 2.5.x credential recovery | pass | email link only, single use, expiring |
| 2.7.x out-of-band verifiers (email codes) | pass | 6-digit codes, attempt cap, expiry (`routes/auth.ts`, `tests/auth.test.ts`) |
| 2.9 / 2.10 service authentication, secrets not in code | pass | Worker secrets; `tests/leak.test.ts`; API keys hashed |

### V3 Session management
| Ids | Result | Proof |
| --- | --- | --- |
| 3.1–3.3 tokens not in URLs, new token on sign-in, logout and expiry | pass | `routes/auth.ts`, `tests/auth.test.ts` |
| 3.4 cookie attributes | pass | host-only, `HttpOnly`, `Secure`, `SameSite=Lax` |
| 3.5 token-based sessions (API keys, OAuth) | pass | hashed, revocable, read-only unless granted (`tests/developer.test.ts`) |
| 3.7.1 re-authentication before sensitive actions | pass (closed 15 Nov) | sign-in or confirmation (passkey, app code, recovery code, or emailed code without a second step) within 10 minutes before roles, SSO/SCIM, API keys, personal export/erasure, removing a person, audit export, sign-in security (`requireFresh`, `tests/identity.test.ts`). There is no whole-company export or company deletion route yet: they must call `requireFresh` when added |
| session list and remote sign-out | pass | `/me/sessions`, `/me/sessions/sign-out-others`, `/admin/users/:id/sessions` |

### V4 Access control
| Ids | Result | Proof |
| --- | --- | --- |
| 4.1.1–4.1.5 enforced server-side, least privilege, deny by default | pass | matrix test; RLS deny by default |
| 4.2.1 IDOR | pass | `tests/isolation-routes.test.ts` |
| 4.2.2 CSRF | pass | custom header required on every cookie write (`app.ts companyFromHost`), `SameSite=Lax`; portal header `x-curahold-portal` |
| 4.3.1 admin interfaces need extra protection | pass (closed 15 Nov) | company-wide second-step requirement for administrators; fresh confirmation for admin changes; desk and console need a second step |
| 4.3.2 directory browsing / metadata | pass | API answers 404 for unknown addresses |
| field level | pass (fixed today) | `tests/field-outs.test.ts` |

### V5 Validation, sanitisation and encoding
| Ids | Result | Proof |
| --- | --- | --- |
| 5.1.x input validation, allow-lists | pass | zod on every body; ids checked as UUIDs (`param()`) |
| 5.2.x sanitisation (rich text, SVG, templates) | pass | no user HTML is rendered; SVG never shown inline; `dangerouslySetInnerHTML` only on Curahold's own help text (`Ask.tsx`) |
| 5.3.1–5.3.3 output encoding, XSS | pass | React; `emailHtml.ts` `esc()`; `tests/text.test.ts` |
| 5.3.4–5.3.5 SQL injection | pass | parameterised queries only; dynamic identifiers allow-listed |
| 5.3.9 SSRF / LFI | pass | see API7 |
| 5.5.x deserialisation | pass | JSON only, schema-checked |

### V6 Stored cryptography
| Ids | Result | Proof |
| --- | --- | --- |
| 6.2.x approved algorithms | pass | AES-256-GCM, HMAC-SHA256, SHA-256 token hashes (`lib/crypto.ts`) |
| 6.3.x random values | pass | `crypto.getRandomValues` (`randomToken`) |
| 6.4.x secret management, rotation | partial | secrets as Worker secrets; `SECRETS_KEY` rotation has no re-seal tool |

### V7 Error handling and logging
| Ids | Result | Proof |
| --- | --- | --- |
| 7.1.1–7.1.2 no credentials / sensitive data in logs | pass (fixed today) | `redact()` (`tests/redact.test.ts`) |
| 7.1.3–7.1.4 security events logged | pass | audit_log: roles, SSO, keys, exports, erasure, support access, AI connector changes |
| 7.2.x log protection | pass (closed 15 Nov) | append-only trigger for every role (migration 0055), no UPDATE/DELETE privilege for the request role, export with SHA-256 chain whose digest is logged (`tests/identity.test.ts`) |
| 7.4.1 generic error messages | pass | `errors.server` text; no stack to the client |

### V8 Data protection
| Ids | Result | Proof |
| --- | --- | --- |
| 8.1.x server-side caches | pass | `cache-control: no-store` on API answers (`lib/headers.ts`) |
| 8.2.x client-side: no sensitive data in storage | pass | session cookie HttpOnly |
| 8.3.x sensitive data: minimal, exportable, deletable, retention | pass | `tests/privacy-admin.test.ts`; retention jobs in `lib/scheduler.ts` |

### V9 Communications
| Ids | Result | Proof |
| --- | --- | --- |
| 9.1.x TLS for all clients, HSTS | pass | Cloudflare TLS; HSTS (`tests/security.test.ts`) |
| 9.2.x outbound TLS | pass | https-only webhooks, connectors, SSO on the shared service |

### V10 Malicious code
| Ids | Result | Proof |
| --- | --- | --- |
| 10.3.x deployed application integrity, no back doors | pass | dev switches hard-coded off in production entries; dependency audit 0 high/critical |
| 10.3.2 dependency integrity (pinned CI) | pass | lock file; actions pinned to commit SHAs; `npm audit` blocking |

### V11 Business logic
| Ids | Result | Proof |
| --- | --- | --- |
| 11.1.1–11.1.4 sequential steps, limits on business actions, anti-automation | pass (fixed today) | request budgets; invitations per hour; idempotency keys (`tests/repeats.test.ts`) |
| 11.1.5 integrity of concurrent edits | pass (fixed today) | versions on tasks, customers, records (`tests/versions.test.ts`) |

### V12 Files and resources
| Ids | Result | Proof |
| --- | --- | --- |
| 12.1.x size limits | pass | `MAX_FILE_MB`, content-length pre-check (`lib/upload.ts`) |
| 12.2.1 file content matches its type | pass (fixed today) | first-bytes check for pictures (`tests/hardening.test.ts`) |
| 12.3.x file names, path traversal | pass | names sanitised; storage keys generated by the server |
| 12.5.x downloads: `attachment`, `nosniff` | pass | `routes/tasks.ts /files/:id`, `routes/help.ts` |
| 12.5.2 untrusted files served from a separate domain | **fail** | served from the app's origin; needs a files domain (owner decision: domain) |
| 12.6.1 SSRF allow-list | pass | see API7 |

### V13 API and web service
| Ids | Result | Proof |
| --- | --- | --- |
| 13.1.x same encoding, admin paths authenticated, no keys in URLs | pass | API keys only in `Authorization` |
| 13.2.x RESTful: methods, schema validation, CSRF | pass | see V4/V5 |
| 13.2.6 / 13.4 rate limits and 429 | pass (fixed today) | `tests/ratelimit.test.ts` |

### V14 Configuration
| Ids | Result | Proof |
| --- | --- | --- |
| 14.1.x build and deploy, secrets out of the repo | pass | `tests/leak.test.ts`, Worker secrets |
| 14.2.x dependencies | pass | `npm audit` 0 high/critical |
| 14.4.x security headers | pass | `tests/security.test.ts` |
| 14.4.3 strict CSP | partial | scripts: self + Paddle + one hashed inline; **styles still allow `'unsafe-inline'`** (239 inline styles; the design package removes them) |
| 14.5.x request origin validation | pass | custom header on writes; CORS only on `/mcp` and OAuth discovery |

## What is still open, and what closing it takes

Closed in the second pass (15 November): passkeys and the second step for employees and staff, re-authentication
before dangerous actions, the write-once audit trail, read-only support, SHA-pinned CI with a blocking audit,
`/.well-known/security.txt` with a disclosure policy, and the self-host DNS check for SSRF.

Not now, on purpose:

1. **Downloads from the app's own origin (12.5.2)** — needs a separate files domain with short-lived signed links;
   waits for the owner's domain decision.
2. **CSP `'unsafe-inline'` for styles (14.4.3)** — the design-system package removes the inline styles (another agent).
3. **The API login is still the owner in a one-login install (1.2.x, SECURITY.md req. 2)** — row security is forced and
   `system()` runs as a role that owns nothing (0254), but until the operator connects the Worker as `curahold_login` an
   injected `reset role` reaches the owner, who could drop the audit trigger. An operations change, documented.
4. **Email on a new sign-in (2.2.2)** — sessions are listed and can be ended; a notification email is a product choice.
5. **DNS rebinding on self-host (API7)** — the check runs just before the call; an egress firewall closes the gap.
