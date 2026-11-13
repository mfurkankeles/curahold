# Curahold on Make

The Make app, as one file: `app.json`. It is **built** from the same
description the Zapier app uses (`../zapier/operations.js`), so the two offer
the same things under the same names:

```
node integrations/make/build.mjs
```

| In `app.json` | In Make's app builder |
| --- | --- |
| `base` | Base |
| `connections.apikey` | a connection of type "API key": Parameters and Communication |
| `rpcs.list_*` | Remote procedures (they fill the Board, Person and Customer dropdowns) |
| `webhooks.*` | one dedicated webhook per trigger: Communication, Attach, Detach |
| `modules.watch_*` | instant triggers, each tied to its webhook |
| `modules.*` (the rest) | actions and the search: Communication, Mappable parameters, Interface, Samples |

Like the Zapier app it only uses the public API with a personal API key; the
customer runs it on their own Make plan.

## Publishing (needs the owner's Make account)

1. In Make: your profile → **My apps** → Create a new app (name `curahold`,
   label `Curahold`).
2. Paste each block of `app.json` into the matching tab (the table above), or
   load them with Make's app extension for VS Code.
3. Add a connection with a real API key and run every module once in a test
   scenario. Three things to look at there, because they depend on how Make
   fills in empty fields: an action with optional fields left empty, "Update
   task" (it reads the task's version first), and "Task completed" (it lets
   only done tasks through).
4. Share the app with the invite link. Apply for the public listing once a
   few companies use it.

## Good to know

- A scenario that starts from Curahold needs a key whose owner may manage
  connections (it adds a webhook), and the key must be able to make changes.
- A company can have 20 webhooks; each scenario that starts from Curahold uses one.
- Make checks that each message is Curahold's. When a scenario is switched on,
  Curahold makes a secret for its webhook and Make keeps it with the webhook
  (`attach` stores `body.secret`). Every message carries a
  `Curahold-Event-Signature` header: the HMAC-SHA256 (hex) of the event's `id`
  made with that secret. The webhook's `condition` lets a message through only
  when `sha256(body.id; "hex"; webhook.secret)` equals the header, so a stranger
  who learns the webhook address cannot start the scenario. Zapier checks the
  whole raw message (`Curahold-Signature`); Make only sees the parsed message,
  so its check covers the event id. The same check is in `build.mjs` (`SIGNED`).
  When you run step 3 above, also post a message by hand with a wrong or
  missing header and see that the scenario does not start: the expression uses
  Make's `sha256(text; encoding; key)` and `headers.*`, which depend on how the
  builder exposes a webhook's headers.
