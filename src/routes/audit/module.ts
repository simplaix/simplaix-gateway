/**
 * Audit log query routes
 * Provides API endpoints for querying audit logs
 */

import { Hono } from 'hono';
import type { GatewayVariables } from '../../types/index.js';
import { auditService } from '../../services/audit.service/index.js';
import { authMiddleware, requireRoles } from '../../middleware/auth.js';

const auditRoutes = new Hono<{ Variables: GatewayVariables }>();

// All audit routes require authentication
auditRoutes.use('/*', authMiddleware);

/**
 * GET /v1/audit/logs
 * Query audit logs with filtering
 */
auditRoutes.get('/logs', async (c) => {
  const user = c.get('user');
  const query = c.req.query();

  // Parse query parameters
  const options = {
    userId: query.user_id || (user.roles?.includes('admin') ? undefined : user.id),
    tenantId: query.tenant_id || user.tenantId,
    toolName: query.tool_name,
    status: query.status as 'pending' | 'confirmed' | 'rejected' | 'completed' | 'failed' | undefined,
    startDate: query.start_date ? new Date(query.start_date) : undefined,
    endDate: query.end_date ? new Date(query.end_date) : undefined,
    limit: query.limit ? parseInt(query.limit, 10) : 100,
    offset: query.offset ? parseInt(query.offset, 10) : 0,
  };

  // Non-admin users can only see their own logs
  if (!user.roles?.includes('admin')) {
    options.userId = user.id;
  }

  try {
    const logs = await auditService.getLogs(options);
    return c.json({
      data: logs,
      pagination: {
        limit: options.limit,
        offset: options.offset,
        total: logs.length, // TODO: Add total count query
      },
    });
  } catch (error) {
    console.error('[Audit] Query failed:', error);
    return c.json(
      { error: 'Failed to query audit logs' },
      500
    );
  }
});

/**
 * GET /v1/audit/logs/:id
 * Get single audit log by ID
 */
auditRoutes.get('/logs/:id', async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  try {
    const log = await auditService.getById(id);

    if (!log) {
      return c.json({ error: 'Audit log not found' }, 404);
    }

    // Check access: users can only view their own logs unless admin
    if (!user.roles?.includes('admin') && log.userId !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }

    return c.json({ data: log });
  } catch (error) {
    console.error('[Audit] Get by ID failed:', error);
    return c.json(
      { error: 'Failed to get audit log' },
      500
    );
  }
});

/**
 * GET /v1/audit/stats
 * Get audit statistics (admin only)
 */
auditRoutes.get('/stats', requireRoles('admin'), async (c) => {
  const user = c.get('user');

  try {
    // Get recent logs to compute basic stats
    const recentLogs = await auditService.getLogs({
      tenantId: user.tenantId,
      limit: 1000,
    });

    const stats = {
      total: recentLogs.length,
      byStatus: {
        pending: recentLogs.filter((l) => l.status === 'pending').length,
        completed: recentLogs.filter((l) => l.status === 'completed').length,
        failed: recentLogs.filter((l) => l.status === 'failed').length,
        confirmed: recentLogs.filter((l) => l.status === 'confirmed').length,
        rejected: recentLogs.filter((l) => l.status === 'rejected').length,
      },
      avgDuration: recentLogs.reduce((sum, l) => sum + (l.duration || 0), 0) / recentLogs.length || 0,
    };

    return c.json({ data: stats });
  } catch (error) {
    console.error('[Audit] Stats query failed:', error);
    return c.json(
      { error: 'Failed to get audit stats' },
      500
    );
  }
});

export { auditRoutes };
