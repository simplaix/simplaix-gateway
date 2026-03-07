import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../schema.js';
import type { Database } from '../index.js';

let pgClient: ReturnType<typeof postgres> | null = null;

export function createPostgresDatabase(url: string): Database {
  pgClient = postgres(url);
  const db = drizzle(pgClient, { schema });
  console.log('[DB] Connected to PostgreSQL');
  return db;
}

export async function closePostgresDatabase(): Promise<void> {
  if (pgClient) {
    await pgClient.end();
    pgClient = null;
  }
}
