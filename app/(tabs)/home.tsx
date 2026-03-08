import { useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { useSharedItems } from '../../hooks/useSharedItems';
import { SongCard } from '../../components/SongCard';
import { PlaylistCard } from '../../components/PlaylistCard';
import { PlaylistModal } from '../../components/PlaylistModal';
import { SharedItem, MusicService } from '../../types';
import * as Spotify from '../../lib/spotify';
import * as AppleMusic from '../../lib/appleMusic';
import * as YouTubeMusic from '../../lib/youtubeMusic';
import { withTimeout } from '../../lib/utils';

export default function Home() {
  const { user } = useAuth();
  const { items, loading, refreshing, refresh, markAsOpened, unreadCount } = useSharedItems();

  const [playlistModalItem, setPlaylistModalItem] = useState<SharedItem | null>(null);

  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const handleSongPress = async (item: SharedItem) => {
    await markAsOpened(item.id);

    const primaryService = user?.primary_service as MusicService | null;
    if (!primaryService) {
      Alert.alert('No service', 'Set a primary streaming service in your profile.');
      return;
    }

    setResolvingId(item.id);

    try {
      let deepLinks: string[] = [];

      switch (primaryService) {
        case 'spotify': {
          let sid = item.spotify_id;
          if (!sid && item.title && item.artist) {
            sid = await withTimeout(Spotify.searchTrack(user!.id, item.title, item.artist), 10_000);
          }
          if (sid) deepLinks = Spotify.getSpotifyDeepLink(sid);
          break;
        }
        case 'apple_music': {
          let amID = item.apple_music_id;
          if (!amID && item.title && item.artist) {
            amID = await withTimeout(AppleMusic.searchTrack(user!.id, item.title, item.artist), 10_000);
          }
          if (amID) deepLinks = AppleMusic.getAppleMusicDeepLink(amID);
          break;
        }
        case 'youtube_music': {
          let ymID = item.youtube_music_id;
          if (!ymID && item.title && item.artist) {
            ymID = await withTimeout(YouTubeMusic.searchTrack(user!.id, item.title, item.artist), 10_000);
          }
          // Returns an array of fallbacks (e.g. youtubemusic://, then vnd.youtube://)
          if (ymID) deepLinks = YouTubeMusic.getYouTubeMusicDeepLink(ymID);
          break;
        }
      }

      if (deepLinks.length > 0) {
        let opened = false;
        for (const link of deepLinks) {
          try {
            // In Expo Go on iOS, canOpenURL restricts custom schemes.
            // Bypassing it and directly trying openURL works natively.
            await Linking.openURL(link);
            opened = true;
            break;
          } catch (e) {
            console.log(`[Home] Could not open link: ${link}`);
            // Continue trying the next link in the fallback array
          }
        }
        
        if (!opened) {
          Alert.alert(
            'App not found',
            `Could not open ${primaryService.replace('_', ' ')}. Make sure it's installed.`,
          );
        }
      } else {
        Alert.alert(
          'Not available',
          `Could not find this song on your ${primaryService.replace('_', ' ')} account.`,
        );
      }
    } catch (err: any) {
      const msg = err?.message === 'timeout'
        ? 'Request timed out. Check your connection.'
        : 'Something went wrong. Please try again.';
      Alert.alert('Error', msg);
      console.error('[Home] handleSongPress error:', err);
    } finally {
      setResolvingId(null);
    }
  };

  const handlePlaylistPress = async (item: SharedItem) => {
    await markAsOpened(item.id);
    setPlaylistModalItem(item);
  };

  const renderItem = ({ item }: { item: SharedItem }) => {
    if (item.type === 'playlist') {
      return <PlaylistCard item={item} onPress={handlePlaylistPress} />;
    }
    return (
      <SongCard 
        item={item} 
        isResolving={resolvingId === item.id}
        onPress={handleSongPress} 
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>musicbridge</Text>
        <Text style={styles.subtitle}>
          {unreadCount > 0 ? `${unreadCount} new` : 'All caught up'}
        </Text>
      </View>

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={refresh}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No songs yet</Text>
              <Text style={styles.emptySubtitle}>
                When friends share songs with you they'll show up here.
              </Text>
            </View>
          ) : null
        }
      />

      <PlaylistModal
        item={playlistModalItem}
        visible={playlistModalItem !== null}
        onClose={() => setPlaylistModalItem(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  logo: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -1,
  },
  subtitle: {
    color: '#555',
    fontSize: 13,
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 24,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingTop: 100,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
