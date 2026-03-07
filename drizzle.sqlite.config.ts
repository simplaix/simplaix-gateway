import 'dotenv/config';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { defineConfig } from 'drizzle-kit';

const defaultSqliteUrl = `file:${join(homedir(), '.simplaix-gateway', 'data', 'gateway.db')}`;

export default defineConfig({
  schema: './src/db/schema.sqlite.ts',
  out: './drizzle/sqlite',
  dialect: 'sqlite',
  dbCredentials: { url: process.env.DATABASE_URL ?? defaultSqliteUrl },
});
