import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

type PluginConfig = {
  gatewayUrl?: string;
  providerId?: string;
  timeoutMs?: number;
  skipTools?: string[];
  gatewayRoot?: string;
};

// auditId temporary Map: toolName → auditId
// use toolName as key, because ctx.sessionKey is always undefined for after_tool_call
const pendingAudits = new Map<string, string>();

/**
 * Extract end-user peerId from sessionKey.
 * sessionKey example:
 *   agent:main:whatsapp:direct:+33769142022
 *   agent:main:telegram:direct:123456789
 *   agent:main:whatsapp:direct:+33769142022:thread:abc
 */
function extractPeerId(sessionKey?: string): string | undefined {
  if (!sessionKey) return undefined;
  const marker = ":direct:";
  const idx = sessionKey.indexOf(marker);
  if (idx === -1) return undefined;
  const rest = sessionKey.slice(idx + marker.length);
  // peerId before the next ':' (could be followed by :thread:xxx)
  const colonIdx = rest.indexOf(":");
  return colonIdx === -1 ? rest : rest.slice(0, colonIdx);
}

async function checkGatewayHealth(gatewayUrl: string): Promise<boolean> {
  try {
    const resp = await fetch(`${gatewayUrl}/api/health`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getGatewayPort(gatewayUrl: string): number {
  try {
    const u = new URL(gatewayUrl);
    if (u.port) return Number(u.port);
    return u.protocol === "https:" ? 443 : 80;
  } catch {
    return 3001;
  }
}

async function listPidsByPort(port: number): Promise<number[]> {
  return await new Promise((resolve) => {
    const child = spawn("lsof", ["-n", "-i", `:${port}`, "-t"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.on("close", () => {
      const pids = out
        .split(/\s+/)
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isInteger(n) && n > 1);
      resolve([...new Set(pids)]);
    });
    child.on("error", () => resolve([]));
  });
}

// Guard against duplicate registration (openclaw may call register() twice)
let registered = false;

export default function register(api: OpenClawPluginApi) {
  if (registered) {
    api.logger.warn?.("[simplaix-gateway] Already registered, skipping duplicate");
    return;
  }
  registered = true;

  const cfg = (api.pluginConfig ?? {}) as PluginConfig;
  const gatewayUrl = (cfg.gatewayUrl ?? process.env.SIMPLAIX_GATEWAY_URL ?? "").replace(/\/$/, "");
  const providerId = cfg.providerId ?? "openclaw";
  const timeoutMs = cfg.timeoutMs ?? 310_000;
  const skipTools = new Set(cfg.skipTools ?? []);
  const token = process.env.SIMPLAIX_AGENT_RUNTIME_TOKEN ?? "";
  const gatewayRoot = cfg.gatewayRoot ?? process.env.SIMPLAIX_GATEWAY_ROOT;

  // ── /lobster-shell command ─────────────────────────────────────
  api.registerCommand({
    name: "lobster-shell",
    description: "Start or check Simplaix Gateway server (expects setup already completed)",
    acceptsArgs: true,
    requireAuth: false,
    handler: async (ctx) => {
      if (!gatewayUrl) {
        return {
          text: "gatewayUrl is missing. Configure plugins.entries.lobster-shell.config.gatewayUrl first.",
        };
      }

      const action = (ctx.args || "start").trim().toLowerCase();
      if (action === "status") {
        const ok = await checkGatewayHealth(gatewayUrl);
        return { text: ok ? `✅ Gateway is running: ${gatewayUrl}` : `⚠️ Gateway is not reachable: ${gatewayUrl}` };
      }

      if (action === "stop") {
        const port = getGatewayPort(gatewayUrl);
        const pids = await listPidsByPort(port);
        if (pids.length === 0) {
          return { text: `ℹ️ No process is listening on port ${port}.` };
        }

        const killed: number[] = [];
        for (const pid of pids) {
          try {
            process.kill(pid, "SIGTERM");
            killed.push(pid);
          } catch {
            // ignore process kill errors
          }
        }

        await sleep(1000);
        const stillUp = await checkGatewayHealth(gatewayUrl);
        return {
          text: stillUp
            ? `⚠️ Sent SIGTERM to pids: ${killed.join(", ") || pids.join(", ")}, but gateway is still reachable.`
            : `🛑 Gateway stopped on port ${port} (pids: ${killed.join(", ") || pids.join(", ")}).`,
        };
      }

      if (action !== "start") {
        return { text: "Usage: /lobster-shell [start|status|stop]" };
      }

      const alreadyUp = await checkGatewayHealth(gatewayUrl);
      if (alreadyUp) {
        return { text: `✅ Gateway already running: ${gatewayUrl}` };
      }

      if (!gatewayRoot) {
        return {
          text: "gatewayRoot is missing. Set plugins.entries.lobster-shell.config.gatewayRoot or SIMPLAIX_GATEWAY_ROOT before /lobster-shell start.",
        };
      }

      if (!existsSync(gatewayRoot)) {
        return {
          text: `gatewayRoot does not exist: ${gatewayRoot}\nSet plugins.entries.lobster-shell.config.gatewayRoot or SIMPLAIX_GATEWAY_ROOT.`,
        };
      }

      try {
        const child = spawn("pnpm", ["dev:server"], {
          cwd: gatewayRoot,
          detached: true,
          stdio: "ignore",
          env: process.env,
        });
        child.unref();

        await sleep(2000);
        const ok = await checkGatewayHealth(gatewayUrl);
        if (ok) {
          return { text: `🚀 Gateway started: ${gatewayUrl}` };
        }
        return {
          text:
            `Gateway start command sent (pid=${child.pid ?? "unknown"}), but health check not ready yet.\n` +
            `Please wait a few seconds and run /lobster-shell status.`,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { text: `Failed to start gateway: ${msg}` };
      }
    },
  });

  if (!gatewayUrl) {
    api.logger.warn?.("[simplaix-gateway] No gatewayUrl configured, plugin disabled");
    return;
  }

  api.logger.info?.("[simplaix-gateway] Policy & Audit plugin initialized");

  // ── before_tool_call ─────────────────────────────────────────────
  api.on("before_tool_call", async (event: any, ctx: any) => {
    if (skipTools.has(event.toolName)) return;

    const auditKey = event.toolName;
    const endUserId = extractPeerId(ctx.sessionKey);

    try {
      const resp = await fetch(`${gatewayUrl}/api/v1/tool-gate/evaluate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(endUserId ? { "X-End-User-Id": endUserId } : {}),
        },
        body: JSON.stringify({
          toolName: event.toolName,
          providerId,
          params: event.params,
          // do not send agentId, let Gateway resolve the correct agent from the art_xxx token
          sessionKey: ctx.sessionKey,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const data = await resp.json();

      if (data.decision === "allow" || data.decision === "confirmed") {
        if (data.auditId) {
          pendingAudits.set(auditKey, data.auditId);
        }
        return; // allow
      }

      if (data.decision === "denied") {
        return {
          block: true,
          blockReason: `[Gateway Policy] Tool "${event.toolName}" denied (risk: ${data.risk})`,
        };
      }

      if (data.decision === "rejected") {
        return {
          block: true,
          blockReason: `[Gateway Approval] Tool "${event.toolName}" rejected: ${data.reason ?? "no reason"}`,
        };
      }

      if (data.decision === "timeout") {
        return {
          block: true,
          blockReason: `[Gateway Approval] Tool "${event.toolName}" approval timed out`,
        };
      }

      // unknown decision — fail-open
      api.logger.warn?.(`[simplaix-gateway] Unknown decision "${data.decision}", allowing`);
    } catch (err) {
      // Gateway unreachable — fail-open
      api.logger.warn?.(`[simplaix-gateway] evaluate failed (${String(err)}), allowing`);
    }
  });

  // ── /pair command ──────────────────────────────────────────────
  api.registerCommand({
    name: "pair",
    description: "Get a link to connect the Simplaix approval app",
    requireAuth: false,
    handler: async (ctx) => {
      const peerId = ctx.senderId || ctx.from;
      if (!peerId) {
        return { text: "Cannot determine your identity." };
      }

      try {
        const resp = await fetch(`${gatewayUrl}/api/v1/auth/pairing-code`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ peerId }),
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          api.logger.warn?.(`[simplaix-gateway] /pair: gateway returned ${resp.status}: ${errBody}`);
          return { text: "Failed to generate pairing link. Please try again later." };
        }

        const data = await resp.json();
        return {
          text: `Install the Simplaix app and tap this link to connect:\n${data.deepLink}\n\nExpires in 5 minutes.`,
        };
      } catch (err) {
        api.logger.warn?.(`[simplaix-gateway] /pair failed: ${String(err)}`);
        return { text: "Failed to generate pairing link. Please try again later." };
      }
    },
  });

  // ── after_tool_call ──────────────────────────────────────────────
  api.on("after_tool_call", async (event: any, ctx: any) => {
    if (skipTools.has(event.toolName)) return;

    // OpenClaw fires after_tool_call twice per tool execution:
    // first call has result but no durationMs, second has both.
    // Only send audit on the complete (second) invocation.
    if (event.durationMs === undefined) return;

    const auditKey = event.toolName;
    const auditId = pendingAudits.get(auditKey);
    pendingAudits.delete(auditKey);

    if (!auditId) return;

    try {
      fetch(`${gatewayUrl}/api/v1/tool-gate/audit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          auditId,
          toolName: event.toolName,
          providerId,
          params: event.params,
          result: event.result,
          error: event.error,
          durationMs: event.durationMs,
        }),
      }).catch(() => {}); // fire-and-forget
    } catch {
      // ignore errors
    }
  });
}
