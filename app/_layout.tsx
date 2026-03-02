import { useEffect } from 'react';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../hooks/useAuth';

/**
 * Inner navigator — reacts to auth state and redirects accordingly.
 * Keeping this separate from AuthProvider lets us consume the context here.
 */
function RootLayoutNav() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  // useRootNavigationState gives us the navigator's key once it is fully mounted.
  // Without this guard, router.replace() can fire before the navigator is ready
  // and throw "Attempted to navigate before mounting the Root Layout component".
  const navState = useRootNavigationState();

  useEffect(() => {
    if (!navState?.key || loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';

    if (!session && !inAuthGroup) {
      // No session — always send to login
      router.replace('/(auth)/login');
    } else if (session && (inAuthGroup || (!inAuthGroup && !inTabsGroup))) {
      // Has session but stuck on auth screens or root — send to home feed
      router.replace('/(tabs)/home');
    }
  }, [navState?.key, session, loading, segments, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0f0f0f' },
        animation: 'fade',
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
