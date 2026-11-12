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
- Make does not check the message's signature in this version: the address
  Make gives each webhook is long and unguessable, and nothing in a message
  changes Curahold. Signature checking is the next thing to add.
