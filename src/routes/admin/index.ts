/**
 * Admin Routes
 * Agent registration and user management endpoints
 * Protected by JWT authentication
 */

import { Hono } from 'hono';
import type { GatewayVariables } from '../../types/index.js';
import { jwtAuthMiddleware } from '../../middleware/auth.js';
import { registerAdminAgentRoutes } from './agents.js';
import { registerAdminUserRoutes } from './users.js';

const adminRoutes = new Hono<{ Variables: GatewayVariables }>();

adminRoutes.use('/*', jwtAuthMiddleware);

registerAdminAgentRoutes(adminRoutes);
registerAdminUserRoutes(adminRoutes);

export { adminRoutes };
