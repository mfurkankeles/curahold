-- More languages. Curahold spoke English and Turkish; it now also speaks
-- Arabic, Hebrew, Persian, Simplified and Traditional Chinese, Japanese and
-- Korean (see shared/src/i18n). The locale columns were fixed to 'en' and 'tr';
-- widen them. The app validates locale too (normalizeLocale), so a further
-- language later is a code change, not a migration — the database just keeps a
-- guard against a stray value.

-- Drop the old locale checks by whatever Postgres named them.
do $$
declare r record;
begin
  for r in
    select rel.relname as tbl, con.conname as name
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public' and con.contype = 'c'
       and rel.relname in ('orgs', 'users', 'signups', 'portal_users')
       and pg_get_constraintdef(con.oid) ilike '%locale%'
  loop
    execute format('alter table %I drop constraint %I', r.tbl, r.name);
  end loop;
end $$;

alter table orgs         add constraint orgs_locale_check         check (locale in ('en', 'tr', 'ar', 'he', 'fa', 'zh-Hans', 'zh-Hant', 'ja', 'ko'));
alter table users        add constraint users_locale_check        check (locale in ('en', 'tr', 'ar', 'he', 'fa', 'zh-Hans', 'zh-Hant', 'ja', 'ko'));
alter table signups      add constraint signups_locale_check      check (locale in ('en', 'tr', 'ar', 'he', 'fa', 'zh-Hans', 'zh-Hant', 'ja', 'ko'));
alter table portal_users add constraint portal_users_locale_check check (locale in ('en', 'tr', 'ar', 'he', 'fa', 'zh-Hans', 'zh-Hant', 'ja', 'ko'));
