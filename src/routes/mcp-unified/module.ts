/**
 * Unified MCP Endpoint
 *
 * Exposes a single MCP Streamable HTTP endpoint that aggregates tools
 * from all providers the caller is authorized to access:
 *
 *   POST   /v1/mcp/mcp    — JSON-RPC (initialize, tools/list, tools/call, etc.)
 *   GET    /v1/mcp/mcp    — SSE session resumption
 *   DELETE /v1/mcp/mcp    — Session termination
 *
 * Agent developers connect to this one endpoint instead of individual
 * provider endpoints. The gateway resolves which upstream provider
 * handles each tool call transparently.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { GatewayVariables, ToolProvider } from '../../types/index.js';
import { flexibleAuthMiddleware } from '../../middleware/auth.js';
import { providerAccessService } from '../../services/provider-access.service/index.js';
import { toolAggregationService } from '../../services/tool-aggregation.service/index.js';
import {
  buildUpstreamHeaders,
  resolveEndUserIdentity,
  evaluateToolCallPolicy,
  forwardToUpstream,
} from '../../services/mcp-proxy.service/index.js';
import { logger } from '../../utils/logger.js';
import { SessionRegistry } from '../../modules/session/session-registry.js';

const mcpUnifiedRoutes = new Hono<{ Variables: GatewayVariables }>();

mcpUnifiedRoutes.use('/*', flexibleAuthMiddleware);

/**
 * In-memory mapping of session IDs to their upstream provider + session ID.
 * When the unified endpoint creates a session with an upstream, we need to
 * track which upstream owns that session for GET/DELETE forwarding.
 */
const sessionRegistry = new SessionRegistry<{
  provider: ToolProvider;
  upstreamSessionId: string;
}>({
  ttlMs: 30 * 60 * 1000,
  maxEntries: 5000,
  cleanupIntervalMs: 60 * 1000,
});

const GATEWAY_SERVER_INFO = {
  name: 'simplaix-gateway',
  version: '1.0.0',
};

const GATEWAY_CAPABILITIES = {
  tools: { listChanged: false },
};

type RouteContext = Context<{ Variables: GatewayVariables }>;

/**
 * Parse the optional `providers` query parameter into a string array.
 * Accepts comma-separated IDs: `?providers=id1,id2,id3`
 */
function parseProviderIds(c: RouteContext): string[] | undefined {
  const raw = c.req.query('providers');
  if (!raw) return undefined;
  const ids = raw.split(',').map((s: string) => s.trim()).filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

/**
 * POST /v1/mcp/mcp
 *
 * Handles all MCP JSON-RPC methods:
 * - initialize: returns gateway capabilities
 * - tools/list: aggregates tools from all accessible providers
 * - tools/call: routes to the correct upstream provider
 * - others: forwarded if a provider can be resolved
 *
 * Optional query parameter:
 *   ?providers=id1,id2  — restrict to a specific set of providers
 */
mcpUnifiedRoutes.post('/mcp', async (c) => {
  const user = c.get('user');
  const agent = c.get('agent');
  const providerIds = parseProviderIds(c);

  const body = await c.req.text();
  const startTime = Date.now();

  let jsonBody: { method?: string; id?: unknown; params?: Record<string, unknown> };
  try {
    jsonBody = JSON.parse(body);
  } catch {
    return c.json(
      { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } },
      400
    );
  }

  const method = jsonBody.method || '';
  const jsonRpcId = jsonBody.id;

  // Resolve end-user identity early — all MCP methods should use the
  // real end-user (from session token) for access checks, not the
  // authenticated caller (which may be an agent runtime / owner).
  const endUser = await resolveEndUserIdentity(
    user,
    c.req.header('X-Gateway-Session-Token'),
    c.req.header('X-End-User-Id')
  );
  const endUserTenant = endUser.endUserTenantId || user.tenantId;

  // ==================== initialize ====================
  if (method === 'initialize') {
    logger.info(
      `[MCPUnified] initialize: endUser=${endUser.endUserId}, agent=${agent?.id || 'none'}`
    );
    return c.json({
      jsonrpc: '2.0',
      id: jsonRpcId,
      result: {
        protocolVersion: '2025-03-26',
        serverInfo: GATEWAY_SERVER_INFO,
        capabilities: GATEWAY_CAPABILITIES,
      },
    });
  }

  // ==================== notifications/initialized ====================
  if (method === 'notifications/initialized') {
    return c.json({ jsonrpc: '2.0', id: jsonRpcId, result: {} });
  }

  // ==================== tools/list ====================
  if (method === 'tools/list') {
    logger.info(
      `[MCPUnified] tools/list: endUser=${endUser.endUserId}, agent=${agent?.id || 'none'}, tenant=${endUserTenant || 'none'}${providerIds ? `, providers=[${providerIds.join(',')}]` : ''}`
    );

    try {
      const { tools } = await toolAggregationService.getAggregatedTools(
        endUser.endUserId,
        endUserTenant,
        agent?.id,
        agent,
        providerIds
      );

      return c.json({
        jsonrpc: '2.0',
        id: jsonRpcId,
        result: { tools },
      });
    } catch (err) {
      logger.error('[MCPUnified] tools/list aggregation failed:', err);
      return c.json({
        jsonrpc: '2.0',
        id: jsonRpcId,
        error: {
          code: -32603,
          message: `Failed to aggregate tools: ${err instanceof Error ? err.message : 'Unknown error'}`,
        },
      }, 500);
    }
  }

  // ==================== tools/call ====================
  const params = jsonBody.params;
  if (method === 'tools/call' && params && typeof params.name === 'string') {
    const toolName = params.name;
    const toolArgs = typeof params.arguments === 'object' && params.arguments
      ? (params.arguments as Record<string, unknown>)
      : undefined;

    logger.info(
      `[MCPUnified] tools/call: tool=${toolName}, endUser=${endUser.endUserId}, agent=${agent?.id || 'none'}`
    );

    // Resolve which provider owns this tool
    const provider = await toolAggregationService.resolveToolProvider(
      toolName, endUserTenant, providerIds
    );
    if (!provider) {
      return c.json({
        jsonrpc: '2.0',
        id: jsonRpcId,
        error: {
          code: -32601,
          message: `No provider found for tool '${toolName}'`,
        },
      }, 404);
    }

    // Check provider-level access using end-user + agent (not owner)
    const access = await providerAccessService.checkAccess(
      endUser.endUserId, provider.id, endUserTenant, agent?.id
    );
    if (!access.allowed) {
      return c.json({
        jsonrpc: '2.0',
        id: jsonRpcId,
        error: {
          code: -32600,
          message: access.reason || `Access denied to provider for tool '${toolName}'`,
        },
      }, 403);
    }

    const upstreamHeaders = buildUpstreamHeaders(user, provider, agent);
    const incomingSessionId = c.req.header('Mcp-Session-Id');
    const incomingAccept = c.req.header('Accept');
    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...upstreamHeaders,
    };
    if (incomingSessionId) forwardHeaders['Mcp-Session-Id'] = incomingSessionId;
    if (incomingAccept) forwardHeaders['Accept'] = incomingAccept;

    const decision = await evaluateToolCallPolicy({
      identity: { user, agent, ...endUser },
      provider,
      toolName,
      toolArgs,
      jsonRpcId,
      body,
      upstreamUrl: provider.endpoint,
      forwardHeaders,
      startTime,
    });

    if (decision.type === 'deny') {
      return c.json(decision.jsonRpcResponse, 403);
    }
    if (decision.type === 'require_confirmation') {
      return decision.sseHandler(c);
    }

    const response = await forwardToUpstream({
      upstreamUrl: provider.endpoint,
      method: 'POST',
      headers: forwardHeaders,
      body,
      auditPromise: decision.auditPromise,
      startTime,
      providerName: provider.name,
    });

    // Track session for GET/DELETE
    const upstreamSessionId = response.headers.get('Mcp-Session-Id');
    const clientSessionId = incomingSessionId || upstreamSessionId;
    if (clientSessionId && upstreamSessionId) {
      // Track client session -> upstream session mapping for GET/DELETE forwarding.
      sessionRegistry.set(clientSessionId, {
        provider,
        upstreamSessionId,
      });
    }

    return response;
  }

  // ==================== Other methods (ping, etc.) ====================
  if (method === 'ping') {
    return c.json({ jsonrpc: '2.0', id: jsonRpcId, result: {} });
  }

  logger.debug(
    `[MCPUnified] Unhandled method: ${method}, endUser=${endUser.endUserId}`
  );
  return c.json({
    jsonrpc: '2.0',
    id: jsonRpcId,
    error: {
      code: -32601,
      message: `Method '${method}' is not supported by the unified endpoint`,
    },
  }, 400);
});

