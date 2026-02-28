import { Hono } from 'hono';
import type { GatewayVariables } from '../../types/index.js';
import { flexibleAuthMiddleware } from '../../middleware/auth.js';
import { handleEvaluate, handleAudit } from './module.js';

const toolGateRoutes = new Hono<{ Variables: GatewayVariables }>();

toolGateRoutes.use('/*', flexibleAuthMiddleware);

toolGateRoutes.post('/evaluate', handleEvaluate);
toolGateRoutes.post('/audit', handleAudit);

export { toolGateRoutes };
