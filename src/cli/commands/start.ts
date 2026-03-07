/**
 * `gateway start` — start the Hono server in long-running mode.
 *
 * Flags:
 *   --tunnel           Start a cloudflared quick tunnel; print the public URL.
 *   --dashboard        Start the gateway-app Next.js dashboard + Python agent.
 *   --dashboard-path   Path to gateway-app directory (default: ./gateway-app).
 *
 * Start order when all flags are used:
 *   1. Gateway server (Hono)
 *   2. Cloudflared tunnel → resolves public URL
 *   3. Dashboard UI (Next.js) + Python agent — both receive GATEWAY_URL
 *
 * All child processes are registered for graceful shutdown on SIGINT / SIGTERM.
 */

import { serve } from '@hono/node-server';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, ensureDb, fail } from '../shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface StartOptions {
  port?: string;
  db?: string;
  tunnel?: boolean;
  dashboard?: boolean;
  dashboardPath?: string;
}

// ── Child process registry ────────────────────────────────────────────────────

const cleanupFns: Array<() => void> = [];

function onCleanup(fn: () => void): void {
  cleanupFns.push(fn);
}

function runCleanup(): void {
  for (const fn of cleanupFns) {
    try { fn(); } catch { /* already exited */ }
  }
}

// ── Output helpers ────────────────────────────────────────────────────────────

function spawnWithPrefix(
  prefix: string,
  cmd: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv },
): ChildProcess {
  const child = spawn(cmd, args, { ...opts, stdio: 'pipe' });

  child.stdout?.on('data', (data: Buffer) => {
    String(data)
      .split('\n')
      .filter(Boolean)
      .forEach((line) => console.log(`${prefix} ${line}`));
  });

  child.stderr?.on('data', (data: Buffer) => {
    String(data)
      .split('\n')
      .filter(Boolean)
      .forEach((line) => console.error(`${prefix} ${line}`));
  });

  child.on('error', (err) =>
    console.error(`${prefix} spawn error: ${err.message}`),
  );

  return child;
}

// ── Cloudflared tunnel ────────────────────────────────────────────────────────

function startTunnel(port: number): Promise<string> {
  return new Promise((res, rej) => {
    import('cloudflared').then(({ Tunnel }) => {
      const t = new Tunnel(['tunnel', '--url', `http://localhost:${port}`]);

      const timeout = setTimeout(() => {
        t.stop();
        rej(new Error('Cloudflared tunnel did not start within 30 seconds'));
      }, 30_000);

      t.once('url', (url: string) => {
        clearTimeout(timeout);
        res(url);
      });

      t.once('error', (err: Error) => {
        clearTimeout(timeout);
        rej(err);
      });

      onCleanup(() => t.stop());
    }).catch(rej);
  });
}

// ── Dashboard resolution ──────────────────────────────────────────────────────

/**
 * Bundled standalone dashboard shipped inside the npm package at
 * dist/dashboard/server.js (two levels up from dist/cli/commands/).
 */
const bundledDashboard = resolve(__dirname, '..', '..', 'dashboard');

interface DashboardLocation {
  mode: 'standalone' | 'dev';
  dir: string;
}

/**
 * Find the dashboard directory, preferring:
 * 1. Explicit --dashboard-path
 * 2. CWD/gateway-app with node_modules (dev / repo clone)
 * 3. Bundled standalone output (npm-installed package)
 */
function resolveDashboard(explicit?: string): DashboardLocation | null {
  if (explicit) {
    const dir = resolve(explicit);
    if (!existsSync(dir)) return null;
    if (existsSync(join(dir, 'server.js'))) return { mode: 'standalone', dir };
    if (existsSync(join(dir, 'node_modules'))) return { mode: 'dev', dir };
    return null;
  }

  // Dev: CWD/gateway-app with node_modules installed
  const cwdApp = join(process.cwd(), 'gateway-app');
  if (existsSync(join(cwdApp, 'node_modules'))) {
    return { mode: 'dev', dir: cwdApp };
  }

  // Bundled standalone from npm package
  if (existsSync(join(bundledDashboard, 'server.js'))) {
    return { mode: 'standalone', dir: bundledDashboard };
  }

  return null;
}

// ── Dashboard (Next.js UI + Python agent) ────────────────────────────────────

