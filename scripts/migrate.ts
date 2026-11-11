// Applies db/migrations to a real Postgres (Supabase or self-hosted):
//   DATABASE_URL=postgres://... npm run migrate
import { migrate } from '../api/src/db/migrate';
import { loadMigrations } from '../api/src/db/migrations-fs';
import { postgresDb } from '../api/src/db/postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL to the Postgres connection string.');
  process.exit(1);
}
const db = postgresDb(url, { max: 1 });
try {
  const applied = await migrate(db, loadMigrations());
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
} finally {
  await db.close();
}
