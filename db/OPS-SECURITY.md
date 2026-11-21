# Operations: security requirements that live outside the code

These are things the code cannot do for itself. Each is a deployment requirement.

## 1. Database roles

Since migration 0254 (ADR 0023) the schema half is done in code: every table with row security forces it, and
`db.system()` runs as `curahold_system`, a role that owns nothing and reaches rows only through its own
`curahold_system_all` policy. Migrations run as the owner through `db.owner()`, which nothing else calls.

What the repository enforces (tests that gate the build, `tests/rls.test.ts`):

- every table with an `org_id` has RLS on and a policy (or, for server-only tables, no privileges for the request
  roles); every table without `org_id` is on a reviewed list; every `SECURITY DEFINER` function pins `search_path`;
- every RLS table is FORCED and has the system role's policy, which names only that role; `db.system()` runs as
  `curahold_system`, which is no superuser, has no BYPASSRLS and owns nothing; only `db/` calls `owner()`;
- a static check that `db.system()` statements on company tables name `org_id`, with a reviewed baseline
  (`tests/fixtures/system-sql-reviewed.json`) that may only shrink.

**Production requirement (left to the operator):** apply `db/ops/role-separation.sql` once so the Worker/Hyperdrive
connects as `curahold_login` (NOINHERIT, owns nothing, member of the three working roles) and only
`MIGRATION_DATABASE_URL` holds the owner. The owner must be a superuser or have BYPASSRLS (0254 checks). Verify
afterwards with the queries at the end of that file.

## 2. Cloudflare rate limiting (at the edge, on top of the app's own limits)

Since 19 Nov 2026 the app limits requests per person, company and network address itself (`api/src/lib/ratelimit.ts`,
`lib/botGuard.ts`, ADR 0015). These edge rules still belong in the Cloudflare dashboard (Security > WAF > Rate limiting
rules) on the zone, because they stop a flood before it costs Worker time:

| Rule | Match | Limit | Action |
| --- | --- | --- | --- |
| Sign-in links and codes | `POST` on `/api/auth/start`, `/api/auth/verify`, `/api/auth/device` | 10 per minute per IP | Block 10 min |
| Sign-up | `POST /api/signup*` | 5 per hour per IP | Block 1 h |
| Support desk sign-in | `desk.<domain>` `/api/desk/sign-in*` | 10 per 10 min per IP | Block 1 h |
| Paddle webhook | `POST /api/inbound/billing/paddle` (and the older alias `POST /api/billing/webhook`) | allow only Paddle's published IPs; 60 per minute otherwise | Block |
| General API | `/api/*` | 600 per minute per IP (per `x-curahold-device` where possible) | Managed challenge |
| Desk mail door | `POST /api/desk/mail` | allow only the mail sender's IPs | Block |

Also turn on Bot Fight Mode and "Always use HTTPS"; HSTS is sent by the app and by `_headers`.

## 3. Environment (new or changed)

- `PLATFORM_OWNER` (or `SUPPORT_STAFF`): REQUIRED. The hosted Worker refuses to start
  without one; there is no implicit owner any more.
- `STAFF_KEYS`: `"ada@x.com:<24+ chars>,bob@x.com:<24+ chars>"`: one key per support person,
  each address must also be in `SUPPORT_STAFF`. Opening a customer's session needs one of these;
  the old shared `STAFF_KEY` no longer opens sessions in production (it still works for
  development and, while no `STAFF_KEYS` exist, for the desk's own tooling). Remove a person
  by deleting their key and address. Rotate by replacing the key.
- Companies' default support policy is now "administrators only" and session recording is
  OFF until an administrator switches it on (Settings > Help & support).
- Paddle checkout: the browser now carries a signed company id (keyed with `PADDLE_WEBHOOK_SECRET`);
  rotating that secret invalidates checkouts open at that moment only.
