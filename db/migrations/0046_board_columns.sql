-- A big board is read a window at a time, column by column: the first cards of
-- each open column in board order, a finished column newest first. These two
-- indexes let each column's window start where it should instead of sorting
-- the whole board for every column.
create index if not exists tasks_column_idx on tasks (board_id, status, position, created_at)
  where archived_at is null and parent_id is null;
create index if not exists tasks_column_done_idx on tasks (board_id, status, updated_at desc)
  where archived_at is null and parent_id is null;
