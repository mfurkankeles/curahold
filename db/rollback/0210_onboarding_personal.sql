-- Undo 0210_onboarding_personal.sql: plans' own phases, and files from the portal on steps.
-- Not a migration (the runner never reads this folder). Run it by hand, as the
-- owner, in one transaction:  psql "$DATABASE_URL" -1 -f db/rollback/0210_onboarding_personal.sql
-- Steps in a phase of a plan's own go to the built-in 'setup' phase first.
drop function portal_onboarding_add_file(uuid, text, int, text, text);
-- Files the portal put on steps stay (the company's people see them on the step).
-- portal_onboarding() and portal_file() as 0200 and 0082 left them.
create or replace function portal_onboarding() returns jsonb
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

create or replace function portal_file(p_file uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare me record; f files; t tasks;
begin
  select * into me from portal_whoami();
  if me.user_id is null then raise exception 'portal_signed_out'; end if;
  select * into f from files where id = p_file and org_id = me.org_id;
  if f.id is null then raise exception 'portal_not_found'; end if;
  t := portal_visible_task(f.task_id);
  if not portal_file_open(f, t) then raise exception 'portal_not_found'; end if;
  return jsonb_build_object('name', f.name, 'mime', f.mime, 'key', f.storage_key);
end $$;
update onboarding_steps set phase = 'setup' where phase not in ('kickoff', 'setup', 'data', 'test', 'golive', 'adopt');
alter table onboarding_steps drop constraint onboarding_steps_phase_check;
alter table onboarding_steps add constraint onboarding_steps_phase_check check (phase in ('kickoff', 'setup', 'data', 'test', 'golive', 'adopt'));
alter table onboarding_plans drop column phases;
