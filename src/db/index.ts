/**
 * Database connection management (PostgreSQL or SQLite via Drizzle ORM)
 * Mode is selected automatically from the DATABASE_URL prefix:
 *   postgres://... → PostgreSQL (default)
 *   file:./...    → SQLite (zero-dependency local mode)
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { getConfig } from '../config.js';
import * as schema from './schema.js';
import * as sqliteSchema from './schema.sqlite.js';
import { createPostgresDatabase, closePostgresDatabase } from './adapters/postgres.js';
import { createSQLiteDatabase, closeSQLiteDatabase } from './adapters/sqlite.js';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

type DbMode = 'postgres' | 'sqlite';

let dbInstance: Database | null = null;
let activeMode: DbMode | null = null;

function detectMode(url: string): DbMode {
  if (url.startsWith('file:') || url.endsWith('.db') || url.endsWith('.sqlite')) {
    return 'sqlite';
  }
  return 'postgres';
}

/**
 * Initialize and return database connection.
 * Lazily creates the connection on first call.
 */
export function getDatabase(): Database {
  if (dbInstance) {
    return dbInstance;
  }

  const { database } = getConfig();

  if (!database.postgresUrl) {
    throw new Error(
      '[DB] DATABASE_URL is required. Use postgres://... or file:./gateway.db',
    );
  }

  activeMode = detectMode(database.postgresUrl);

  if (activeMode === 'sqlite') {
    dbInstance = createSQLiteDatabase(database.postgresUrl);
  } else {
    dbInstance = createPostgresDatabase(database.postgresUrl);
  }

  return dbInstance;
}

/**
 * Initialize database and seed built-in data on first startup.
 *
 * Uses the schema that matches the active db mode so that column types
 * (e.g. timestamp_ms for SQLite) are serialized correctly.
 */
export async function initializeDatabase() {
  const db = getDatabase();

  // Select the table object whose column definitions match the active driver.
  // SQLite timestamp columns use integer(timestamp_ms) — passing a Date through
  // the PG column's mapToDriverValue would produce a raw Date that better-sqlite3
  // cannot bind. Using the SQLite schema object avoids that coercion mismatch.
  const cpTable =
    activeMode === 'sqlite' ? sqliteSchema.credentialProviders : schema.credentialProviders;

  // Cast to any so the PG-typed db accepts SQLite table objects (and vice versa).
  // Column names and JS types are identical at runtime; only the driver-level
  // serialization differs, which is why we pick the right table object above.
  const anyDb = db as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  const existing = await anyDb
    .select({ id: cpTable.id })
    .from(cpTable)
    .where(eq(cpTable.serviceType, 'gateway_api'))
    .limit(1);

  if (existing.length === 0) {
    const id = nanoid();
    const now = new Date();
    const config = JSON.stringify({
      connectUrl: '/auth/connect?service=gateway_api',
      jwt: { headerName: 'Authorization', prefix: 'Bearer ' },
    });

    await anyDb.insert(cpTable).values({
      id,
      tenantId: null,
      serviceType: 'gateway_api',
      name: 'Gateway API',
      description: 'Simplaix Gateway authentication',
      authType: 'jwt',
      config,
      isActive: true,
      createdAt: now,
    });

    console.log('[DB] Seeded gateway_api credential provider');
  }

  console.log('[DB] Database initialized');
}

/**
 * Close database connection
 */
export async function closeDatabase() {
  if (activeMode === 'sqlite') {
    closeSQLiteDatabase();
  } else {
    await closePostgresDatabase();
  }
  dbInstance = null;
  activeMode = null;
}
