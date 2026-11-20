-- Hindi and Malay. Curahold now also speaks Hindi (hi) and Malay (ms) (see
-- shared/src/i18n/core.ts, LOCALE_INFO). The locale checks of 0033 list the
-- nine languages before them, so a company, a person, a sign-up or a portal
-- user in Hindi or Malay was refused by the database (the demo hub could not
-- even seed its company). Widen the same four checks; nothing else changes.
-- The app still validates locale itself (normalizeLocale); this is the guard.

alter table orgs         drop constraint if exists orgs_locale_check;
alter table users        drop constraint if exists users_locale_check;
alter table signups      drop constraint if exists signups_locale_check;
alter table portal_users drop constraint if exists portal_users_locale_check;

alter table orgs         add constraint orgs_locale_check         check (locale in ('en', 'tr', 'ar', 'he', 'fa', 'zh-Hans', 'zh-Hant', 'ja', 'ko', 'hi', 'ms'));
alter table users        add constraint users_locale_check        check (locale in ('en', 'tr', 'ar', 'he', 'fa', 'zh-Hans', 'zh-Hant', 'ja', 'ko', 'hi', 'ms'));
alter table signups      add constraint signups_locale_check      check (locale in ('en', 'tr', 'ar', 'he', 'fa', 'zh-Hans', 'zh-Hant', 'ja', 'ko', 'hi', 'ms'));
alter table portal_users add constraint portal_users_locale_check check (locale in ('en', 'tr', 'ar', 'he', 'fa', 'zh-Hans', 'zh-Hant', 'ja', 'ko', 'hi', 'ms'));
