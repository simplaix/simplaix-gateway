/**
 * `gateway status` — show DB connection status and config summary.
 */

import { resolve } from 'node:path';
import { loadEnv, ok, fail, defaultSqliteUrl } from '../shared.js';

export async function runStatus(): Promise<void> {
  loadEnv();

  const dbUrl = process.env.DATABASE_URL ?? defaultSqliteUrl();
  const isFile =
    dbUrl.startsWith('file:') || dbUrl.endsWith('.db') || dbUrl.endsWith('.sqlite');
  const dbMode = isFile ? 'sqlite' : 'postgres';
  const dbDisplay = isFile
    ? resolve(dbUrl.replace(/^file:/, ''))
    : dbUrl.replace(/:\/\/[^@]*@/, '://***@');

  console.log('');
  console.log('  Gateway Status');
  console.log('  ──────────────');
  console.log(`  DB mode:    ${dbMode}`);
  console.log(`  DB path:    ${dbDisplay}`);
  console.log(
    `  JWT_SECRET: ${process.env.JWT_SECRET ? '✓ set' : '✗ not set (ephemeral auth only)'}`,
  );
  console.log(
    `  ENC_KEY:    ${process.env.CREDENTIAL_ENCRYPTION_KEY ? '✓ set' : '✗ not set'}`,
  );
  console.log(`  PORT:       ${process.env.PORT ?? '7521'}`);
  console.log('');

  // Try DB connection.
  let userCount = 0;
  try {
    const { getDatabase } = await import('../../db/index.js');
    const { users } = await import('../../db/schema.js');
    const { count } = await import('drizzle-orm');

    const db = getDatabase();
    const result = await (db as any)
      .select({ n: count() })
      .from(users);
    userCount = Number(result[0]?.n ?? 0);

    ok(`Connected — ${userCount} user${userCount !== 1 ? 's' : ''} in database`);
  } catch (err) {
    fail(`Cannot connect to database: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
