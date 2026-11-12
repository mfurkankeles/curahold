-- Curahold — support tickets from Zendesk, Freshdesk, Intercom, Jira Service
-- Management, Salesforce and Dynamics cases, or any tool through the API or
-- an inbound webhook. Tickets are records of the built-in "ticket" kind, so
-- they follow their customer's access rules, appear on its page and
-- timeline, roll up into customer fields and feed the health score.

alter table record_types drop constraint if exists record_types_kind_check;
alter table record_types add constraint record_types_kind_check check (kind in ('contact', 'opportunity', 'ticket', 'custom'));

-- Tickets sent through the API or a webhook are found again by the sending
-- tool's own id ("zendesk-like-tool" + "4711"), so sending twice updates.
alter table records add column external_id text check (length(external_id) <= 200);
create unique index records_external_idx on records (org_id, type_id, source, external_id) where external_id is not null;
