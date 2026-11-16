-- What a customer reads for a column: what the company wrote for it in the board's portal settings, or,
-- where it wrote nothing, a plain word for the step the request is at (received, in progress, done) that
-- the portal writes in the customer's own language. The board's internal column name ("Waiting on legal",
-- "Triage") is the team's word and is no longer sent to the customer.
-- 'name' is now the company's label or null; 'step' is 'new' (the intake column), 'doing' or 'done'.
create or replace function portal_board_json(b boards) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', b.id,
    'name', b.name,
    'columns', (select coalesce(jsonb_agg(jsonb_build_object(
                  'key', c->>'key',
                  'name', nullif(btrim(b.portal->'labels'->>(c->>'key')), ''),
                  'step', case
                            when coalesce((c->>'done')::boolean, false) then 'done'
                            when c->>'key' = coalesce(nullif(b.portal->>'intake', ''), b.columns->0->>'key') then 'new'
                            else 'doing'
                          end,
                  'done', coalesce((c->>'done')::boolean, false)) order by ord), '[]'::jsonb)
                from jsonb_array_elements(b.columns) with ordinality as x(c, ord)),
    'fields', coalesce(b.portal->'fields', '[]'::jsonb))
$$;
