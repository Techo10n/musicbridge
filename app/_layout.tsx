import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { useClipboardReel } from '../hooks/useClipboardReel';
import { ReelImportBanner } from '../components/ReelImportBanner';
import { ReelImportModal } from '../components/ReelImportModal';

/**
 * Inner navigator — reacts to auth state and redirects accordingly.
 * Keeping this separate from AuthProvider lets us consume the context here.
 */
function RootLayoutNav() {
  const { session, user, loading } = useAuth();
  useNotifications();

  const segments = useSegments();
  const router = useRouter();
  const navState = useRootNavigationState();

  // Reel import — clipboard detection + banner + modal
  const { pendingUrl, pendingSource, dismiss } = useClipboardReel();
  const [modalUrl, setModalUrl] = useState<string | null>(null);

  const handleFindSong = () => {
    if (!pendingUrl) return;
    setModalUrl(pendingUrl);
    dismiss();
  };

  const handleModalClose = () => {
    setModalUrl(null);
  };

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

  useEffect(() => {
    if (!pendingUrl || pendingSource !== 'link' || modalUrl) return;
    setModalUrl(pendingUrl);
    dismiss();
  }, [pendingUrl, pendingSource, modalUrl, dismiss]);

  // Only show reel import UI when logged in
  const showReelUI = !!session && !!user?.primary_service;

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0f0f0f' },
          animation: 'fade',
        }}
      />
      {showReelUI && (
        <ReelImportBanner
          url={pendingUrl}
          onFindSong={handleFindSong}
          onDismiss={dismiss}
        />
      )}
      {showReelUI && (
        <ReelImportModal
          reelUrl={modalUrl}
          onClose={handleModalClose}
        />
      )}
    </View>
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
