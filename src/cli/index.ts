#!/usr/bin/env node
/**
 * Simplaix Gateway CLI
 *
 * Usage:
 *   gateway init                         scaffold .env with auto-generated secrets
 *   gateway start [--port n] [--db url]  start the gateway server
 *   gateway status                       show DB connection status
 *   gateway admin create --email --password [--name]
 *   gateway admin list
 */

import { Command } from 'commander';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve package.json relative to this file (works whether running via tsx or
// installed as a compiled binary).
const __dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkg = require(join(__dir, '..', '..', 'package.json')) as { version: string };

const program = new Command();

program
  .name('gateway')
  .description('Simplaix Gateway — local-first MCP gateway with identity and audit')
  .version(pkg.version);

// ── init ─────────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Scaffold a .env config file with auto-generated secrets')
  .option('-f, --force', 'overwrite an existing .env file')
  .action(async (opts: { force?: boolean }) => {
    const { runInit } = await import('./commands/init.js');
    await runInit({ force: opts.force });
  });

// ── start ─────────────────────────────────────────────────────────────────────

program
  .command('start')
  .description('Start the gateway server (defaults: SQLite ./gateway.db, port 7521)')
  .option('-p, --port <number>', 'port to listen on')
  .option('--db <url>', 'database URL (overrides DATABASE_URL env / .env)')
  .option('--tunnel', 'start a cloudflared quick tunnel and print the public URL')
  .option('--dashboard', 'start the gateway-app Next.js dashboard + Python agent')
  .option('--dashboard-path <path>', 'path to gateway-app directory (default: ./gateway-app)')
  .action(
    async (opts: {
      port?: string;
      db?: string;
      tunnel?: boolean;
      dashboard?: boolean;
      dashboardPath?: string;
    }) => {
      const { runStart } = await import('./commands/start.js');
      await runStart(opts);
    },
  );

// ── status ────────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show database connection status and config summary')
  .action(async () => {
    const { runStatus } = await import('./commands/status.js');
    await runStatus();
  });

// ── admin ─────────────────────────────────────────────────────────────────────

const admin = program
  .command('admin')
  .description('Manage admin users');

admin
  .command('create')
  .description('Create a new admin user')
  .requiredOption('-e, --email <email>', 'user email address')
  .requiredOption('-p, --password <password>', 'user password')
  .option('-n, --name <name>', 'display name')
  .action(async (opts: { email: string; password: string; name?: string }) => {
    const { runAdminCreate } = await import('./commands/admin.js');
    await runAdminCreate(opts);
  });

admin
  .command('list')
  .description('List all admin users')
  .action(async () => {
    const { runAdminList } = await import('./commands/admin.js');
    await runAdminList();
  });

// ── parse ─────────────────────────────────────────────────────────────────────

await program.parseAsync(process.argv);
