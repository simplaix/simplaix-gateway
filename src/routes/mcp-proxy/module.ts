/**
 * MCP Proxy Routes
 *
 * Exposes a per-provider MCP Streamable HTTP proxy endpoint:
 *   POST /v1/mcp-proxy/:providerId/mcp
 *   GET  /v1/mcp-proxy/:providerId/mcp   (SSE session resumption)
 *   DELETE /v1/mcp-proxy/:providerId/mcp  (session termination)
 *
 * Agent developers configure their MCP client to connect here instead of
 * directly to an upstream MCP server. The gateway:
 *   1. Authenticates the caller (JWT or API key)
 *   2. Resolves the tool provider by ID
 *   3. Checks ACL (user/role/agent → provider access)
 *   4. Transparently proxies the MCP protocol to the upstream endpoint
 *   5. Audits all tools/call invocations with full lifecycle tracking
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { GatewayVariables } from '../../types/index.js';
import { flexibleAuthMiddleware } from '../../middleware/auth.js';
import { toolProviderService } from '../../services/tool-provider.service/index.js';
import { providerAccessService } from '../../services/provider-access.service/index.js';
import { logger } from '../../utils/logger.js';
import {
  buildUpstreamHeaders,
  resolveEndUserIdentity,
  evaluateToolCallPolicy,
  forwardToUpstream,
} from '../../services/mcp-proxy.service/index.js';

const mcpProxyRoutes = new Hono<{ Variables: GatewayVariables }>();

mcpProxyRoutes.use('/*', flexibleAuthMiddleware);

type RouteContext = Context<{ Variables: GatewayVariables }>;

/**
 * Shared logic: resolve provider + check ACL.
 * Resolves end-user from session token so access checks use the
 * real end-user identity, not the agent runtime / owner.
 */
async function resolveAndAuthorize(c: RouteContext) {
  const user = c.get('user');
  const agent = c.get('agent');
  const { providerId } = c.req.param();

  const provider = await toolProviderService.getProvider(providerId);
  if (!provider) {
    return {
      error: c.json(
        { error: 'Not Found', message: `Tool provider '${providerId}' not found`, code: 'PROVIDER_NOT_FOUND' },
        404
      ),
    };
  }

  if (!provider.isActive) {
    return {
      error: c.json(
        { error: 'Forbidden', message: `Tool provider '${provider.name}' is disabled`, code: 'PROVIDER_DISABLED' },
        403
      ),
    };
  }

  // Resolve end-user for access checks (not the agent runtime owner)
  const endUser = await resolveEndUserIdentity(
    user,
    c.req.header('X-Gateway-Session-Token'),
    c.req.header('X-End-User-Id')
  );
  const endUserTenant = endUser.endUserTenantId || user.tenantId;

  if (provider.tenantId && endUserTenant && provider.tenantId !== endUserTenant) {
    return {
      error: c.json(
        { error: 'Forbidden', message: 'Provider belongs to a different tenant', code: 'TENANT_MISMATCH' },
        403
      ),
    };
  }

  const access = await providerAccessService.checkAccess(
    endUser.endUserId,
    provider.id,
    endUserTenant,
    agent?.id
  );
  if (!access.allowed) {
    // Keep denial reason in logs for audit/debug while returning a generic 403 payload.
    logger.debug(
      `[MCPProxy] Access denied: endUser=${endUser.endUserId}, agent=${agent?.id || 'none'}, provider=${provider.id}, reason=${access.reason}`
    );
    return {
      error: c.json(
        { error: 'Forbidden', message: access.reason || 'Access denied to this provider', code: 'PROVIDER_ACCESS_DENIED' },
        403
      ),
    };
  }

  return { provider, endUser };
}

/**
 * POST /v1/mcp-proxy/:providerId/mcp
 */
