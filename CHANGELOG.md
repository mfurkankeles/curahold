# Changelog

All notable changes to Curahold are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it is released (`package.json` is `0.1.0`, unreleased).

How to use this file: add a line under **Unreleased** in the same PR as the change, in the right group (Added, Changed,
Deprecated, Removed, Fixed, Security). Write for a customer or an operator, not for the compiler. On release, rename
Unreleased to the version and date and start a new Unreleased section. Use invented examples only.

## [Unreleased]

### Added

- Yearly plans: every administrator gets an e-mail 30 days before the plan renews (the date, the plan and seats, and
  where to change or stop it), as the terms and the refund policy promise. It comes even with other notifications
  turned off; operators can set the window with `RENEWAL_NOTICE_DAYS` (7–90).

### Changed

- Every language reads as one product (localisation review): Persian speaks formally ("شما") in the app and the whole
  help centre; Hebrew uses the plural on the site, in e-mails, consent, sign-up and the trial, with one word each for
  single sign-on, e-mail and trial; Korean shows the right particle after a name ("Acme를", not "Acme을(를)") and one
  politeness level; Turkish says "siz" everywhere and "kullanıcı" for a seat outside the legal pages; Hindi writes
  "कुंजी" for a key; Malay no longer uses Indonesian or "tempat duduk". Seat, plan, viewer, record and e-mail are in the
  glossary for all eleven languages. Four translations that changed the meaning are fixed (a refund promised where the
  English says credit, in Turkish and Japanese; the Arabic AI-consent purpose; the Korean indemnity clause). The AI
  consent version moves on, so people are asked once more.
- Sign-up: the line naming the terms and the privacy policy is one sentence in each language, so Hebrew prefixes, the
  Arabic "و" and the CJK and Hindi full stops sit right.
- Every action button carries an icon; every popup shows a 44 × 44 Close and closes on Esc; the site's /why/ page and
  the blog index have Back. The help centre's getting-started page says how a trial starts in all eleven languages.
- The site no longer marks the hand-over card, linked stories and linked work "Coming soon": they ship.
- Yearly plans: the renewal e-mail is now sent a little more than 30 days before the renewal, so it always arrives at
  least 30 days ahead, as the terms say; the billing help says "at least 30 days".
- Plans: the seat minimum is stated on the pricing page, in the terms (§5) and in the refund policy, in all eleven
  languages. The region it follows is fixed at checkout, so the hourly seat sync no longer lowers a subscription below
  the minimum it was bought with, and a plan change starts from the seats in use. The CuraAI money limit counts the
  seats paid for, the minimum included, and its field accepts cents.
- Site: the finance pages speak only of what ships today (contract value for the roles you allow, renewals, the cost
  to serve report); the accounting "coming soon" lines and the accounting integration group are gone.
- Legal drafts: a broken sentence in the DPA's Annex 4 is fixed in all eleven languages.
- AI team: no seat carries a private tone in the built-in org chart; only the owner's stored card can hold one, so the
  demo and a fresh install use the professional tone.
- Plans: a paying company's CuraAI money limit can no longer be set above its plan's allowance (full seats × the plan's
  rate; a fixed amount in the trial), and the public help chat has its own monthly cap. Every plan is billed for at
  least a few seats (3 by default; more in India and for some yearly plans), shown on the Billing page. A new trial keeps
  25 seats and has 1 GB a seat by default. All of these are operator settings (ADR 0022); prices are not final.
- Turkish: the in-app cookie banner and the API reference address the reader as "siz", like the rest of the product.
- Trial limits are where the terms say they are: during a trial, Settings → **Billing** shows the seats approved for the
  trial and the file space per full seat, and its seat row counts against the trial's seats (it said "no limit" before).
  The trial request form names the file space next to the seats, and the billing help says 25 seats by default and 1 GB
  a seat, in all eleven languages.
- Legal drafts (all eleven languages): the terms cover monthly and yearly plans, renewal, plan and seat changes and
  refer to a new **Refund policy** page (draft for the lawyer, linked from the site footer and the trust page); the
  privacy notice and DPA give the AI question retention the product really applies (none, 7, 30 by default, 90 or 365
  days; answers are not kept), list the public website chat as Curahold's own activity, and explain an AI assistant a
  user connects through the connector; the terms and acceptable use policy allow that connector use; the sanctions
  clause says what the product refuses (Iran) and the fair-use paragraph says what is limited; internal notes are out
  of the public text. The cookie page lists the Turnstile human check on public forms (cookie choices are asked again).
