/**
 * Database connection management (PostgreSQL via Drizzle ORM)
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { getConfig } from '../config.js';
import * as schema from './schema.js';
import { credentialProviders } from './schema.js';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let dbInstance: Database | null = null;
let pgClient: ReturnType<typeof postgres> | null = null;

/**
 * Initialize and return database connection
 */
export function getDatabase(): Database {
  if (dbInstance) {
    return dbInstance;
  }

  const config = getConfig();
  const { database } = config;

  if (!database.postgresUrl) {
    throw new Error('[DB] DATABASE_URL is required. PostgreSQL is the only supported database.');
  }

  pgClient = postgres(database.postgresUrl);
  dbInstance = drizzle(pgClient, { schema });
  console.log('[DB] Connected to PostgreSQL');

  return dbInstance;
}

/**
 * Initialize database (run drizzle-kit migrations externally).
 * Seeds built-in data on first startup.
 */
export async function initializeDatabase() {
  const db = getDatabase();

  // Seed the built-in "gateway_api" credential provider if it doesn't exist
  const existing = await db
    .select({ id: credentialProviders.id })
    .from(credentialProviders)
    .where(eq(credentialProviders.serviceType, 'gateway_api'))
    .limit(1);

  if (existing.length === 0) {
    const id = nanoid();
    const now = new Date();
    const config = JSON.stringify({
      connectUrl: '/auth/connect?service=gateway_api',
      jwt: { headerName: 'Authorization', prefix: 'Bearer ' },
    });

    await db.insert(credentialProviders).values({
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
  if (pgClient) {
    await pgClient.end();
  }
  dbInstance = null;
  pgClient = null;
}
