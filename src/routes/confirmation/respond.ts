import type { Hono } from 'hono';
import type { GatewayVariables } from '../../types/index.js';
import { requestPauser } from '../../services/pauser.service/index.js';
import { auditService } from '../../services/audit.service/index.js';
import { canAccessConfirmation } from './shared.js';

type ResolveRequestInput = {
  confirmationId: string;
  userId: string;
  confirmed: boolean;
  reason?: string;
};

async function resolveDbConfirmation(input: ResolveRequestInput) {
  const dbConfirmation = await auditService.getConfirmationByRequestId(input.confirmationId);
  if (!dbConfirmation) return { error: 'not_found' as const };
  if (dbConfirmation.status !== 'pending') return { error: 'already_resolved' as const, status: dbConfirmation.status };

  const { confirmationToken } = await auditService.updateConfirmationByRequestId(
    input.confirmationId,
    input.confirmed,
    input.userId,
    input.reason
  );

  requestPauser.emitConfirmationResolved({
    id: input.confirmationId,
    confirmed: input.confirmed,
    userId: dbConfirmation.userId,
  });

  return {
    confirmationToken,
    dbConfirmation,
  };
}

export function registerConfirmationResponseRoutes(
  confirmationRoutes: Hono<{ Variables: GatewayVariables }>
) {
  confirmationRoutes.post('/:id/respond', async (c) => {
    const user = c.get('user');
    const { id } = c.req.param();

    let body: { confirmed: boolean; reason?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { confirmed, reason } = body;
    if (typeof confirmed !== 'boolean') {
      return c.json({ error: 'confirmed field is required and must be a boolean' }, 400);
    }

    const pendingRequest = requestPauser.getPending(id);
    if (pendingRequest) {
      if (!canAccessConfirmation(user, pendingRequest)) {
        return c.json({ error: 'Not authorized to respond to this confirmation request' }, 403);
      }

      const success = requestPauser.resume(id, {
        confirmed,
        confirmedBy: user.id,
        reason,
      });
      if (!success) {
        return c.json({ error: 'Failed to process confirmation response' }, 500);
      }

      return c.json({
        success: true,
        message: confirmed ? 'Request confirmed' : 'Request rejected',
        confirmation_id: id,
        confirmed_by: user.id,
        timestamp: new Date().toISOString(),
      });
    }

    const dbConfirmation = await auditService.getConfirmationByRequestId(id);
    if (!dbConfirmation) {
      return c.json({ error: 'Confirmation request not found' }, 404);
    }
    if (dbConfirmation.status !== 'pending') {
      return c.json({ error: 'Confirmation already resolved', status: dbConfirmation.status }, 409);
    }
    if (!canAccessConfirmation(user, {
      userId: dbConfirmation.userId,
      endUserId: dbConfirmation.endUserId ?? undefined,
      tenantId: dbConfirmation.tenantId ?? undefined,
    })) {
      return c.json({ error: 'Not authorized to respond to this confirmation request' }, 403);
    }

    const resolved = await resolveDbConfirmation({
      confirmationId: id,
      userId: user.id,
      confirmed,
      reason,
    });

    if ('error' in resolved) {
      if (resolved.error === 'not_found') return c.json({ error: 'Confirmation request not found' }, 404);
      return c.json({ error: 'Confirmation already resolved', status: resolved.status }, 409);
    }

    return c.json({
      success: true,
      message: confirmed ? 'Request confirmed' : 'Request rejected',
      confirmation_id: id,
      confirmed_by: user.id,
      timestamp: new Date().toISOString(),
      ...(resolved.confirmationToken && { confirmation_token: resolved.confirmationToken, expiresIn: 1800 }),
    });
  });

  confirmationRoutes.post('/:id/confirm', async (c) => {
    const user = c.get('user');
    const { id } = c.req.param();

    const pendingRequest = requestPauser.getPending(id);
    if (pendingRequest) {
      if (!canAccessConfirmation(user, pendingRequest)) {
        return c.json({ error: 'Not authorized' }, 403);
      }

      requestPauser.resume(id, {
        confirmed: true,
        confirmedBy: user.id,
      });

      return c.json({ success: true, message: 'Request confirmed' });
    }

    const dbConfirmation = await auditService.getConfirmationByRequestId(id);
    if (!dbConfirmation) {
      return c.json({ error: 'Confirmation request not found' }, 404);
    }
    if (dbConfirmation.status !== 'pending') {
      return c.json({ error: 'Confirmation already resolved', status: dbConfirmation.status }, 409);
    }
    if (!canAccessConfirmation(user, {
      userId: dbConfirmation.userId,
      endUserId: dbConfirmation.endUserId ?? undefined,
      tenantId: dbConfirmation.tenantId ?? undefined,
    })) {
      return c.json({ error: 'Not authorized' }, 403);
    }

    const resolved = await resolveDbConfirmation({
      confirmationId: id,
      userId: user.id,
      confirmed: true,
    });
    if ('error' in resolved) {
      if (resolved.error === 'not_found') return c.json({ error: 'Confirmation request not found' }, 404);
      return c.json({ error: 'Confirmation already resolved', status: resolved.status }, 409);
    }

    return c.json({
      success: true,
      message: 'Request confirmed',
      ...(resolved.confirmationToken && { confirmation_token: resolved.confirmationToken, expiresIn: 1800 }),
    });
  });

  confirmationRoutes.post('/:id/reject', async (c) => {
    const user = c.get('user');
    const { id } = c.req.param();

    let reason: string | undefined;
    try {
      const body = await c.req.json();
      reason = body.reason;
    } catch {
      // Body is optional.
    }

    const pendingRequest = requestPauser.getPending(id);
    if (pendingRequest) {
      if (!canAccessConfirmation(user, pendingRequest)) {
        return c.json({ error: 'Not authorized' }, 403);
      }

      requestPauser.resume(id, {
        confirmed: false,
        confirmedBy: user.id,
        reason,
      });

      return c.json({ success: true, message: 'Request rejected' });
    }

    const dbConfirmation = await auditService.getConfirmationByRequestId(id);
    if (!dbConfirmation) {
      return c.json({ error: 'Confirmation request not found' }, 404);
    }
    if (dbConfirmation.status !== 'pending') {
      return c.json({ error: 'Confirmation already resolved', status: dbConfirmation.status }, 409);
    }
    if (!canAccessConfirmation(user, {
      userId: dbConfirmation.userId,
      endUserId: dbConfirmation.endUserId ?? undefined,
      tenantId: dbConfirmation.tenantId ?? undefined,
    })) {
      return c.json({ error: 'Not authorized' }, 403);
    }

    const resolved = await resolveDbConfirmation({
      confirmationId: id,
      userId: user.id,
      confirmed: false,
      reason,
    });
    if ('error' in resolved) {
      if (resolved.error === 'not_found') return c.json({ error: 'Confirmation request not found' }, 404);
      return c.json({ error: 'Confirmation already resolved', status: resolved.status }, 409);
    }

    return c.json({ success: true, message: 'Request rejected' });
  });
}
