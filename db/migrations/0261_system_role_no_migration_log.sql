-- Curahold — the server's own role may not write the migration log (review nit on 0254).
--
-- 0254 granted curahold_system row rights on every table, schema_migrations
-- included. Only the owner (db.owner(), db/migrate.ts) records migrations; a
-- request path that could insert or delete there could make the next deploy skip
-- or repeat a migration. Reading it stays allowed (health checks show the last one).
revoke insert, update, delete, truncate on schema_migrations from curahold_system;
