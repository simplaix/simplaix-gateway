/**
 * User Credential Routes
 * User-facing endpoints for managing their credentials for external services
 * Protected by JWT authentication
 */

import { Hono } from 'hono';
import type { GatewayVariables, StoreCredentialInput } from '../../types/index.js';
import { flexibleAuthMiddleware, requireScope } from '../../middleware/auth.js';
import { credentialService } from '../../services/credential.service/index.js';
import { credentialProviderService } from '../../services/credential-provider.service/index.js';

const credentialRoutes = new Hono<{ Variables: GatewayVariables }>();

// All credential routes require authentication (JWT, agent token, or API key)
credentialRoutes.use('/*', flexibleAuthMiddleware);

/**
 * GET /v1/credentials
 * List current user's credentials
 */
credentialRoutes.get('/', async (c) => {
  const user = c.get('user');

  try {
    const credentials = await credentialService.listUserCredentials(user.id);

    return c.json({
      credentials: credentials.map((cred) => ({
        id: cred.id,
        serviceType: cred.serviceType,
        providerName: cred.providerName,
        scopes: cred.scopes,
        expiresAt: cred.expiresAt?.toISOString(),
        hasRefreshToken: cred.hasRefreshToken,
        createdAt: cred.createdAt.toISOString(),
        updatedAt: cred.updatedAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[Credentials] Failed to list credentials:', error);
    return c.json({ error: 'Failed to list credentials' }, 500);
  }
});

/**
 * DELETE /v1/credentials/:id
 * Delete a credential
 */
credentialRoutes.delete('/:id', async (c) => {
  const credentialId = c.req.param('id');
  const user = c.get('user');

  try {
    // Verify the credential belongs to the user
    const credential = await credentialService.getById(credentialId);
    if (!credential) {
      return c.json({ error: 'Credential not found' }, 404);
    }

    if (credential.userId !== user.id) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    await credentialService.deleteCredential(credentialId);

    return c.json({ success: true, message: 'Credential deleted' });
  } catch (error) {
    console.error('[Credentials] Failed to delete credential:', error);
    return c.json({ error: 'Failed to delete credential' }, 500);
  }
});

/**
 * POST /v1/credentials/jwt
 * Add a JWT credential (e.g., for Gateway API)
 */
credentialRoutes.post('/jwt', async (c) => {
  const user = c.get('user');

  let body: {
    serviceType: string;
    token: string;
    expiresAt?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  // Validate required fields
  if (!body.serviceType || typeof body.serviceType !== 'string') {
    return c.json({ error: 'Service type is required' }, 400);
  }

  if (!body.token || typeof body.token !== 'string') {
    return c.json({ error: 'Token is required' }, 400);
  }

  try {
    // Find the provider
    const provider = await credentialProviderService.getByServiceType(body.serviceType, user.tenantId);
    if (!provider) {
      return c.json({ error: `No credential provider configured for service '${body.serviceType}'` }, 404);
    }

    // Verify auth type matches
    if (provider.authType !== 'jwt') {
      return c.json({ error: `Service '${body.serviceType}' does not use JWT authentication` }, 400);
    }

    // Store the credential
    const credential = await credentialService.storeCredential({
      userId: user.id,
      providerId: provider.id,
      credentials: { token: body.token },
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });

    return c.json({
      success: true,
      credential: {
        id: credential.id,
        serviceType: credential.serviceType,
        providerName: credential.providerName,
        expiresAt: credential.expiresAt?.toISOString(),
        createdAt: credential.createdAt.toISOString(),
      },
    }, 201);
  } catch (error) {
    console.error('[Credentials] Failed to store JWT credential:', error);
    return c.json({ error: 'Failed to store credential' }, 500);
  }
});

/**
 * POST /v1/credentials/apikey
 * Add an API key credential
 */
credentialRoutes.post('/apikey', async (c) => {
  const user = c.get('user');

  let body: {
    serviceType: string;
    apiKey: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  // Validate required fields
  if (!body.serviceType || typeof body.serviceType !== 'string') {
    return c.json({ error: 'Service type is required' }, 400);
  }

  if (!body.apiKey || typeof body.apiKey !== 'string') {
    return c.json({ error: 'API key is required' }, 400);
  }

  try {
    // Find the provider
    const provider = await credentialProviderService.getByServiceType(body.serviceType, user.tenantId);
    if (!provider) {
      return c.json({ error: `No credential provider configured for service '${body.serviceType}'` }, 404);
    }

    // Verify auth type matches
    if (provider.authType !== 'api_key') {
      return c.json({ error: `Service '${body.serviceType}' does not use API key authentication` }, 400);
    }

    // Store the credential
    const credential = await credentialService.storeCredential({
      userId: user.id,
      providerId: provider.id,
      credentials: { apiKey: body.apiKey },
    });

    return c.json({
      success: true,
      credential: {
        id: credential.id,
        serviceType: credential.serviceType,
        providerName: credential.providerName,
        createdAt: credential.createdAt.toISOString(),
      },
    }, 201);
  } catch (error) {
    console.error('[Credentials] Failed to store API key credential:', error);
    return c.json({ error: 'Failed to store credential' }, 500);
  }
});

/**
 * GET /v1/credentials/oauth/:serviceType/auth
 * Get OAuth authorization URL
 * Placeholder for future OAuth implementation
 */
credentialRoutes.get('/oauth/:serviceType/auth', async (c) => {
  const serviceType = c.req.param('serviceType');
  const user = c.get('user');
  const redirectUrl = c.req.query('redirect_url');

  try {
    // Find the provider
    const provider = await credentialProviderService.getByServiceType(serviceType, user.tenantId);
    if (!provider) {
      return c.json({ error: `No credential provider configured for service '${serviceType}'` }, 404);
    }

    // Verify auth type is OAuth
    if (provider.authType !== 'oauth2') {
      return c.json({ error: `Service '${serviceType}' does not use OAuth authentication` }, 400);
    }

    // Get OAuth config
    const oauthConfig = provider.config?.oauth2;
    if (!oauthConfig) {
      return c.json({ error: 'OAuth configuration not found for this provider' }, 500);
    }

    // TODO: Generate proper OAuth authorization URL with state parameter
    // For now, return a placeholder response
    return c.json({
      error: 'OAuth flow not yet implemented',
      message: 'Please configure OAuth credentials manually or wait for OAuth support',
      provider: {
        serviceType: provider.serviceType,
        name: provider.name,
        authorizationUrl: oauthConfig.authorizationUrl,
      },
    }, 501);
  } catch (error) {
    console.error('[Credentials] Failed to get OAuth auth URL:', error);
    return c.json({ error: 'Failed to get authorization URL' }, 500);
  }
});

/**
 * GET /v1/credentials/oauth/:serviceType/callback
 * OAuth callback endpoint
 * Placeholder for future OAuth implementation
 */
credentialRoutes.get('/oauth/:serviceType/callback', async (c) => {
  const serviceType = c.req.param('serviceType');
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  if (error) {
    return c.json({ error: `OAuth error: ${error}` }, 400);
  }

  // TODO: Implement OAuth callback
  // 1. Verify state parameter
  // 2. Exchange code for tokens
  // 3. Store tokens in credential vault
  // 4. Redirect back to originating app

  return c.json({
    error: 'OAuth callback not yet implemented',
    params: { serviceType, code: code ? '***' : undefined, state },
  }, 501);
});

/**
 * POST /v1/credentials/resolve
 * Resolve credentials for service types
 * Internal API for SDK and MCP proxy
 * Requires credentials:resolve scope when accessed via API key
 */
credentialRoutes.post('/resolve', requireScope('credentials:resolve'), async (c) => {
  const user = c.get('user');

  let body: {
    serviceTypes: string[];
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  // Validate required fields
  if (!body.serviceTypes || !Array.isArray(body.serviceTypes) || body.serviceTypes.length === 0) {
    return c.json({ error: 'Service types array is required' }, 400);
  }

  try {
    const result = await credentialService.resolveCredentials(
      user.id,
      body.serviceTypes,
      user.tenantId
    );

    return c.json(result);
  } catch (error) {
    console.error('[Credentials] Failed to resolve credentials:', error);
    return c.json({ error: 'Failed to resolve credentials' }, 500);
  }
});

/**
 * GET /v1/credentials/check/:serviceType
 * Check if user has a credential for a service type
 * Requires credentials:resolve scope when accessed via API key
 */
credentialRoutes.get('/check/:serviceType', requireScope('credentials:resolve'), async (c) => {
  const serviceType = c.req.param('serviceType');
  const user = c.get('user');

  try {
    const result = await credentialService.getUserCredentialByServiceType(
      user.id,
      serviceType,
      user.tenantId
    );

    if (result) {
      return c.json({
        hasCredential: true,
        credential: {
          id: result.credential.id,
          serviceType: result.credential.serviceType,
          providerName: result.credential.providerName,
          expiresAt: result.credential.expiresAt?.toISOString(),
          isExpired: result.credential.expiresAt 
            ? result.credential.expiresAt < new Date() 
            : false,
        },
      });
    } else {
      // Get provider info for auth URL
      const provider = await credentialProviderService.getByServiceType(serviceType, user.tenantId);
      
      return c.json({
        hasCredential: false,
        authUrl: provider
          ? (provider.config?.connectUrl || `/auth/connect?service=${serviceType}`)
          : null,
        provider: provider ? {
          name: provider.name,
          authType: provider.authType,
        } : null,
      });
    }
  } catch (error) {
    console.error('[Credentials] Failed to check credential:', error);
    return c.json({ error: 'Failed to check credential' }, 500);
  }
});

export { credentialRoutes };
