-- Onboarding plans: one mutual plan, used two ways (shared/src/onboarding.ts).
--
--   kind 'self'   — this company getting started with Curahold itself. One per
--                   company, opened when its trial or paid start begins; its
--                   steps tick themselves from what the company does in the
--                   product (team invited, first import, sync healthy…). Shown at
--                   <slug>.<domain>/onboarding.
--   kind 'client' — the company onboarding one of ITS customers (accounts). Made
--                   from a template, opened by the hand-over of a won deal, seen
--                   by the customer in their portal, handed to Customer Success
--                   with a health baseline when done.
--
-- Around a plan: steps by phase (with dependencies, both sides' owners, the
-- signal that completes them, an optional short form that writes customer
-- fields), goals, the people of both sides, shared issues (linked to support
-- tickets, never copied), the data-mapping table, sites, and before/after
-- metrics. Nothing here duplicates an existing entity: a step that needs
-- product work links a story through request_links; an issue links a ticket
-- record; the hand-over to Customer Success is a handovers card.
--
-- Undo: db/rollback/0200_onboarding.sql.

-- ------------------------------------------------------------------ tables

create table onboarding_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  kind        text not null default 'client' check (kind in ('self', 'client')),
  name        text not null check (length(name) between 1 and 120),
  summary     text not null default '' check (length(summary) <= 1000),
  -- The blueprint: phases, steps, goals, mapping rows and metrics (shared/src/onboarding.ts, Blueprint).
  body        jsonb not null default '{}'::jsonb check (pg_column_size(body) <= 64000),
  -- Copied from a built-in template (its key), or null when written here.
  built_in    text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz,
  unique (org_id, id),
  foreign key (org_id, created_by) references users (org_id, id) on delete set null (created_by)
);

create table onboarding_plans (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  kind         text not null check (kind in ('self', 'client')),
  account_id   uuid,
  template_id  uuid,
  handover_id  uuid,
  name         text not null check (length(name) between 1 and 160),
  status       text not null default 'active' check (status in ('draft', 'active', 'paused', 'done', 'cancelled')),
  -- Where a client plan lives: Onboarding when the company has it, else Customer Success.
  department   text check (department in ('onboarding', 'success')),
  owner_id     uuid,
  welcome      text not null default '' check (length(welcome) <= 4000),
  -- The hand-over note from Sales (prefilled from the hand-over card).
  note         text not null default '' check (length(note) <= 8000),
  started_on   date not null default current_date,
  target_on    date,
  done_at      timestamptz,
  done_by      uuid,
  -- When handed to Customer Success: the health score and metrics at that moment.
  baseline     jsonb not null default '{}'::jsonb check (pg_column_size(baseline) <= 8000),
  -- The shareable progress report: SHA-256 of the link's secret, never the secret.
  share_hash   text unique,
  share_at     timestamptz,
  portal_visible boolean not null default true,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, id),
  check ((kind = 'self') = (account_id is null)),
  foreign key (org_id, account_id) references accounts (org_id, id) on delete cascade,
  foreign key (org_id, template_id) references onboarding_templates (org_id, id) on delete set null (template_id),
  foreign key (org_id, owner_id) references users (org_id, id) on delete set null (owner_id),
  foreign key (org_id, done_by) references users (org_id, id) on delete set null (done_by),
  foreign key (org_id, created_by) references users (org_id, id) on delete set null (created_by)
);
create unique index onboarding_plans_self_idx on onboarding_plans (org_id) where kind = 'self';
create unique index onboarding_plans_handover_idx on onboarding_plans (handover_id) where handover_id is not null;
create index onboarding_plans_account_idx on onboarding_plans (org_id, account_id);
create index onboarding_plans_open_idx on onboarding_plans (org_id) where status in ('draft', 'active', 'paused');

create table onboarding_people (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  plan_id        uuid not null,
  side           text not null check (side in ('vendor', 'customer')),
  user_id        uuid,
  portal_user_id uuid,
  name           text not null check (length(name) between 1 and 120),
  role           text not null default 'other' check (role in ('sponsor', 'lead', 'integration', 'tester', 'user', 'other')),
  duty           text not null default '' check (length(duty) <= 300),
  contact        text not null default '' check (length(contact) <= 200),
  position       int not null default 0,
  created_at     timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, plan_id) references onboarding_plans (org_id, id) on delete cascade,
  foreign key (org_id, user_id) references users (org_id, id) on delete set null (user_id),
  foreign key (org_id, portal_user_id) references portal_users (org_id, id) on delete set null (portal_user_id)
);
create index onboarding_people_plan_idx on onboarding_people (plan_id);

