/**
 * Authentication middleware
 * Supports JWT tokens and Gateway API Keys (gk_)
 */

import { createMiddleware } from 'hono/factory';
import type { GatewayVariables, ApiKeyScope } from '../types/index.js';
import { verifyJWT, extractToken, AuthError } from '../services/auth.service/index.js';
import { agentService } from '../services/agent.service/index.js';
import { apiKeyService } from '../services/api-key.service/index.js';
import { userService } from '../services/user.service/index.js';
import { logger } from '../utils/logger.js';
import { hasPermissionFromRoles, isKnownPermission } from '../modules/authz/permissions.js';

/**
 * Authentication middleware
 * Accepts JWT tokens for user authentication.
 */
export const authMiddleware = createMiddleware<{ Variables: GatewayVariables }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization');
    const token = extractToken(authHeader);

    if (!token) {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'Missing or invalid Authorization header',
          code: 'MISSING_TOKEN',
        },
        401
      );
    }

    try {
      const user = await verifyJWT(token);
      c.set('user', user);
      logger.debug(`[Auth] User authenticated: ${user.id} (tenant: ${user.tenantId || 'none'})`);
      await next();
    } catch (error) {
      if (error instanceof AuthError) {
        return c.json(
          {
            error: 'Unauthorized',
            message: error.message,
            code: error.code,
          },
          401
        );
      }
      
      logger.error('[Auth] Unexpected error:', error);
      return c.json(
        {
          error: 'Internal Server Error',
          message: 'Authentication failed',
          code: 'AUTH_ERROR',
        },
        500
      );
    }
  }
);

/**
 * JWT-only authentication middleware (alias for authMiddleware)
 * Use this for admin endpoints that require user authentication
 */
export const jwtAuthMiddleware = authMiddleware;

/**
 * Optional authentication middleware
 * Sets user context if token is present, but doesn't require it
 */
export const optionalAuthMiddleware = createMiddleware<{ Variables: GatewayVariables }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization');
    const token = extractToken(authHeader);

    if (token) {
      try {
        const user = await verifyJWT(token);
        c.set('user', user);
      } catch {
        // Ignore auth errors for optional auth
        logger.warn('[Auth] Optional auth failed, continuing as anonymous');
      }
    }

    await next();
  }
);

/**
 * Role-based access control middleware factory
 * Creates middleware that checks if user has required roles
 */
export function requireRoles(...requiredRoles: string[]) {
  return createMiddleware<{ Variables: GatewayVariables }>(async (c, next) => {
    const user = c.get('user');

    if (!user) {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'Authentication required',
          code: 'NOT_AUTHENTICATED',
        },
        401
      );
    }

    const userRoles = user.roles || [];
    const hasRequiredRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRequiredRole) {
      return c.json(
        {
          error: 'Forbidden',
          message: `Required roles: ${requiredRoles.join(', ')}`,
          code: 'INSUFFICIENT_PERMISSIONS',
        },
        403
      );
    }

    await next();
  });
}

/**
 * Permission-based access control middleware factory
 * Creates middleware that checks if user has permission based on roles
 */
export function requirePermission(permission: string) {
  return createMiddleware<{ Variables: GatewayVariables }>(async (c, next) => {
    const user = c.get('user');

    if (!user) {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'Authentication required',
          code: 'NOT_AUTHENTICATED',
        },
        401
      );
    }

    const userRoles = user.roles || [];
    if (!isKnownPermission(permission)) {
      // Fail closed to avoid silently allowing typos in permission names.
      logger.warn(`[Auth] Unknown permission: ${permission}`);
      return c.json(
        {
          error: 'Forbidden',
          message: 'Unknown permission',
          code: 'UNKNOWN_PERMISSION',
        },
        403
      );
    }

    const hasPermission = hasPermissionFromRoles(userRoles, permission);
    if (!hasPermission) {
      return c.json(
        {
          error: 'Forbidden',
          message: `Permission denied: ${permission}`,
          code: 'INSUFFICIENT_PERMISSIONS',
        },
        403
      );
    }

    await next();
  });
}

/**
 * Check if a user has a specific permission
 * Utility function for use in route handlers
 */
export function hasPermission(userRoles: string[] | undefined, permission: string): boolean {
  return hasPermissionFromRoles(userRoles, permission);
}

/**
 * API Key authentication middleware
 * Supports two modes:
 * 1. API key + JWT (full context) — downstream apps with full user identity
 * 2. API key + User ID (lightweight) — agents with minimal user identity
 */
