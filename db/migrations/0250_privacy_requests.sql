-- The company's log of requests people make about their personal data (KVKK m. 11, GDPR Art. 15–22, DPDP ss. 11–14
-- and the other laws the site serves): access, correction, erasure, restriction, objection, portability and
-- withdrawal of consent. Access and erasure already had their tools (export, erase); restriction and objection had no
-- record at all, so nothing showed that they were answered, or answered on time. Each row keeps the law that applies
-- and the date it is due under that law (shared/src/privacyRequests.ts), and who logged and closed it; changes are in
-- the audit log too. Only people with privacy.manage see or write it, enforced here as well as in the route.
create table privacy_requests (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  kind          text not null check (kind in ('access', 'rectification', 'erasure', 'restriction', 'objection', 'portability', 'withdrawal')),
  subject_name  text not null check (length(subject_name) between 1 and 200),
  subject_email text check (subject_email is null or length(subject_email) <= 320),
  law           text not null check (law ~ '^[a-z_]{2,20}$'),
  received_on   date not null,
  due_on        date not null check (due_on >= received_on),
  status        text not null default 'open' check (status in ('open', 'done', 'refused')),
  note          text check (note is null or length(note) <= 2000),
  created_by    uuid,
  closed_by     uuid,
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, id),
  check ((status = 'open') = (closed_at is null)),
  foreign key (org_id, created_by) references users (org_id, id) on delete set null (created_by),
  foreign key (org_id, closed_by) references users (org_id, id) on delete set null (closed_by)
);
create index privacy_requests_due_idx on privacy_requests (org_id, status, due_on);
alter table privacy_requests enable row level security;
create policy privacy_requests_select on privacy_requests for select using (org_id = app_org() and app_has_perm('privacy.manage'));
create policy privacy_requests_insert on privacy_requests for insert with check (org_id = app_org() and app_has_perm('privacy.manage'));
create policy privacy_requests_update on privacy_requests for update
  using (org_id = app_org() and app_has_perm('privacy.manage'))
  with check (org_id = app_org() and app_has_perm('privacy.manage'));
-- No delete: the log is the evidence that a request was answered. It goes with the company (cascade) or by retention.
grant select, insert on privacy_requests to curahold_app;
grant update (status, note, closed_by, closed_at, updated_at, due_on) on privacy_requests to curahold_app;
