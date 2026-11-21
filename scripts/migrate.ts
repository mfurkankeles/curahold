// Applies db/migrations to a real Postgres (Supabase or self-hosted), as the table owner:
//   MIGRATION_DATABASE_URL=postgres://owner... npm run migrate   (DATABASE_URL is the fallback)
// The application's own login should not be the owner (ADR 0023).
import { migrate } from '../api/src/db/migrate';
import { loadMigrations } from '../api/src/db/migrations-fs';
import { postgresDb } from '../api/src/db/postgres';

const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Set MIGRATION_DATABASE_URL (or DATABASE_URL) to the owner\'s Postgres connection string.');
  process.exit(1);
}
const db = postgresDb(url, { max: 1 });
try {
  const applied = await migrate(db, loadMigrations());
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
} finally {
  await db.close();
}
