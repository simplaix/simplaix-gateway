/**
 * Simplaix Gateway - MCP Gateway with Identity, Confirmation, and Audit
 * 
 * A lightweight gateway that provides:
 * - Virtual Agent Identity management (registration, routing)
 * - Identity verification (JWT/OIDC and API Keys)
 * - Policy-based access control
 * - Human-in-the-loop confirmation for sensitive operations
 * - Comprehensive audit logging
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { handle } from 'hono/vercel';

import type { GatewayVariables } from './types/index.js';
import { initializeDatabase } from './db/index.js';
import { requestLoggerMiddleware } from './middleware/audit.js';
import { mcpProxyService } from './services/mcp-proxy.service/index.js';
import { requestPauser } from './services/pauser.service/index.js';

// Import routes
import { streamRoutes } from './routes/stream/index.js';
import { confirmationRoutes } from './routes/confirmation/index.js';
import { auditRoutes } from './routes/audit/index.js';
import { adminRoutes } from './routes/admin/index.js';
import { agentRoutes } from './routes/agent/index.js';
import { authRoutes } from './routes/auth/index.js';
import { credentialRoutes } from './routes/credentials/index.js';
import { credentialProviderRoutes } from './routes/credential-providers/index.js';
import { apiKeyRoutes } from './routes/api-keys/index.js';
import { toolProviderRoutes } from './routes/tool-providers/index.js';
import { providerAccessRoutes } from './routes/provider-access/index.js';
import { mcpProxyRoutes } from './routes/mcp-proxy/index.js';
import { mcpUnifiedRoutes } from './routes/mcp-unified/index.js';
import { mcpServerRoutes } from './mcp/index.js';
import { notificationRoutes } from './routes/notification/index.js';
import { toolGateRoutes } from './routes/tool-gate/index.js';

// Import services for initialization
import { userService } from './services/user.service/index.js';
import { notificationDispatcher } from './services/notification.service/index.js';
import { seedGatewaySelfProvider } from './services/tool-provider.service/index.js';
import { getConfig } from './config.js';

// Initialize database and admin user on cold start
let dbInitialized = false;
async function ensureDbInitialized() {
  if (!dbInitialized) {
    console.log('[Gateway] Initializing database...');
    await initializeDatabase();
    
    // Create initial admin user if configured
    const config = getConfig();
    if (config.adminEmail && config.adminPassword) {
      await userService.ensureInitialAdmin(config.adminEmail, config.adminPassword);
    }

    // Seed built-in gateway management provider
    await seedGatewaySelfProvider();

    // Start push notification dispatcher
    notificationDispatcher.init();

    dbInitialized = true;
  }
}

// Create main app
const app = new Hono<{ Variables: GatewayVariables }>().basePath('/api');

// Global middleware
app.use('*', cors({
  origin: '*', // Configure this for production
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Api-Key', 'X-User-Id'],
  exposeHeaders: ['X-Request-Id'],
  credentials: true,
}));

app.use('*', logger());
app.use('*', requestLoggerMiddleware);

// Initialize database middleware
app.use('*', async (c, next) => {
  await ensureDbInitialized();
  await next();
});

// Health check endpoint
app.get('/health', async (c) => {
  const mcpHealth = await mcpProxyService.healthCheck();
  
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    services: {
      gateway: 'healthy',
      mcp: mcpHealth.healthy ? 'healthy' : 'unhealthy',
    },
    metrics: {
      pendingConfirmations: requestPauser.pendingCount,
      mcpLatency: mcpHealth.latency,
    },
  });
});

// API info endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Simplaix Gateway',
    version: '0.2.0',
    description: 'MCP Gateway with Virtual Agent Identity, Confirmation, and Audit capabilities',
    authentication: {
      jwt: 'Authorization: Bearer <jwt> (for admin operations and agent invocation)',
      apiKey: 'X-Api-Key: gk_xxx + X-User-Id or JWT (for server-to-server / MCP proxy)',
    },
    endpoints: {
      health: 'GET /api/health',
      auth: {
        verifyCredentials: 'POST /api/v1/auth/verify-credentials',
        me: 'GET /api/v1/auth/me',
        updateProfile: 'PUT /api/v1/auth/me',
        changePassword: 'POST /api/v1/auth/change-password',
        note: 'JWT issuance (login/refresh) is handled by gateway-app',
      },
      stream: 'GET /api/v1/stream',
      mcp: {
        note: 'Tool calls go through the MCP proxy with full audit logging',
        proxy: 'POST /api/v1/mcp-proxy/:providerId/mcp',
        proxySSE: 'GET /api/v1/mcp-proxy/:providerId/mcp',
        proxyTerminate: 'DELETE /api/v1/mcp-proxy/:providerId/mcp',
      },
      admin: {
        agents: {
          create: 'POST /api/v1/admin/agents',
          list: 'GET /api/v1/admin/agents',
          get: 'GET /api/v1/admin/agents/:id',
          update: 'PUT /api/v1/admin/agents/:id',
          delete: 'DELETE /api/v1/admin/agents/:id',
          disable: 'POST /api/v1/admin/agents/:id/disable',
          enable: 'POST /api/v1/admin/agents/:id/enable',
        },
      },
      confirmation: {
        respond: 'POST /api/v1/confirmation/:id/respond',
        confirm: 'POST /api/v1/confirmation/:id/confirm',
        reject: 'POST /api/v1/confirmation/:id/reject',
        get: 'GET /api/v1/confirmation/:id',
      },
      audit: {
        logs: 'GET /api/v1/audit/logs',
        logById: 'GET /api/v1/audit/logs/:id',
        stats: 'GET /api/v1/audit/stats',
      },
      agents: {
        invoke: 'POST /api/v1/agents/:agentId/invoke',
        get: 'GET /api/v1/agents/:agentId',
      },
      apiKeys: {
        create: 'POST /api/v1/admin/api-keys',
        list: 'GET /api/v1/admin/api-keys',
        revoke: 'DELETE /api/v1/admin/api-keys/:id',
      },
      credentials: {
        list: 'GET /api/v1/credentials',
        delete: 'DELETE /api/v1/credentials/:id',
        addJwt: 'POST /api/v1/credentials/jwt',
        addApiKey: 'POST /api/v1/credentials/apikey',
        oauthAuth: 'GET /api/v1/credentials/oauth/:serviceType/auth',
        oauthCallback: 'GET /api/v1/credentials/oauth/:serviceType/callback',
        resolve: 'POST /api/v1/credentials/resolve',
        check: 'GET /api/v1/credentials/check/:serviceType',
      },
      credentialProviders: {
        list: 'GET /api/v1/credential-providers',
        create: 'POST /api/v1/credential-providers',
        get: 'GET /api/v1/credential-providers/:id',
        update: 'PUT /api/v1/credential-providers/:id',
        delete: 'DELETE /api/v1/credential-providers/:id',
        getByService: 'GET /api/v1/credential-providers/by-service/:serviceType',
      },
      toolProviders: {
        list: 'GET /api/v1/admin/tool-providers',
        create: 'POST /api/v1/admin/tool-providers',
        get: 'GET /api/v1/admin/tool-providers/:id',
        update: 'PUT /api/v1/admin/tool-providers/:id',
        delete: 'DELETE /api/v1/admin/tool-providers/:id',
      },
      providerAccess: {
        list: 'GET /api/v1/admin/provider-access',
        create: 'POST /api/v1/admin/provider-access',
        get: 'GET /api/v1/admin/provider-access/:id',
        delete: 'DELETE /api/v1/admin/provider-access/:id',
      },
      mcpServer: {
        endpoint: 'ALL /api/v1/mcp-server/mcp',
        health: 'GET /api/v1/mcp-server/health',
      },
      notifications: {
        registerDevice: 'POST /api/v1/notifications/devices',
        listDevices: 'GET /api/v1/notifications/devices',
        removeDevice: 'DELETE /api/v1/notifications/devices/:id',
      },
    },
  });
});

// Mount routes
app.route('/v1/auth', authRoutes);
app.route('/v1/stream', streamRoutes);
app.route('/v1/confirmation', confirmationRoutes);
app.route('/v1/audit', auditRoutes);
app.route('/v1/admin', adminRoutes);
app.route('/v1/agents', agentRoutes);
app.route('/v1/credentials', credentialRoutes);
app.route('/v1/credential-providers', credentialProviderRoutes);
app.route('/v1/admin/api-keys', apiKeyRoutes);
app.route('/v1/admin/tool-providers', toolProviderRoutes);
app.route('/v1/admin/provider-access', providerAccessRoutes);
app.route('/v1/mcp', mcpUnifiedRoutes);
app.route('/v1/mcp-proxy', mcpProxyRoutes);
app.route('/v1/mcp-server', mcpServerRoutes);
app.route('/v1/notifications', notificationRoutes);
app.route('/v1/tool-gate', toolGateRoutes);

// Error handler
app.onError((err, c) => {
  console.error('[Error]', err);
  return c.json(
    {
      error: 'Internal Server Error',
      message: err.message,
    },
    500
  );
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: 'Not Found',
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
    404
  );
});

// Export for Vercel
export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);

export default app;
