-- Curahold — the ready-made dashboards arrive filled.
--
-- Until now they waited in a gallery to be added one by one. A company now
-- gets them the first time anyone opens Dashboards: real pages like any other,
-- to change or delete (deleting goes to the trash, so one can be taken back).
-- A page remembers which ready-made dashboard it started as, so the same one
-- is not offered as "not added yet" and is never added twice.

alter table pages add column template text check (length(template) <= 40);
