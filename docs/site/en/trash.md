---
title: The trash
section: help
order: 6.5
summary: What you delete stays for 30 days and can be put back as it was. Who sees what, and how to delete for good.
---
# The trash

Deleting something in Curahold is not final straight away. It moves to the trash, stays there for 30 days, and can be put back as it was. When the 30 days are over it is erased for good, files included.

## What goes to the trash

| You delete | What goes with it | What stays |
| --- | --- | --- |
| A customer | Its records (contacts, opportunities and the rest), timeline, meetings, health history and portal people | Its tasks stay on their boards, without a customer |
| A task | Its subtasks, comments, time, followers, links and files | Nothing else is touched |
| A record | Its comments and files | Tasks that pointed at it |
| A timeline entry or a meeting | Only itself | A meeting's next steps stay, as tasks |
| A page, a saved report, an automation | Only itself | Tasks an automation already opened |

Undoing an import puts everything that import added in the trash as one item.

Some things are deleted outright and do not pass through the trash: a single comment, a single file, a time entry, a saved view, a webhook or an API key.

## Putting something back

Right after a delete, the notice at the bottom of the screen offers **Undo**. Later, open your menu (bottom left), choose **Trash**, find the item and choose **Put back**.

It returns as it was: at the same address, with everything that went with it. Links other things held to it are tied again: a customer's tasks point at it once more, unless someone has pointed a task at another customer in the meantime. If it was linked to a CRM, the sync follows it again. Nobody is notified and no webhook is sent: coming back is not news.

Three things do not come back: notices already sent about it, and the open sessions and one-time links of a customer's portal people. They sign in again; an invitation that was never accepted has to be sent again.

### When it cannot come back yet

- **What it belonged to is in the trash too.** A record needs its customer, a subtask its parent task. Curahold says which one; put that back first.
- **What it belonged to no longer exists.** For example, the kind of record was removed. It cannot be put back.
- **Something else has taken its place.** Another customer now carries the same CRM id, or a portal person the same email. Change or remove that one first.

When something under it has lost what it belonged to for good, the rest still comes back and the message says how many items were left out.

## Who sees what

- You see, and can put back, what you deleted yourself.
- People who can change company settings or manage privacy see everything deleted in the company, and can put any of it back.
- People on a viewer seat cannot delete, so they have no trash.

## Deleting for good

People who can change company settings or manage privacy can choose **Delete for good** on any item. It is erased at once, with its files, and nobody can put it back. Use this for a request to erase personal data that cannot wait 30 days.

Everything else leaves by itself when its 30 days are over.

## For developers

Every `DELETE` that moves something to the trash answers with a `trashId`. Listing, putting back and deleting for good are in the [trash reference](/docs/en/ref-trash/).
