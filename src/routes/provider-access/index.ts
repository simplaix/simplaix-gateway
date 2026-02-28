/**
 * Provider Access Routes
 * Admin endpoints for managing provider access rules (ACL) and tool-level policies
 * Protected by JWT authentication + provider permissions
 */

import { Hono } from 'hono';
import type { GatewayVariables } from '../../types/index.js';
import { jwtAuthMiddleware } from '../../middleware/auth.js';
import { registerProviderAccessRuleRoutes } from './rules.js';
import { registerProviderAccessAgentRoutes } from './agent-rules.js';

const providerAccessRoutes = new Hono<{ Variables: GatewayVariables }>();

providerAccessRoutes.use('/*', jwtAuthMiddleware);

registerProviderAccessRuleRoutes(providerAccessRoutes);
registerProviderAccessAgentRoutes(providerAccessRoutes);

export { providerAccessRoutes };