/**
 * GET /v1/mcp/mcp — SSE session resumption
 *
 * Routes to the upstream provider that owns the session.
 */
mcpUnifiedRoutes.get('/mcp', async (c) => {
  const user = c.get('user');
  const agent = c.get('agent');
  const sessionId = c.req.header('Mcp-Session-Id');

  if (!sessionId) {
    return c.json(
      { error: 'Bad Request', message: 'Mcp-Session-Id header required for GET' },
      400
    );
  }

  const session = sessionRegistry.get(sessionId);
  if (!session) {
    return c.json(
      { error: 'Not Found', message: 'Session not found. Start a new session via POST.' },
      404
    );
  }

  const upstreamHeaders = buildUpstreamHeaders(user, session.provider, agent);
  const forwardHeaders: Record<string, string> = {
    Accept: 'text/event-stream',
    'Mcp-Session-Id': session.upstreamSessionId,
    ...upstreamHeaders,
  };

  return forwardToUpstream({
    upstreamUrl: session.provider.endpoint,
    method: 'GET',
    headers: forwardHeaders,
    providerName: session.provider.name,
  });
});

/**
 * DELETE /v1/mcp/mcp — session termination
 */
mcpUnifiedRoutes.delete('/mcp', async (c) => {
  const user = c.get('user');
  const agent = c.get('agent');
  const sessionId = c.req.header('Mcp-Session-Id');

  if (!sessionId) {
    return c.json(
      { error: 'Bad Request', message: 'Mcp-Session-Id header required for DELETE' },
      400
    );
  }

  const session = sessionRegistry.get(sessionId);
  if (!session) {
    // Keep DELETE idempotent: unknown session is treated as already closed.
    return new Response(null, { status: 204 });
  }

  const upstreamHeaders = buildUpstreamHeaders(user, session.provider, agent);
  const forwardHeaders: Record<string, string> = {
    'Mcp-Session-Id': session.upstreamSessionId,
    ...upstreamHeaders,
  };

  sessionRegistry.delete(sessionId);
  // Delete local mapping first to prevent stale reuse during upstream errors.

  return forwardToUpstream({
    upstreamUrl: session.provider.endpoint,
    method: 'DELETE',
    headers: forwardHeaders,
    providerName: session.provider.name,
  });
});

export { mcpUnifiedRoutes };