create table onboarding_sites (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references orgs(id) on delete cascade,
  plan_id   uuid not null,
  name      text not null check (length(name) between 1 and 120),
  region    text not null default '' check (length(region) <= 80),
  -- Status per phase: { "<phase>": "todo" | "doing" | "done" | "na" }.
  stages    jsonb not null default '{}'::jsonb check (pg_column_size(stages) <= 2000),
  position  int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, plan_id) references onboarding_plans (org_id, id) on delete cascade
);
create index onboarding_sites_plan_idx on onboarding_sites (plan_id);

create table onboarding_steps (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  plan_id        uuid not null,
  -- The blueprint's key (dependencies are written with it), and the built-in wording's key.
  key            text not null check (key ~ '^[a-z][a-zA-Z0-9_.-]{0,60}$'),
  title_key      text,
  title          text check (length(title) <= 200),
  body           text not null default '' check (length(body) <= 2000),
  phase          text not null check (phase in ('kickoff', 'setup', 'data', 'test', 'golive', 'adopt')),
  position       int not null default 0,
  side           text not null default 'vendor' check (side in ('vendor', 'customer', 'both')),
  owner_id       uuid,
  person_id      uuid,
  -- A product event that completes it by itself (shared/src/onboarding.ts, SIGNALS); null = ticked by a person.
  signal         text check (signal ~ '^[a-z][a-zA-Z0-9_.]{1,60}$'),
  status         text not null default 'todo' check (status in ('todo', 'doing', 'done', 'blocked', 'skipped')),
  effort_days    int check (effort_days between 0 and 365),
  hands_on_hours numeric(6, 1) check (hands_on_hours between 0 and 1000),
  start_on       date,
  due_on         date,
  done_at        timestamptz,
  done_by        uuid,
  done_how       text check (done_how in ('auto', 'manual', 'portal')),
  depends_on     text[] not null default '{}',
  delay_reason   text not null default '' check (length(delay_reason) <= 500),
  fix            text check (fix ~ '^/[^\s]{0,300}$'),
  guide          text check (guide ~ '^[a-z0-9-]{2,60}(#[a-z0-9-]{1,60})?$'),
  -- A short form: customer field keys the step asks for; answers are written to the customer.
  form           text[] not null default '{}',
  -- The step takes a file (kept in files, onboarding_step_id); optional steps count half towards completion.
  upload         boolean not null default false,
  required       boolean not null default true,
  -- Product work this step waits for (a story; the request itself is a request_links row).
  task_id        uuid,
  site_id        uuid,
  nudged_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, id),
  unique (plan_id, key),
  foreign key (org_id, plan_id) references onboarding_plans (org_id, id) on delete cascade,
  foreign key (org_id, owner_id) references users (org_id, id) on delete set null (owner_id),
  foreign key (org_id, done_by) references users (org_id, id) on delete set null (done_by),
  foreign key (org_id, person_id) references onboarding_people (org_id, id) on delete set null (person_id),
  foreign key (org_id, task_id) references tasks (org_id, id) on delete set null (task_id),
  foreign key (org_id, site_id) references onboarding_sites (org_id, id) on delete cascade
);
create index onboarding_steps_plan_idx on onboarding_steps (plan_id, position);
create index onboarding_steps_signal_idx on onboarding_steps (org_id) where signal is not null and status not in ('done', 'skipped');

create table onboarding_goals (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  plan_id    uuid not null,
  title_key  text,
  title      text check (length(title) <= 200),
  priority   text not null default 'must' check (priority in ('must', 'should', 'nice')),
  status     text not null default 'planned' check (status in ('planned', 'doing', 'done', 'dropped')),
  target_on  date,
  done_on    date,
  proof_url  text check (proof_url ~ '^https?://' and length(proof_url) <= 500),
  position   int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, plan_id) references onboarding_plans (org_id, id) on delete cascade
);
create index onboarding_goals_plan_idx on onboarding_goals (plan_id);