mcpProxyRoutes.post('/:providerId/mcp', async (c) => {
  const result = await resolveAndAuthorize(c);
  if ('error' in result) return result.error;

  const { provider, endUser } = result;
  const user = c.get('user');
  const agent = c.get('agent');

  const body = await c.req.text();
  const upstreamUrl = provider.endpoint;
  const upstreamHeaders = buildUpstreamHeaders(user, provider, agent);

  const incomingSessionId = c.req.header('Mcp-Session-Id');
  const incomingAccept = c.req.header('Accept');
  const forwardHeaders: Record<string, string> = {
    'Content-Type': c.req.header('Content-Type') || 'application/json',
    ...upstreamHeaders,
  };
  if (incomingSessionId) forwardHeaders['Mcp-Session-Id'] = incomingSessionId;
  if (incomingAccept) forwardHeaders['Accept'] = incomingAccept;

  let auditPromise: Promise<string | undefined> | undefined;
  const startTime = Date.now();

  try {
    const jsonBody = JSON.parse(body);
    if (jsonBody.method === 'tools/call' && jsonBody.params?.name) {
      const toolCallName = jsonBody.params.name;
      const toolCallArgs = jsonBody.params.arguments;
      const jsonRpcId = jsonBody.id;

      logger.info(
        `[MCPProxy] tools/call: endUser=${endUser.endUserId}, agent=${agent?.id || 'none'}, provider=${provider.name}, tool=${toolCallName}, args=${JSON.stringify(toolCallArgs || {})}`
      );

      const decision = await evaluateToolCallPolicy({
        identity: {
          user,
          agent,
          ...endUser,
        },
        provider,
        toolName: toolCallName,
        toolArgs: toolCallArgs,
        jsonRpcId,
        body,
        upstreamUrl,
        forwardHeaders,
        startTime,
      });

      if (decision.type === 'deny') {
        return c.json(decision.jsonRpcResponse, 403);
      }
      if (decision.type === 'require_confirmation') {
        // Keep stream open until approval workflow completes.
        return decision.sseHandler(c);
      }
      // 'allow' or 'exempt' — continue to upstream
      auditPromise = decision.auditPromise;
    } else {
      logger.debug(
        `[MCPProxy] ${jsonBody.method || 'unknown'}: provider=${provider.name}, endUser=${endUser.endUserId}`
      );
    }
  } catch {
    // Body is not JSON — still forward it
  }

  return forwardToUpstream({
    upstreamUrl,
    method: 'POST',
    headers: forwardHeaders,
    body,
    auditPromise,
    startTime,
    providerName: provider.name,
  });
});

/**
 * GET /v1/mcp-proxy/:providerId/mcp (SSE session resumption)
 */
mcpProxyRoutes.get('/:providerId/mcp', async (c) => {
  const result = await resolveAndAuthorize(c);
  if ('error' in result) return result.error;

  const { provider } = result;
  const user = c.get('user');
  const agent = c.get('agent');

  const upstreamHeaders = buildUpstreamHeaders(user, provider, agent);
  const incomingSessionId = c.req.header('Mcp-Session-Id');

  const forwardHeaders: Record<string, string> = {
    Accept: 'text/event-stream',
    ...upstreamHeaders,
  };
  if (incomingSessionId) forwardHeaders['Mcp-Session-Id'] = incomingSessionId;

  return forwardToUpstream({
    upstreamUrl: provider.endpoint,
    method: 'GET',
    headers: forwardHeaders,
    providerName: provider.name,
  });
});

/**
 * DELETE /v1/mcp-proxy/:providerId/mcp (session termination)
 */
mcpProxyRoutes.delete('/:providerId/mcp', async (c) => {
  const result = await resolveAndAuthorize(c);
  if ('error' in result) return result.error;

  const { provider } = result;
  const user = c.get('user');
  const agent = c.get('agent');

  const upstreamHeaders = buildUpstreamHeaders(user, provider, agent);
  const incomingSessionId = c.req.header('Mcp-Session-Id');

  const forwardHeaders: Record<string, string> = {
    ...upstreamHeaders,
  };
  if (incomingSessionId) forwardHeaders['Mcp-Session-Id'] = incomingSessionId;

  return forwardToUpstream({
    upstreamUrl: provider.endpoint,
    method: 'DELETE',
    headers: forwardHeaders,
    providerName: provider.name,
  });
});

export { mcpProxyRoutes };
