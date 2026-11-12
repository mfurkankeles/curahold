-- Live refresh and offline reading need nothing stored: a page asks "has
-- anything I can see changed?" every half minute and reloads only when it
-- has. These indexes make that question a single index probe each.

create index tasks_updated_idx on tasks (org_id, updated_at desc);
create index comments_recent_idx on comments (org_id, created_at desc);
create index records_updated_idx on records (org_id, updated_at desc);
-- The unread number beside the bell.
create index notifications_unread_idx on notifications (org_id, user_id) where read_at is null;
