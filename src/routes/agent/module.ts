/**
 * Agent Routes
 * Handles agent invocation from frontend clients
 * 
 * This is the entry point for end-users calling agents.
 * Uses flexible authentication: JWT (direct) or API key + JWT (server-to-server).
 * The API key + JWT mode supports callers like CopilotKit that pass credentials
 * via query parameters (_api_key, _token) instead of HTTP headers.
 */

import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { GatewayVariables } from '../../types/index.js';
import { flexibleAuthMiddleware } from '../../middleware/auth.js';
import { agentService } from '../../services/agent.service/index.js';
import { issueSessionJWT } from '../../services/auth.service/index.js';
import { credentialService } from '../../services/credential.service/index.js';

const agentRoutes = new Hono<{ Variables: GatewayVariables }>();

// Flexible auth: accepts JWT (header) or API key + JWT (headers or query params)
agentRoutes.use('/*', flexibleAuthMiddleware);

/**
 * POST /v1/agents/:agentId/invoke
 * Invoke an agent from the frontend
 * 
 * This endpoint:
 * 1. Verifies user JWT
 * 2. Loads agent and checks tenant isolation
 * 3. Forwards request to agent's runtimeUrl
 * 4. Injects user context headers for the runtime
 */
agentRoutes.post('/:agentId/invoke', async (c) => {
  const user = c.get('user');
  const { agentId } = c.req.param();

  // Load the agent
  const agent = await agentService.getAgent(agentId);

  if (!agent) {
    return c.json(
      {
        error: 'Not Found',
        message: 'Agent not found',
        code: 'AGENT_NOT_FOUND',
      },
      404
    );
  }

  // Check tenant isolation
  if (agent.tenantId && user.tenantId && agent.tenantId !== user.tenantId) {
    return c.json(
      {
        error: 'Forbidden',
        message: 'Agent belongs to a different tenant',
        code: 'TENANT_MISMATCH',
      },
      403
    );
  }

  // Check if agent is active (kill switch)
  if (!agent.isActive) {
    return c.json(
      {
        error: 'Forbidden',
        message: 'Agent is disabled',
        code: 'AGENT_DISABLED',
      },
      403
    );
  }

  // Resolve required credentials before forwarding to the agent runtime.
  // If any are missing, return 401 so the frontend can trigger auth flow.
  // If all are available, they'll be injected as X-Credential-* headers.
  let resolvedCredentials: Record<string, string> | undefined;

  if (agent.requiredCredentials && agent.requiredCredentials.length > 0) {
    const serviceTypes = agent.requiredCredentials.map(rc => rc.serviceType);
    const result = await credentialService.resolveCredentials(
      user.id,
      serviceTypes,
      user.tenantId
    );

    if (result.missing.length > 0) {
      console.log(`[Agent] Missing credentials for user ${user.id}: ${result.missing.join(', ')}`);
      return c.json(
        {
          code: 'CREDENTIALS_REQUIRED',
          missing: result.missing,
          authUrls: result.authUrls,
          message: `Authentication required for: ${result.missing.join(', ')}`,
        },
        401
      );
    }

    resolvedCredentials = result.credentials;
  }

  // Parse request body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  // Build headers for the runtime
  const requestId = nanoid();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Gateway-Request-ID': requestId,
    'X-Gateway-Agent-ID': agent.id,
    'X-End-User-ID': user.id,
    'X-User-Id': user.id, // Also send as X-User-Id for credential SDK middleware
  };

  if (user.tenantId) {
    headers['X-Tenant-ID'] = user.tenantId;
  }

  if (user.email) {
    headers['X-End-User-Email'] = user.email;
  }

  if (user.roles && user.roles.length > 0) {
    headers['X-End-User-Roles'] = user.roles.join(',');
  }

  // Forward upstream secret if configured
  if (agent.upstreamSecret) {
    headers['Authorization'] = `Bearer ${agent.upstreamSecret}`;
  }

  // Inject pre-resolved credentials as headers so the agent SDK
  // can read them without making additional network calls.
  if (resolvedCredentials) {
    for (const [serviceType, token] of Object.entries(resolvedCredentials)) {
      headers[`X-Credential-${serviceType}`] = token;
    }
  }

  // Issue a session JWT so the agent can forward user context back to
  // the Gateway's MCP proxy for per-user policy enforcement and audit.
  const sessionToken = await issueSessionJWT({
    agentId: agent.id,
    userId: user.id,
    tenantId: user.tenantId,
    roles: user.roles,
    email: user.email,
    requestId,
  });
  if (sessionToken) {
    headers['X-Gateway-Session-Token'] = sessionToken;
    console.log(`[Agent] Session token issued for user=${user.id}, agent=${agent.id}, requestId=${requestId}`);
  } else {
    console.log(`[Agent] No session token issued (JWT_SECRET not configured)`);
  }

  console.log(`[Agent] Invoking agent ${agent.id} (${agent.name}) for user ${user.id}, requestId=${requestId}`);

  try {
    // Forward to agent runtime (upstreamUrl is the runtimeUrl)
    const response = await fetch(agent.upstreamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    // Handle non-OK responses
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Agent] Runtime error: ${response.status} ${errorText}`);
      
      return c.json(
        {
          error: 'Runtime Error',
          message: `Agent runtime returned ${response.status}`,
          code: 'RUNTIME_ERROR',
          details: errorText,
        },
        response.status as 400 | 401 | 403 | 404 | 500 | 502 | 503
      );
    }

    // Check if response is streaming (SSE)
    const contentType = response.headers.get('Content-Type') || '';
    
    if (contentType.includes('text/event-stream')) {
      // Forward SSE stream
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');
      c.header('X-Gateway-Request-ID', requestId);
      
      return new Response(response.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Gateway-Request-ID': requestId,
        },
      });
    }

    // Forward JSON response
    const result = await response.json();
    
    return c.json({
      success: true,
      request_id: requestId,
      data: result,
    });
  } catch (error) {
    console.error('[Agent] Invoke failed:', error);
    
    return c.json(
      {
        error: 'Gateway Error',
        message: error instanceof Error ? error.message : 'Failed to invoke agent',
        code: 'INVOKE_FAILED',
      },
      502
    );
  }
});

/**
 * GET /v1/agents/:agentId/credentials-check
 * Lightweight pre-check: are all required credentials available?
 *
 * Returns 200 with { ok: true } if all credentials are satisfied,
 * or 401 with { code, missing, authUrls } if any are missing.
 * Used by the CopilotKit runtime route to show an auth prompt
 * before streaming begins.
 */
agentRoutes.get('/:agentId/credentials-check', async (c) => {
  const user = c.get('user');
  const { agentId } = c.req.param();

  const agent = await agentService.getAgent(agentId);

  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  // Tenant isolation
  if (agent.tenantId && user.tenantId && agent.tenantId !== user.tenantId) {
    return c.json({ error: 'Agent belongs to a different tenant' }, 403);
  }

  // No required credentials — always OK
  if (!agent.requiredCredentials || agent.requiredCredentials.length === 0) {
    return c.json({ ok: true });
  }

  const serviceTypes = agent.requiredCredentials.map(rc => rc.serviceType);
  const result = await credentialService.resolveCredentials(
    user.id,
    serviceTypes,
    user.tenantId
  );

  if (result.missing.length > 0) {
    return c.json(
      {
        code: 'CREDENTIALS_REQUIRED',
        missing: result.missing,
        authUrls: result.authUrls,
        message: `Authentication required for: ${result.missing.join(', ')}`,
      },
      401
    );
  }

  return c.json({ ok: true });
});

/**
 * GET /v1/agents/:agentId
 * Get agent details (public info only)
 */
agentRoutes.get('/:agentId', async (c) => {
  const user = c.get('user');
  const { agentId } = c.req.param();

  const agent = await agentService.getAgent(agentId);

  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  // Check tenant isolation
  if (agent.tenantId && user.tenantId && agent.tenantId !== user.tenantId) {
    return c.json({ error: 'Agent belongs to a different tenant' }, 403);
  }

  return c.json({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    is_active: agent.isActive,
    tenant_id: agent.tenantId,
  });
});

export { agentRoutes };