create table onboarding_issues (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  plan_id     uuid not null,
  step_id     uuid,
  title       text not null check (length(title) between 1 and 200),
  body        text not null default '' check (length(body) <= 4000),
  -- Who has to move next.
  side        text not null default 'vendor' check (side in ('vendor', 'customer')),
  type        text not null default 'question' check (type in ('question', 'bug', 'data', 'access', 'request')),
  urgency     text not null default 'normal' check (urgency in ('low', 'normal', 'high', 'urgent')),
  status      text not null default 'open' check (status in ('open', 'waiting', 'resolved')),
  opened_on   date not null default current_date,
  due_on      date,
  resolved_at timestamptz,
  -- The support ticket this issue is (a records row of the ticket kind); its status wins.
  record_id   uuid,
  portal_author_id uuid,
  -- Where it came from: a person, the portal, or a failed setup test / check (source_ref = its id).
  -- A failed test is one row, resolved when the test passes again (lib/onboardingSetup.ts).
  source      text not null default 'manual' check (source in ('manual', 'portal', 'setup_test', 'setup_check')),
  source_ref  text check (source_ref ~ '^[a-z][a-zA-Z0-9_.-]{0,60}$'),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, plan_id) references onboarding_plans (org_id, id) on delete cascade,
  foreign key (org_id, step_id) references onboarding_steps (org_id, id) on delete set null (step_id),
  foreign key (org_id, record_id) references records (org_id, id) on delete set null (record_id),
  foreign key (org_id, portal_author_id) references portal_users (org_id, id) on delete set null (portal_author_id),
  foreign key (org_id, created_by) references users (org_id, id) on delete set null (created_by)
);
create index onboarding_issues_plan_idx on onboarding_issues (plan_id);
create index onboarding_issues_record_idx on onboarding_issues (org_id, record_id) where record_id is not null;
create unique index onboarding_issues_source_idx on onboarding_issues (plan_id, source, source_ref) where source_ref is not null;

create table onboarding_fields (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  plan_id     uuid not null,
  -- Where the field comes from: an import's column, a connected tool's mapping, a step's form, or written here.
  source      text not null check (source in ('import', 'sync', 'form', 'custom')),
  name        text not null check (length(name) between 1 and 120),
  target      text not null default '' check (length(target) <= 120),
  example     text not null default '' check (length(example) <= 300),
  type        text not null default 'text' check (type in ('text', 'number', 'money', 'date', 'choice', 'email', 'url', 'person', 'other')),
  required    boolean not null default false,
  proof_url   text check (proof_url ~ '^https?://' and length(proof_url) <= 500),
  -- Curahold read it without a problem (from the import or the sync).
  auto_ok     boolean,
  -- What arrived for it last (expected is `type` + `example`); the rules run on it (shared/src/onboarding.ts, checkField).
  received    text check (length(received) <= 300),
  received_at timestamptz,
  failing_since date,
  fixed_at    timestamptz,
  checked_at  timestamptz,
  checked_by  text check (length(checked_by) <= 120),
  verified_at timestamptz,
  verified_by uuid,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  unique (org_id, id),
  unique (plan_id, source, name),
  foreign key (org_id, plan_id) references onboarding_plans (org_id, id) on delete cascade,
  foreign key (org_id, verified_by) references users (org_id, id) on delete set null (verified_by)
);

create table onboarding_metrics (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  plan_id    uuid not null,
  title_key  text,
  title      text check (length(title) <= 120),
  unit       text not null default '' check (length(unit) <= 20),
  baseline   numeric,
  current    numeric,
  target     numeric,
  better     text not null default 'up' check (better in ('up', 'down')),
  position   int not null default 0,
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, plan_id) references onboarding_plans (org_id, id) on delete cascade
);

