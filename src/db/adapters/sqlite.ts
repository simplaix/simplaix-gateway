import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { resolve } from 'node:path';
import * as sqliteSchema from '../schema.sqlite.js';
import * as pgSchema from '../schema.js';
import type { Database } from '../index.js';

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

const SCHEMA_SQL = /* sql */ `
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  upstream_url TEXT NOT NULL,
  upstream_secret TEXT,
  runtime_token_hash TEXT,
  runtime_token_prefix TEXT,
  is_active INTEGER DEFAULT 1 NOT NULL,
  require_confirmation INTEGER DEFAULT 0,
  required_credentials TEXT,
  tenant_id TEXT,
  owner_user_id TEXT,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL,
  scopes TEXT,
  created_by TEXT NOT NULL,
  tenant_id TEXT,
  is_active INTEGER DEFAULT 1 NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  last_used_at INTEGER
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  tenant_id TEXT,
  agent_id TEXT,
  end_user_id TEXT,
  provider_id TEXT,
  tool_name TEXT NOT NULL,
  arguments TEXT,
  result TEXT,
  confirmation_id TEXT,
  confirmed_by TEXT,
  status TEXT NOT NULL,
  duration INTEGER,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE TABLE IF NOT EXISTS confirmations (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tenant_id TEXT,
  tool_name TEXT NOT NULL,
  arguments TEXT,
  risk TEXT NOT NULL,
  status TEXT NOT NULL,
  confirmed_by TEXT,
  reason TEXT,
  provider_id TEXT,
  agent_id TEXT,
  end_user_id TEXT,
  rule_id TEXT,
  confirmation_token TEXT,
  token_expires_at INTEGER,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE TABLE IF NOT EXISTS credential_providers (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT,
  service_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  auth_type TEXT NOT NULL,
  config TEXT,
  is_active INTEGER DEFAULT 1 NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS device_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  tenant_id TEXT,
  platform TEXT NOT NULL,
  push_token TEXT NOT NULL,
  device_name TEXT,
  is_active INTEGER DEFAULT 1 NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS provider_access_rules (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  action TEXT NOT NULL,
  tool_pattern TEXT DEFAULT '*',
  confirmation_mode TEXT,
  risk_level TEXT,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS tool_providers (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT,
  name TEXT NOT NULL,
  pattern TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  auth_type TEXT DEFAULT 'none',
  auth_secret TEXT,
  is_active INTEGER DEFAULT 1 NOT NULL,
  priority INTEGER DEFAULT 0,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS user_credentials (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  credentials TEXT NOT NULL,
  scopes TEXT,
  expires_at INTEGER,
  refresh_token TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  tenant_id TEXT,
  is_active INTEGER DEFAULT 1 NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);
`;

export function createSQLiteDatabase(filePath: string): Database {
  patchPgColumnsForSQLite();

  const stripped = filePath.startsWith('file:') ? filePath.slice(5) : filePath;
  const resolvedPath = resolve(stripped);
  sqliteClient = new BetterSqlite3(resolvedPath);
  sqliteClient.pragma('journal_mode = WAL');

  wrapClientForSQLite(sqliteClient);

  sqliteClient.exec(SCHEMA_SQL);
  console.log('[DB] SQLite schema ready');

  const db = drizzle(sqliteClient, { schema: sqliteSchema });
  console.log('[DB] Connected to SQLite:', resolvedPath);
  return db as unknown as Database;
}

export function closeSQLiteDatabase(): void {
  if (sqliteClient) {
    sqliteClient.close();
    sqliteClient = null;
  }
}