function startDashboard(loc: DashboardLocation, gatewayUrl: string, port: number, agentRuntimeToken: string): void {
  // Next.js must NOT inherit PORT (gateway's port) — it would collide.
  // Omit PORT so Next.js falls back to its own default (3000).
  const { PORT: _drop, ...envWithoutPort } = process.env;

  const uiEnv: NodeJS.ProcessEnv = {
    ...envWithoutPort,
    NEXT_PUBLIC_GATEWAY_URL: gatewayUrl,
    GATEWAY_API_URL: `http://localhost:${port}`,
  };

  if (loc.mode === 'standalone') {
    // Production: pre-built standalone output shipped with the npm package.
    const ui = spawnWithPrefix('[UI]   ', process.execPath, ['server.js'], {
      cwd: loc.dir,
      env: { ...uiEnv, HOSTNAME: '0.0.0.0' },
    });
    onCleanup(() => ui.kill('SIGTERM'));
  } else {
    // Dev: run next dev from the gateway-app source directory.
    const nextBin = join(loc.dir, 'node_modules', '.bin', 'next');
    const ui = spawnWithPrefix('[UI]   ', nextBin, ['dev'], { cwd: loc.dir, env: uiEnv });
    onCleanup(() => ui.kill('SIGTERM'));
  }

  // Python agent (only available in dev / repo clone)
  const agentDir = join(loc.dir, 'agent');
  if (existsSync(agentDir)) {
    const localGatewayUrl = `http://localhost:${port}`;
    const agentEnv: NodeJS.ProcessEnv = {
      ...envWithoutPort,
      GATEWAY_API_URL: localGatewayUrl,
      GATEWAY_URL: localGatewayUrl,
      AGENT_RUNTIME_TOKEN: agentRuntimeToken,
      AGENT_PORT: process.env.AGENT_PORT ?? '8000',
    };
    const agent = spawnWithPrefix('[Agent]', 'uv', ['run', 'python', 'main.py'], {
      cwd: agentDir,
      env: agentEnv,
    });
    onCleanup(() => agent.kill('SIGTERM'));
  } else if (loc.mode === 'dev') {
    console.log('[Dashboard] No agent/ directory found — skipping Python agent');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function runStart(options: StartOptions): Promise<void> {
  loadEnv();

  if (options.db) process.env.DATABASE_URL = options.db;
  if (options.port) process.env.PORT = options.port;

  // Reset config cache so CLI flag overrides are picked up.
  const { setConfig, loadConfig } = await import('../../config.js');
  setConfig(loadConfig());

  await ensureDb();

  const { default: app } = await import('../../index.js');
  const port = parseInt(process.env.PORT ?? '7521', 10);

  // Graceful shutdown.
  process.once('SIGINT', () => { runCleanup(); process.exit(0); });
  process.once('SIGTERM', () => { runCleanup(); process.exit(0); });

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[Gateway] Listening on http://localhost:${info.port}`);

    if (!options.tunnel && !options.dashboard) return;

    // Post-server startup: tunnel first (to get URL), then dashboard.
    (async () => {
      let gatewayUrl = `http://localhost:${info.port}`;

      if (options.tunnel) {
        console.log('[Tunnel]  Starting cloudflared quick tunnel...');
        try {
          gatewayUrl = await startTunnel(info.port);
          // Expose the public URL to the running gateway process so that
          // auth routes (OAuth callbacks, pair links, etc.) use the tunnel
          // address instead of http://localhost. auth/module.ts reads
          // process.env.GATEWAY_PUBLIC_URL at request time, so this takes
          // effect immediately for all subsequent requests.
          process.env.GATEWAY_PUBLIC_URL = gatewayUrl;
          console.log(`[Tunnel]  Public URL: ${gatewayUrl}`);
        } catch (err) {
          fail(`Tunnel failed: ${err instanceof Error ? err.message : String(err)}`);
          // Fall back to localhost — still start dashboard if requested.
        }
      }

      if (options.dashboard) {
        const loc = resolveDashboard(options.dashboardPath);
        if (!loc) {
          fail('Dashboard not found. Run from the simplaix-gateway repo root, or pass --dashboard-path <dir>.');
          return;
        }

        console.log(`[Dashboard] Starting from ${loc.dir} (${loc.mode} mode)`);
        console.log(`[Dashboard] Gateway URL: ${gatewayUrl}`);

        // Auto-provision a dashboard agent so the Python agent can authenticate.
        // On restart, regenerate the token (plain token is never stored).
        const { agentService } = await import('../../services/agent.service/index.js');
        const DASHBOARD_AGENT_NAME = '__dashboard__';
        const agentPort = process.env.AGENT_PORT ?? '8000';
        const existing = (await agentService.listAgents()).find(
          (a) => a.name === DASHBOARD_AGENT_NAME,
        );
        let agentRuntimeToken: string;
        if (existing) {
          const result = await agentService.regenerateRuntimeToken(existing.id);
          agentRuntimeToken = result!.runtimeToken;
        } else {
          const created = await agentService.createAgent({
            name: DASHBOARD_AGENT_NAME,
            upstreamUrl: `http://localhost:${agentPort}`,
            description: 'Auto-created by gateway start --dashboard',
          });
          agentRuntimeToken = created.runtimeToken;
        }
        console.log(`[Dashboard] Agent runtime token provisioned`);

        startDashboard(loc, gatewayUrl, info.port, agentRuntimeToken);
      }
    })();
  });
}
