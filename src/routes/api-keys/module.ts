/**
 * API Key Management Routes
 * Admin endpoints for creating, listing, and revoking Gateway API keys (gk_)
 * Protected by JWT authentication (admin/tenant_admin roles)
 */

import { Hono } from 'hono';
import type { GatewayVariables, CreateApiKeyInput, ApiKeyScope } from '../../types/index.js';
import { jwtAuthMiddleware, requireRoles } from '../../middleware/auth.js';
import { apiKeyService } from '../../services/api-key.service/index.js';
import { resolveTenantScope } from '../../modules/authz/tenant-scope.js';

const apiKeyRoutes = new Hono<{ Variables: GatewayVariables }>();

// All API key management routes require JWT authentication
apiKeyRoutes.use('/*', jwtAuthMiddleware);

// Require admin or tenant_admin role
apiKeyRoutes.use('/*', requireRoles('admin', 'tenant_admin'));

/**
 * POST /v1/admin/api-keys
 * Create a new API key
 * The full key is only returned once — store it securely!
 */
apiKeyRoutes.post('/', async (c) => {
  const user = c.get('user');

  let body: {
    name: string;
    scopes?: ApiKeyScope[];
    tenantId?: string;
    expiresAt?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  // Validate required fields
  if (!body.name || typeof body.name !== 'string') {
    return c.json({ error: 'API key name is required' }, 400);
  }

  // Validate scopes if provided
  const validScopes: ApiKeyScope[] = ['credentials:resolve', 'credentials:read', 'credentials:write'];
  if (body.scopes) {
    for (const scope of body.scopes) {
      if (!validScopes.includes(scope)) {
        return c.json({ error: `Invalid scope: ${scope}. Valid scopes: ${validScopes.join(', ')}` }, 400);
      }
    }
  }

  try {
    const { tenantId } = resolveTenantScope(user, body.tenantId);
    // Scope tenant at creation time so tenant_admin cannot create cross-tenant keys.
    const input: CreateApiKeyInput = {
      name: body.name,
      scopes: body.scopes,
      tenantId,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    };

    const { key, record } = await apiKeyService.createKey(input, user.id);

    return c.json({
      success: true,
      message: 'API key created. Store this key securely — it will not be shown again!',
      key, // Full key, only shown once
      keyRecord: {
        id: record.id,
        keyPrefix: record.keyPrefix,
        name: record.name,
        scopes: record.scopes,
        createdBy: record.createdBy,
        tenantId: record.tenantId,
        isActive: record.isActive,
        createdAt: record.createdAt.toISOString(),
        expiresAt: record.expiresAt?.toISOString() || null,
      },
    }, 201);
  } catch (error) {
    console.error('[Admin] Failed to create API key:', error);
    return c.json({ error: 'Failed to create API key' }, 500);
  }
});

/**
 * GET /v1/admin/api-keys
 * List API keys (metadata only, no key values)
 */
apiKeyRoutes.get('/', async (c) => {
  const user = c.get('user');
  const userRoles = user.roles || [];

  try {
    // Admin can see all keys, tenant_admin only sees own tenant's keys
    let keys;
    if (userRoles.includes('admin')) {
      keys = await apiKeyService.listKeys();
    } else {
      keys = await apiKeyService.listKeys(undefined, user.tenantId);
    }

    return c.json({
      keys: keys.map((k) => ({
        id: k.id,
        keyPrefix: k.keyPrefix,
        name: k.name,
        scopes: k.scopes,
        createdBy: k.createdBy,
        tenantId: k.tenantId,
        isActive: k.isActive,
        createdAt: k.createdAt.toISOString(),
        expiresAt: k.expiresAt?.toISOString() || null,
        lastUsedAt: k.lastUsedAt?.toISOString() || null,
      })),
      count: keys.length,
    });
  } catch (error) {
    console.error('[Admin] Failed to list API keys:', error);
    return c.json({ error: 'Failed to list API keys' }, 500);
  }
});

/**
 * DELETE /v1/admin/api-keys/:id
 * Revoke an API key
 */
apiKeyRoutes.delete('/:id', async (c) => {
  const keyId = c.req.param('id');
  const user = c.get('user');

  try {
    // Verify the key exists
    const key = await apiKeyService.getKeyById(keyId);
    if (!key) {
      return c.json({ error: 'API key not found' }, 404);
    }

    // Tenant isolation: non-admin can only revoke keys in their own tenant
    const userRoles = user.roles || [];
    if (!userRoles.includes('admin') && key.tenantId && user.tenantId && key.tenantId !== user.tenantId) {
      return c.json({ error: 'API key not found' }, 404);
    }

    await apiKeyService.revokeKey(keyId);

    return c.json({ success: true, message: 'API key revoked' });
  } catch (error) {
    console.error('[Admin] Failed to revoke API key:', error);
    return c.json({ error: 'Failed to revoke API key' }, 500);
  }
});

export { apiKeyRoutes };
