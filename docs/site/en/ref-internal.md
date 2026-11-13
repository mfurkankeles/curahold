---
title: Reference: what is not in the API
section: reference
order: 41
summary: Addresses that belong to the browser, listed so nothing is hidden.
---
# Reference: what is not in the API

These addresses exist but belong to the browser or to other machines. They are listed so nothing is hidden.

| Addresses | How many | Why |
| --- | --- | --- |
| `/admin/…` | 29 | Company settings, roles, people and privacy tools: an administrator in the browser. Keys cannot change them. |
| `/auth/…` | 5 | Signing in and out happens in the browser. |
| `/billing/…` | 3 | Plan and payment, with the payment provider. |
| `/client-error/…` | 1 | The browser reporting its own errors, so a fault a person hits is recorded. |
| `/connect/…` | 1 | Starting a connection to a CRM or chat app: a person approves it in the browser. |
| `/connections/…` | 27 | Managing connections and their field matching: an administrator in the browser. |
| `/desk/…` | 12 | Curahold support's own queue of help requests and the door for answers by email; open only with Curahold's own keys. |
| `/help/…` | 7 | Help requests to Curahold support and their conversation, from inside the product. |
| `/help-files/…` | 1 | Files sent to support. |
| `/hooks/…` | 3 | Chat apps and calendars calling back. |
| `/join/…` | 1 | Joining a company by invitation happens in the browser. |
| `/logo/…` | 1 | The company logo. |
| `/manifest.webmanifest/…` | 1 | The installable-app manifest. |
| `/metrics/…` | 1 | The operator-only platform metrics (the owner dashboard); not part of a company's API. |
| `/oauth/…` | 0 | The consent screen for apps and AI assistants; see "AI connector and OAuth". |
| `/org/…` | 1 | The company's public sign-in details. |
| `/portal/…` | 6 | Managing who can sign in to the customer portal. |
| `/replay/…` | 1 | The browser's session recording for support (disclosed, inputs masked, kept a week); the page posts its own events here, and only Curahold's desk reads them. |
| `/setup/…` | 5 | The first-time setup of a company. |
| `/signup/…` | 4 | Opening a new company happens on the website. |
| `/support/…` | 9 | Curahold support's own desk. |
