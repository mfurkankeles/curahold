---
title: Reference: trash
section: reference
order: 27
summary: What was deleted in the last 30 days: listing it, putting it back, deleting it for good.
---
# Reference: trash

Deleting a customer, a record, a task, a timeline entry, a page, a saved report or a rule moves it to the trash, and the answer to that `DELETE` carries a `trashId`. For 30 days it can be put back as it was: under the same id, with everything that went with it, and with the links other things held to it. When the 30 days are over it is erased, files included. A person sees and restores what they deleted themselves; whoever may change company settings or manage privacy sees all of it and can delete something for good at once. Comments, single files, time entries and settings such as webhooks or keys are deleted outright and never pass through here.

> This page is built from the product's own code, so it always matches what the API accepts. The shapes are in [Objects](/docs/en/ref-objects/).

## Every address

| | |
| --- | --- |
| `GET /trash` | Lists what can still be put back, newest first, 50 at a time. |
| `POST /trash/:id/restore` | Puts it back as it was. |
| `DELETE /trash/:id` | Deletes it for good now, files included, without waiting for the 30 days. |

## Details

### `GET /trash`

Lists what can still be put back, newest first, 50 at a time. `kind` narrows to one kind (`account`, `record`, `task`, `activity`, `page`, `report`, `automation`), `q` searches the names, `before` (the `deletedAt` of the last item you have) gives the next 50. `manage` in the answer says whether this person may delete for good.

**Query:** `kind`, `q`, `before`

### `POST /trash/:id/restore`

Puts it back as it was. `dropped` counts rows left out because what they belonged to was deleted for good in the meantime, by table; `unlinked` lists links cleared for the same reason. `409 trash_parent_first` means what it belonged to is in the trash too (put that back first; `parentLabel` names it), `409 trash_parent_gone` that it no longer exists, `409 trash_conflict` that something else now holds the same CRM id or email. A refusal changes nothing.

**Needs:** a seat that can write

### `DELETE /trash/:id`

Deletes it for good now, files included, without waiting for the 30 days. Needs the right to change company settings or to manage privacy.
