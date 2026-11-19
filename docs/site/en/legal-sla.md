---
title: Service level agreement
section: legal
order: 7
summary: Availability Curahold commits to on paid plans, how it is measured, service credits, support response times, backups and recovery targets.
---
# Service level agreement (SLA)

> **Draft — lawyer approval required.** Version 2026-11-19.draft1. Part of the Terms of service for paid plans (not for trials). Figures in [brackets] are proposals: only a figure our monitoring can prove is promised.

## 1. Availability

- **Target:** the Service is available **[99.5]%** of each calendar month.
- **Measured** by external checks of the sign-in page and the API every minute from at least two regions; a minute counts as unavailable when both regions fail. The figures are shown on the status page [status page address].
- **Not counted:** planned maintenance announced at least 48 hours ahead (at most [4] hours a month, outside 08:00–20:00 Istanbul time where possible); problems caused by the Customer, its network or its connected third-party tools; a suspension under the terms; force majeure; features marked beta.

## 2. Service credits

| Monthly availability | Credit (share of that month's fee) |
| --- | --- |
| below [99.5]% | [10]% |
| below [99.0]% | [25]% |
| below [95.0]% | [50]% |

An administrator claims a credit within 30 days after the month ends, through support. Credits are set against the next invoice, are not paid out in cash, and are the **sole remedy** for missed availability. If availability is below [99.0]% in three months of any six, the Customer may end the agreement with a refund of prepaid fees.

## 3. Support

| Severity | Example | First response |
| --- | --- | --- |
| 1 — critical | The Service is down or data is at risk | [4] business hours |
| 2 — major | A key feature fails, no workaround | [1] business day |
| 3 — minor | A feature fails, a workaround exists | [2] business days |
| 4 — question | How-to, requests | [3] business days |

Business hours: [09:00–18:00 Istanbul time, Monday–Friday, excluding public holidays in Türkiye]. Channels: in-app help and [support e-mail].

## 4. Backups and recovery

- Backups at least daily, kept for 35 days.
- **Recovery point objective:** [24] hours. **Recovery time objective:** [8] hours.
- Restore tests at least quarterly [confirm with the hosting set-up].

## 5. Changes

This SLA changes as described in section 19 of the terms; a change may not lower the target during a paid subscription term.
