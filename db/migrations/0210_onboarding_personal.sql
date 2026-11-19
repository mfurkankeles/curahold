-- A customer's plan, made their own; and files from the portal on a plan's steps.
--
-- Phases: a plan may rename, reorder, add or remove its phases without touching
-- its template (onboarding_plans.phases: [{"key", "name"}] in order; empty = the
-- built-in phases the steps use, in the built-in order). A step's phase is then
-- any short key, not only the six built-in ones.
--
-- Portal files: the customer may put a file on a step of their own plan (side
-- customer or both, or a step that asks for one), like a file on a request they
-- opened (0082). The portal reads a step's files, and opens one through
-- portal_file. Size, type and the company's quota are checked before (api/src/portal.ts).
-- Undo: db/rollback/0210_onboarding_personal.sql.

alter table onboarding_steps drop constraint onboarding_steps_phase_check;
alter table onboarding_steps add constraint onboarding_steps_phase_check check (phase ~ '^[a-z][a-z0-9_-]{0,40}$');
alter table onboarding_plans add column phases jsonb not null default '[]'::jsonb check (jsonb_typeof(phases) = 'array');

create or replace function portal_onboarding() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare me record;
begin
  select * into me from portal_whoami();
  if me.user_id is null then return null; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'status', p.status, 'welcome', p.welcome, 'phases', p.phases,
      'startedOn', p.started_on, 'targetOn', p.target_on, 'doneAt', p.done_at, 'account', (select a.name from accounts a where a.id = p.account_id),
      'owner', (select u.name from users u where u.id = p.owner_id and u.org_id = p.org_id),
      'steps', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', s.id, 'key', s.key, 'titleKey', s.title_key, 'title', s.title, 'body', s.body, 'phase', s.phase,
          'side', s.side, 'status', s.status, 'signal', s.signal, 'dueOn', s.due_on, 'doneAt', s.done_at,
          'dependsOn', s.depends_on, 'form', s.form, 'position', s.position, 'required', s.required, 'upload', s.upload,
          'doneHow', s.done_how, 'startOn', s.start_on, 'updatedAt', s.updated_at,
          'person', (select x.name from onboarding_people x where x.id = s.person_id),
          'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'size', f.size, 'mine', f.portal_author_id = me.user_id) order by f.created_at), '[]'::jsonb)
            from files f where f.onboarding_step_id = s.id and f.org_id = p.org_id)) order by s.position), '[]'::jsonb)
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

-- A file on one of the customer's own steps, by a portal person. Limited per person per day.
create function portal_onboarding_add_file(p_step uuid, p_name text, p_size int, p_mime text, p_key text) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare me record; v_step uuid; v_id uuid; n int;
begin
  select * into me from portal_whoami();
  if me.user_id is null then raise exception 'portal_signed_out'; end if;
  select s.id into v_step from onboarding_steps s join onboarding_plans p on p.id = s.plan_id
   where s.id = p_step and p.org_id = me.org_id and p.account_id = me.account_id and p.kind = 'client' and p.portal_visible
     and p.status in ('active', 'paused') and (s.side in ('customer', 'both') or s.upload);
  if v_step is null then raise exception 'portal_not_found'; end if;
  select count(*) into n from files where org_id = me.org_id and portal_author_id = me.user_id and created_at > now() - interval '1 day';
  if n >= 60 then raise exception 'portal_rate'; end if;
  insert into files (org_id, onboarding_step_id, name, size, mime, storage_key, portal_author_id)
  values (me.org_id, v_step, left(p_name, 200), p_size, p_mime, p_key, me.user_id)
  returning files.id into v_id;
  update onboarding_steps s set updated_at = now() where s.id = v_step;
  return v_id;
end $$;

-- A file the portal may open: on a request it sees (0082), or on a step of its own visible plan.
create or replace function portal_file(p_file uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare me record; f files; t tasks;
begin
  select * into me from portal_whoami();
  if me.user_id is null then raise exception 'portal_signed_out'; end if;
  select * into f from files where id = p_file and org_id = me.org_id;
  if f.id is null then raise exception 'portal_not_found'; end if;
  if f.onboarding_step_id is not null then
    if not exists (select 1 from onboarding_steps s join onboarding_plans p on p.id = s.plan_id
                    where s.id = f.onboarding_step_id and p.org_id = me.org_id and p.account_id = me.account_id and p.kind = 'client' and p.portal_visible) then
      raise exception 'portal_not_found';
    end if;
    return jsonb_build_object('name', f.name, 'mime', f.mime, 'key', f.storage_key);
  end if;
  t := portal_visible_task(f.task_id);
  if not portal_file_open(f, t) then raise exception 'portal_not_found'; end if;
  return jsonb_build_object('name', f.name, 'mime', f.mime, 'key', f.storage_key);
end $$;

-- Like every SECURITY DEFINER function, 0200's portal action pins pg_temp last too (tests/rls.test.ts).
alter function portal_onboarding_act(text, uuid, jsonb) set search_path = public, pg_temp;

revoke execute on function portal_onboarding_add_file(uuid, text, int, text, text) from public, curahold_app;
grant execute on function portal_onboarding_add_file(uuid, text, int, text, text) to curahold_portal;
