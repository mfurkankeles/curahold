---
title: Timeline and health score
section: help
order: 4
summary: Logging calls and notes, a customer's history, and a health score that shows its reasons.
---
# Timeline and health score

Every customer page has a **timeline** and, if you switched it on, a **health score**. The timeline tells what happened with the customer; the score sums it up in one number, with its reasons.

## Timeline

In the box at the top, choose **Note**, **Call**, **Meeting** or **Email**, write what happened and add it. Change the date if you need to, and tick the people you spoke to.

These appear on the timeline by themselves:

- Tasks opened and finished for the customer
- Comments on those tasks
- Contacts (stakeholders) added
- Days when the health score moved by 10 points or more

**Pin** an important note to keep it at the top. Whoever wrote an entry, or someone who manages customers, can edit or delete it. A task on a board you cannot open, or a field hidden from you, does not show on the timeline either.

## Health score

Switch it on in Settings → Health score. It is a number from 0 to 100 for every customer, worked out from what is already in Curahold:

| Signal | Full points | No points |
| --- | --- | --- |
| Recent touch | Last call, meeting, email or note within 14 days | 45 days or older |
| Overdue work | No overdue tasks | 3 or more overdue tasks |
| Support load | No open support tickets | 5 open tickets (an urgent one counts twice) |
| A champion | At least one "Champion" contact | None |
| Decision maker known | At least one "Decision maker" contact | None |
| No blockers | No blockers or skeptics | A blocker |
| The owner's judgement | The first option of a choice field (for example "Good") | Its last option (for example "At risk") |
| A number field | A value you choose | A value you choose |

You choose the weights, the days and the bands (Healthy, Worth watching, At risk). Before you save, a preview shows what each customer would score. A signal with no data for a customer is left out and the others share its weight.

> **Why?** Next to the score on a customer page, **Why?** shows the points each signal gave and a chart of recent weeks. The score is no black box: you can see where every point comes from.

The score behaves like any customer field: a column in lists, a filter, on home-page cards, in exports, in the API and in webhooks. Map it to a field in a CRM sync and it is written to your CRM too. Nobody can type it in by hand.

It is worked out again within seconds of a change to that customer, and once a day. Each day's score is kept; trends and the weekly summary come from there.

## Weekly summary

On Monday, at the hour you chose for your morning summary, you get a summary of your customers: renewals in the next 30 days, scores that fell and the main reason, customers with no touch for 30+ days, and the week's work. Switch it off in Your settings.
