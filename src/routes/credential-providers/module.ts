/**
 * Credential Provider Routes
 * Admin endpoints for managing credential providers (Google, Slack, Gateway API, etc.)
 * Protected by JWT authentication
 */

import { Hono } from 'hono';
import type { 
  GatewayVariables, 
  CreateCredentialProviderInput, 
  UpdateCredentialProviderInput,
  CredentialProvider,
} from '../../types/index.js';
import { jwtAuthMiddleware, requirePermission } from '../../middleware/auth.js';
import { credentialProviderService } from '../../services/credential-provider.service/index.js';
import { logger } from '../../utils/logger.js';
import { resolveTenantScope } from '../../modules/authz/tenant-scope.js';
import {
  mergeMaskedSecrets,
  redactCredentialProviderConfig,
} from '../../modules/security/secrets.js';
import { parseJsonBody } from '../../modules/http/request.js';

const credentialProviderRoutes = new Hono<{ Variables: GatewayVariables }>();

// All credential provider routes require JWT authentication
credentialProviderRoutes.use('/*', jwtAuthMiddleware);

function serializeProvider(provider: CredentialProvider) {
  return {
    id: provider.id,
    tenantId: provider.tenantId,
    serviceType: provider.serviceType,
    name: provider.name,
    description: provider.description,
    authType: provider.authType,
    // Never return raw provider secrets in read endpoints.
    config: redactCredentialProviderConfig(provider.config),
    isActive: provider.isActive,
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt?.toISOString(),
  };
}

/**
 * GET /v1/credential-providers
 * List all credential providers (filtered by tenant if applicable)
 */
credentialProviderRoutes.get('/', requirePermission('provider:read'), async (c) => {
  const user = c.get('user');
  const requestedTenantId = c.req.query('tenant_id') || undefined;
  const { tenantId } = resolveTenantScope(user, requestedTenantId);

  try {
    const providers = await credentialProviderService.list(tenantId);

    return c.json({
      providers: providers.map((provider) => ({
        ...serializeProvider(provider),
      })),
    });
  } catch (error) {
    logger.error('[CredentialProviders] Failed to list providers:', error);
    return c.json({ error: 'Failed to list credential providers' }, 500);
  }
});

/**
 * POST /v1/credential-providers
 * Create a new credential provider
 */
credentialProviderRoutes.post('/', requirePermission('provider:create'), async (c) => {
  const user = c.get('user');

  const parsed = await parseJsonBody<CreateCredentialProviderInput>(c);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Validate required fields
  if (!body.serviceType || typeof body.serviceType !== 'string') {
    return c.json({ error: 'Service type is required' }, 400);
  }

  if (!body.name || typeof body.name !== 'string') {
    return c.json({ error: 'Provider name is required' }, 400);
  }

  const validAuthTypes = ['oauth2', 'api_key', 'jwt', 'basic'];
  if (!body.authType || !validAuthTypes.includes(body.authType)) {
    return c.json({ error: `Auth type must be one of: ${validAuthTypes.join(', ')}` }, 400);
  }

  // Validate service type format (lowercase, alphanumeric with underscores)
  const serviceTypeRegex = /^[a-z][a-z0-9_]*$/;
  if (!serviceTypeRegex.test(body.serviceType)) {
    return c.json({ 
      error: 'Service type must start with a lowercase letter and contain only lowercase letters, numbers, and underscores' 
    }, 400);
  }

  try {
    const { tenantId } = resolveTenantScope(user, body.tenantId);
    const provider = await credentialProviderService.create({
      tenantId,
      serviceType: body.serviceType,
      name: body.name,
      description: body.description,
      authType: body.authType,
      config: body.config,
    });

    return c.json({
      success: true,
      provider: {
        ...serializeProvider(provider),
      },
    }, 201);
  } catch (error) {
    logger.error('[CredentialProviders] Failed to create provider:', error);
    if (error instanceof Error && error.message.includes('already exists')) {
      return c.json({ error: error.message }, 409);
    }
    return c.json({ error: 'Failed to create credential provider' }, 500);
  }
});

/**
 * GET /v1/credential-providers/:id
 * Get credential provider details
 */
