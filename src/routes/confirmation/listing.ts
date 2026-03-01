import type { Hono } from 'hono';
import type { GatewayVariables } from '../../types/index.js';
import { requestPauser } from '../../services/pauser.service/index.js';
import { auditService } from '../../services/audit.service/index.js';
import {
  canAccessConfirmation,
  formatDbConfirmation,
  parseConfirmationStatusFilter,
  parseJsonArguments,
} from './shared.js';

export function registerConfirmationListingRoutes(
  confirmationRoutes: Hono<{ Variables: GatewayVariables }>
) {
  confirmationRoutes.get('/list', async (c) => {
    const user = c.get('user');
    const statusFilter = parseConfirmationStatusFilter(c.req.query('status') || undefined);
    const isAdmin = user.roles?.includes('admin');

    const rows = await auditService.listConfirmations({
      status: statusFilter,
      userId: isAdmin ? undefined : user.id,
      tenantId: user.tenantId,
    });

    const confirmations = rows.map((r) => ({
      id: r.id,
      requestId: r.requestId,
      userId: r.userId,
      tenantId: r.tenantId,
      toolName: r.toolName,
      arguments: parseJsonArguments(r.arguments),
      risk: r.risk,
      status: r.status,
      confirmedBy: r.confirmedBy,
      reason: r.reason,
      providerId: r.providerId,
      agentId: r.agentId,
      endUserId: r.endUserId,
      ruleId: r.ruleId,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() || null,
    }));

    return c.json({
      success: true,
      confirmations,
      count: confirmations.length,
    });
  });

  confirmationRoutes.get('/pending', async (c) => {
    const user = c.get('user');
    let requests = requestPauser.getPendingForUser(user.id);

    if (user.roles?.includes('admin') && user.tenantId) {
      const tenantRequests = requestPauser.getPendingForTenant(user.tenantId);
      const ids = new Set(requests.map((r) => r.id));
      for (const r of tenantRequests) {
        if (!ids.has(r.id)) requests.push(r);
      }
    }

    return c.json({
      data: requests.map((r) => ({
        id: r.id,
        tool: r.toolName,
        arguments: r.arguments,
        risk: r.risk,
        user_id: r.userId,
        end_user_id: r.endUserId,
        provider_id: r.providerId,
        agent_id: r.agentId,
        created_at: r.createdAt.toISOString(),
      })),
    });
  });

  confirmationRoutes.get('/:id', async (c) => {
    const user = c.get('user');
    const { id } = c.req.param();

    const pendingRequest = requestPauser.getPending(id);
    if (pendingRequest) {
      if (!canAccessConfirmation(user, pendingRequest)) {
        return c.json({ error: 'Not authorized to view this confirmation request' }, 403);
      }

      return c.json({
        confirmation_id: pendingRequest.id,
        status: 'pending',
        tool: pendingRequest.toolName,
        arguments: pendingRequest.arguments,
        risk: pendingRequest.risk,
        created_at: pendingRequest.createdAt.toISOString(),
        user_id: pendingRequest.userId,
        end_user_id: pendingRequest.endUserId,
        provider_id: pendingRequest.providerId,
        agent_id: pendingRequest.agentId,
        tenant_id: pendingRequest.tenantId,
      });
    }

    const dbConfirmation = await auditService.getConfirmationByRequestId(id);
    if (!dbConfirmation) {
      return c.json({ error: 'Confirmation request not found' }, 404);
    }

    if (!canAccessConfirmation(user, {
      userId: dbConfirmation.userId,
      endUserId: dbConfirmation.endUserId ?? undefined,
      tenantId: dbConfirmation.tenantId ?? undefined,
    })) {
      return c.json({ error: 'Not authorized to view this confirmation request' }, 403);
    }

    return c.json(
      formatDbConfirmation({
        requestId: dbConfirmation.requestId,
        status: dbConfirmation.status,
        toolName: dbConfirmation.toolName,
        arguments: dbConfirmation.arguments,
        risk: dbConfirmation.risk,
        createdAt: dbConfirmation.createdAt,
        resolvedAt: dbConfirmation.resolvedAt,
        userId: dbConfirmation.userId,
        endUserId: dbConfirmation.endUserId,
        providerId: dbConfirmation.providerId,
        agentId: dbConfirmation.agentId,
        ruleId: dbConfirmation.ruleId,
        tenantId: dbConfirmation.tenantId,
        confirmedBy: dbConfirmation.confirmedBy,
        reason: dbConfirmation.reason,
      })
    );
  });
}