- The sales site no longer says the old tool becomes optional, that e-mails show on the timeline, or that accounting is
  available today; the settings hint says rule runs and hand-overs are not counted or sold per plan, fair use applies.
- The legal pages — terms, privacy notice, data processing agreement, acceptable use, SLA, order form, accessibility
  statement and the KVKK notice — are now in all eleven languages, each marked as a draft for the lawyer and saying that
  the English text prevails (for the KVKK notice, the Turkish). The privacy notice adds notes for India (grievance
  officer, Data Protection Board), Malaysia (Data Protection Officer, transfer safeguard, Malay and English), Singapore,
  the Gulf, Israel and East Asia, and says plainly that Curahold is not for anyone under 18.
- The sales site's links to help and legal pages now open in the reader's language instead of English, and the trust
  page lists the SLA, acceptable use policy, order form and the page for reporting a security issue.
- CuraAI: the panel has a visible Close (and Esc), Minimize is easier to hit, and **My requests** sits in the footer with
  its name. The round button steps aside while you type or scroll, on every screen size. A question typed in English in
  another language's interface is answered from the same help section in that language; "How do I add a renewal?" is
  answered in all eleven languages, and Hindi "नवीनीकरण" or Chinese "续订" find the same page as the help's own words.
- Toolbar buttons show their names next to their icons (board Import and Settings, Saved views, Home and Inbox actions on
  phones, the sidebar's **New board**); **Choose a file** has its icon.
- Settings: on a phone each topic has one way back. When billing is switched off for the workspace, its page says so
  instead of telling an administrator to ask an administrator. The customer-word presets work in every language.
- Connections: the service's own error message is folded under "What {app} said"; the plain sentence stays on top.
- The in-app platform console and business metrics pages use the app's own frame and, when they cannot be shown, say why
  and offer a way on.
- Turkish speaks "siz" everywhere, including the owner console and the go-live guide.
- The go-live guide sets backups to be deleted after 35 days, and the checklist has a matching item.
- Phones: bottom sheets (filters, date picker, task and record panels) can be pulled down to close. Every save button shows
  its saving ring and tick, not only the ones in dialogs. A task, record or opportunity card grows into its panel.
- Sales site: prices are hidden until launch ("pricing announced at launch") and the EU data claim only shows once it is
  confirmed (`SITE_PRICES`, `SITE_EU_DATA`); the setup-time promise is gone; demo links open in the visitor's language
  where the demo has it.
- Billing refuses countries we never sell to, in the billing profile, at checkout and at sign-up.
- Help centre: every picture is retaken in all eleven languages from the current product (today's labels, Turkish "siz",
  the customer's own address instead of a developer's). A help page shared or found in search shows a fuller description,
  in the page's own words, and the sales site's robots.txt points crawlers to the help centre's sitemap too.
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
  agenda, sales-to-onboarding hand-over checklist, health score sheet) and nineteen plain definitions (among them customer health
  score, churn, net revenue retention, ARR, business review, champion, time to value and the sales-to-success hand-over), the
  same items in every language, each saying only what Curahold does today. Linked from the Resources menu and the footer.
- Settings → Company: a privacy request log for objections, restrictions and other requests, with the due date the law of
  the person's country sets, and a reply date. Trial requests can be exported for the person who sent them.
- Report figures and the done tile on a customer show how they moved against the period before, with an icon and words,
  not only a colour.
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

- Requests about personal data: a GDPR or UK GDPR request's due date is one calendar month after receipt (it showed up
  to two days late in February), and moving a due date before the day the request came in is a clear error, not a
  server error.
- The owner's console no longer sends the same e-mail or phone alert twice when two sends overlap, and two different
  alerts for the same screen both stay on the phone.
- A save button pressed again while its ring was settling keeps its ring until the second save is back.
- Help and CuraAI no longer leave a connection open when a language's help index is missing.
- Opening the app in a new browser no longer leaves one connection to the server open for as long as the page stays open
  (an early answer the app could not use was never let go); every page now settles as soon as it has loaded.
  The owner console, a shared onboarding report, file downloads and session replays let go of error answers the same way.
