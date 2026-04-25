import * as Device from 'expo-device';
import * as ExpoNotifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Show notifications as banners even when the app is in the foreground
ExpoNotifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Requests push notification permission and registers the device's Expo
 * push token with Supabase.  Safe to call multiple times — upsert is idempotent.
 * Returns the token string on success, null if permission was denied or the
 * device doesn't support push (simulators).
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  // Physical device required — simulators can't receive push notifications
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await ExpoNotifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await ExpoNotifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  // Android needs a notification channel
  if (Platform.OS === 'android') {
    await ExpoNotifications.setNotificationChannelAsync('default', {
      name: 'MusicBridge',
      importance: ExpoNotifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const tokenData = await ExpoNotifications.getExpoPushTokenAsync({
    projectId: 'a417b41a-56d9-4a34-8e13-f96072339330',
  });

  const token = tokenData.data;

  // Persist to Supabase — ignore errors so registration failures don't block the app
  const { error: upsertError } = await supabase.from('push_tokens').upsert(
    { user_id: userId, token, platform: Platform.OS },
    { onConflict: 'user_id,token' },
  );
  if (upsertError) {
    console.warn('[notifications] failed to save push token:', upsertError);
  }

  return token;
}

/**
 * Removes the current device's push token from Supabase on sign-out so the
 * user stops receiving notifications on this device.
 */
export async function unregisterPushToken(userId: string): Promise<void> {
  try {
    const tokenData = await ExpoNotifications.getExpoPushTokenAsync({
      projectId: 'a417b41a-56d9-4a34-8e13-f96072339330',
    });
    await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', tokenData.data);
  } catch {
    // Best-effort — don't block sign-out
  }
}

/**
 * Sends a push notification to another user via the send-notification edge function.
 * Fire-and-forget: errors are logged but not re-thrown so they never break
 * the action that triggered the notification.
 */
export async function sendPushNotification(
  recipientId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.functions.invoke('send-notification', {
      body: { recipientId, title, body, data },
    });
  } catch (err) {
    console.warn('[notifications] sendPushNotification failed:', err);
  }
}
