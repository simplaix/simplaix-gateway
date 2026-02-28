import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';

import { registerDevice, confirmRequest, rejectRequest } from '@/lib/api';
import { getAuthToken, getGatewayUrl } from '@/lib/storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function setupCategories() {
  await Notifications.setNotificationCategoryAsync('CONFIRMATION_ACTION', [
    {
      identifier: 'CONFIRM_ACTION',
      buttonTitle: 'Approve',
      options: { opensAppToForeground: false },
    },
    {
      identifier: 'REJECT_ACTION',
      buttonTitle: 'Reject',
      options: { opensAppToForeground: false, isDestructive: true },
    },
    {
      identifier: 'REVIEW_ACTION',
      buttonTitle: 'Review',
      options: { opensAppToForeground: true },
    },
  ]);
}

async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('[Push] Must use physical device for push notifications');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Permission not granted');
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: projectId ?? undefined,
  });

  return tokenData.data;
}

/**
 * Hook that manages push notification registration and incoming notification handling.
 * Returns a refresh trigger that components can call to reload data when a push arrives.
 */
export function usePushNotifications(): { refreshKey: number } {
  const [refreshKey, setRefreshKey] = useState(0);
  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  useEffect(() => {
    let mounted = true;

    (async () => {
      await setupCategories();

      const token = await getExpoPushToken();
      if (!token || !mounted) return;

      const gatewayUrl = await getGatewayUrl();
      const authToken = await getAuthToken();
      if (!gatewayUrl || !authToken) return;

      try {
        await registerDevice({
          platform: Platform.OS as string,
          pushToken: token,
          deviceName: Device.deviceName ?? undefined,
        });
        console.log('[Push] Device registered with gateway');
      } catch (err) {
        console.warn('[Push] Failed to register device:', err);
      }
    })();

    // Foreground notification — bump refresh key so the list re-fetches
    notificationListener.current =
      Notifications.addNotificationReceivedListener(() => {
        if (mounted) setRefreshKey((k) => k + 1);
      });

    // User tapped on notification or used an action button
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(async (response) => {
        const data = response.notification.request.content.data as {
          type?: string;
          confirmationId?: string;
        };

        if (data?.type !== 'confirmation' || !data.confirmationId) return;

        const actionId = response.actionIdentifier;

        if (actionId === 'CONFIRM_ACTION') {
          try {
            await confirmRequest(data.confirmationId);
          } catch (err) {
            console.warn('[Push] Inline confirm failed:', err);
          }
        } else if (actionId === 'REJECT_ACTION') {
          try {
            await rejectRequest(data.confirmationId);
          } catch (err) {
            console.warn('[Push] Inline reject failed:', err);
          }
        } else {
          // Default tap or REVIEW_ACTION — navigate to the detail screen
          router.push(`/confirmation/${data.confirmationId}`);
        }

        if (mounted) setRefreshKey((k) => k + 1);
      });

    return () => {
      mounted = false;
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return { refreshKey };
}
