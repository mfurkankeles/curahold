---
title: Reference: setup health
section: reference
order: 28
summary: The setup checks and the "Test your setup" list: read them, run a step, record the result, approve go-live.
---
# Reference: setup health

Setup health is a set of cheap checks over the company's own data (no model, no cost), each with a plain sentence, the reason it matters and the screen that fixes it. Everything is read as the caller: each person sees the checks they can fix, administrators see them all. Nothing here fixes anything; a test step does what its name says (a test ticket, one sync run, a dry run of a rule) and nothing more. Every try is kept with what it saw.

> This page is built from the product's own code, so it always matches what the API accepts. The shapes are in [Objects](/docs/en/ref-objects/).

## Every address

| | |
| --- | --- |
| `GET /setup-health` | The checks the caller can fix, worst first: `status`, `problem`, `why`, `fix` (the screen), and the counts `failing`, `found` and `fixed`. |
| `POST /setup-health/check` | The same checks, run now, and what fails is remembered, so a later read can count what was fixed. |
| `POST /setup-health/:id/confirm` | For a check that cannot be read from here (mail domain records): `done: true` says it was done, `false` takes it back. |
| `GET /setup-test` | The test steps of the company, each with `status`, `required`, the last tries (`runs`, with what each saw), its `issue` and its kept `input`; the `bundles` and the go-live `gate`. |
| `POST /setup-test/:id/run` | Runs a step the server can run (a test ticket, one sync run, a dry run of a rule) and keeps the try. |
| `POST /setup-test/:id/mark` | A person's verdict on a step: `pass`, `fail`, `skipped` (optional steps only) or `todo`, with an optional `note`. |
| `POST /setup-test/:id/input` | What the step is tried with (a customer, a connection, a colleague), kept for the next try. |
| `POST /setup-test/:id/issue` | Turns a failed step into an issue (also on the company's onboarding plan, when there is one). |
| `POST /setup-test/approve` | A go-live approval, once every required step passed: `side: customer` (an administrator of the company) or `vendor` (Curahold). |
| `POST /setup-test/reset` | Starts the list again (administrators). |

## Details

### `GET /setup-health`

The checks the caller can fix, worst first: `status`, `problem`, `why`, `fix` (the screen), and the counts `failing`, `found` and `fixed`. `?area=sync,import` limits it to some areas.

### `POST /setup-health/check`

The same checks, run now, and what fails is remembered, so a later read can count what was fixed. Answers as `GET /setup-health` does.

### `POST /setup-health/:id/confirm`

For a check that cannot be read from here (mail domain records): `done: true` says it was done, `false` takes it back.

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `done` | yes/no | required |  |

### `GET /setup-test`

The test steps of the company, each with `status`, `required`, the last tries (`runs`, with what each saw), its `issue` and its kept `input`; the `bundles` and the go-live `gate`.

### `POST /setup-test/:id/run`

Runs a step the server can run (a test ticket, one sync run, a dry run of a rule) and keeps the try. Answers with the whole list.

### `POST /setup-test/:id/mark`

A person's verdict on a step: `pass`, `fail`, `skipped` (optional steps only) or `todo`, with an optional `note`.

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `status` | one of todo \| pass \| fail \| skipped | required |  |
| `note` | text | optional | at most 500 characters |

### `POST /setup-test/:id/input`

What the step is tried with (a customer, a connection, a colleague), kept for the next try. `value: null` lets it choose.

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `value` | id | required | may be null |

### `POST /setup-test/:id/issue`

Turns a failed step into an issue (also on the company's onboarding plan, when there is one). It closes by itself when the step passes.

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `title` | text | optional | at least 1 characters; at most 200 characters |

### `POST /setup-test/approve`

A go-live approval, once every required step passed: `side: customer` (an administrator of the company) or `vendor` (Curahold). With both, the setup is complete.

| Field | Type | | Notes |
| --- | --- | --- | --- |
| `side` | one of customer \| vendor | required |  |
| `approve` | yes/no | required |  |

### `POST /setup-test/reset`

Starts the list again (administrators). The tries stay on record.
