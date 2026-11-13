# Operations: security requirements that live outside the code

These are things the code cannot do for itself. Each is a deployment requirement.

## 1. Database roles (P1: the application's login role owns the tables)

Today one login role both owns the tables and runs `db.system()` (198 call sites).
Per request, `db.tenant()` does `set local role curahold_app`, so row-level security
binds it; but `db.system()` runs as the owner with RLS out of the picture, relying
on every statement naming `org_id` by hand. Nothing in the schema stops a mistake there.

What the repository now enforces (tests that gate the build):

- `tests/rls.test.ts`: every table with an `org_id` has RLS on and a policy (or, for
  server-only tables, no privileges for the request roles); every table without
  `org_id` is on a reviewed list; every `SECURITY DEFINER` function pins
  `search_path = public, pg_temp` (migration 0034).
- A static check that `db.system()` statements on company tables name `org_id`.
  Existing exceptions are in `tests/fixtures/system-sql-reviewed.json` (primary-key
  lookups, external-id hooks, the hourly clean-up, the owner's metrics). The list may
  only shrink: a new unscoped statement fails the build.

What was deliberately NOT done in code: `FORCE ROW LEVEL SECURITY`. With it the owner
role is bound by the policies too, and `db.system()` plus all the definer functions
(owned by the same role) would see no rows, because they run without `app.org_id`.
That breaks the in-memory demo, the tests (PGlite has a single role) and the e2e.
It is only correct together with a separate login role.

**Production requirement:** apply `db/ops/role-separation.sql` once (reviewed template):
`curahold_owner` owns objects and runs migrations only; the Worker/Hyperdrive connects as
`curahold_login` (not the owner, can `set role curahold_app`/`curahold_portal`; `bypassrls`
is what `db.system()` needs and is why the static test above matters). Point the migration
job at `curahold_owner` and the Worker at `curahold_login`. Verify afterwards:
`select relname from pg_class where relowner = (select oid from pg_roles where rolname = 'curahold_login')`
returns nothing.

## 2. Cloudflare rate limiting (the app sets no request limit of its own)

Configure in the Cloudflare dashboard (Security > WAF > Rate limiting rules) on the zone,
as an ops requirement; the Worker does not do this:

| Rule | Match | Limit | Action |
| --- | --- | --- | --- |
| Sign-in links and codes | `POST` on `/api/auth/start`, `/api/auth/verify`, `/api/auth/device` | 10 per minute per IP | Block 10 min |
| Sign-up | `POST /api/signup*` | 5 per hour per IP | Block 1 h |
| Support desk sign-in | `desk.<domain>` `/api/desk/sign-in*` | 10 per 10 min per IP | Block 1 h |
| Paddle webhook | `POST /api/billing/webhook` | allow only Paddle's published IPs; 60 per minute otherwise | Block |
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
