-- Curahold — API keys and app tokens can be limited to areas (security audit H1, ADR 0024).
--
-- A token used to carry its person's whole role; only read versus write could be
-- chosen. Administration and identity are now closed to every token in the code
-- (api/src/lib/tokenScope.ts), and a key or an app may also be limited to areas,
-- each read or write: {'work:write','customers:read'}. Null keeps today's reach:
-- every area, with the token's own read or write. Additive; the existing grants and
-- policies of both tables (0007) cover the new column.
alter table api_tokens add column areas text[];
alter table oauth_codes add column areas text[];
alter table api_tokens add constraint api_tokens_areas_check
  check (areas is null or areas <@ array['work:read','work:write','customers:read','customers:write','reports:read','reports:write','people:read','people:write','webhooks:read','webhooks:write']::text[]);
