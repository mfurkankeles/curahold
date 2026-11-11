-- Tendwell — stakeholders: who reports to whom (the org chart), and the
-- stakeholder fields on contacts (first and last name, LinkedIn, decision
-- role, stance towards us).

alter table records add column parent_id uuid;
alter table records add constraint records_parent_fk
  foreign key (org_id, parent_id) references records (org_id, id) on delete set null (parent_id);
create index records_parent_idx on records (org_id, parent_id) where parent_id is not null;

-- Contact types made before this release get the new built-in fields
-- (appended; a field the company already has under the same key is kept).
update record_types t
   set fields = t.fields || coalesce((
         select jsonb_agg(f) from jsonb_array_elements('[{"key": "first_name", "label": {"en": "First name", "tr": "Ad"}, "type": "text"}, {"key": "last_name", "label": {"en": "Last name", "tr": "Soyad"}, "type": "text"}, {"key": "linkedin", "label": {"en": "LinkedIn", "tr": "LinkedIn"}, "type": "url"}, {"key": "decision", "label": {"en": "Decision role", "tr": "Karar düzeyi"}, "type": "select", "options": [{"key": "decision_maker", "label": {"en": "Decision maker", "tr": "Karar verici"}}, {"key": "approver", "label": {"en": "Approver (budget)", "tr": "Onaylayan (bütçe)"}}, {"key": "influencer", "label": {"en": "Influencer", "tr": "Etkileyen"}}, {"key": "evaluator", "label": {"en": "Evaluator", "tr": "Değerlendiren"}}, {"key": "user", "label": {"en": "User", "tr": "Kullanıcı"}}]}, {"key": "stance", "label": {"en": "Stance towards us", "tr": "Bize karşı duruşu"}, "type": "select", "options": [{"key": "champion", "label": {"en": "Champion", "tr": "Güçlü destekçi"}}, {"key": "supporter", "label": {"en": "Supporter", "tr": "Destekçi"}}, {"key": "neutral", "label": {"en": "Neutral", "tr": "Nötr"}}, {"key": "skeptic", "label": {"en": "Skeptic", "tr": "Şüpheci"}}, {"key": "blocker", "label": {"en": "Blocker", "tr": "Engelleyici"}}]}]'::jsonb) f
          where not exists (select 1 from jsonb_array_elements(t.fields) e where e->>'key' = f->>'key')
       ), '[]'::jsonb)
 where t.kind = 'contact';
