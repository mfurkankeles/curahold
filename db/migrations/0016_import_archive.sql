-- Tasks from a file, and finished work that steps aside by itself.

-- An import of tasks is kept like an import of customers: long enough to be
-- undone. It belongs to whoever ran it, on the board it went to.
alter table import_batches drop constraint import_batches_kind_check;
alter table import_batches add constraint import_batches_kind_check check (kind in ('accounts', 'tasks'));
alter table import_batches add column board_id uuid;
alter table import_batches add foreign key (org_id, board_id) references boards (org_id, id) on delete cascade;

drop policy import_batches_all on import_batches;
create policy import_batches_all on import_batches for all
  using (org_id = app_org() and (
    (kind = 'accounts' and app_has_perm('accounts.manage'))
    or (kind = 'tasks' and created_by = app_user())))
  with check (org_id = app_org() and (
    (kind = 'accounts' and app_has_perm('accounts.manage'))
    or (kind = 'tasks' and created_by = app_user() and app_can_write())));

-- Finished tasks leave the board for its archive after this many days, so a
-- board that has been in use for years still opens at once. Null: never.
alter table boards add column archive_days int default 90 check (archive_days is null or archive_days between 7 and 3650);

-- The archive of a board, newest first; and the nightly sweep.
create index tasks_archived_idx on tasks (org_id, board_id, archived_at desc) where archived_at is not null;
create index tasks_done_open_idx on tasks (done_at) where done_at is not null and archived_at is null;

-- Found by the speed test: a board's cards count their subtasks, and without
-- this each card read every task in the company to do it.
create index tasks_parent_idx on tasks (parent_id) where parent_id is not null;
create index files_task_idx on files (task_id);
