# CLAUDE.md — hard rules for AI sessions working on Curahold

Read before changing anything. Orientation: [docs/HANDOVER.md](docs/HANDOVER.md) (map, risks), [docs/DEVELOPER.md](docs/DEVELOPER.md)
(how to add things), [ARCHITECTURE.md](ARCHITECTURE.md), [docs/ADR/](docs/ADR/README.md) (decisions), [CONTRIBUTING.md](CONTRIBUTING.md).
Priority order when goals conflict (QUALITY.md): 1 data safety and correctness (no loss, no wrong data, no leak between companies),
2 speed, 3 simplicity, 4 real-time, 5 design, 6 feature count. Gross margin is a budget every change must fit.

## Never

- **No deploy, no `git push`, no publishing** unless the product owner explicitly says so in this session. CI never deploys.
- **No new paid service, API or subscription, and no new runtime dependency.** A dev tool through `npx` that adds nothing to
  `package.json` is fine. Propose anything else with options and costs; do not add it.
- **No real names or data**: no real company, person or customer names, no ids from other systems, no internal tool names, no real
  data — in code, tests, seeds, demo, docs, screenshots or commit messages. Invented examples only (Acme, Ada, `ada@demo.example`;
  reuse the demo's own names). `tests/leak.test.ts` must pass before every commit and must never be weakened; if it flags a word you
  wrote, rephrase.
- **No competitor names or copied interfaces** in the product, site, ads or public docs. Marketing claims only about shipped features.
  Legal notices only true ones (never "patented").
- **Never edit an applied migration.** New file `db/migrations/NNNN_name.sql`, next number; prefer additive changes.
- **Never use `db.system()` to make a failing query work** inside a request route. Fix the policy or permission in a migration.
- **Never weaken a guard test** (`leak`, `rls`, `isolation*`, `i18n*`, `docs-coverage`, `docs-reference`, `security*`, `team-redteam`).
- **Never commit secrets** (`.env`, `.dev.vars`, keys) or stage `node_modules`/`dist`. Stage explicit paths, never `git add -A`.

## Always

- **Tenant isolation**: every company table has `org_id`, row security with a policy on `app_org()`, grants for `curahold_app`, and
  paired foreign keys `(org_id, id)`. Routes work inside `run(c, …)`. Every `db.system()` statement names `org_id` from a trusted source.
- **Permissions** in the route (`requirePerm`, `requireWriter`) and, where it matters, in SQL (`app_has_perm`). Field values go through
  `lib/fieldAccess.ts`. Department walls live in SQL (`app_visible_boards`).
- **Every user-facing string in every dictionary** in `shared/src/i18n/` (all of them, not only English and Turkish), written as a native
  product writer would, `{placeholders}` exact, terms from `glossary.ts`. Built-in content uses `phrase()`. No inline language pairs.
- **Design tokens only** (`docs/design/tokens.md`): no `style={{}}` unless the value comes from data, no raw colours, sizes, radii,
  spacing or durations. Owner tools are desktop-first; every screen must still work well on a phone; right-to-left languages too.
- **Side effects through the outbox** in the same transaction; writes accept `Idempotency-Key`; deletes go to the trash.
- **Errors** via `fail('code')` with words in every dictionary; nothing internal leaks to the user.
- **Docs travel with code**: help page in every language + `shared/src/helpLinks.ts` + assistant eval cases for any new screen, setting
  or API area; `scripts/docs/catalogue.ts` + `npm run docs:reference` for a route; `docs/ENVIRONMENT.md` for a setting; an ADR for a
  decision with trade-offs; `CHANGELOG.md` for a visible change.
- **Comments to the standard** (CONTRIBUTING.md "Comments"): a header in every file, a doc comment on every exported function, component
  and route, WHY-comments for security, permissions, legal, money, the AI approval gate and cost caps, performance tricks and workarounds,
  with ADR links. No comments that restate code. `npm run lint:comments` must not get worse.
- **AI features stay capped and gated**: assistant tools are read-only and run as the asker; the AI team only proposes, and only the
  operator's own approval runs an outside action (`api/src/team/gate.ts`). Do not add a path around either.

## How to work

- Lean testing: run the tests your change touches (`npx vitest run tests/<file>.test.ts --maxWorkers=1`), the three guards, and the
  full suite once before you finish. Do not re-run the same suite repeatedly.
- Look at what you changed on screen (desktop 1440 first for owner tools, then a 390 px phone; light and dark; Turkish and English)
  before calling it done.
- Small, separate commits per coherent change; plain-English subject, a body that says why.
- Decisions that belong to the product owner (scope, pricing, a paid service, removing a feature, anything irreversible): build the
  safe default behind a setting, and write the question down with the options and their costs instead of stopping.
