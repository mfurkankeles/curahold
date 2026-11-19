-- The AI assistant is off until an administrator turns it on (package l2-privacy, 20 Nov 2026).
--
-- The privacy notice, the KVKK notice and the DPA say questions reach the AI
-- provider "only when the company turns AI on"; the code used to treat a
-- company that never chose as on. settingsOf() (api/src/assistant/core.ts) now
-- counts only an explicit true. A saved settings card also wrote
-- enabled: true when an administrator changed only the limit, so a stored
-- true does not prove a choice: every company is switched off here and its
-- administrators see the notice on the card. The demo company (slug 'demo')
-- stays on, as it is reseeded with the assistant on (scripts/seed-demo.ts).
-- `turnedOffAt` records when this happened, for the activity question
-- "why did AI answers stop?".
update orgs
   set settings = jsonb_set(
         coalesce(settings, '{}'::jsonb),
         '{assistant}',
         coalesce(settings->'assistant', '{}'::jsonb) || jsonb_build_object('enabled', false, 'turnedOffAt', now()))
 where slug <> 'demo'
   and coalesce(settings->'assistant'->>'enabled', '') <> 'false';
