/**
 * SSE Stream routes for real-time confirmation notifications
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { GatewayVariables, PendingConfirmation, ConfirmationRequiredEvent } from '../../types/index.js';
import { authMiddleware } from '../../middleware/auth.js';
import { requestPauser } from '../../services/pauser.service/index.js';

const streamRoutes = new Hono<{ Variables: GatewayVariables }>();

// All stream routes require authentication
streamRoutes.use('/*', authMiddleware);

/** Build the rich confirmation event payload from a PendingConfirmation */
function toConfirmationEvent(request: PendingConfirmation): ConfirmationRequiredEvent {
  return {
    id: request.id,
    tool: {
      name: request.toolName,
      description: request.toolDescription,
      inputSchema: request.toolInputSchema,
      provider: { id: request.providerId || '', name: request.providerName || '' },
    },
    arguments: request.arguments,
    risk: { level: request.risk },
    agent: request.agentId ? { id: request.agentId, name: request.agentName || '' } : undefined,
    user: { id: request.userId, endUserId: request.endUserId || request.userId },
    tenantId: request.tenantId,
    timestamp: request.createdAt.toISOString(),
  };
}

/**
 * GET /v1/stream
 * SSE endpoint for confirmation notifications
 * Clients connect here to receive real-time confirmation requests
 */
streamRoutes.get('/', async (c) => {
  const user = c.get('user');
  
  console.log(`[Stream] User ${user.id} connected`);

  return streamSSE(c, async (stream) => {
    // Send initial connection confirmation
    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({
        userId: user.id,
        timestamp: new Date().toISOString(),
      }),
    });

    // Send any pending confirmation requests for this user
    const pendingRequests = requestPauser.getPendingForUser(user.id);
    for (const request of pendingRequests) {
      const event = toConfirmationEvent(request);
      await stream.writeSSE({
        event: 'CONFIRMATION_REQUIRED',
        data: JSON.stringify(event),
      });
    }

    // Subscribe to new confirmation required events
    const unsubscribeRequired = requestPauser.onConfirmationRequired(async (event) => {
      // Only send events for this user (or tenant admins)
      const isUserRequest = event.user.endUserId === user.id || event.user.id === user.id;
      const isAdminView = user.roles?.includes('admin') && event.tenantId === user.tenantId;
      if (isUserRequest || isAdminView) {
        try {
          await stream.writeSSE({
            event: 'CONFIRMATION_REQUIRED',
            data: JSON.stringify(event),
          });
        } catch (error) {
          console.error('[Stream] Failed to send confirmation required event:', error);
        }
      }
    });

    // Subscribe to confirmation resolved events
    const unsubscribeResolved = requestPauser.onConfirmationResolved(async (event) => {
      if (event.userId === user.id) {
        try {
          await stream.writeSSE({
            event: 'CONFIRMATION_RESOLVED',
            data: JSON.stringify({
              id: event.id,
              confirmed: event.confirmed,
              timestamp: new Date().toISOString(),
            }),
          });
        } catch (error) {
          console.error('[Stream] Failed to send confirmation resolved event:', error);
        }
      }
    });

    // Keep connection alive with heartbeat
    const heartbeatInterval = setInterval(async () => {
      try {
        await stream.writeSSE({
          event: 'heartbeat',
          data: JSON.stringify({ timestamp: new Date().toISOString() }),
        });
      } catch {
        // Connection closed
        clearInterval(heartbeatInterval);
      }
    }, 30000); // 30 second heartbeat

    // Wait for client disconnect
    stream.onAbort(() => {
      console.log(`[Stream] User ${user.id} disconnected`);
      clearInterval(heartbeatInterval);
      unsubscribeRequired();
      unsubscribeResolved();
    });

    // Keep the stream open indefinitely
    // The stream will be closed when the client disconnects
    await new Promise(() => {}); // Never resolves, keeps stream open
  });
});

/**
 * GET /v1/stream/pending
 * Get list of pending confirmation requests for the current user
 * Non-SSE endpoint for polling fallback
 */
streamRoutes.get('/pending', async (c) => {
  const user = c.get('user');

  let requests = requestPauser.getPendingForUser(user.id);

  // Admins can see all tenant requests
  if (user.roles?.includes('admin') && user.tenantId) {
    requests = requestPauser.getPendingForTenant(user.tenantId);
  }

  return c.json({
    data: requests.map((r) => toConfirmationEvent(r)),
  });
});

export { streamRoutes };
