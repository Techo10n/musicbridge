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
      // Collect the track IDs for the user's primary service
      const trackIds = item.tracks
        .map((t: Track) => {
          switch (primaryService) {
            case 'spotify': return t.spotify_id;
            case 'apple_music': return t.apple_music_id;
            case 'youtube_music': return t.youtube_music_id;
          }
        })
        .filter((id): id is string => id !== null && id !== undefined);

      if (trackIds.length === 0) {
        Alert.alert(
          'Not Available',
          `None of these tracks are resolved for ${serviceName(primaryService)}. The sender may not have been connected to that service.`,
        );
        return;
      }

      let playlistId: string | null = null;

      switch (primaryService) {
        case 'spotify':
          playlistId = await Spotify.createPlaylist(user.id, item.title, trackIds);
          break;
        case 'apple_music':
          playlistId = await AppleMusic.createPlaylist(user.id, item.title, trackIds);
          break;
        case 'youtube_music':
          playlistId = await YouTubeMusic.createPlaylist(user.id, item.title, trackIds);
          break;
      }

      if (playlistId) {
        Alert.alert('Added!', `"${item.title}" was added to your ${serviceName(primaryService)} library.`);
        onClose();
      } else {
        Alert.alert('Error', `Failed to create playlist. Make sure you're connected to ${serviceName(primaryService)}.`);
      }
    } catch (err) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
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
