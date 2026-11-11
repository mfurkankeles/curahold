---
title: Webhooks
section: developers
order: 4
summary: Events, the message format, verifying signatures and retries.
---
# Webhooks

With a webhook, Tendwell sends a message to your address within seconds of a change. No need to keep asking what changed.

## Adding one

Settings → Developers → **New webhook**. You need permission to manage connections.

- The address must be a public `https` address. Local and private-network addresses are refused.
- Choose which events to send.
- A **signing secret** (`whsec_…`) is shown when you add it. It is shown once; keep it.

**Send a test** posts a `ping` event to your address and shows the answer.

## Events

| Event | When |
| --- | --- |
| `task.created` | A task was opened |
| `task.updated` | A task changed (status, people, date, archived…) |
| `account.created` | A customer was added |
| `account.updated` | A customer changed |
| `record.created` | A record (contact, opportunity…) was added |
| `record.updated` | A record changed |
| `comment.created` | A comment was written on a task |

If something changes several times within a minute, one message goes out, carrying how it looks when the message is sent.

## The message

```http
POST /your-endpoint HTTP/1.1
Content-Type: application/json
Tendwell-Event: task.updated
Tendwell-Signature: t=1794394831,v1=5f2b…

{
  "id": "9b0c…",
  "event": "task.updated",
  "occurredAt": "2026-11-11T10:20:31.000Z",
  "company": "yourcompany",
  "url": "https://yourcompany.tendwell.com",
  "data": { "id": "…", "title": "Send the renewal proposal", "status": "done", "done": true, "dueDate": "2027-01-15" }
}
```

The same message can arrive more than once; use `id` to drop repeats.

## Verifying the signature

`v1` in the `Tendwell-Signature` header is the HMAC-SHA256 of `t + "." + body` with your secret. Use the body exactly as received, before parsing it. Reject `t` values older than five minutes.

```js
// Node.js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
```

```python
# Python
import hmac, hashlib, time

def verify(raw_body: bytes, header: str, secret: str) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    if abs(time.time() - int(parts["t"])) > 300:
        return False
    signed = parts["t"].encode() + b"." + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts["v1"])
```

## Answering, and retries

- Answer `2xx` within 10 seconds. Do the work afterwards.
- With no answer, or anything but `2xx`, Tendwell tries again after 1, 5, 30, 120 and 360 minutes: 6 tries in all.
- A webhook that fails 50 times in a row is paused. Turn it back on with **Resume** in Settings → Developers.
- Redirects are not followed; give the final address.
