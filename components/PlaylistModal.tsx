import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SharedItem, Track, MusicService } from '../types';
import { serviceName } from './ServiceBadge';
import * as Spotify from '../lib/spotify';
import * as AppleMusic from '../lib/appleMusic';
import * as YouTubeMusic from '../lib/youtubeMusic';
import { useAuth } from '../hooks/useAuth';
import { withTimeout } from '../lib/utils';

interface PlaylistModalProps {
  item: SharedItem | null;
  visible: boolean;
  onClose: () => void;
}

export function PlaylistModal({ item, visible, onClose }: PlaylistModalProps) {
  const [adding, setAdding] = useState(false);
  const { user } = useAuth();

  if (!item) return null;

  const primaryService = user?.primary_service as MusicService | null;

  const handleAddToService = async () => {
    if (!user || !primaryService || !item.tracks) return;

    setAdding(true);
    try {
      // Create an array of functions that will return the promises when called
      const trackIdTasks = item.tracks.map((t: Track) => async () => {
        let id: string | null | undefined;
        
        switch (primaryService) {
          case 'spotify':
            id = t.spotify_id;
            if (!id && t.title && t.artist) {
              id = await Spotify.searchTrack(user.id, t.title, t.artist);
            }
            break;
          case 'apple_music':
            id = t.apple_music_id;
            if (!id && t.title && t.artist) {
              id = await AppleMusic.searchTrack(user.id, t.title, t.artist);
            }
            break;
          case 'youtube_music':
            id = t.youtube_music_id;
            if (!id && t.title && t.artist) {
              id = await YouTubeMusic.searchTrack(user.id, t.title, t.artist);
            }
            break;
        }
        return id;
      });

      // Execute in chunks to avoid rate limits (429 errors from Spotify/Apple APIs)
      const resolvedIds: (string | null | undefined)[] = [];
      const CHUNK_SIZE = 3;
      
      for (let i = 0; i < trackIdTasks.length; i += CHUNK_SIZE) {
        const chunk = trackIdTasks.slice(i, i + CHUNK_SIZE);
        // Timeout bumped to 60s because 429's backoff might take 5-10 seconds
        const results = await withTimeout(Promise.all(chunk.map(fn => fn())), 60_000);
        resolvedIds.push(...results);
        
        // Add a small delay between chunks if there are more to process
        if (i + CHUNK_SIZE < trackIdTasks.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Filter out any that still couldn't be found
      const trackIds = resolvedIds.filter((id): id is string => id !== null && id !== undefined);

      if (trackIds.length === 0) {
        Alert.alert(
          'Not Available',
          `None of these tracks could be found on ${serviceName(primaryService)}.`,
        );
        return;
      }

      let playlistId: string | null = null;

      switch (primaryService) {
        case 'spotify':
          playlistId = await withTimeout(Spotify.createPlaylist(user.id, item.title, trackIds), 30_000);
          break;
        case 'apple_music':
          playlistId = await withTimeout(AppleMusic.createPlaylist(user.id, item.title, trackIds), 30_000);
          break;
        case 'youtube_music':
          playlistId = await withTimeout(YouTubeMusic.createPlaylist(user.id, item.title, trackIds), 30_000);
          break;
      }

      if (playlistId) {
        Alert.alert('Added!', `"${item.title}" was added to your ${serviceName(primaryService)} library.`);
        onClose();
      } else {
        Alert.alert('Error', `Failed to create playlist. Make sure you're connected to ${serviceName(primaryService)}.`);
      }
    } catch (err: any) {
      // Catch specific multi-hour rate limit errors thrown when Spotify Development app quotas are exhausted
      if (err?.message === 'spotify_rate_limit_exceeded') {
        Alert.alert(
          'Spotify Rate Limit Reached',
          'Because your Spotify App is in "Development Mode" (in the Developer Dashboard), Spotify limits how many searches you can perform in a day. You have hit this limit by processing large playlists. Please wait 12 hours or create a new Spotify App in the Dashboard to reset this limit.'
        );
      } else {
        const msg = err?.message === 'timeout'
          ? 'Request timed out. Check your connection and try again.'
          : 'Something went wrong. Please try again.';
        Alert.alert('Error', msg);
      }
      console.error('[PlaylistModal] addToService error:', err);
    } finally {
      setAdding(false);
    }
  };

  const renderTrack = ({ item: track, index }: { item: Track; index: number }) => (
    <View style={styles.trackRow}>
      <Text style={styles.trackIndex}>{index + 1}</Text>
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
        <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Image
            source={item.cover_image_url ? { uri: item.cover_image_url } : require('../assets/icon.png')}
            style={styles.cover}
          />
          <View style={styles.headerInfo}>
            <Text style={styles.playlistTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.trackCount}>
              {item.tracks?.length ?? 0} tracks · from {item.sender?.display_name ?? 'someone'}
            </Text>
            {item.message && (
              <Text style={styles.message} numberOfLines={2}>"{item.message}"</Text>
            )}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Track list */}
        <FlatList
          data={item.tracks ?? []}
          renderItem={renderTrack}
          keyExtractor={(_, i) => String(i)}
          style={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No tracks in this playlist</Text>
          }
        />

        {/* Add to service button */}
        {primaryService && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.addButton, adding && styles.addButtonDisabled]}
              onPress={handleAddToService}
              disabled={adding}
              activeOpacity={0.8}
            >
              {adding ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.addButtonText}>
                  Add to {serviceName(primaryService)}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 20,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  cover: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#2a2a2a',
  },
  headerInfo: {
    flex: 1,
  },
  playlistTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  trackCount: {
    color: '#888',
    fontSize: 13,
    marginBottom: 4,
  },
  message: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
  },
  closeButton: {
    padding: 4,
  },
  closeText: {
    color: '#666',
    fontSize: 18,
  },
  list: {
    flex: 1,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 14,
  },
  trackIndex: {
    color: '#555',
    fontSize: 14,
    width: 24,
    textAlign: 'center',
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  trackArtist: {
    color: '#888',
    fontSize: 13,
  },
  separator: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginLeft: 58,
  },
  emptyText: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  addButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
});
