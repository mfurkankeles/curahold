<!--
Thanks for contributing. Keep this short; delete what does not apply.
Use invented examples only (Acme, Ada, ada@demo.example). No real company, person or customer names, ever:
the leak scan will fail the PR.
-->

## What and why

<!-- One or two sentences: what changes, and the problem it solves. Link the issue if there is one. -->

## How to verify

<!-- Commands run, screens checked, or the test that proves it. -->

## Checklist

- [ ] `npm run typecheck` and `npm run lint` pass (new `any` / `!` / suppressed hook deps are avoided; existing ones may stay)
- [ ] Tests added or updated for the behaviour (data loss, isolation, concurrency, sync and personalization paths especially)
- [ ] Every new user-visible string exists in **both** `en` and `tr` (`npm run strings`; `tests/i18n.test.ts` passes)
- [ ] New table or column: migration added as a **new** numbered file in `db/migrations/` (existing ones untouched), with RLS enabled and a policy keyed on `app_org()`
- [ ] New route runs inside `db.tenant(...)`; any `db.system(...)` use is justified below and filters by `org_id` explicitly
- [ ] New environment variable documented in `docs/ENVIRONMENT.md` (and `selfhost.env.example` if self-hosters need it)
- [ ] `CHANGELOG.md` updated under **Unreleased** (user-visible changes)
- [ ] No secrets, real names or real customer data in code, tests, fixtures, screenshots or docs

## Tenant-isolation impact

<!-- "None", or: which queries/endpoints touch company data, and how company A is kept from company B. -->

## Risk and rollout

<!-- Migrations that need care, flags, anything to do on deploy (secrets, cron, DNS). "None" is fine. -->
