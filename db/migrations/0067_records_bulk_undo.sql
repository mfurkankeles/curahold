-- Curahold — a change to many records at once can be undone, as one to many
-- tasks or customers can (POST /records/bulk, POST /undo/:id). What the change
-- replaced is kept for 30 minutes, for the person who made it only.

alter table undo_log drop constraint if exists undo_log_kind_check;
alter table undo_log add constraint undo_log_kind_check check (kind in ('tasks', 'accounts', 'records'));
