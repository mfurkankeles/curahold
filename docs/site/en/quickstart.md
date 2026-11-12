---
title: Quickstart
section: developers
order: 2
summary: From nothing to your first task and your first webhook, in about five minutes.
---
# Quickstart

Five steps, about five minutes. You need a Curahold company and a seat that can make changes.

## 1. Make a key

1. Open **Your settings**.
2. Under **API keys and connected apps**, choose **New API key**.
3. Tick **Can make changes** and copy the key. It starts with `chk_` and is shown only once.

```bash
export CURAHOLD=https://yourcompany.curahold.com/api
export CURAHOLD_KEY=chk_...
```

## 2. Ask who you are

```bash
curl -s $CURAHOLD/me -H "Authorization: Bearer $CURAHOLD_KEY"
```

The answer says who the key acts as and how the company is set up: its time zone, its currency, the word it uses for "customer" and its customer fields. Everything a key does is done **as this person**: it sees what they see and may change what they may change.

## 3. Read customers

```bash
curl -s "$CURAHOLD/accounts?q=harbor&limit=5" -H "Authorization: Bearer $CURAHOLD_KEY"
```

Each customer carries its own fields in `fields`, under the keys listed in `org.accountFields` of the `/me` answer.

## 4. Add a task

A task lives on a board, in one of its columns. Pick a board first:

```bash
curl -s $CURAHOLD/boards -H "Authorization: Bearer $CURAHOLD_KEY"
```

Then add the task. The `Idempotency-Key` header makes a retry safe: the same key sent again gets the first answer back and nothing is done twice.

```bash
curl -s -X POST $CURAHOLD/tasks \
  -H "Authorization: Bearer $CURAHOLD_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"boardId":"<board id>","title":"Send the renewal summary","accountId":"<customer id>","dueDate":"2027-02-20"}'
```

## 5. Hear about changes

Instead of asking again and again, let Curahold tell you. In **Settings → Developers** choose **New webhook**, give a public `https` address and pick the events you want (`task.updated`, `account.updated` …). Every message is signed; [check the signature](/docs/en/webhooks/#verifying-the-signature) before trusting it.

## The same in JavaScript

```js
const api = 'https://yourcompany.curahold.com/api';
const headers = { Authorization: `Bearer ${process.env.CURAHOLD_KEY}`, 'Content-Type': 'application/json' };

const { boards } = await (await fetch(`${api}/boards`, { headers })).json();
const res = await fetch(`${api}/tasks`, {
  method: 'POST',
  headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
  body: JSON.stringify({ boardId: boards[0].id, title: 'Send the renewal summary' }),
});
if (!res.ok) throw new Error((await res.json()).message);
const { task } = await res.json();
```

## The same in Python

```python
import os, uuid, requests

api = "https://yourcompany.curahold.com/api"
headers = {"Authorization": f"Bearer {os.environ['CURAHOLD_KEY']}"}

boards = requests.get(f"{api}/boards", headers=headers).json()["boards"]
res = requests.post(
    f"{api}/tasks",
    headers={**headers, "Idempotency-Key": str(uuid.uuid4())},
    json={"boardId": boards[0]["id"], "title": "Send the renewal summary"},
)
res.raise_for_status()
task = res.json()["task"]
```

## Where next

- [API guide](/docs/en/api-reference/): the ideas behind the API, with examples.
- [Reference](/docs/en/ref-customers/): every address, field by field.
- [Connect your own tool](/docs/en/connect-your-own-tool/): keep Curahold in step with a system that is not on the list of connections.
- [Webhooks](/docs/en/webhooks/) and [errors](/docs/en/ref-errors/).