export const apiKeyAuthMiddleware = createMiddleware<{ Variables: GatewayVariables }>(
  async (c, next) => {
    const apiKeyHeader = c.req.header('X-Api-Key');

    if (!apiKeyHeader) {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'Missing X-Api-Key header',
          code: 'MISSING_API_KEY',
        },
        401
      );
    }

    try {
      // Verify the API key
      const result = await apiKeyService.verifyKey(apiKeyHeader);
      if (!result) {
        return c.json(
          {
            error: 'Unauthorized',
            message: 'Invalid or expired API key',
            code: 'INVALID_API_KEY',
          },
          401
        );
      }

      c.set('apiKey', result.key);

      // Mode 1: Try JWT first for full context
      const authHeader = c.req.header('Authorization');
      const token = extractToken(authHeader);

      if (token) {
        // JWT provided — verify for full user context
        try {
          const user = await verifyJWT(token);
          c.set('user', user);
          logger.debug(`[Auth] API key + JWT auth: key=${result.key.keyPrefix}... user=${user.id}`);
          await next();
          return;
        } catch (error) {
          // JWT verification failed — do not downgrade to header-based identity.
          if (error instanceof AuthError) {
            return c.json(
              {
                error: 'Unauthorized',
                message: error.message,
                code: error.code,
              },
              401
            );
          }
          throw error;
        }
      }

      // Mode 2: Fall back to X-User-Id header for lightweight identity
      const userId = c.req.header('X-User-Id');
      if (userId) {
        c.set('user', {
          id: userId,
          tenantId: result.key.tenantId || undefined,
        });
        logger.debug(`[Auth] API key + User-Id auth: key=${result.key.keyPrefix}... userId=${userId}`);
        await next();
        return;
      }

      // Neither JWT nor User-Id provided
      return c.json(
        {
          error: 'Unauthorized',
          message: 'API key requires either Authorization (JWT) or X-User-Id header',
          code: 'MISSING_USER_IDENTITY',
        },
        401
      );
    } catch (error) {
      logger.error('[Auth] API key auth error:', error);
      return c.json(
        {
          error: 'Internal Server Error',
          message: 'Authentication failed',
          code: 'AUTH_ERROR',
        },
        500
      );
    }
  }
);

/**
 * Flexible authentication middleware
 * Accepts any of: JWT, API key + JWT, API key + User ID, Agent Runtime Token (art_xxx)
 * Used for routes that need to support multiple auth methods (e.g., credentials, MCP proxy)
 *
 * Supports two input channels:
 *   1. Standard HTTP headers: Authorization, X-Api-Key, X-User-Id, X-Agent-Id
 *   2. Query parameters: _token (JWT), _api_key — for callers (e.g. CopilotKit
 *      HttpAgent) that cannot set custom HTTP headers on outbound requests.
 *
 * Auth paths (checked in order):
 *   1. Agent Runtime Token (art_xxx) — agent's "identity card"
 *   2. API key (gk_xxx) — server-to-server trust
 *   3. JWT — user identity
 */
