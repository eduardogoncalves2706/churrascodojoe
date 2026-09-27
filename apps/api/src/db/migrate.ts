import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb } from './client';

export async function runMigrations(migrationsFolder: string) {
  await migrate(getDb(), { migrationsFolder });
}
