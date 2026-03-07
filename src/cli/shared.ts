/**
 * Shared CLI utilities: env loading, DB init, and output formatting.
 */

import { config as dotenvConfig } from 'dotenv';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { initializeDatabase } from '../db/index.js';

// ==================== Paths ====================

const DATA_DIR = join(homedir(), '.simplaix-gateway', 'data');

/**
 * Return the default SQLite DATABASE_URL as an absolute `file:` path
 * inside `~/.simplaix-gateway/data/`. The directory is created on demand
 * so the CLI works out-of-the-box regardless of the working directory.
 */
export function defaultSqliteUrl(): string {
  mkdirSync(DATA_DIR, { recursive: true });
  return `file:${join(DATA_DIR, 'gateway.db')}`;
}

// ==================== Environment ====================

/**
 * Load .env from the current working directory and apply defaults.
 * Must be called before any config/DB access.
 */
export function loadEnv(): void {
  dotenvConfig({ path: resolve(process.cwd(), '.env') });

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = defaultSqliteUrl();
  }
  if (!process.env.PORT) {
    process.env.PORT = '7521';
  }
}

// ==================== Database ====================

/**
 * Run migrations (SQLite: automatic; Postgres: must already be migrated)
 * and seed built-in data. Exits the process with an error message on failure.
 */
export async function ensureDb(): Promise<void> {
  try {
    await initializeDatabase();
  } catch (err) {
    fail(`Database initialization failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// ==================== Output ====================

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

export function ok(msg: string): void {
  console.log(`${GREEN}✓${RESET} ${msg}`);
}

export function fail(msg: string): void {
  console.error(`${RED}✗${RESET} ${msg}`);
}

/**
 * Print a simple fixed-width ASCII table to stdout.
 *
 * @param headers - Column header labels
 * @param rows    - Array of string arrays, one per row
 */
export function printTable(headers: string[], rows: string[][]): void {
  const all = [headers, ...rows];
  const widths = headers.map((_, i) =>
    Math.max(...all.map((r) => (r[i] ?? '').length)),
  );

  const divider = widths.map((w) => '─'.repeat(w + 2)).join('┼');
  const fmt = (row: string[]) =>
    row.map((cell, i) => ` ${(cell ?? '').padEnd(widths[i])} `).join('│');

  console.log(fmt(headers));
  console.log(divider);
  for (const row of rows) {
    console.log(fmt(row));
  }
}
