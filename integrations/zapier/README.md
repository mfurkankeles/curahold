# Curahold on Zapier

A Zapier app (Platform CLI) that lets a company wire Curahold to the
thousands of tools Zapier knows. It uses nothing but the public API with a
personal API key, so it can do exactly what the key's owner can do, and the
customer pays Zapier with their own plan: nothing is added to our costs.

- **Starts a Zap (instant):** new task, task changed, task completed, new
  customer, customer changed, new record, record changed, new comment, new
  note/call/meeting. Each is a webhook the Zap adds for itself and removes
  when it is turned off; messages are checked against Curahold's signature.
- **Does:** create task, update task, comment on task, create customer,
  update customer, log a note/call/meeting.
- **Finds:** a customer by name.

`operations.js` is the single description of all of that; `app.js` turns it
into Zapier's shape (the Make app in `../make` is built from the same file).
`tests/integrations.test.ts` runs every trigger, action and search against
the real API.

## Publishing (needs the owner's Zapier developer account)

```
cd integrations/zapier
npm install
npx zapier login          # opens Zapier's own sign-in
npx zapier register "Curahold"
npx zapier validate
npx zapier push
```

Then, in Zapier's developer pages: add the logo and description, invite the
first users with the private invite link, and apply for the public directory
once a handful of companies use it (Zapier asks for live users first).

## Good to know

- A Zap that starts from Curahold needs a key whose owner may manage
  connections (it adds a webhook), and the key must be able to make changes.
- A company can have 20 webhooks; each Zap that starts from Curahold uses one.
- "Update task" reads the task first and changes it against that version, so
  it never silently overwrites an edit made in the same second.
