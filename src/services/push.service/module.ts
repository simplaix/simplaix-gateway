/**
 * Expo Push Notification Service
 *
 * Sends push notifications via the Expo Push API.
 * Expo proxies to APNs/FCM so no platform-specific credentials are needed.
 */

import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDatabase } from '../../db/index.js';
import { deviceTokens } from '../../db/schema.js';
import type { ConfirmationRequiredEvent } from '../../types/index.js';
import { formatToolNotification } from './messages.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoPushMessage {
  to: string;
  title: string;
  subtitle?: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  categoryId?: string;
  priority?: 'default' | 'normal' | 'high';
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

function riskLabel(level: string): string {
  switch (level) {
    case 'critical': return '🔴 Critical';
    case 'high': return '🟠 High';
    case 'medium': return '🟡 Medium';
    default: return '🟢 Low';
  }
}

class PushService {
  /**
   * Register (or re-activate) a device for a user.
   * Upserts by pushToken — if the same token already exists, update ownership.
   */
  async registerDevice(params: {
    userId: string;
    tenantId?: string;
    platform: 'ios' | 'macos' | 'android';
    pushToken: string;
    deviceName?: string;
  }): Promise<string> {
    const db = getDatabase();
    const now = new Date();

    const existing = await db
      .select({ id: deviceTokens.id })
      .from(deviceTokens)
      .where(eq(deviceTokens.pushToken, params.pushToken))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(deviceTokens)
        .set({
          userId: params.userId,
          tenantId: params.tenantId,
          platform: params.platform,
          deviceName: params.deviceName,
          isActive: true,
          updatedAt: now,
        })
        .where(eq(deviceTokens.id, existing[0].id));
      return existing[0].id;
    }

    const id = nanoid();
    await db.insert(deviceTokens).values({
      id,
      userId: params.userId,
      tenantId: params.tenantId,
      platform: params.platform,
      pushToken: params.pushToken,
      deviceName: params.deviceName,
      isActive: true,
      createdAt: now,
    });
    return id;
  }

  async listDevices(userId: string) {
    const db = getDatabase();
    return db
      .select()
      .from(deviceTokens)
      .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.isActive, true)));
  }

  async removeDevice(id: string, userId: string): Promise<boolean> {
    const db = getDatabase();
    const result = await db
      .update(deviceTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(deviceTokens.id, id), eq(deviceTokens.userId, userId)));
    return (result as unknown as { rowCount: number }).rowCount > 0;
  }

  /**
   * Send a confirmation push to all active devices for a given user.
   */
  async sendConfirmationPush(userId: string, event: ConfirmationRequiredEvent): Promise<void> {
    const devices = await this.listDevices(userId);
    if (devices.length === 0) {
      console.log(`[Push] No devices registered for user ${userId}, skipping push`);
      return;
    }

    const agentLabel = event.agent?.name || 'Agent';
    const { title, body } = formatToolNotification(
      event.tool.name,
      agentLabel,
      event.arguments,
    );

    const messages: ExpoPushMessage[] = devices.map((d) => ({
      to: d.pushToken,
      title,
      subtitle: `${riskLabel(event.risk.level)} · ${event.tool.name}`,
      body,
      sound: 'default',
      categoryId: 'CONFIRMATION_ACTION',
      priority: 'high',
      data: {
        type: 'confirmation',
        confirmationId: event.id,
        toolName: event.tool.name,
        risk: event.risk.level,
      },
    }));

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        console.error(`[Push] Expo API returned ${response.status}: ${await response.text()}`);
        return;
      }

      const { data: tickets } = (await response.json()) as { data: ExpoPushTicket[] };

      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        if (ticket.status === 'error') {
          console.error(`[Push] Failed for device ${devices[i].id}: ${ticket.message}`);
          if (ticket.details?.error === 'DeviceNotRegistered') {
            await this.deactivateToken(devices[i].id);
          }
        }
      }

      console.log(`[Push] Sent ${messages.length} notification(s) for confirmation ${event.id}`);
    } catch (error) {
      console.error('[Push] Failed to send push notification:', error);
    }
  }

  private async deactivateToken(deviceId: string): Promise<void> {
    const db = getDatabase();
    await db
      .update(deviceTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(deviceTokens.id, deviceId));
    console.log(`[Push] Deactivated stale device token ${deviceId}`);
  }
}

export const pushService = new PushService();