export const flexibleAuthMiddleware = createMiddleware<{ Variables: GatewayVariables }>(
  async (c, next) => {
    // Read from headers first, fall back to query params
    const apiKeyHeader = c.req.header('X-Api-Key') || c.req.query('_api_key') || undefined;
    const authHeader = c.req.header('Authorization');
    // Accept JWT from Authorization header or _token query param
    const tokenFromHeader = extractToken(authHeader);
    const tokenFromQuery = c.req.query('_token') || undefined;

    // Resolve JWT from either source (header takes precedence)
    const token = tokenFromHeader || tokenFromQuery || null;

    // Path 0: Agent Runtime Token (art_xxx) — the agent's "identity card"
    // Detected from Authorization: Bearer art_xxx or X-Api-Key: art_xxx
    const bearerToken = tokenFromHeader || tokenFromQuery || null;
    const artCandidate = (bearerToken && bearerToken.startsWith('art_')) ? bearerToken
      : (apiKeyHeader && apiKeyHeader.startsWith('art_')) ? apiKeyHeader
      : null;

    if (artCandidate) {
      try {
        const agent = await agentService.verifyRuntimeToken(artCandidate);
        if (!agent) {
          return c.json(
            { error: 'Unauthorized', message: 'Invalid or expired agent runtime token', code: 'INVALID_ART' },
            401
          );
        }

        if (!agent.isActive) {
          return c.json(
            { error: 'Forbidden', message: 'Agent is disabled', code: 'AGENT_DISABLED' },
            403
          );
        }

        // Set agent context
        c.set('agent', agent);

        // Resolve agent owner for audit/metadata purposes only.
        // Owner identity must NOT be used for access control — that's the
        // end-user's (resolved from session token) and agent's job.
        const ownerId = agent.ownerUserId || agent.id;
        const ownerUser = await userService.getUserWithRoles(ownerId);

      const ownerContext = ownerUser
          ? {
              id: ownerUser.id,
              tenantId: ownerUser.tenantId || agent.tenantId || undefined,
              roles: ownerUser.roles || [],
            }
          : {
              id: ownerId,
              tenantId: agent.tenantId || undefined,
            };

        c.set('agentOwner', ownerContext);

        // Set `user` to a minimal agent-runtime identity so downstream
        // code that reads c.get('user') still has a value. MCP routes
        // must resolve the real end-user from the session token header.
        c.set('user', {
          id: agent.id,
          tenantId: agent.tenantId || undefined,
        });

        logger.debug(
          `[Auth] Flexible: Agent Runtime Token: agent=${agent.id} (${agent.name}), owner=${ownerContext.id} (stored as agentOwner, not user)`
        );
        await next();
        return;
      } catch (error) {
        logger.error('[Auth] Agent runtime token verification error:', error);
        return c.json(
          { error: 'Internal Server Error', message: 'Authentication failed', code: 'AUTH_ERROR' },
          500
        );
      }
    }

    // Path 1: API key present — server-to-server trust
    if (apiKeyHeader) {
      const result = await apiKeyService.verifyKey(apiKeyHeader);
      if (!result) {
        return c.json(
          {
            error: 'Unauthorized',
            message: 'Invalid or expired API key',
            code: 'INVALID_API_KEY',
          },
          401
        );
      }

      c.set('apiKey', result.key);

      // Try JWT for full user context (audit, tenant isolation, etc.)
      if (token) {
        try {
          const user = await verifyJWT(token);
          c.set('user', user);
          logger.debug(`[Auth] Flexible: API key + JWT: key=${result.key.keyPrefix}... user=${user.id}`);
        } catch (error) {
          if (error instanceof AuthError) {
            return c.json(
              { error: 'Unauthorized', message: error.message, code: error.code },
              401
            );
          }
          throw error;
        }
      } else {
        // Fall back to X-User-Id
        const userId = c.req.header('X-User-Id');
        if (userId) {
          c.set('user', {
            id: userId,
            tenantId: result.key.tenantId || undefined,
          });
          logger.debug(`[Auth] Flexible: API key + User-Id: key=${result.key.keyPrefix}... userId=${userId}`);
        } else {
          return c.json(
            {
              error: 'Unauthorized',
              message: 'API key requires either Authorization (JWT) or X-User-Id header',
              code: 'MISSING_USER_IDENTITY',
            },
            401
          );
        }
      }

      // Resolve agent context from X-Agent-Id header if provided
      const agentId = c.req.header('X-Agent-Id');
      if (agentId) {
        const agent = await agentService.getAgent(agentId);
        if (agent) {
          if (!agent.isActive) {
            return c.json(
              { error: 'Forbidden', message: 'Agent is disabled', code: 'AGENT_DISABLED' },
              403
            );
          }
          c.set('agent', agent);
          // Agent context is additive metadata; it does not replace end-user identity.
          logger.debug(`[Auth] Flexible: resolved agent ${agent.id} (${agent.name}) from X-Agent-Id`);
        }
      }

      await next();
      return;
    }

    // Path 2: No API key — JWT-only auth (from header or query param)
    if (!token) {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'Missing authentication: provide Authorization header or X-Api-Key header',
          code: 'MISSING_TOKEN',
        },
        401
      );
    }

    try {
      const user = await verifyJWT(token);
      c.set('user', user);
      logger.debug(`[Auth] Flexible: JWT user: ${user.id}`);
      await next();
    } catch (error) {
      if (error instanceof AuthError) {
        return c.json(
          { error: 'Unauthorized', message: error.message, code: error.code },
          401
        );
      }
      logger.error('[Auth] Unexpected error:', error);
      return c.json(
        { error: 'Internal Server Error', message: 'Authentication failed', code: 'AUTH_ERROR' },
        500
      );
    }
  }
);

/**
 * Scope-based access control middleware factory for API keys
 * Checks if the authenticated API key has the required scope.
 * If no API key is set (e.g., JWT-only auth), the request passes through.
 */
export function requireScope(scope: ApiKeyScope) {
  return createMiddleware<{ Variables: GatewayVariables }>(async (c, next) => {
    const apiKey = c.get('apiKey');

    // If authenticated via API key, check scope
    if (apiKey) {
      if (!apiKeyService.hasScope(apiKey, scope)) {
        return c.json(
          {
            error: 'Forbidden',
            message: `API key missing required scope: ${scope}`,
            code: 'INSUFFICIENT_SCOPE',
          },
          403
        );
      }
    }

    // JWT auth doesn't need scope checks — they have full access
    await next();
  });
}
