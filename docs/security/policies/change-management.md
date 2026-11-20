# Change management policy

> **Draft — owner to adopt.** Version 2026-11-20.draft1. Lines marked OPEN are not done yet.

## Every change

- Small, separate commits with a plain-English reason (CONTRIBUTING.md); no secrets, `node_modules` or build output
  staged; the leak test passes before every commit.
- Review by someone other than the author: another AI seat reviews an agent's branch (never its own), and the Senior
  Security Engineer seat gives an AppSec verdict on every agent-written branch and new dependency.
- The CI gate must pass: typecheck, lint, the full test suite on PGlite and Postgres 16, the tenant-isolation suites
  on both, the leak scan, i18n, builds, the Docker image and the production dependency audit
  (`.github/workflows/ci.yml`). Guard tests are never weakened to make a change pass (CLAUDE.md).
- OPEN: branch protection in the git host requiring the CI gate and a review, no force-push (SECURITY.md #15).

## Database changes

- A new numbered file in `db/migrations/`; an applied migration is never edited; additive changes preferred.
- Every new company table ships with `org_id`, row-level security, grants and paired foreign keys in the same migration.
- A failing query is fixed in the policy or the permission, never by switching to `db.system()` inside a request route.

## Releases

- Nothing reaches production, and nothing is published, without the owner's explicit go-ahead; CI never deploys.
- The deploy and its verification follow the runbook ("Deploy"); the release notes say what changed for customers.
- Rollback is prepared before a deploy (RUNBOOK "Rollback"); a red test blocks a release with no exception unless the
  owner agrees.
- Changes that affect customers' contracts follow the notice periods: 30 days for material term changes and new
  sub-processors (Terms §19, DPA §5).

## Emergency changes

A security fix may go out faster, still through the CI gate and with the owner's go-ahead; it is reviewed in full
afterwards and recorded in the incident's post-mortem.