- Support desk: a session replay keeps the look of screens the person opened after it started (their styles were
  refused by the desk's content policy and the replay showed them unstyled).
- Sign-up no longer promises a set-up time ("Ready in about 15 minutes" and minutes per step): it was never measured.
  It now says there are five steps, in every language.
- Owner console, Plan & targets: investors who passed and closed fundraising windows step back by colour and outline
  instead of fading, so their words and buttons keep AA contrast.
- On phones the customer page's **Next promise** shows two whole lines, never part of a third.
- The CuraAI answer list no longer moves the page around it when a new answer arrives (an embedded demo slid up).
- Team load says "1 customer", not "1 customers"; Arabic and Persian counts read naturally.
- Portal: the welcome card comes before the request list on a first visit, and the onboarding banner's arrow points forward.

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

- Smaller hardening from the security audit: members see the plan on Billing but no longer the tax number, billing
  address or the payment provider's ids; the AI connector's "open one item" takes only real ids; ten wrong authenticator codes in a
  row stop that person's codes for 15 minutes (recovery codes still work); help-request files wait for the upload
  scanner; error logs mask every token prefix and the portal's too; the portal sends HSTS; a self-hosted server
  without SMTP warns at start that sign-in links go to its log.
- Customer portal: the six-digit e-mail code is checked one try at a time, even when many guesses arrive together, and
  ten wrong codes in a row stop that person's codes for 15 minutes, however many new e-mails were asked for.
- Webhooks: a webhook now sends only what the person who added it can see — tasks and comments on boards they can open,
  not private boards or other departments' boards. When that person leaves, the webhook is switched off and the people
  who manage connections are notified.
- Seat limits now hold on every way in: joining by the company's domain, a first single sign-on and SCIM (adding or
  turning a person back on) stop at the trial's approved seats or the plan's limit, like an invitation does, also when
  many arrive at once; SCIM
  answers `403` with the reason and the sign-in page says the seats are full.
- Billing: the checkout is now a Paddle transaction the server makes with the plan's price and the company's seats; the
  page only opens it and never sees the signed company id. Because the browser can still change an open checkout, the
  webhook checks what was bought: a new subscription for a price that is not in `PADDLE_PRICES` is refused instead of
  ending the trial, too few seats are brought back to the company's seats at once, and a plan too small for the
  company's full seats is flagged; each raises an alert in the owner's console and on his phones.
- A change sent twice still happens once, but when its answer holds something shown only once (a new API key, a
  webhook's signing secret, an authenticator secret, recovery codes, a secret link or calendar feed address), the server keeps only that it was
  done: the repeat answers `{ "ok": true, "repeated": true }`. Repeat keys are kept a day instead of two; migration 0256
  clears what was kept before.
- API keys and connected apps (the AI connector included) can no longer administer the company: roles, people,
  removing or exporting someone, company deletion, single sign-on and SCIM, billing, API keys, connected chat apps and
  CRMs, security settings and support access answer `403 session_required` to every key and app token, whatever it was
  allowed — as does anything that needs an administrator's permission (assistant and portal settings, departments,
  customer imports and settings, automations…), checked in the database too. A key or an app can also be limited to areas (`work`, `customers`, `reports`, `people`, `webhooks`), each read
  or write (ADR 0024). Subscribing outgoing webhooks with a key keeps working.
- Database: the server's own work (sign-in look-ups, inbound hooks, the hourly jobs) no longer runs as the owner of the
  tables. It runs as a role that can read and write rows but cannot change the schema, a policy or a trigger, and every
  table now forces row security (migration 0254, ADR 0023). Operators: give migrations their own owner login with
  `MIGRATION_DATABASE_URL` and let the application connect with a login that owns nothing (`db/ops/role-separation.sql`).
- Privacy: the desk's draft first reply on a help request now asks the AI model only when the person who wrote the
  request has accepted CuraAI's notice; for anyone else support answers without a draft and nothing leaves Curahold
  (an operator setting can rest it on the company's switch instead, ADR 0021). A visitor's cookie choice is stored only
  with the hash of a text our banners really show. Answered requests about personal data are kept 3 years after closing,
  then deleted (`RETENTION_PRIVACY_REQUEST_DAYS`), and appear in the privacy notice in every language.
- Privacy: the server stores a hash of the consent words it actually served and refuses a consent without a policy version;
  old assistant consents are purged (the latest yes is kept); an erased portal person's consent proof stays, anonymised;
  AI drafts need the person's consent; a company's deletion certificate is e-mailed to its administrators.
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
- Edge rate limiting, an off-site backup with a rehearsed
  restore, and a `SECRETS_KEY` re-seal tool are not in place yet; see `SECURITY.md` and `docs/RUNBOOK.md`.
- Prettier has not been applied to the existing code; run it once in a dedicated PR.
