-- Segment event ingestion. Track / identify events are pushed to the company's
-- signed inbound address (/api/inbound/segment/{source}); the receiver verifies
-- the signature, then — with no signed-in person — writes through the definer
-- function below, which only ever touches the request's own company (app_org()),
-- the same way the code-webhook receiver writes through migration 0036.
--
-- An event becomes one timeline activity under the customer matched by the
-- event's email address (a contact record with that address first, then a
-- customer whose web-address field is that domain), and links to that contact
-- when there is one. The activity's (source, external id) are unique
-- (activities_external_idx, migration 0008), so a redelivered event is ignored,
-- not duplicated. No Segment data is stored anywhere else and nothing is written
-- back to Segment: the connection's shared secret (sealed) and its public source
-- id (config) live on the connections row like every other source.

create function segment_ingest(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org     uuid := app_org();
  v_email   text := lower(nullif(p->>'email', ''));
  v_domain  text;
  v_account uuid;
  v_contact uuid;
  v_source  text := left(coalesce(p->>'source', ''), 60);
  v_ext     text := left(coalesce(p->>'messageId', ''), 200);
  v_body    text := left(coalesce(nullif(p->>'summary', ''), ''), 20000);
  v_at      timestamptz := coalesce((p->>'happenedAt')::timestamptz, now());
  v_keys    text[];
  v_n       integer;
begin
  if v_org is null or v_source = '' or v_ext = '' or v_body = '' then
    return jsonb_build_object('matched', false, 'created', false);
  end if;

  -- The customer's web-address fields, for matching an email domain to a customer.
  select array_agg(f->>'key') into v_keys
    from orgs o, lateral jsonb_array_elements(coalesce(o.account_fields, '[]'::jsonb)) f
   where o.id = v_org and f->>'type' = 'url';

  if v_email is not null then
    -- A contact of this company with that exact address: its customer, and the contact to link.
    select r.id, r.account_id into v_contact, v_account
      from records r join record_types rt on rt.id = r.type_id
     where r.org_id = v_org and rt.kind = 'contact' and r.archived_at is null and r.account_id is not null
       and lower(r.fields->>'email') = v_email
     order by r.created_at limit 1;

    -- Otherwise a customer whose web address is the email's domain (public mail providers say nothing about a company).
    if v_account is null then
      v_domain := lower(split_part(v_email, '@', 2));
      if v_domain <> '' and v_keys is not null
         and v_domain !~ '^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|aol|proton|protonmail|yandex|mail|gmx)\.' then
        select a.id into v_account from accounts a
         where a.org_id = v_org and a.archived_at is null
           and exists (select 1 from jsonb_each_text(a.fields) ff where ff.key = any (v_keys)
                        and lower(regexp_replace(regexp_replace(ff.value, '^https?://(www\.)?', '', 'i'), '[/:?#].*$', '')) = v_domain)
         order by a.created_at limit 1;
      end if;
    end if;
  end if;

  if v_account is null then
    return jsonb_build_object('matched', false, 'created', false);
  end if;

  insert into activities (org_id, account_id, author_id, kind, body, happened_at, contact_ids, source, external_id)
  values (v_org, v_account, null, 'note', v_body, v_at,
          case when v_contact is null then '{}'::uuid[] else array[v_contact] end, v_source, v_ext)
  on conflict (org_id, source, external_id) where external_id is not null do nothing;
  get diagnostics v_n = row_count;

  return jsonb_build_object('matched', true, 'created', v_n > 0, 'accountId', v_account);
end
$$;

revoke all on function segment_ingest(jsonb) from public;
grant execute on function segment_ingest(jsonb) to curahold_app;