-- A step that waits for product work is one more customer request on the story (b14's demand counts it);
-- the hand-over to Customer Success when onboarding is done is one more hand-over card.
alter table request_links drop constraint request_links_source_check;
alter table request_links add constraint request_links_source_check check (source in ('account', 'ticket', 'meeting', 'portal', 'task', 'onboarding'));
alter table handovers drop constraint handovers_source_kind_check;
alter table handovers add constraint handovers_source_kind_check check (source_kind in ('record', 'task', 'onboarding'));

-- A step's files are files like any other (one owner: a task, a record, or an onboarding step).
alter table files add column onboarding_step_id uuid;
alter table files add constraint files_onboarding_step_fk foreign key (org_id, onboarding_step_id) references onboarding_steps (org_id, id) on delete cascade;
alter table files drop constraint files_owner_check;
alter table files add constraint files_owner_check check (num_nonnulls(task_id, record_id, onboarding_step_id) = 1);
create index files_onboarding_step_idx on files (onboarding_step_id) where onboarding_step_id is not null;

-- ------------------------------------------------------------------ helpers

-- Whether this person may see a plan: anyone in the company for its own (self) plan;
-- for a customer's plan, whoever may see that customer.
create function app_sees_plan(p_plan uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from onboarding_plans p where p.id = p_plan and p.org_id = app_org()
                  and (p.account_id is null or app_sees_account(p.account_id)))
$$;

alter policy files_select on files using (
  org_id = app_org() and coalesce((select true from tasks t where t.id = files.task_id), (select true from records r where r.id = files.record_id),
                                  (select app_sees_plan(s.plan_id) from onboarding_steps s where s.id = files.onboarding_step_id), false));
alter policy files_insert on files with check (
  org_id = app_org() and app_can_write()
  and coalesce((select true from tasks t where t.id = files.task_id), (select true from records r where r.id = files.record_id),
               (select app_sees_plan(s.plan_id) from onboarding_steps s where s.id = files.onboarding_step_id), false));

-- Templates are kept by account managers and the leads of Onboarding or Customer Success.
create function app_keeps_onboarding_templates() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app_has_perm('accounts.manage') or exists (
    select 1 from departments d where d.org_id = app_org() and d.key in ('onboarding', 'success') and app_leads_department(d.id))
$$;

-- ------------------------------------------------------------------ the portal

-- The customer's plans, as they may see them: no internal note, no owner's
-- e-mail, only plans the company left visible. Wording keys are passed through
-- (the portal says them in the person's language).
create function portal_onboarding() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me record;
begin
  select * into me from portal_whoami();
  if me.user_id is null then return null; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'status', p.status, 'welcome', p.welcome,
      'startedOn', p.started_on, 'targetOn', p.target_on, 'doneAt', p.done_at, 'account', (select a.name from accounts a where a.id = p.account_id),
      'owner', (select u.name from users u where u.id = p.owner_id and u.org_id = p.org_id),
      'steps', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', s.id, 'key', s.key, 'titleKey', s.title_key, 'title', s.title, 'body', s.body, 'phase', s.phase,
          'side', s.side, 'status', s.status, 'signal', s.signal, 'dueOn', s.due_on, 'doneAt', s.done_at,
          'dependsOn', s.depends_on, 'form', s.form, 'position', s.position, 'required', s.required, 'upload', s.upload,
          'doneHow', s.done_how, 'startOn', s.start_on, 'updatedAt', s.updated_at,
          'person', (select x.name from onboarding_people x where x.id = s.person_id)) order by s.position), '[]'::jsonb)
        from onboarding_steps s where s.plan_id = p.id),
      'goals', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'titleKey', g.title_key, 'title', g.title, 'priority', g.priority,
          'status', g.status, 'targetOn', g.target_on, 'doneOn', g.done_on) order by g.position), '[]'::jsonb)
        from onboarding_goals g where g.plan_id = p.id),
      'people', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'side', x.side, 'name', x.name, 'role', x.role, 'duty', x.duty,
          'contact', case when x.side = 'vendor' then x.contact else '' end, 'me', x.portal_user_id = me.user_id) order by x.side desc, x.position), '[]'::jsonb)
        from onboarding_people x where x.plan_id = p.id),
      'issues', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'side', i.side, 'type', i.type, 'urgency', i.urgency,
          'status', i.status, 'openedOn', i.opened_on, 'dueOn', i.due_on, 'resolvedAt', i.resolved_at) order by i.status, i.opened_on desc), '[]'::jsonb)
        from onboarding_issues i where i.plan_id = p.id),
      'fields', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'source', f.source, 'name', f.name, 'example', f.example, 'type', f.type,
          'required', f.required, 'autoOk', f.auto_ok, 'received', f.received, 'fixedAt', f.fixed_at,
          'checkedAt', f.checked_at, 'verifiedAt', f.verified_at) order by f.position, f.name), '[]'::jsonb)
        from onboarding_fields f where f.plan_id = p.id),
      'sites', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'region', x.region, 'stages', x.stages) order by x.position), '[]'::jsonb)
        from onboarding_sites x where x.plan_id = p.id),
      'metrics', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'titleKey', m.title_key, 'title', m.title, 'unit', m.unit,
          'baseline', m.baseline, 'current', m.current, 'target', m.target, 'better', m.better) order by m.position), '[]'::jsonb)
        from onboarding_metrics m where m.plan_id = p.id),
      'formFields', (select coalesce(jsonb_agg(jsonb_build_object('key', d->>'key', 'label', d->'label', 'type', d->>'type')), '[]'::jsonb)
        from orgs o, jsonb_array_elements(o.account_fields) d
        where o.id = p.org_id and d->>'key' in (select unnest(s.form) from onboarding_steps s where s.plan_id = p.id)),
      'fieldValues', (select coalesce(jsonb_object_agg(k, a.fields->k), '{}'::jsonb)
        from accounts a, unnest((select array_agg(distinct f) from onboarding_steps s, unnest(s.form) f where s.plan_id = p.id)) k
        where a.id = p.account_id))
    order by p.started_on desc)
    from onboarding_plans p
   where p.org_id = me.org_id and p.account_id = me.account_id and p.kind = 'client'
     and p.portal_visible and p.status in ('active', 'paused', 'done')), '[]'::jsonb);
