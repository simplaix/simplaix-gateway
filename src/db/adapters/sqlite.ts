import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as sqliteSchema from '../schema.sqlite.js';
import * as pgSchema from '../schema.js';
import type { Database } from '../index.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the package root relative to this file rather than process.cwd() so
// that migration files are found correctly when the package is installed globally.
//   dev (tsx):  src/db/adapters/ → up 3 levels → project root
//   installed:  dist/db/adapters/ → up 3 levels → package root
const __pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// Symbol used by drizzle-orm to store column objects on table instances.
// The Symbol is globally registered so we can re-derive it at runtime.
const DRIZZLE_COLUMNS = Symbol.for('drizzle:Columns');

/**
 * Patch the PostgreSQL schema column objects for SQLite compatibility.
 *
 * All services import table objects from src/db/schema.ts (PG types). Those
 * column objects use PG-style type mappings that leave booleans as JS true/false
 * and may leave Date objects as-is. better-sqlite3 only accepts numbers, strings,
 * bigints, buffers, and null — it rejects booleans and Date objects.
 *
 * Fix strategy:
 *   WRITE (mapToDriverValue): delegated to the better-sqlite3 prepare() wrapper
 *     below — normalises every bound value right before the driver sees it.
 *   READ  (mapFromDriverValue): patched here for boolean columns only so that
 *     SQLite's 0/1 integers are returned as JS booleans to callers.
 *
 * We access columns via Symbol.for('drizzle:Columns') because that is the
 * actual storage drizzle-orm uses; the legacy ._ property does not carry a
 * 'columns' key in drizzle-orm ^0.45.
 */
function patchPgColumnsForSQLite(): void {
  for (const exported of Object.values(pgSchema)) {
    if (!exported || typeof exported !== 'object') continue;
    const columns = (exported as any)[DRIZZLE_COLUMNS];
    if (!columns || typeof columns !== 'object') continue;

    for (const col of Object.values(columns) as any[]) {
      const sqlType: string =
        typeof col?.getSQLType === 'function' ? col.getSQLType() : '';

      if (sqlType === 'boolean') {
        // Write: PG passes true/false → SQLite needs 0/1.
        col.mapToDriverValue = (v: unknown) => (v ? 1 : 0);
        // Read: SQLite returns 0/1 → callers expect JS boolean.
        col.mapFromDriverValue = (v: unknown) => Boolean(v);
      } else if (sqlType.startsWith('timestamp')) {
        // Write: PG mapToDriverValue returns an ISO string (e.g. "2026-01-01T00:00:00.000Z").
        // Storing that ISO string in a SQLite INTEGER column is technically valid (SQLite
        // keeps it as TEXT), but on read PgTimestamp.mapFromDriverValue appends "+0000"
        // to the already-UTC string, producing an invalid date. Store as integer ms instead.
        col.mapToDriverValue = (v: unknown) => {
          if (v instanceof Date) return v.getTime();
          if (typeof v === 'string') return new Date(v).getTime();
          return v;
        };
        // Read: SQLite returns the integer ms → build a proper Date.
        col.mapFromDriverValue = (v: unknown) => {
          if (typeof v === 'number') return new Date(v);
          if (typeof v === 'string') return new Date(v);
          return v;
        };
      }
    }
  }
}

/**
 * Wrap the better-sqlite3 client's prepare() so that all JavaScript boolean
 * and Date values are normalised to SQLite-compatible primitives before the
 * native driver binds them.
 *
 * boolean → 0 | 1
 * Date    → Unix milliseconds (integer)
 *
 * This is a belt-and-suspenders complement to the mapToDriverValue patches:
 * it operates at the lowest level regardless of which drizzle table objects
 * are used, handling every INSERT/UPDATE/SELECT parameter automatically.
 */
function wrapClientForSQLite(client: InstanceType<typeof BetterSqlite3>): void {
  const normalize = (v: unknown): unknown => {
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v instanceof Date) return v.getTime();
    return v;
  };

  const origPrepare = client.prepare.bind(client);
  (client as any).prepare = (source: string) => {
    const stmt = origPrepare(source);
    for (const method of ['run', 'all', 'get', 'iterate'] as const) {
      const orig = (stmt[method] as (...a: unknown[]) => unknown).bind(stmt);
      (stmt as any)[method] = (...args: unknown[]) => orig(...args.map(normalize));
    }
    return stmt;
  };
}

let sqliteClient: InstanceType<typeof BetterSqlite3> | null = null;

export function createSQLiteDatabase(filePath: string): Database {
  // Patch read-side column mappers for the PG schema objects used by services.
  patchPgColumnsForSQLite();

  const resolvedPath = filePath.startsWith('file:') ? filePath.slice(5) : filePath;
  sqliteClient = new BetterSqlite3(resolvedPath);
  sqliteClient.pragma('journal_mode = WAL');

  // Intercept prepare() to normalise boolean/Date values on every write.
  wrapClientForSQLite(sqliteClient);

  const db = drizzle(sqliteClient, { schema: sqliteSchema });
  // Migration files live inside the package at drizzle/sqlite/.
  // DB file path uses process.cwd() intentionally (creates in user's directory).
  const migrationsFolder = join(__pkgRoot, 'drizzle', 'sqlite');
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