credentialProviderRoutes.get('/:id', requirePermission('provider:read'), async (c) => {
  const providerId = c.req.param('id');
  const user = c.get('user');

  try {
    const provider = await credentialProviderService.getById(providerId);

    if (!provider) {
      return c.json({ error: 'Credential provider not found' }, 404);
    }

    const { tenantId, isAdmin } = resolveTenantScope(user);
    if (!isAdmin && provider.tenantId && tenantId && provider.tenantId !== tenantId) {
      return c.json({ error: 'Credential provider not found' }, 404);
    }

    return c.json({
      provider: serializeProvider(provider),
    });
  } catch (error) {
    logger.error('[CredentialProviders] Failed to get provider:', error);
    return c.json({ error: 'Failed to get credential provider' }, 500);
  }
});

/**
 * PUT /v1/credential-providers/:id
 * Update credential provider configuration
 */
credentialProviderRoutes.put('/:id', requirePermission('provider:update'), async (c) => {
  const providerId = c.req.param('id');

  const parsed = await parseJsonBody<UpdateCredentialProviderInput>(c);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Validate auth type if provided
  if (body.authType) {
    const validAuthTypes = ['oauth2', 'api_key', 'jwt', 'basic'];
    if (!validAuthTypes.includes(body.authType)) {
      return c.json({ error: `Auth type must be one of: ${validAuthTypes.join(', ')}` }, 400);
    }
  }

  try {
    const existing = await credentialProviderService.getById(providerId);
    if (!existing) {
      return c.json({ error: 'Credential provider not found' }, 404);
    }
    const user = c.get('user');
    const { tenantId, isAdmin } = resolveTenantScope(user);
    if (!isAdmin && existing.tenantId && tenantId && existing.tenantId !== tenantId) {
      return c.json({ error: 'Credential provider not found' }, 404);
    }

    // Preserve masked fields (e.g. "********") as existing stored secrets.
    const mergedConfig = mergeMaskedSecrets(body.config, existing.config);
    const provider = await credentialProviderService.update(providerId, {
      ...body,
      config: mergedConfig === undefined ? body.config : mergedConfig,
    });

    if (!provider) {
      return c.json({ error: 'Credential provider not found' }, 404);
    }

    return c.json({
      success: true,
      provider: serializeProvider(provider),
    });
  } catch (error) {
    logger.error('[CredentialProviders] Failed to update provider:', error);
    return c.json({ error: 'Failed to update credential provider' }, 500);
  }
});

/**
 * DELETE /v1/credential-providers/:id
 * Delete a credential provider
 */
credentialProviderRoutes.delete('/:id', requirePermission('provider:delete'), async (c) => {
  const providerId = c.req.param('id');
  const user = c.get('user');

  try {
    // Check if provider exists
    const provider = await credentialProviderService.getById(providerId);
    if (!provider) {
      return c.json({ error: 'Credential provider not found' }, 404);
    }
    const { tenantId, isAdmin } = resolveTenantScope(user);
    if (!isAdmin && provider.tenantId && tenantId && provider.tenantId !== tenantId) {
      return c.json({ error: 'Credential provider not found' }, 404);
    }

    await credentialProviderService.delete(providerId);

    return c.json({ success: true, message: 'Credential provider deleted' });
  } catch (error) {
    logger.error('[CredentialProviders] Failed to delete provider:', error);
    return c.json({ error: 'Failed to delete credential provider' }, 500);
  }
});

/**
 * GET /v1/credential-providers/by-service/:serviceType
 * Get credential provider by service type (looks up tenant-specific first, then global)
 */
credentialProviderRoutes.get('/by-service/:serviceType', requirePermission('provider:read'), async (c) => {
  const serviceType = c.req.param('serviceType');
  const user = c.get('user');
  const requestedTenantId = c.req.query('tenant_id') || undefined;
  const { tenantId } = resolveTenantScope(user, requestedTenantId);

  try {
    const provider = await credentialProviderService.getByServiceType(serviceType, tenantId);

    if (!provider) {
      return c.json({ error: `Credential provider for service '${serviceType}' not found` }, 404);
    }

    return c.json({
      provider: serializeProvider(provider),
    });
  } catch (error) {
    logger.error('[CredentialProviders] Failed to get provider by service type:', error);
    return c.json({ error: 'Failed to get credential provider' }, 500);
  }
});

export { credentialProviderRoutes };
