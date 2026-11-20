---
title: Owner console: plan, investors, the Monday summary and phone alerts
section: reference
order: 42
summary: For the platform owner and the operator — Plan & targets in the owner console (targets, budget against spend, milestones, fundraising windows, the investor pipeline), loading the business plan file, the weekly CEO e-mail and alerts on the owner's phone.
---
# Owner console: plan, investors, the Monday summary and phone alerts

> For the platform owner and whoever runs the server. Customers never see any of this: it lives in the owner console
> (`desk.<your domain>`), and only the platform owner, signed in with his authenticator app, can open it.

**Plan & targets** has three views, chosen at the top of the page: **Targets & tasks**, **Budget & investors** and
**Monday summary**. Each view has its own address (`/plan`, `/plan?q=investors`, `/plan?q=summary`), so a link from an
e-mail or a phone alert opens the right one.

## Targets & tasks {#targets}

The monthly targets for the funnel (site visitors, trial requests, approvals, activations, paying companies, seats, MRR,
ARR, invoices, companies lost) against what really happened this month, with the pace by the days gone. Under them are the
two **milestones** of the plan; their targets are set here too, and they are measured in **Budget & investors**.

## Loading the business plan {#import}

**Load from the plan** reads the plan's targets file (`targets.json`) and shows how many targets, budget lines,
fundraising windows and tasks it holds for the scenario you pick, before anything is stored. **Load** stores them together;
a file that is out of shape loads nothing and says why. Loading again is safe: the spend you entered, window statuses and
notes are kept, and no task is added twice.

The operator can do the same from a terminal:

```bash
DATABASE_URL=postgres://… npx tsx scripts/plan/load-targets.ts --file targets.json --scenario baz
```

Without `DATABASE_URL`, or with `--dry-run`, it only reads the file and prints what it would load.

## Budget & investors {#investors}

- **Budget and spend**: each month's planned budget (from the plan, or lines you add), what was really spent (you type
  it) and the revenue from paid invoices beside the plan's expected revenue. Enter the cash you have and the console works
  out the **runway**: months the cash lasts at this month's and the next two months' planned spend minus the plan's
  expected revenue.
- **Milestones**: **expanded companies** — paying for 3 months or more, with work started in at least two departments in
  the last 30 days; **switched companies** — paying for 6 months or more, once linked to an outside CRM or tracker, and now
  working in Curahold itself (the link is off, or 80% of new records in the last 30 days were made in Curahold). Both are
  counted on real data across companies; only the numbers are shown.
- **Fundraising windows**: when a round could open, what it should raise and what must be true first. The plan file brings
  the pre-seed and seed windows (months 4–7 and 10–14 after launch). Change a window's status as it moves (planned,
  preparing, open, closed); **Set aside** keeps it in the list, greyed out, instead of deleting it.
- **Investor pipeline**: the angels, funds and programmes you talk to, typed by you, with the stage, the next step and its
  day, an amount and the window it belongs to. Removing one keeps it for 30 days with **Bring back**. Only you see this list.

## The Monday summary {#summary}

Every Monday at 06:00 UTC (09:00 in Istanbul) the console sends you one e-mail about the week before: targets against
actuals, new and waiting trial requests, revenue and invoices, server errors, failed syncs and alerts, the AI team's
proposals waiting for your approval, help requests that block a customer, this month's budget and runway, the next
fundraising window and the investor steps due this week. It is written from the console's own figures — no AI model is
used, so it costs nothing and invents nothing — and it goes once per week however often the hourly job runs.

In **Monday summary** you can turn it off, choose its language (Turkish or English; phone alerts follow the same
choice), read a preview as it would be written now, and send it to yourself at once. It goes to `PLATFORM_OWNER` (or the
first support-staff address).

## Alerts on your phone {#phones}

Help requests that block a customer's work, system alerts (many errors, slow answers, notifications stuck) and the Monday
summary can also reach your phones and computers as notifications, even when the console is closed. It is free: the
browser's own push service carries the message, and it is encrypted so that only your device can read it.

1. The operator creates a key pair once and adds it to the server (see below).
2. Open the console on your phone and choose **Plan & targets → Monday summary → Add this device**, then allow
   notifications. On an iPhone, first add the console to the Home Screen (Share → Add to Home Screen) and open it from there.
3. **Send a test** checks it. **Remove** stops a device; a device whose browser gave up is removed by itself.

For the operator: `npx tsx scripts/plan/vapid-keys.ts` prints `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`; set both (the
private one as a secret) and, if you like, `VAPID_SUBJECT` (a `mailto:` address; default the owner's). Without them the
console says phone alerts are not set up, and e-mail alerts keep working. Changing the keys later means adding every
device again.
