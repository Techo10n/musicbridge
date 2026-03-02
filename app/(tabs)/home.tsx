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

export default function Home() {
  const { user } = useAuth();
  const { items, loading, refreshing, refresh, markAsOpened } = useSharedItems();

  const [playlistModalItem, setPlaylistModalItem] = useState<SharedItem | null>(null);

  const handleSongPress = async (item: SharedItem) => {
    await markAsOpened(item.id);

    const primaryService = user?.primary_service as MusicService | null;
    if (!primaryService) {
      Alert.alert('No service', 'Set a primary streaming service in your profile.');
      return;
    }

    let deepLink: string | null = null;

    switch (primaryService) {
      case 'spotify':
        if (item.spotify_id) deepLink = Spotify.getSpotifyDeepLink(item.spotify_id);
        break;
      case 'apple_music':
        if (item.apple_music_id) deepLink = AppleMusic.getAppleMusicDeepLink(item.apple_music_id);
        break;
      case 'youtube_music':
        if (item.youtube_music_id) deepLink = YouTubeMusic.getYouTubeMusicDeepLink(item.youtube_music_id);
        break;
    }

    if (deepLink) {
      const canOpen = await Linking.canOpenURL(deepLink);
      if (canOpen) {
        await Linking.openURL(deepLink);
      } else {
        Alert.alert(
          'App not found',
          `Could not open ${primaryService.replace('_', ' ')}. Make sure it's installed.`,
        );
      }
    } else {
      Alert.alert(
        'Not available',
        `This song isn't linked to your ${primaryService.replace('_', ' ')} account. The sender may not have been connected.`,
      );
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
    return <SongCard item={item} onPress={handleSongPress} />;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>musicbridge</Text>
        <Text style={styles.subtitle}>
          {items.filter((i) => !i.opened).length > 0
            ? `${items.filter((i) => !i.opened).length} new`
            : 'All caught up'}
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
