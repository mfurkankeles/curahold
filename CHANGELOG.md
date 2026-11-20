# Changelog

All notable changes to Curahold are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it is released (`package.json` is `0.1.0`, unreleased).

How to use this file: add a line under **Unreleased** in the same PR as the change, in the right group (Added, Changed,
Deprecated, Removed, Fixed, Security). Write for a customer or an operator, not for the compiler. On release, rename
Unreleased to the version and date and start a new Unreleased section. Use invented examples only.

## [Unreleased]

### Changed

- Charts use a new eight-colour palette that starts from the brand violet and stays readable for colour-blind people in light
  and dark (neighbouring colours were too close before: green and orange-red could not be told apart in dark). A ninth group is
  shown as "Other" instead of repeating a colour. In the owner console every state (paid, overdue, at risk …) shows an icon with
  its words, not only a colour.
- Reports and dashboards: when two colours chosen for options would look alike to colour-blind readers (green "won" beside
  orange "lost"), that chart uses the palette's own order instead; a figure tile only carries a side mark when it has a state,
  and the state shows as an icon too; every chart has **Show as table**.
- Owner console: the overview starts with what waits for your decision (proposals, new trial requests, failed payments)
  and shows each business figure with its change on the period before; figures at zero are left out. The approval queue
  lists every waiting proposal beside the one being decided and takes keys (A approve, R reject, E edit, M meeting,
  J / K next and previous); a decision waits 7 seconds with **Undo** (or Z) before it is sent.

### Added

- Owner console, Plan & targets: two new views. **Budget & investors** shows the budget against what was really spent
  with the runway your cash gives, the plan's two milestones (expanded and switched companies) counted on real data,
  fundraising windows with their dates, target and status, and your own investor pipeline (stage, next step and its day;
  a removed investor can be brought back for 30 days). **Load from the plan** fills targets, milestones, budget, windows
  and tasks from the business plan's `targets.json` (also `scripts/plan/load-targets.ts`); loading again is safe.
- Owner console: a **Monday summary** e-mail at 09:00 Istanbul time with last week's targets against actuals, trial
  requests, revenue and invoices, errors and alerts and the AI team's proposals waiting for you — written without any AI
  model, once a week, in Turkish or English, with a preview and an off switch in the console.
- Owner console: **alerts on your phone** for help requests that block a customer, system alerts and the Monday summary,
  by free Web Push (encrypted so only your device reads it), once the server has a VAPID key pair (`VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`).
- Sales site: a small content hub in all eleven languages (/resources/): four templates (renewal playbook, business review (QBR)
  agenda, sales-to-onboarding hand-over checklist, health score sheet) and six plain definitions (customer health score, churn,
  contract renewal, customer portal, customer onboarding, cost to serve), the same items in every language, each saying only
  what Curahold does today. Linked from the Resources menu and the footer.
- Connectors: Lark/Feishu and Telegram chat notifications; Odoo CRM (companies, contacts, opportunities, two-way); Google Calendar and
  Outlook Calendar (past meetings onto the timeline, plan a meeting from a record); Azure DevOps (pushes, pull requests and builds linked
  to tasks); Zoho Desk tickets; Stripe read-only (customers, invoices, payments, restricted key only); WhatsApp Business with the
  company's own Meta app (incoming messages on the contact's timeline, replies and templates).
- Incoming webhooks: one signed address per company and source, replay protection, field mapping to a task, ticket, customer event or
  deal note, a test-delivery screen, a 30-day delivery log and ready recipes. Two new setup-health checks: failing webhooks and a silent
  WhatsApp number.
- Hindi and Malay: the app, the customer portal, e-mails, the help centre (whole user guide), the website, the demo company
  and the free assistant rules, in a formal register; job titles and plan names stay in English. Trial consent texts for India
  (DPDP Act 2023: itemised notice, grievance route to the Data Protection Board) and Malaysia (PDPA: notice in Malay and English
  together), drafts for the lawyer's review. Rupee and ringgit amounts, Latin digits in Hindi.
- Billing: plan limits on full seats, connected tools, sync frequency, file space and CuraAI answers a month, shown with your
  use on Settings → Billing; regional prices (INR, SGD; USD for Malaysia and the Gulf with a local guide price) with tax added
  by Paddle; a 30-day grace after a failed payment. The price list is one data file (`shared/src/plans.json`).
- Cost model (`scripts/quality/cost.mts`): unit cost per company and per seat for 1–300 customers, fixed costs and break-even,
  every input with its source in `scripts/quality/cost.inputs.json`.
- Consent before every AI assistant chat (in the app, the customer portal and the public docs): a short notice of what goes to the
  AI provider, why, for how long, with the privacy notice, and equal **Accept** / **Decline**. The server refuses a question without a
  "yes" to the current notice version (`consent_required`); each answer is recorded (who, when, version, language) and in the activity
  log; withdraw any time under CuraAI or in Your settings; a new notice version asks again (migration 0243).
- Deleting the whole company (Settings → Company): typed confirmation, 30-day grace period with cancel, then everything goes, files and
  connection keys included, with a deletion certificate; invoices stay for tax law (migration 0241).
