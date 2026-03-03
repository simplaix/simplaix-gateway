import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as sqliteSchema from '../schema.sqlite.js';
import type { Database } from '../index.js';
import { join } from 'node:path';

let sqliteClient: InstanceType<typeof BetterSqlite3> | null = null;

export function createSQLiteDatabase(filePath: string): Database {
  const resolvedPath = filePath.startsWith('file:') ? filePath.slice(5) : filePath;
  sqliteClient = new BetterSqlite3(resolvedPath);
  sqliteClient.pragma('journal_mode = WAL');
  const db = drizzle(sqliteClient, { schema: sqliteSchema });
  const migrationsFolder = join(process.cwd(), 'drizzle', 'sqlite');
  migrate(db, { migrationsFolder });
  console.log('[DB] SQLite migrations applied');
  console.log('[DB] Connected to SQLite:', resolvedPath);
  // Safe cast: column names and JS types are identical at runtime to the PG schema
  return db as unknown as Database;
}

export function closeSQLiteDatabase(): void {
  if (sqliteClient) {
    sqliteClient.close();
    sqliteClient = null;
  }
}
