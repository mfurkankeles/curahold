-- Proof of consent and of accepted contracts (package b9-compliance, 19 Nov 2026).
--
-- 1. consent_log (0039, cookie choices of people signed in) gets the fields a
--    KVKK / GDPR / PDPL review asks the controller to prove: which version of
--    the cookie policy, a SHA-256 of the exact words shown, the language, the
--    country (from the edge, never the IP address), the surface, the action and
--    an anonymous consent id that ties a person's choices across devices' banners.
-- 2. consent_events: the same record for visitors who are not signed in (the
--    sales site, the docs, the demo, the sign-in page). No company, no person:
--    a random consent id from the visitor's own browser, the country, the choice.
-- 3. agreement_evidence: an append-only, hash-chained record of every
--    click-accept of the contract pack (terms/MSA, DPA, SLA, AUP) — who, for
--    which company, which document version and text hash, when, from which
--    country, the box and button text, the context, and the copy sent. Each row
--    carries the hash of the previous row, so a changed or deleted row breaks
--    the chain (tests/compliance.test.ts verifies it). The trial's acceptance
--    step (org_agreements, the b4-trial package) writes one row here per document.

alter table consent_log drop constraint if exists consent_log_source_check;
alter table consent_log
  add constraint consent_log_source_check check (source in ('app', 'site', 'portal', 'docs', 'demo', 'console', 'trial')),
  add column policy_version text check (policy_version is null or length(policy_version) between 1 and 40),
  add column text_hash      text check (text_hash is null or text_hash ~ '^[0-9a-f]{64}$'),
  add column locale         text check (locale is null or length(locale) between 2 and 10),
  add column country        text check (country is null or country ~ '^[A-Z]{2}$'),
  add column consent_id     uuid,
  add column action         text check (action is null or action in ('accept_all', 'reject_all', 'custom', 'withdraw'));

create table consent_events (
  id              uuid primary key default gen_random_uuid(),
  consent_id      uuid not null,
  surface         text not null check (surface in ('site', 'app', 'portal', 'docs', 'demo', 'console', 'trial')),
  action          text not null check (action in ('accept_all', 'reject_all', 'custom', 'withdraw')),
  analytics       boolean not null,
  marketing       boolean not null,
  policy_version  text not null check (length(policy_version) between 1 and 40),
  text_hash       text check (text_hash is null or text_hash ~ '^[0-9a-f]{64}$'),
  locale          text check (locale is null or length(locale) between 2 and 10),
  country         text check (country is null or country ~ '^[A-Z]{2}$'),
  created_at      timestamptz not null default now()
);
create index consent_events_id_idx on consent_events (consent_id, created_at desc);
create index consent_events_created_idx on consent_events (created_at);
-- Central and written only by the server over the owner connection: no policy for the app role.
alter table consent_events enable row level security;

create table agreement_evidence (
  seq             bigint generated always as identity primary key,
  id              uuid not null unique default gen_random_uuid(),
  org_id          uuid references orgs(id) on delete set null,
  -- The company as stated at acceptance (kept even if the org is later deleted).
  company_name    text check (company_name is null or length(company_name) <= 300),
  company_tax_id  text check (company_tax_id is null or length(company_tax_id) <= 60),
  user_id         uuid,
  user_email      text not null check (length(user_email) <= 254),
  user_name       text check (user_name is null or length(user_name) <= 200),
  user_role       text check (user_role is null or length(user_role) <= 40),
  -- The ticked box "I am authorised to accept on behalf of the company".
  authority       boolean not null,
  doc             text not null check (doc in ('terms', 'dpa', 'sla', 'aup', 'order_form')),
  version         text not null check (length(version) between 1 and 40),
  doc_locale      text not null check (length(doc_locale) between 2 and 10),
  -- SHA-256 of the exact document text (and of its PDF copy) the person was given.
  doc_hash        text not null check (doc_hash ~ '^[0-9a-f]{64}$'),
  pdf_hash        text check (pdf_hash is null or pdf_hash ~ '^[0-9a-f]{64}$'),
  -- SHA-256 of the box text and the button label as rendered.
  statement_hash  text not null check (statement_hash ~ '^[0-9a-f]{64}$'),
  button_label    text not null check (length(button_label) <= 120),
  context         text not null check (context in ('trial_approval', 'purchase', 're_acceptance', 'order_form')),
  ip_country      text check (ip_country is null or ip_country ~ '^[A-Z]{2}$'),
  user_agent      text check (user_agent is null or length(user_agent) <= 400),
  -- The message id of the confirmation e-mail carrying the copy (durable record).
  copy_message_id text check (copy_message_id is null or length(copy_message_id) <= 300),
  accepted_at     timestamptz not null default now(),
  prev_hash       text not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  row_hash        text not null unique check (row_hash ~ '^[0-9a-f]{64}$')
);
create index agreement_evidence_org_idx on agreement_evidence (org_id, doc, accepted_at desc);
alter table agreement_evidence enable row level security;
-- The company reads its own evidence; writing goes through the server only.
create policy agreement_evidence_select on agreement_evidence for select using (org_id = app_org());
grant select on agreement_evidence to curahold_app;

-- Append-only: no update, no delete, for anyone. The one change let through is the
-- company link set to null when the company itself is deleted (on delete set null):
-- org_id is not part of row_hash, so the chain still verifies afterwards.
create function agreement_evidence_frozen() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and old.org_id is not null and new.org_id is null
     and not exists (select 1 from orgs where id = old.org_id)
     and (to_jsonb(new) - 'org_id') = (to_jsonb(old) - 'org_id') then
    return new;
  end if;
  raise exception 'agreement_evidence is append-only (% refused)', tg_op using errcode = 'insufficient_privilege';
end;
$$;
create trigger agreement_evidence_no_update before update or delete on agreement_evidence
  for each row execute function agreement_evidence_frozen();
create trigger agreement_evidence_no_truncate before truncate on agreement_evidence
  for each statement execute function agreement_evidence_frozen();
