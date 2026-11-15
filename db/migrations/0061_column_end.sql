-- A new card goes to the end of its column: max(position) over every card the
-- board has in that status (archived and subtasks included, as before). The
-- column index 0046 only holds open top-level cards, so on a big board this
-- read a whole table (26 ms of a 37 ms "add a task"). This one answers it from
-- the end of one index range.
create index if not exists tasks_column_end_idx on tasks (board_id, status, position);
