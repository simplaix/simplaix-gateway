import { Hono } from 'hono';
import type { GatewayVariables } from '../../types/index.js';
import { flexibleAuthMiddleware } from '../../middleware/auth.js';
import { registerDeviceRoutes } from './devices.js';

const notificationRoutes = new Hono<{ Variables: GatewayVariables }>();

notificationRoutes.use('/*', flexibleAuthMiddleware);

registerDeviceRoutes(notificationRoutes);

export { notificationRoutes };