- Nightly retention purges for the stated periods: trial requests 12 months, consent proof 3 years (a "yes" in force is kept), help
  requests 24 months, activity log 12 months; configurable with `RETENTION_*` (docs/ENVIRONMENT.md §6e).
- Download and erase for people at customers (portal people), not only switching them off.

- Engineering foundation for new owners: GitHub Actions CI (`.github/workflows/ci.yml`) with typecheck, lint, the full test suite on
  PGlite and on Postgres 16, build, Docker image build check, and required guards for row-level-security isolation, the repository leak
  scan and i18n completeness; a nightly end-to-end workflow; a pull request template.
- ESLint (flat config) and Prettier configuration, `lint`, `lint:fix`, `format` and `format:check` scripts. Existing `any`, non-null `!` and
  `react-hooks` findings are warnings, so lint passes today.
- `.nvmrc` (Node 22) and `engines.node >= 22`, matching the Dockerfile.
- Documentation: `ARCHITECTURE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/RUNBOOK.md`, `docs/ENVIRONMENT.md` and architecture decision
  records in `docs/ADR/`.
- Test scripts `test:isolation`, `test:leak` and `test:i18n` for the three required guards.

### Changed

- Motion: dialogs, side panels, menus, popovers, the search palette, phone sheets and toasts now animate out as well as in
  (100–150 ms, always shorter than the way in); phone sheets slide up from the bottom (280 ms); one set of motion tokens
  (`--dur-1…4`, `--ease-in/out/move`, `--dist-1…3`). With "reduce motion" on, opening and closing still fade for 100 ms so the
  change is not lost.
- Moving between screens: the page cross-fades in the direction you go (Back from the other side), a customer card
  grows into its page, and Back returns to the list where you left it, with its search and filters.
- Loading: a Curahold loader instead of a still logo, a thin progress line at the top while a screen loads, skeletons in
  the shape of each screen, and save buttons that show a ring and then a tick. The demo opens faster, with real progress.
- Every action button has an icon and a label; every dialog, panel and sheet has a large Close at the end corner (and
  Esc); pages under another page show Back in the same place; on a phone the task panel rises from the bottom with Back.
- Toasts stay 4 seconds (7 with Undo) and pause under the pointer; errors stay until you close them. Ticking a task done
  shows at once and turns back if the server refuses.
- Easier to read: stronger contrast on the main button, field borders and the keyboard focus ring; each script (Arabic,
  Hebrew, Persian, Japanese, Korean, Chinese, Hindi) uses its own system font, size and line height.
- Turkish: the whole product says "siz".

- Sales site: the Turkish pages speak to visitors as "siz" everywhere (landing page, menus, inner pages, blog, animated versions, consent).
- Sales site: the headline says what Curahold is and what it does ("Work management for customer teams" above "Every renewal, every
  promise, every task, on time.") in all eleven languages; every page uses the same two calls to action, "Try it free" and "Live demo",
  each with an icon; "3 months free, no card needed" sits under them.
- Sales site header: "Sign in" shows on desktop; the "AI version" button is now "Animated tour" under Resources; on a phone both calls
  to action wait in a bar at the bottom once the first screen is scrolled past. The sign-in window has a 44 px close in its corner.
- Sales site pricing: the landing page shows a two-line summary ("from $15 per seat a month on a yearly plan") with a link instead of
  the full plans; /pricing/ shows the prices in the first screen and adds a plan comparison table, pricing questions and a line for
  larger companies. Its structured data now lists all four offers (Team and Business, monthly and yearly) at the prices the page shows,
  instead of one $19 offer next to a page showing $15. Prices themselves are unchanged.
- Sales site: the landing page is about a third shorter (about 7,900 px at 1440 wide, from 12,400): "Why Curahold" shows three reasons
  and links to /why/, which now ends with an honest "Who it is not for" (a personal to-do list, a help desk, bookkeeping, a
  critical-path schedule) and the two calls to action. The scroll story's steps are a little shorter.
- Sales site search: every page has a title and description written for its language's searches (no page is now too
  short or too long for search results); the animated versions are kept out of search results; the sitemap is an index
  with one file per language; questions and prices carry structured data that matches the page; share links show a PNG
  picture; footer column titles are no longer headings. The help centre's production build gets absolute canonical and
  hreflang addresses (only to languages that really have the page), article structured data and its own sitemap, which
  the docs host's robots.txt now names. New settings: `SITE_LASTMOD`, `DOCS_ORIGIN` (ADR 0020).
- Sales site speed and motion: no stylesheet blocks the first paint any more (first-screen styles inline, the rest cut to
  what each kind of page uses and loaded after); the headline and its buttons show at once instead of sliding in; Arabic,
  Persian, Hebrew, Chinese, Japanese and Korean pages use their system's own reading faces at their own sizes and download
  no font; sections settle in over 300 ms; the glowing dots in the background no longer blink; the integrations strip has
  a Pause button and stays still for anyone who asked their system for less motion.
