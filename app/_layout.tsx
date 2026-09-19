import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { useCallback, useEffect, useRef } from 'react';
import { Alert, View } from 'react-native';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  Fraunces_500Medium_Italic,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  useFonts,
} from '@expo-google-fonts/fraunces';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { getSpotifyReconnectRequired } from '../lib/spotify';
import { ThemeProvider, useTheme } from '../lib/theme';
import { ToastProvider } from '../components/ui';

void SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden or unavailable (e.g. web) — nothing to do.
});

/**
 * Inner navigator — reacts to auth state and redirects accordingly.
 * Kept separate from the providers so it can consume them.
 */
function RootLayoutNav({ fontsReady }: { fontsReady: boolean }) {
  const { session, user, loading } = useAuth();
  const { colors, isDark } = useTheme();
  useNotifications();

  const segments = useSegments();
  const router = useRouter();
  const navState = useRootNavigationState();
  const promptedReconnectFor = useRef<string | null>(null);

  useEffect(() => {
    if (!navState?.key || loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && user?.primary_service && (inAuthGroup || (!inAuthGroup && !inTabsGroup))) {
      router.replace('/(tabs)/home');
    }
  }, [navState?.key, session, user, loading, segments, router]);

  // Hide the splash once fonts and the first auth resolution are both in.
  useEffect(() => {
    if (fontsReady && !loading) void SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady, loading]);

  const maybePromptSpotifyReconnect = useCallback(async () => {
    if (!session || !user) return;
    if (promptedReconnectFor.current === session.user.id) return;
    const reconnectRequired = await getSpotifyReconnectRequired();
    if (!reconnectRequired || user.spotify_access_token) return;
    promptedReconnectFor.current = session.user.id;
    Alert.alert(
      'Reconnect Spotify',
      'Your Spotify session expired. Reconnect Spotify from Settings to keep opening songs and using Spotify library features.',
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Open Settings', onPress: () => router.push('/(tabs)/settings') },
      ],
    );
  }, [router, session, user]);

  useEffect(() => {
    if (loading) return;
    void maybePromptSpotifyReconnect();
  }, [loading, maybePromptSpotifyReconnect]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'fade',
        }}
      />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_500Medium_Italic,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
  });
  // A font failure must not brick the app: fall through to the system face.
  const fontsReady = fontsLoaded || !!fontError;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <RootLayoutNav fontsReady={fontsReady} />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
