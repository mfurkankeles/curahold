-- Outgoing webhooks: remember which hooks already have an event. An event goes to every hook of the company that
-- asked for it; when one of them failed, the whole event was queued again and sent to all of them on the retry, so a
-- receiver that had answered 200 got it a second time. Automation tools such as Zapier and Make run a step for every
-- delivery and do not drop repeats, so that was a second action (a second message, a second row). sent_to lists the
-- hooks that answered 2xx (or 410 Gone, which turns the hook off); a retry goes only to the others.
-- Additive: existing rows start with an empty list, which is what they meant before.
alter table webhook_events add column sent_to uuid[] not null default '{}';
