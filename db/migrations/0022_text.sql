-- Text the way people type and read it.
--
-- fold_text: what search and name matching compare. Case and marks are dropped, and the four Turkish
-- i's (İ, I, ı, i) are one letter: "Işık", "IŞIK" and "isik" are the same text, so "isik" finds
-- "Işık" and "istanbul" finds "İstanbul". (Plain lower() and ILIKE treat them as different letters.)
--
-- sort_tr: the order of a Turkish dictionary (… c ç d … g ğ h ı i j … o ö p … s ş t u ü v …), as a
-- text whose plain byte order is that order: each of the 32 letters becomes the letter in the same
-- place of another alphabet whose letters are stored in order.
--
-- Lists are ordered for whoever reads them: the Turkish way for someone reading in Turkish, and with
-- marked letters beside their plain letter for everyone else. The reader's language is app.locale,
-- which the API sets at the start of each request.
--
-- The same table of letters is in shared/src/text.ts (foldText); tests/text.test.ts keeps the two
-- in step.
create function fold_text(s text) returns text
language sql immutable parallel safe as $$
  select lower(translate(s,
    'ÁÀÂÄÃÅáàâäãåÉÈÊËĚéèêëěÍÌÎÏíìîïÓÒÔÕØóòôõøÚÙÛŮúùûůÝŸýÿÑŃŇñńňĆČćčŚŠśšßŹŻŽźżžŁłĐđĎďŘřŤťİIıÇçĞğÖöŞşÜü',
    'aaaaaaaaaaaaeeeeeeeeeeiiiiiiiioooooooooouuuuuuuuyyyynnnnnnccccssssszzzzzzllddddrrttiiiccggoossuu'))
$$;

create function sort_tr(s text) returns text
language sql immutable parallel safe as $$
  select translate(lower(translate(s,
      'İIÇĞÖŞÜÁÀÂÄÃÅáàâäãåÉÈÊËĚéèêëěÍÌÎÏíìîïÓÒÔÕØóòôõøÚÙÛŮúùûůÝŸýÿÑŃŇñńňĆČćčŚŠśšßŹŻŽźżžŁłĐđĎďŘřŤť',
      'iıçğöşüaaaaaaaaaaaaeeeeeeeeeeiiiiiiiioooooooooouuuuuuuuyyyynnnnnnccccssssszzzzzzllddddrrtt')),
      'abcçdefgğhıijklmnoöpqrsştuüvwxyz',
      'абвгдежзийклмнопрстуфхцчшщъыьэюя')
$$;

-- Folding a name letter by letter is slow work to repeat on every row of every search. The big
-- tables keep the folded text beside the name (the database fills and refreshes it by itself), in
-- plain byte order ("C"), so searching and ordering read ready-made values.
alter table accounts add column name_fold text collate "C" generated always as (fold_text(name)) stored,
                     add column name_tr text collate "C" generated always as (sort_tr(name)) stored;
alter table records add column name_fold text collate "C" generated always as (fold_text(name)) stored,
                    add column name_tr text collate "C" generated always as (sort_tr(name)) stored;
alter table tasks add column title_fold text collate "C" generated always as (fold_text(title)) stored;

-- The order of a list of customers or records, for whoever is reading: order by sort_key(name_fold, name_tr).
create function sort_key(fold text, tr text) returns text
language sql stable parallel safe as $$
  select case when current_setting('app.locale', true) = 'tr' then tr else fold end
$$;

-- The same for short lists (people, boards, teams…), worked out on the spot. Bytes, so the server's own
-- collation has no say.
create function sort_text(s text) returns bytea
language sql stable parallel safe as $$
  select convert_to(case when current_setting('app.locale', true) = 'tr' then sort_tr(s) else fold_text(s) end, 'UTF8')
$$;

grant execute on function fold_text(text), sort_tr(text), sort_key(text, text), sort_text(text) to curahold_app;

-- Search finds rows by their folded text (see 0017 for why these functions exist). The patterns arrive
-- already folded: the caller writes app_find_tasks(fold_text($1), fold_text($2), n), so the folding is
-- done once, where the database can see the words it is looking for.
create or replace function app_find_accounts(p_like text, p_prefix text, p_limit int) returns setof uuid
language sql stable security definer set search_path = public as $$
  select a.id from accounts a
   where a.org_id = app_org() and a.archived_at is null and a.name_fold like p_like
     and ((select app_has_perm('accounts.view_all'))
          or a.owner_id = (select app_user())
          or ((select app_has_perm('accounts.view_team')) and (a.team_id in (select app_my_teams()) or a.owner_id in (select app_my_people()))))
   order by (a.name_fold like p_prefix) desc, sort_key(a.name_fold, a.name_tr) limit p_limit
$$;

create or replace function app_find_tasks(p_like text, p_prefix text, p_limit int) returns setof uuid
language sql stable security definer set search_path = public as $$
  select t.id from tasks t
   where t.org_id = app_org() and t.archived_at is null and t.title_fold like p_like
     and t.board_id in (select app_visible_boards())
   order by (t.title_fold like p_prefix) desc, t.updated_at desc limit p_limit
$$;

create or replace function app_find_records(p_like text, p_prefix text, p_limit int) returns setof uuid
language sql stable security definer set search_path = public as $$
  select r.id from records r
   where r.org_id = app_org() and r.archived_at is null and r.name_fold like p_like
     and ((r.account_id is null and ((select app_has_perm('accounts.view_all')) or r.owner_id = (select app_user()) or r.created_by = (select app_user())))
          or exists (select 1 from accounts a
                      where a.id = r.account_id and a.org_id = app_org()
                        and ((select app_has_perm('accounts.view_all'))
                        or a.owner_id = (select app_user())
                        or ((select app_has_perm('accounts.view_team')) and (a.team_id in (select app_my_teams()) or a.owner_id in (select app_my_people()))))))
   order by (r.name_fold like p_prefix) desc, sort_key(r.name_fold, r.name_tr) limit p_limit
$$;

-- Names are matched and looked up by their folded text now.
drop index accounts_name_idx;
create index accounts_name_idx on accounts (org_id, name_fold);
drop index records_type_idx;
create index records_type_idx on records (org_id, type_id, name_fold);

-- "Contains" searches read a trigram index of the folded text where the server has trigrams.
do $$
begin
  drop index if exists tasks_title_trgm;
  drop index if exists accounts_name_trgm;
  drop index if exists records_name_trgm;
  create index tasks_title_trgm on tasks using gin (title_fold gin_trgm_ops);
  create index accounts_name_trgm on accounts using gin (name_fold gin_trgm_ops);
  create index records_name_trgm on records using gin (name_fold gin_trgm_ops);
exception when others then
  raise notice 'pg_trgm is not available here; search reads the tables instead';
end $$;
