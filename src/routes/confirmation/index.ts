/**
 * Confirmation response routes
 * Handles user confirmation/rejection of pending requests
 */

import { Hono } from 'hono';
import type { GatewayVariables } from '../../types/index.js';
import { flexibleAuthMiddleware } from '../../middleware/auth.js';
import { registerConfirmationListingRoutes } from './listing.js';
import { registerConfirmationResponseRoutes } from './respond.js';

const confirmationRoutes = new Hono<{ Variables: GatewayVariables }>();

confirmationRoutes.use('/*', flexibleAuthMiddleware);

registerConfirmationListingRoutes(confirmationRoutes);
registerConfirmationResponseRoutes(confirmationRoutes);

export { confirmationRoutes };
