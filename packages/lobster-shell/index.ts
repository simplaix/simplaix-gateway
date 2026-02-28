import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

type PluginConfig = {
  gatewayUrl?: string;
  providerId?: string;
  timeoutMs?: number;
  skipTools?: string[];
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

// Guard against duplicate registration (openclaw may call register() twice)
let registered = false;

export default function register(api: OpenClawPluginApi) {
  if (registered) {
    api.logger.warn?.("[simplaix-gateway] Already registered, skipping duplicate");
    return;
  }
  registered = true;

  const cfg = (api.pluginConfig ?? {}) as PluginConfig;
  const gatewayUrl = (
    cfg.gatewayUrl ??
    process.env.SIMPLAIX_GATEWAY_URL ??
    ""
  ).replace(/\/$/, "");
  const providerId = cfg.providerId ?? "openclaw";
  const timeoutMs = cfg.timeoutMs ?? 310_000;
  const skipTools = new Set(cfg.skipTools ?? []);
  const token = process.env.SIMPLAIX_AGENT_RUNTIME_TOKEN ?? "";

  if (!gatewayUrl) {
    api.logger.warn?.(
      "[simplaix-gateway] No gatewayUrl configured, plugin disabled",
    );
    return;
  }

  api.logger.info?.(
    "[simplaix-gateway] Policy & Audit plugin initialized",
  );

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
      api.logger.warn?.(
        `[simplaix-gateway] Unknown decision "${data.decision}", allowing`,
      );
    } catch (err) {
      // Gateway unreachable — fail-open
      api.logger.warn?.(
        `[simplaix-gateway] evaluate failed (${String(err)}), allowing`,
      );
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
          api.logger.warn?.(
            `[simplaix-gateway] /pair: gateway returned ${resp.status}: ${errBody}`,
          );
          return { text: "Failed to generate pairing link. Please try again later." };
        }

        const data = await resp.json();
        return {
          text: `Install the Simplaix app and tap this link to connect:\n${data.deepLink}\n\nExpires in 5 minutes.`,
        };
      } catch (err) {
        api.logger.warn?.(
          `[simplaix-gateway] /pair failed: ${String(err)}`,
        );
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
