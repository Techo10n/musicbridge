import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { useClipboardReel } from '../hooks/useClipboardReel';
import { ReelImportBanner } from '../components/ReelImportBanner';
import { ReelImportModal } from '../components/ReelImportModal';
import { getSpotifyReconnectRequired } from '../lib/spotify';

const tutorialKey = (userId: string) => `museaic_tutorial_seen_${userId}`;

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
  const reelUiReady = !!session && !!user && !loading;

  // Reel import — clipboard detection + banner + modal
  const { pendingUrl, pendingSource, dismiss } = useClipboardReel(user?.id ?? null, reelUiReady);
  const [modalUrl, setModalUrl] = useState<string | null>(null);
  const [shownSpotifyReconnectPrompt, setShownSpotifyReconnectPrompt] = useState(false);

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

  useEffect(() => {
    setShownSpotifyReconnectPrompt(false);
  }, [session?.user.id]);

  useEffect(() => {
    if (!session || !user || loading || shownSpotifyReconnectPrompt) return;

    let cancelled = false;

    const maybePromptSpotifyReconnect = async () => {
      const reconnectRequired = await getSpotifyReconnectRequired();
      if (cancelled || !reconnectRequired) return;
      if (user.spotify_access_token) return;

      setShownSpotifyReconnectPrompt(true);
      Alert.alert(
        'Reconnect Spotify',
        'Your Spotify session expired. Reconnect Spotify from your profile to keep opening songs and using Spotify library features.',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Open Profile',
            onPress: () => {
              router.push('/(tabs)/profile');
            },
          },
        ],
      );
    };

    void maybePromptSpotifyReconnect();

    return () => {
      cancelled = true;
    };
  }, [loading, router, session, shownSpotifyReconnectPrompt, user]);

  useEffect(() => {
    if (!session || !user || loading) return;

    let cancelled = false;
    void (async () => {
      const key = tutorialKey(user.id);
      const seen = await AsyncStorage.getItem(key);
      if (cancelled || seen) return;
      await AsyncStorage.setItem(key, '1');
      Alert.alert(
        'Welcome to Museaic',
        'Connect your streaming services in Settings, share songs from the center tab, and use Library to open saved playlists and reel finds.',
        [{ text: 'Got it' }],
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, session, user]);

  // Only show reel import UI when logged in
  const showReelUI = reelUiReady;

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#1a1813' },
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