end $$;

-- What the customer may do from the portal, on their own plan only:
--   'tick'   — a manual step on their side is done;
--   'check'  — a mapping row looks right to them;
--   'issue'  — raise an issue (title, urgency); it lands with the vendor side;
--   'answer' — a step's form: customer fields named by the step, then the step is done.
create function portal_onboarding_act(p_kind text, p_id uuid, p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare me record; v_plan uuid; v_step record; v_keys text[]; v_id uuid;
begin
  select * into me from portal_whoami();
  if me.user_id is null then raise exception 'portal_signed_out'; end if;
  if p_kind = 'issue' then
    select p.id into v_plan from onboarding_plans p where p.id = p_id and p.org_id = me.org_id and p.account_id = me.account_id and p.portal_visible and p.status in ('active', 'paused');
    if v_plan is null or length(trim(coalesce(p_data->>'title', ''))) = 0 then raise exception 'portal_not_found'; end if;
    insert into onboarding_issues (org_id, plan_id, title, body, side, type, urgency, portal_author_id, source)
    values (me.org_id, v_plan, left(trim(p_data->>'title'), 200), left(coalesce(p_data->>'body', ''), 4000), 'vendor',
            case when p_data->>'type' in ('question', 'bug', 'data', 'access', 'request') then p_data->>'type' else 'question' end,
            case when p_data->>'urgency' in ('low', 'normal', 'high', 'urgent') then p_data->>'urgency' else 'normal' end, me.user_id, 'portal')
    returning id into v_id;
    return jsonb_build_object('id', v_id);
  end if;
  if p_kind = 'check' then
    update onboarding_fields f set checked_at = now(), checked_by = me.name
      from onboarding_plans p where f.id = p_id and p.id = f.plan_id and p.org_id = me.org_id and p.account_id = me.account_id and p.portal_visible
    returning f.id into v_id;
    if v_id is null then raise exception 'portal_not_found'; end if;
    return jsonb_build_object('id', v_id);
  end if;
  select s.* into v_step from onboarding_steps s join onboarding_plans p on p.id = s.plan_id
   where s.id = p_id and p.org_id = me.org_id and p.account_id = me.account_id and p.portal_visible and p.status in ('active', 'paused')
     and s.side in ('customer', 'both') and s.status not in ('done', 'skipped');
  if v_step.id is null then raise exception 'portal_not_found'; end if;
  if p_kind = 'answer' then
    -- Only the fields the step names, as text of at most 500 characters each.
    select array_agg(k) into v_keys from jsonb_object_keys(coalesce(p_data, '{}'::jsonb)) k where k = any (v_step.form);
    if v_keys is null then raise exception 'portal_not_found'; end if;
    update accounts a set fields = a.fields || (select jsonb_object_agg(k, left(p_data->>k, 500)) from unnest(v_keys) k), updated_at = now()
     where a.id = me.account_id and a.org_id = me.org_id;
  elsif p_kind = 'tick' then
    if v_step.signal is not null or array_length(v_step.form, 1) > 0 then raise exception 'portal_not_found'; end if;
  else
    raise exception 'portal_not_found';
  end if;
  -- A step waiting for another one cannot be ticked yet.
  if exists (select 1 from onboarding_steps d where d.plan_id = v_step.plan_id and d.key = any (v_step.depends_on) and d.status not in ('done', 'skipped')) then
    raise exception 'portal_not_found';
  end if;
  update onboarding_steps set status = 'done', done_at = now(), done_how = 'portal', updated_at = now() where id = v_step.id;
  return jsonb_build_object('id', v_step.id);
end $$;

revoke execute on function portal_onboarding(), portal_onboarding_act(text, uuid, jsonb) from public, curahold_app;
grant execute on function portal_onboarding() to curahold_portal;
grant execute on function portal_onboarding_act(text, uuid, jsonb) to curahold_portal;

-- ---------------------------------------------------------------------- RLS

alter table onboarding_templates enable row level security;
alter table onboarding_plans enable row level security;
alter table onboarding_people enable row level security;
alter table onboarding_sites enable row level security;
alter table onboarding_steps enable row level security;
alter table onboarding_goals enable row level security;
alter table onboarding_issues enable row level security;
alter table onboarding_fields enable row level security;
alter table onboarding_metrics enable row level security;

create policy onboarding_templates_select on onboarding_templates for select using (org_id = app_org());
create policy onboarding_templates_write on onboarding_templates for all
  using (org_id = app_org() and (select app_can_write()) and (select app_keeps_onboarding_templates()))
  with check (org_id = app_org() and (select app_can_write()) and (select app_keeps_onboarding_templates()));

create policy onboarding_plans_select on onboarding_plans for select
  using (org_id = app_org() and (account_id is null or app_sees_account(account_id)));
-- The company's own plan: its administrators change it; a customer's plan: whoever may see and write to that customer.
create policy onboarding_plans_write on onboarding_plans for all
  using (org_id = app_org() and (select app_can_write())
         and ((account_id is null and (select app_has_perm('org.manage'))) or (account_id is not null and app_sees_account(account_id))))
  with check (org_id = app_org() and (select app_can_write())
         and ((account_id is null and (select app_has_perm('org.manage'))) or (account_id is not null and app_sees_account(account_id))));

-- Everything inside a plan follows the plan. On the company's own plan anyone with a full seat
-- may tick a step or raise an issue (the people doing the setup are rarely all administrators).
create policy onboarding_people_select on onboarding_people for select using (org_id = app_org() and app_sees_plan(plan_id));
create policy onboarding_people_write on onboarding_people for all
  using (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id))
  with check (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id));
