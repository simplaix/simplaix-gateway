/**
 * Notification Dispatcher
 *
 * Subscribes to confirmation events and fans out to all notification channels.
 * Currently supports: Expo Push. SSE is handled separately by stream routes.
 */

import { requestPauser } from '../pauser.service/index.js';
import { pushService } from '../push.service/index.js';

class NotificationDispatcher {
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    requestPauser.onConfirmationRequired(async (event) => {
      const targetUserId = event.user.endUserId || event.user.id;
      try {
        await pushService.sendConfirmationPush(targetUserId, event);
      } catch (error) {
        console.error('[NotificationDispatcher] Push delivery failed:', error);
      }
    });

    console.log('[NotificationDispatcher] Initialized — listening for confirmation events');
  }
}

export const notificationDispatcher = new NotificationDispatcher();
