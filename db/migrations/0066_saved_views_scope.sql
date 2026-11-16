-- Curahold — saved views on every list, not only on a board.
--
-- A saved view is a name for how a list is shown: its filter, its order, its
-- columns and its layout. Until now it belonged to a board; `scope` says which
-- list it belongs to: 'board' (with board_id), 'accounts' (the customer list),
-- 'records:<kind>' (a records list), 'my_tasks' or 'timeline'. Who sees it is
-- unchanged (row-level security in 0013): its maker, and — when shared — the
-- whole company (for a board: whoever may see that board).

alter table saved_views add column if not exists scope text not null default 'board';
alter table saved_views add constraint saved_views_scope_check
  check (scope ~ '^(board|accounts|my_tasks|timeline|records:[a-z][a-z0-9_]{0,40})$' and (scope = 'board' or board_id is null));
create index if not exists saved_views_scope_idx on saved_views (org_id, scope);