create policy onboarding_sites_select on onboarding_sites for select using (org_id = app_org() and app_sees_plan(plan_id));
create policy onboarding_sites_write on onboarding_sites for all
  using (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id))
  with check (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id));
create policy onboarding_steps_select on onboarding_steps for select using (org_id = app_org() and app_sees_plan(plan_id));
create policy onboarding_steps_write on onboarding_steps for all
  using (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id))
  with check (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id));
create policy onboarding_goals_select on onboarding_goals for select using (org_id = app_org() and app_sees_plan(plan_id));
create policy onboarding_goals_write on onboarding_goals for all
  using (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id))
  with check (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id));
create policy onboarding_issues_select on onboarding_issues for select using (org_id = app_org() and app_sees_plan(plan_id));
create policy onboarding_issues_write on onboarding_issues for all
  using (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id))
  with check (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id));
create policy onboarding_fields_select on onboarding_fields for select using (org_id = app_org() and app_sees_plan(plan_id));
create policy onboarding_fields_write on onboarding_fields for all
  using (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id))
  with check (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id));
create policy onboarding_metrics_select on onboarding_metrics for select using (org_id = app_org() and app_sees_plan(plan_id));
create policy onboarding_metrics_write on onboarding_metrics for all
  using (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id))
  with check (org_id = app_org() and (select app_can_write()) and app_sees_plan(plan_id));

grant select, insert, update, delete on onboarding_templates, onboarding_plans, onboarding_people, onboarding_sites,
  onboarding_steps, onboarding_goals, onboarding_issues, onboarding_fields, onboarding_metrics to curahold_app;
