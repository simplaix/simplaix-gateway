/**
 * Device registration routes for push notifications.
 */

import type { Hono } from 'hono';
import type { GatewayVariables } from '../../types/index.js';
import { pushService } from '../../services/push.service/index.js';

export function registerDeviceRoutes(app: Hono<{ Variables: GatewayVariables }>) {
  /**
   * POST /devices — register (or re-activate) a device
   */
  app.post('/devices', async (c) => {
    const user = c.get('user');
    const body = await c.req.json<{
      platform: 'ios' | 'macos' | 'android';
      pushToken: string;
      deviceName?: string;
    }>();

    if (!body.platform || !body.pushToken) {
      return c.json({ error: 'Bad Request', message: 'platform and pushToken are required' }, 400);
    }

    if (!['ios', 'macos', 'android'].includes(body.platform)) {
      return c.json({ error: 'Bad Request', message: 'platform must be ios, macos, or android' }, 400);
    }

    const id = await pushService.registerDevice({
      userId: user.id,
      tenantId: user.tenantId,
      platform: body.platform,
      pushToken: body.pushToken,
      deviceName: body.deviceName,
    });

    return c.json({ data: { id } }, 201);
  });

  /**
   * GET /devices — list active devices for the current user
   */
  app.get('/devices', async (c) => {
    const user = c.get('user');
    const devices = await pushService.listDevices(user.id);

    return c.json({
      data: devices.map((d) => ({
        id: d.id,
        platform: d.platform,
        deviceName: d.deviceName,
        createdAt: d.createdAt,
      })),
    });
  });

  /**
   * DELETE /devices/:id — deactivate a device
   */
  app.delete('/devices/:id', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');

    const removed = await pushService.removeDevice(id, user.id);
    if (!removed) {
      return c.json({ error: 'Not Found', message: 'Device not found or not owned by you' }, 404);
    }

    return c.json({ data: { success: true } });
  });
}
