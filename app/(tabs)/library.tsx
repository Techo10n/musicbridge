import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useLibrary } from '../../hooks/useLibrary';
import { useFriends } from '../../hooks/useFriends';
import { LibraryArtist, LibraryPlaylist, LibraryTrack, User } from '../../types';
import { LibraryPlaylistDetailModal } from '../../components/LibraryPlaylistDetailModal';
import { FriendPickerModal } from '../../components/FriendPickerModal';
import { serviceName } from '../../components/ServiceBadge';

const SERVICE_COLOR: Record<string, string> = {
  spotify: '#1DB954',
  apple_music: '#fc3c44',
  youtube_music: '#FF0000',
};

export default function LibraryScreen() {
  const { user } = useAuth();
  const { playlists, savedTracks, followedArtists, loading, error, fetchLibrary } = useLibrary();

  const [selectedPlaylist, setSelectedPlaylist] = useState<LibraryPlaylist | null>(null);
  const [playlistModalVisible, setPlaylistModalVisible] = useState(false);

  // Saved-song sharing state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pendingSongShare, setPendingSongShare] = useState<LibraryTrack | null>(null);
  const [sharingSong, setSharingSong] = useState(false);

  // Load on tab focus (but only once per session unless refreshed)
  const [hasFetched, setHasFetched] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFetched) {
        fetchLibrary();
        setHasFetched(true);
      }
    }, [hasFetched, fetchLibrary]),
  );

  const handleRefresh = async () => {
    await fetchLibrary();
  };

  const openPlaylist = (playlist: LibraryPlaylist) => {
    setSelectedPlaylist(playlist);
    setPlaylistModalVisible(true);
  };

  const openSongShare = (track: LibraryTrack) => {
    setPendingSongShare(track);
    setPickerVisible(true);
  };

  const handleSongShareFriendSelected = async (friend: User, message: string) => {
    if (!user || !pendingSongShare) return;
    setSharingSong(true);
    try {
      const { error: dbError } = await supabase.from('shared_items').insert({
        sender_id: user.id,
        recipient_id: friend.id,
        type: 'song',
        title: pendingSongShare.title,
        artist: pendingSongShare.artist,
        cover_image_url: pendingSongShare.coverUrl,
        spotify_id: pendingSongShare.service === 'spotify' ? pendingSongShare.id : null,
        apple_music_id: pendingSongShare.service === 'apple_music' ? pendingSongShare.id : null,
        youtube_music_id: pendingSongShare.service === 'youtube_music' ? pendingSongShare.id : null,
        message: message || null,
      });
      if (dbError) throw dbError;
      Alert.alert('Sent!', `Shared "${pendingSongShare.title}" with ${friend.display_name}.`);
    } catch (err) {
      Alert.alert('Error', 'Failed to share. Please try again.');
      console.error('[LibraryScreen] song share error:', err);
    } finally {
      setSharingSong(false);
      setPendingSongShare(null);
    }
  };

  const serviceColor = user?.primary_service
    ? SERVICE_COLOR[user.primary_service] ?? '#fff'
    : '#fff';

  const renderPlaylistRow = ({ item }: { item: LibraryPlaylist }) => (
    <TouchableOpacity style={styles.playlistRow} onPress={() => openPlaylist(item)} activeOpacity={0.8}>
      {item.coverUrl ? (
        <Image source={{ uri: item.coverUrl }} style={styles.playlistCover} />
      ) : (
        <View style={[styles.playlistCover, styles.coverPlaceholder]}>
          <Ionicons name="musical-notes" size={22} color="#555" />
        </View>
      )}
      <View style={styles.playlistInfo}>
        <Text style={styles.playlistName} numberOfLines={1}>{item.name}</Text>
        {item.trackCount > 0 && (
          <Text style={styles.playlistMeta}>{item.trackCount} tracks</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#555" />
    </TouchableOpacity>
  );

  const renderSavedTrackRow = ({ item: track }: { item: LibraryTrack }) => (
    <View style={styles.trackRow}>
      {track.coverUrl ? (
        <Image source={{ uri: track.coverUrl }} style={styles.trackCover} />
      ) : (
        <View style={[styles.trackCover, styles.trackCoverPlaceholder]}>
          <Ionicons name="musical-note" size={16} color="#555" />
        </View>
      )}
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
        <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>
      </View>
      <TouchableOpacity
        style={styles.shareButton}
        onPress={() => openSongShare(track)}
        disabled={sharingSong}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="paper-plane-outline" size={18} color="#555" />
      </TouchableOpacity>
    </View>
  );

  const renderArtistChip = ({ item: artist }: { item: LibraryArtist }) => (
    <View style={styles.artistChip}>
      {artist.imageUrl ? (
        <Image source={{ uri: artist.imageUrl }} style={styles.artistImage} />
      ) : (
        <View style={[styles.artistImage, styles.artistImagePlaceholder]}>
          <Ionicons name="person" size={20} color="#555" />
        </View>
      )}
      <Text style={styles.artistName} numberOfLines={2}>{artist.name}</Text>
    </View>
  );

  if (!user?.primary_service) {
    return (
      <View style={styles.emptyScreen}>
        <Ionicons name="library-outline" size={48} color="#333" />
        <Text style={styles.emptyTitle}>No music service connected</Text>
        <Text style={styles.emptySubtitle}>
          Connect a streaming service in your Profile to see your library here.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Screen header */}
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Library</Text>
        <View style={[styles.servicePill, { borderColor: serviceColor }]}>
          <Text style={[styles.servicePillText, { color: serviceColor }]}>
            {serviceName(user.primary_service)}
          </Text>
        </View>
      </View>

      {loading && !playlists.length ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.loadingText}>Loading your library…</Text>
        </View>
      ) : error ? (
        <View style={styles.emptyScreen}>
          <Ionicons name="warning-outline" size={40} color="#555" />
          <Text style={styles.emptyTitle}>Couldn't load library</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchLibrary}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={handleRefresh}
              tintColor="#555"
            />
          }
        >
          {/* Playlists section */}
          {playlists.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Playlists</Text>
              <FlatList
                data={playlists}
                renderItem={renderPlaylistRow}
                keyExtractor={(p) => p.id}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={styles.rowSeparator} />}
              />
            </View>
          )}

          {/* Saved / Liked songs section */}
          {savedTracks.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {user.primary_service === 'youtube_music' ? 'Liked Videos' : 'Saved Songs'}
              </Text>
              <FlatList
                data={savedTracks}
                renderItem={renderSavedTrackRow}
                keyExtractor={(t, i) => `${t.id}-${i}`}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={styles.rowSeparator} />}
              />
            </View>
          )}

          {/* Followed artists (Spotify only) */}
          {followedArtists.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Followed Artists</Text>
              <FlatList
                data={followedArtists}
                renderItem={renderArtistChip}
                keyExtractor={(a) => a.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.artistList}
              />
            </View>
          )}

          {/* Empty state */}
          {!playlists.length && !savedTracks.length && !followedArtists.length && (
            <View style={styles.emptyInline}>
              <Ionicons name="library-outline" size={40} color="#333" />
              <Text style={styles.emptyInlineText}>Your library is empty.</Text>
              <Text style={styles.emptyInlineSubtext}>
                Save songs and create playlists in{' '}
                {serviceName(user.primary_service)} to see them here.
              </Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <LibraryPlaylistDetailModal
        playlist={selectedPlaylist}
        visible={playlistModalVisible}
        onClose={() => setPlaylistModalVisible(false)}
      />

      <FriendPickerModal
        visible={pickerVisible}
        title={pendingSongShare ? `Share "${pendingSongShare.title}"` : 'Share Song'}
        onClose={() => {
          setPickerVisible(false);
          setPendingSongShare(null);
        }}
        onSelect={handleSongShareFriendSelected}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  screenTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
  },
  servicePill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  servicePillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#555',
    fontSize: 14,
  },
  scroll: {
    flex: 1,
  },
  section: {
    marginTop: 28,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  // Playlists
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  playlistCover: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
  },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistInfo: {
    flex: 1,
  },
  playlistName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  playlistMeta: {
    color: '#666',
    fontSize: 13,
  },
  // Saved tracks
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  trackCover: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#2a2a2a',
  },
  trackCoverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
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
  shareButton: {
    padding: 4,
  },
  // Artists
  artistList: {
    gap: 16,
    paddingBottom: 4,
  },
  artistChip: {
    alignItems: 'center',
    width: 80,
    gap: 8,
  },
  artistImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2a2a2a',
  },
  artistImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  artistName: {
    color: '#ccc',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  rowSeparator: {
    height: 1,
    backgroundColor: '#1a1a1a',
  },
  // Empty states
  emptyScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyInline: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyInlineText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyInlineSubtext: {
    color: '#444',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
