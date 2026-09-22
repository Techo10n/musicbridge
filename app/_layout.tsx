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
  const { session, user, loading, needsUsername } = useAuth();
  const { colors, isDark } = useTheme();
  useNotifications();

  const segments = useSegments();
  const router = useRouter();
  const navState = useRootNavigationState();
  const promptedReconnectFor = useRef<string | null>(null);

  // One gate for the whole app. Onboarding is not optional: an account with no
  // service has nowhere to open songs, and one with a placeholder username
  // (migration 014) cannot be found by anyone.
  useEffect(() => {
    if (!navState?.key || loading) return;

    const [group, leaf] = segments as string[];
    const inAuth = group === '(auth)';
    const inOnboarding = group === '(onboarding)';

    if (!session) {
      if (!inAuth) router.replace('/(auth)/welcome');
      return;
    }

    // Wait for the profile row before deciding where an authenticated user goes.
    if (!user) return;

    if (!user.primary_service) {
      if (leaf !== 'service') router.replace('/(onboarding)/service');
      return;
    }

    if (needsUsername) {
      if (leaf !== 'profile') router.replace('/(onboarding)/profile');
      return;
    }

    // Onboarded. Let the remaining optional steps finish on their own.
    if (inAuth || (!inOnboarding && group !== '(tabs)')) {
      router.replace('/(tabs)/home');
    }
  }, [navState?.key, session, user, needsUsername, loading, segments, router]);

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
