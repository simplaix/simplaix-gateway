import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";

import { HttpAgent } from "@ag-ui/client";
import { NextRequest } from "next/server";

const STRANDS_AGENT_URL = process.env.STRANDS_AGENT_URL || "http://localhost:8000";
const GATEWAY_API_URL = process.env.GATEWAY_API_URL || "http://localhost:3001";
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY || "";

// Service adapter for multi-agent support (using empty adapter for single agent)
const serviceAdapter = new ExperimentalEmptyAdapter();

/**
 * Try to extract the agent ID from a Gateway invoke URL.
 * Pattern: .../api/v1/agents/:agentId/invoke
 * Returns null if the URL doesn't match the Gateway pattern.
 */
function extractGatewayAgentId(url: string): string | null {
  const match = url.match(/\/api\/v1\/agents\/([^/]+)\/invoke$/);
  return match ? match[1] : null;
}

/**
 * Build a synthetic AG-UI SSE stream that renders as a text message
 * in the CopilotKit chat.  Used to show an auth prompt without
 * involving the agent at all.
 */
function buildAuthPromptStream(authUrls: Record<string, string>, missing: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const threadId = `thread_${Date.now()}`;
  const runId = `run_${Date.now()}`;
  const messageId = `msg_${Date.now()}`;

  // Build a user-friendly auth prompt message
  const links = missing.map((service) => {
    const url = authUrls[service] || `/auth/connect?service=${service}`;
    const label = service.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return `[Connect ${label}](${url})`;
  });

  const text =
    `To proceed, you need to authenticate first.\n\n` +
    links.join("\n\n") +
    `\n\nOnce you've connected, come back here and send your request again.`;

  // AG-UI SSE events
  const events = [
    { type: "RUN_STARTED", threadId, runId },
    { type: "TEXT_MESSAGE_START", messageId, role: "assistant" },
    { type: "TEXT_MESSAGE_CONTENT", messageId, delta: text },
    { type: "TEXT_MESSAGE_END", messageId },
    { type: "RUN_FINISHED", threadId, runId },
  ];

  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
}

// Next.js API route handler for CopilotKit runtime requests
// Creates a per-request HttpAgent to forward user identity to the agent
export const POST = async (req: NextRequest) => {
  // Extract the upstream JWT from the standard Authorization header.
  // The CopilotKitProvider sends this automatically; the gateway verifies
  // the JWT (gateway-issued or external issuer) and extracts user identity.
  const authHeader = req.headers.get("authorization");

  // ----------------------------------------------------------------
  // Pre-check: if the agent URL points to a Gateway invoke endpoint,
  // verify that all required credentials are available BEFORE starting
  // the CopilotKit/AG-UI streaming flow.  If credentials are missing,
  // return a synthetic SSE stream with an auth prompt message.
  // ----------------------------------------------------------------
  const agentId = extractGatewayAgentId(STRANDS_AGENT_URL);
  if (agentId && authHeader) {
    try {
      const checkUrl = `${GATEWAY_API_URL}/api/v1/agents/${agentId}/credentials-check`;
      const checkRes = await fetch(checkUrl, {
        headers: { Authorization: authHeader },
      });

      if (checkRes.status === 401) {
        const data = await checkRes.json().catch(() => null);
        if (data?.code === "CREDENTIALS_REQUIRED") {
          return new Response(buildAuthPromptStream(data.authUrls ?? {}, data.missing ?? []), {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        }
      }
    } catch (err) {
      // Pre-check failed (e.g. Gateway unreachable) — fall through
      // and let the normal flow handle the error.
      console.error("[CopilotKit] Credential pre-check failed:", err);
    }
  }

  // ----------------------------------------------------------------
  // Normal flow: forward to the agent via CopilotKit runtime.
  //
  // CopilotKit's HttpAgent (v1.x / @ag-ui/client) does NOT forward
  // custom HTTP headers to the downstream URL.  We pass auth via
  // query parameters instead:
  //   _api_key  — server-to-server trust (proves this is a trusted caller)
  //   _token    — user JWT (for audit, tenant isolation, credential resolution)
  // The gateway's flexibleAuthMiddleware reads both channels.
  // ----------------------------------------------------------------
  const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  const params = new URLSearchParams();
  if (GATEWAY_API_KEY) params.set("_api_key", GATEWAY_API_KEY);
  if (jwt) params.set("_token", jwt);

  const qs = params.toString();
  const sep = STRANDS_AGENT_URL.includes("?") ? "&" : "?";
  const agentUrl = qs ? `${STRANDS_AGENT_URL}${sep}${qs}` : STRANDS_AGENT_URL;

  const gatewayAgent = new HttpAgent({
    url: agentUrl,
  });

  const runtime = new CopilotRuntime({
    agents: {
      gateway_agent: gatewayAgent,
    },
  });

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};
