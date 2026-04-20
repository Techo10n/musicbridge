import { useCallback, useEffect, useRef } from 'react';
import * as ExpoNotifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { registerForPushNotifications } from '../lib/notifications';
import { useAuth } from './useAuth';

/**
 * Registers the device for push notifications when the user is signed in and
 * sets up a foreground tap handler that navigates to the relevant screen.
 *
 * Call once at the root layout level.
 */
export function useNotifications() {
  const { user } = useAuth();
  const router = useRouter();
  const responseListenerRef = useRef<ExpoNotifications.EventSubscription | null>(null);

  const handleNotificationResponse = useCallback(async (response: ExpoNotifications.NotificationResponse) => {
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    if (!data) return;

    switch (data.type) {
      case 'new_share':
        router.push('/(tabs)/home');
        break;
      case 'new_follower':
        router.push('/(tabs)/friends');
        break;
      default:
        break;
    }

    await ExpoNotifications.clearLastNotificationResponseAsync();
  }, [router]);

  // Register / re-register whenever the user changes (login / account switch)
  useEffect(() => {
    if (!user?.id) return;
    registerForPushNotifications(user.id);
  }, [user?.id]);

  // Handle tapping a notification while the app is foregrounded or from cold start
  useEffect(() => {
    ExpoNotifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationResponse(response);
      }
    });

    responseListenerRef.current = ExpoNotifications.addNotificationResponseReceivedListener(
      (response) => {
        handleNotificationResponse(response);
      },
    );

    return () => {
      responseListenerRef.current?.remove();
    };
  }, [handleNotificationResponse]);
}
