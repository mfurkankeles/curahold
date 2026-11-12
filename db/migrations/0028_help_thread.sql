-- Curahold — a help request becomes a conversation.
--
-- Until now a request went out once and its answer came back by whatever road
-- the support desk used. Now the answer lives on the request: support replies,
-- the person replies back (in the product or by answering the email), and the
-- request says whose turn it is. Colleagues can be kept in the loop, and
-- Curahold's own team can leave itself notes that never reach the customer.

alter table help_requests add column followers uuid[] not null default '{}';
alter table help_requests add column needed_by date;
alter table help_requests add column last_message_at timestamptz;
-- When the person who asked last opened it: an answer newer than this is still unread.
alter table help_requests add column seen_at timestamptz;
-- Goes into the reply address of the emails about this request (reply+<token>@…), so an
-- answer by email finds its way back. Unguessable, and of no use for anything else.
alter table help_requests add column reply_token text unique check (length(reply_token) between 16 and 80);

create table help_messages (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  request_id  uuid not null,
  author      text not null check (author in ('user', 'support')),
  -- Who in the company wrote it (author 'user'); who at Curahold did (author 'support').
  user_id     uuid,
  staff       text check (length(staff) <= 200),
  body        text not null check (length(body) between 1 and 20000),
  -- A note Curahold's team leaves for itself. Never shown to, or sent to, the company.
  internal    boolean not null default false,
  via         text not null default 'app' check (via in ('app', 'email', 'desk')),
  -- The Message-ID of the email this arrived as or went out as: threads replies, drops repeats.
  email_id    text check (length(email_id) <= 400),
  created_at  timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, request_id) references help_requests (org_id, id) on delete cascade,
  foreign key (org_id, user_id) references users (org_id, id) on delete set null (user_id),
  check (not internal or author = 'support')
);
create index help_messages_request_idx on help_messages (request_id, created_at);
create unique index help_messages_email_idx on help_messages (email_id) where email_id is not null;
alter table help_messages enable row level security;
-- Internal notes are Curahold's own: the application's role never reads one, whoever asks.
create policy help_messages_select on help_messages for select
  using (org_id = app_org() and not internal and exists (select 1 from help_requests h where h.id = help_messages.request_id));
create policy help_messages_insert on help_messages for insert
  with check (
    org_id = app_org() and author = 'user' and user_id = app_user() and not internal
    and exists (select 1 from help_requests h where h.id = help_messages.request_id and (h.user_id = app_user() or app_user() = any (h.followers)))
  );
grant select, insert on help_messages to curahold_app;

-- Someone kept in the loop reads the request and answers on it, like the person who asked.
drop policy help_requests_select on help_requests;
create policy help_requests_select on help_requests for select
  using (org_id = app_org() and (user_id = app_user() or app_user() = any (followers) or app_has_perm('org.manage')));
drop policy help_requests_update on help_requests;
create policy help_requests_update on help_requests for update
  using (org_id = app_org() and (user_id = app_user() or app_user() = any (followers)))
  with check (org_id = app_org() and (user_id = app_user() or app_user() = any (followers)));
grant update (status, followers, last_message_at, seen_at) on help_requests to curahold_app;

alter table help_files add column message_id uuid;
