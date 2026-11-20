-- Deleting a whole company, and keeping only what the law asks for afterwards
-- (package l2-privacy, 20 Nov 2026; api/src/lib/companyDeletion.ts).
--
-- 1. company_deletions: an administrator's request, the grace period (30 days
--    by default, COMPANY_DELETE_GRACE_DAYS) during which it can be cancelled,
--    and, once purged, the certificate: what was removed, counted per table,
--    files and connector tokens included, with its SHA-256. No foreign key to
--    orgs on purpose: the certificate outlives the company. It holds no
--    personal data (no names, no e-mail addresses), only the company's name
--    and address as the customer knew them.
-- 2. invoices outlive the company: tax law asks for them (TR VUK m.253: 5
--    years; TTK m.82: 10 years). The link to the company is set to null and
--    the company's name is copied onto the row at the purge.
-- 3. consent_records become append-only like agreement_evidence: the only
--    change let through is the anonymisation the purge and erasure make (the
--    e-mail address replaced by its SHA-256, the browser dropped) and the
--    company link set to null when the company is deleted. Deleting is left to
--    the retention job (lib/retention.ts), which runs over the owner
--    connection; the app role has no grant on the table at all.

create table company_deletions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  org_slug         text not null check (length(org_slug) <= 80),
  org_name         text not null check (length(org_name) <= 300),
  requested_by     uuid,
  requested_at     timestamptz not null default now(),
  purge_after      timestamptz not null,
  cancelled_at     timestamptz,
  cancelled_by     uuid,
  purged_at        timestamptz,
  certificate      jsonb,
  certificate_hash text check (certificate_hash is null or certificate_hash ~ '^[0-9a-f]{64}$')
);
-- One open request per company.
create unique index company_deletions_open_idx on company_deletions (org_id) where cancelled_at is null and purged_at is null;
create index company_deletions_due_idx on company_deletions (purge_after) where cancelled_at is null and purged_at is null;
alter table company_deletions enable row level security;
-- The company sees, asks for and cancels its own; the purge runs over the owner connection.
create policy company_deletions_select on company_deletions for select using (org_id = app_org());
create policy company_deletions_insert on company_deletions for insert with check (org_id = app_org() and purged_at is null and certificate is null);
create policy company_deletions_update on company_deletions for update using (org_id = app_org() and purged_at is null) with check (org_id = app_org() and purged_at is null);
grant select, insert on company_deletions to curahold_app;
grant update (cancelled_at, cancelled_by) on company_deletions to curahold_app;

alter table invoices alter column org_id drop not null;
alter table invoices drop constraint invoices_org_id_fkey;
alter table invoices add constraint invoices_org_id_fkey foreign key (org_id) references orgs(id) on delete set null;
alter table invoices add column company_name text check (company_name is null or length(company_name) <= 300);

create function consent_records_frozen() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'email' - 'user_agent' - 'org_id') = (to_jsonb(old) - 'email' - 'user_agent' - 'org_id')
     and (new.email = old.email or new.email = 'erased:' || encode(sha256(convert_to(old.email, 'UTF8')), 'hex') or old.email like 'erased:%' and new.email = old.email)
     and (new.user_agent is null or new.user_agent is not distinct from old.user_agent)
     and (new.org_id is not distinct from old.org_id or (new.org_id is null and not exists (select 1 from orgs where id = old.org_id)))
  then
    return new;
  end if;
  raise exception 'consent_records is append-only (% refused)', tg_op using errcode = 'insufficient_privilege';
end;
$$;
create trigger consent_records_no_update before update on consent_records
  for each row execute function consent_records_frozen();
create trigger consent_records_no_truncate before truncate on consent_records
  for each statement execute function consent_records_frozen();
