/**
 * HTTP request logger middleware.
 * Tool-level auditing is handled directly in route/service layers.
 */

import { createMiddleware } from 'hono/factory';
import { logger } from '../utils/logger.js';

/**
 * Simple request logger middleware
 * Logs all HTTP requests (not just tool calls)
 */
export const requestLoggerMiddleware = createMiddleware(async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  // Log after downstream handling so we capture final status and total latency.
  const duration = Date.now() - start;
  const status = c.res.status;
  
  logger.info(`[HTTP] ${method} ${path} ${status} ${duration}ms`);
});
