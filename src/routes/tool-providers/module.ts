/**
 * Tool Provider Routes
 * Admin endpoints for managing tool providers (MCP server routing)
 * Protected by JWT authentication
 */

import { Hono } from 'hono';
import type { GatewayVariables } from '../../types/index.js';
import { jwtAuthMiddleware, requirePermission } from '../../middleware/auth.js';
import { toolProviderService } from '../../services/tool-provider.service/index.js';
import { toolAggregationService } from '../../services/tool-aggregation.service/index.js';
import { resolveTenantScope } from '../../modules/authz/tenant-scope.js';

const toolProviderRoutes = new Hono<{ Variables: GatewayVariables }>();

// All tool provider routes require JWT authentication
toolProviderRoutes.use('/*', jwtAuthMiddleware);

/**
 * GET /v1/admin/tool-providers
 * List all tool providers (filtered by tenant if applicable)
 */
toolProviderRoutes.get('/', async (c) => {
  const user = c.get('user');
  const requestedTenantId = c.req.query('tenant_id') || undefined;
  const { tenantId } = resolveTenantScope(user, requestedTenantId);

  try {
    const providers = await toolProviderService.listProviders(tenantId);

    return c.json({
      providers: providers.map((provider) => ({
        id: provider.id,
        tenantId: provider.tenantId,
        name: provider.name,
        pattern: provider.pattern,
        endpoint: provider.endpoint,
        authType: provider.authType,
        isActive: provider.isActive,
        priority: provider.priority,
        description: provider.description,
        createdAt: provider.createdAt.toISOString(),
        updatedAt: provider.updatedAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[ToolProviders] Failed to list providers:', error);
    return c.json({ error: 'Failed to list tool providers' }, 500);
  }
});

/**
 * POST /v1/admin/tool-providers
 * Create a new tool provider
 */
toolProviderRoutes.post('/', requirePermission('provider:create'), async (c) => {
  const user = c.get('user');

  let body: {
    tenantId?: string;
    name: string;
    pattern: string;
    endpoint: string;
    authType?: 'bearer' | 'api_key' | 'none';
    authSecret?: string;
    priority?: number;
    description?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.name || typeof body.name !== 'string') {
    return c.json({ error: 'Provider name is required' }, 400);
  }

  if (!body.pattern || typeof body.pattern !== 'string') {
    return c.json({ error: 'Pattern is required' }, 400);
  }

  if (!body.endpoint || typeof body.endpoint !== 'string') {
    return c.json({ error: 'Endpoint is required' }, 400);
  }

  if (body.authType) {
    const validAuthTypes = ['bearer', 'api_key', 'none'];
    if (!validAuthTypes.includes(body.authType)) {
      return c.json({ error: `Auth type must be one of: ${validAuthTypes.join(', ')}` }, 400);
    }
  }

  try {
    const { tenantId } = resolveTenantScope(user, body.tenantId);
    const provider = await toolProviderService.createProvider({
      tenantId,
      name: body.name,
      pattern: body.pattern,
      endpoint: body.endpoint,
      authType: body.authType,
      authSecret: body.authSecret,
      priority: body.priority,
      description: body.description,
    });

    return c.json({
      success: true,
      provider: {
        id: provider.id,
        tenantId: provider.tenantId,
        name: provider.name,
        pattern: provider.pattern,
        endpoint: provider.endpoint,
        authType: provider.authType,
        isActive: provider.isActive,
        priority: provider.priority,
        description: provider.description,
        createdAt: provider.createdAt.toISOString(),
      },
    }, 201);
  } catch (error) {
    console.error('[ToolProviders] Failed to create provider:', error);
    if (error instanceof Error && error.message.includes('already exists')) {
      return c.json({ error: error.message }, 409);
    }
    return c.json({ error: 'Failed to create tool provider' }, 500);
  }
});

/**
 * GET /v1/admin/tool-providers/:id/tools
 * Fetch the list of tools from an upstream provider via MCP tools/list.
 */
toolProviderRoutes.get('/:id/tools', async (c) => {
  const user = c.get('user');
  const providerId = c.req.param('id');

  try {
    const provider = await toolProviderService.getProvider(providerId);
    if (!provider) {
      return c.json({ error: 'Tool provider not found' }, 404);
    }
    const { tenantId, isAdmin } = resolveTenantScope(user);
    // Return not found on cross-tenant access to avoid provider existence disclosure.
    if (!isAdmin && provider.tenantId && tenantId && provider.tenantId !== tenantId) {
      return c.json({ error: 'Tool provider not found' }, 404);
    }

    const tools = await toolAggregationService.fetchToolsForProvider(provider);

    return c.json({
      providerId: provider.id,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description || null,
      })),
    });
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error('[ToolProviders] Failed to fetch tools for provider:', msg);
    return c.json({ error: `Failed to fetch tools from provider: ${msg}` }, 502);
  }
});

/**
 * GET /v1/admin/tool-providers/:id
 * Get tool provider details
 */
toolProviderRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const providerId = c.req.param('id');

  try {
    const provider = await toolProviderService.getProvider(providerId);

    if (!provider) {
      return c.json({ error: 'Tool provider not found' }, 404);
    }
    const { tenantId, isAdmin } = resolveTenantScope(user);
    // Return not found on cross-tenant access to avoid provider existence disclosure.
    if (!isAdmin && provider.tenantId && tenantId && provider.tenantId !== tenantId) {
      return c.json({ error: 'Tool provider not found' }, 404);
    }

    return c.json({
      provider: {
        id: provider.id,
        tenantId: provider.tenantId,
        name: provider.name,
        pattern: provider.pattern,
        endpoint: provider.endpoint,
        authType: provider.authType,
        isActive: provider.isActive,
        priority: provider.priority,
        description: provider.description,
        createdAt: provider.createdAt.toISOString(),
        updatedAt: provider.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('[ToolProviders] Failed to get provider:', error);
    return c.json({ error: 'Failed to get tool provider' }, 500);
  }
});

/**
 * PUT /v1/admin/tool-providers/:id
 * Update tool provider configuration
 */
toolProviderRoutes.put('/:id', requirePermission('provider:update'), async (c) => {
  const user = c.get('user');
  const providerId = c.req.param('id');

  let body: Partial<{
    name: string;
    pattern: string;
    endpoint: string;
    authType: 'bearer' | 'api_key' | 'none';
    authSecret: string | null;
    isActive: boolean;
    priority: number;
    description: string | null;
  }>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (body.authType) {
    const validAuthTypes = ['bearer', 'api_key', 'none'];
    if (!validAuthTypes.includes(body.authType)) {
      return c.json({ error: `Auth type must be one of: ${validAuthTypes.join(', ')}` }, 400);
    }
  }

  try {
    const existing = await toolProviderService.getProvider(providerId);
    if (!existing) {
      return c.json({ error: 'Tool provider not found' }, 404);
    }
    const { tenantId, isAdmin } = resolveTenantScope(user);
    // Return not found on cross-tenant access to avoid provider existence disclosure.
    if (!isAdmin && existing.tenantId && tenantId && existing.tenantId !== tenantId) {
      return c.json({ error: 'Tool provider not found' }, 404);
    }

    const provider = await toolProviderService.updateProvider(providerId, body);

    if (!provider) {
      return c.json({ error: 'Tool provider not found' }, 404);
    }

    return c.json({
      success: true,
      provider: {
        id: provider.id,
        tenantId: provider.tenantId,
        name: provider.name,
        pattern: provider.pattern,
        endpoint: provider.endpoint,
        authType: provider.authType,
        isActive: provider.isActive,
        priority: provider.priority,
        description: provider.description,
        createdAt: provider.createdAt.toISOString(),
        updatedAt: provider.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('[ToolProviders] Failed to update provider:', error);
    return c.json({ error: 'Failed to update tool provider' }, 500);
  }
});

/**
 * DELETE /v1/admin/tool-providers/:id
 * Delete a tool provider
 */
toolProviderRoutes.delete('/:id', requirePermission('provider:delete'), async (c) => {
  const user = c.get('user');
  const providerId = c.req.param('id');

  try {
    const provider = await toolProviderService.getProvider(providerId);
    if (!provider) {
      return c.json({ error: 'Tool provider not found' }, 404);
    }
    const { tenantId, isAdmin } = resolveTenantScope(user);
    // Return not found on cross-tenant access to avoid provider existence disclosure.
    if (!isAdmin && provider.tenantId && tenantId && provider.tenantId !== tenantId) {
      return c.json({ error: 'Tool provider not found' }, 404);
    }

    await toolProviderService.deleteProvider(providerId);

    return c.json({ success: true, message: 'Tool provider deleted' });
  } catch (error) {
    console.error('[ToolProviders] Failed to delete provider:', error);
    return c.json({ error: 'Failed to delete tool provider' }, 500);
  }
});

export { toolProviderRoutes };
