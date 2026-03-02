import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { MusicServiceButton } from '../../components/MusicServiceButton';
import { MusicService } from '../../types';
import * as Spotify from '../../lib/spotify';
import * as AppleMusic from '../../lib/appleMusic';
import * as YouTubeMusic from '../../lib/youtubeMusic';

const SERVICES: MusicService[] = ['spotify', 'apple_music', 'youtube_music'];
const SERVICE_LABELS: Record<MusicService, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  youtube_music: 'YouTube Music',
};
const SERVICE_COLORS: Record<MusicService, string> = {
  spotify: '#1DB954',
  apple_music: '#fc3c44',
  youtube_music: '#FF0000',
};

export default function Profile() {
  const { user, signOut, setPrimaryService, refreshUser } = useAuth();
  const [loadingService, setLoadingService] = useState<MusicService | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const isConnected = (service: MusicService): boolean => {
    switch (service) {
      case 'spotify': return !!user?.spotify_access_token;
      case 'apple_music': return !!user?.apple_music_user_token;
      case 'youtube_music': return !!user?.youtube_access_token;
    }
  };

  const handleConnect = async (service: MusicService) => {
    if (!user) return;
    setLoadingService(service);
    try {
      let success = false;
      switch (service) {
        case 'spotify': success = await Spotify.connectSpotify(user.id); break;
        case 'apple_music': success = await AppleMusic.connectAppleMusic(user.id); break;
        case 'youtube_music': success = await YouTubeMusic.connectYouTubeMusic(user.id); break;
      }
      if (success) {
        await refreshUser();
        Alert.alert('Connected!', `${SERVICE_LABELS[service]} connected successfully.`);
      } else {
        Alert.alert('Failed', `Could not connect ${SERVICE_LABELS[service]}.`);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLoadingService(null);
    }
  };

  const handleDisconnect = async (service: MusicService) => {
    if (!user) return;
    Alert.alert(
      `Disconnect ${SERVICE_LABELS[service]}?`,
      'You can reconnect at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setLoadingService(service);
            try {
              switch (service) {
                case 'spotify': await Spotify.disconnectSpotify(user.id); break;
                case 'apple_music': await AppleMusic.disconnectAppleMusic(user.id); break;
                case 'youtube_music': await YouTubeMusic.disconnectYouTubeMusic(user.id); break;
              }
              await refreshUser();
            } finally {
              setLoadingService(null);
            }
          },
        },
      ],
    );
  };

  const handleSetPrimary = async (service: MusicService) => {
    if (!user || user.primary_service === service) return;
    try {
      await setPrimaryService(service);
      Alert.alert('Primary service updated', `${SERVICE_LABELS[service]} is now your primary service.`);
    } catch {
      Alert.alert('Error', 'Could not update primary service');
    }
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            await signOut();
          } finally {
            setSigningOut(false);
          }
        },
      },
    ]);
  };

  if (!user) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  const initials = user.display_name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile header */}
        <View style={styles.profileSection}>
          <View style={styles.avatar}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
          <Text style={styles.displayName}>{user.display_name}</Text>
          <Text style={styles.username}>@{user.username}</Text>
        </View>

        {/* Music services section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Streaming Services</Text>
          <Text style={styles.sectionSubtitle}>
            Connect your services so friends can share music you can actually play.
          </Text>

          {SERVICES.map((service) => (
            <View key={service}>
              <MusicServiceButton
                service={service}
                connected={isConnected(service)}
                onConnect={() => handleConnect(service)}
                onDisconnect={() => handleDisconnect(service)}
                loading={loadingService === service}
                isPrimary={user.primary_service === service}
              />
              {/* Set as primary button — only shown if connected and not already primary */}
              {isConnected(service) && user.primary_service !== service && (
                <TouchableOpacity
                  style={styles.setPrimaryButton}
                  onPress={() => handleSetPrimary(service)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.setPrimaryText}>Set as primary</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        {/* Primary service info */}
        {user.primary_service && (
          <View style={styles.primaryInfo}>
            <View style={[styles.primaryDot, { backgroundColor: SERVICE_COLORS[user.primary_service] }]} />
            <Text style={styles.primaryInfoText}>
              Songs will open in <Text style={styles.primaryInfoHighlight}>{SERVICE_LABELS[user.primary_service]}</Text>
            </Text>
          </View>
        )}

        {/* Sign out */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.signOutButton, signingOut && styles.signOutDisabled]}
            onPress={handleSignOut}
            disabled={signingOut}
            activeOpacity={0.8}
          >
            {signingOut ? (
              <ActivityIndicator color="#ff4444" size="small" />
            ) : (
              <Text style={styles.signOutText}>Sign Out</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileSection: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  initials: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  displayName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  username: {
    color: '#666',
    fontSize: 15,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  sectionSubtitle: {
    color: '#666',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  setPrimaryButton: {
    alignSelf: 'flex-end',
    marginTop: -6,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  setPrimaryText: {
    color: '#888',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  primaryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 24,
    gap: 8,
  },
  primaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  primaryInfoText: {
    color: '#666',
    fontSize: 13,
  },
  primaryInfoHighlight: {
    color: '#888',
    fontWeight: '600',
  },
  signOutButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  signOutDisabled: {
    opacity: 0.6,
  },
  signOutText: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomPad: {
    height: 40,
  },
});