- Sales site speed on phones: the lower half of the landing page (the story's steps and window, the short "why" block,
  the price summary, the footer) is laid out only as it comes near the screen, and Turkish pages preload the headline
  face's Turkish letters too, so a late font no longer re-lays out every heading after the first paint.
- Billing runs on one path (ADR 0019): Paddle's notifications go to `/api/inbound/billing/paddle`; the older
  `/api/billing/webhook` runs the same handler. Settings → Billing is one screen.
- The AI assistant is off for a company until an administrator turns it on, as the privacy texts say; existing companies were switched
  off (migration 0240), the demo stays on.
- Erasing a person also removes their CuraAI questions, notifications, chat links, sign-in factors, recordings and mentions in AI notes.
- Consent records can no longer be changed, only anonymised (migration 0241).
- Dev dependencies: added `eslint`, `@eslint/js`, `@babel/eslint-parser`, `@babel/core`, `eslint-plugin-react-hooks`, `globals` and `prettier`
  (`@babel/*` patch updates came with them). `typescript-eslint` is deliberately not used because it does not support TypeScript 7 yet.

### Fixed

- Single sign-on: a test sign-in now says what is wrong (the client secret was refused, the signature no longer matches
  the stored certificate, the token was for another app or out of date, or the provider could not be reached) and which
  field to fix; an identity provider that cannot be reached sends people back to the sign-in page instead of an error page.
- SCIM: a rename sent by name parts and a deactivation sent as the text "False" (as some identity providers send them)
  are now applied; before, the person stayed active.
- Outgoing webhooks: when one of several receivers failed, the retry sent the event again to the ones that already had it
  (a Zap ran twice); now only the others get it. A receiver answering 410 Gone (a deleted Zap or scenario) is turned off at once.
- Incoming webhooks: the delivery log says why a delivery was refused or not used in the reader's language, and a task
  webhook's board can be changed on the Mapping tab without changing its address.
- Mail that cannot be sent (the relay refused the app password, its daily limit, a recipient) is answered with a plain
  sentence instead of an error; a busy relay is tried once more.
- The AI connector takes at most 10 messages in one JSON-RPC batch.

- Hover washes on toasts, segmented buttons and chips, and the read-only warning colour in the sidebar show again (their
  design tokens referred to themselves and computed to nothing). The phone menu, the console's company drawer and the
  Office and AI team panels close with the same 44 × 44 Close as every dialog.

- Hebrew says "יום אחד", "משימה אחת הועברה" after a count of one instead of "1 ימים", "1 משימות הועברו": the noun, "one" in
  its gender, a neighbouring verb or adjective in agreement, and a prefix letter joined to the word.

- A customer listed twice in an imported file is reported ("same customer as row 2: merged into one") instead of being
  merged without a word.
- A new deal, contact or other record can create its customer on the spot: the customer field searches and offers "Add new
  customer" like the task form.
- The trial request form, opened in another tab, says the answers are kept and only the e-mail needs confirming again,
  then returns to the step it was on; before, it silently started over.
- Tools that are not turned on for an installation say who can turn them on, instead of "not set up on this server".

- A connection that stopped working now says why in your language (sign-in no longer accepted, no permission, could not
  be reached, or a neutral "reported a problem"), with the service's own message under it, in the reconnect banner and the
  connection lists; before, the raw service message (often English) stood alone. A sync that only waits out a service's
  rate limit shows "Paused, resumes automatically" instead of "Needs a look".

- Importing a Turkish task file with a "Liste" column now offers the Boards step.
- The renewals view no longer adds amounts in other currencies one to one under the company's currency sign: amounts
  with a rate are converted (marked ≈), others are totalled in their own currency.
- English counts say "1 renewal", "1 day", "1 reply" (singular after one).

- _Nothing yet._

### Security

- A crawler with a made-up `Authorization: Bearer` header is refused like any other crawler; the bearer must be a live key
  or app token of the company. Scanners without a session now count towards the unknown-address limit (they saw 401,
  never 404); webhook receivers stay out of that count.

- _Nothing yet._

### Known issues

- `tests/i18n.test.ts` fails on a clean checkout: the audit action `billing.refused` (written in `api/src/lib/billing.ts`) has no
  `audit.billing.refused` string in `shared/src/i18n/en.ts` / `tr.ts`. Because the i18n check is a required CI job, this must be fixed
  (add the two strings, e.g. with `npm run strings`) before the gate can go green.
- `db/OPS-SECURITY.md` is referenced from `api/src/lib/headers.ts` and `tests/rls.test.ts` but does not exist; the content it was meant to
  hold is now in `SECURITY.md` ("Known operational requirements"). Update the two comments when convenient.
- Edge rate limiting, database role separation (`FORCE ROW LEVEL SECURITY` with a non-owner login), an off-site backup with a rehearsed
  restore, and a `SECRETS_KEY` re-seal tool are not in place yet; see `SECURITY.md` and `docs/RUNBOOK.md`.
- Prettier has not been applied to the existing code; run it once in a dedicated PR.
