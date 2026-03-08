import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useFriends } from '../hooks/useFriends';
import * as Spotify from '../lib/spotify';
import * as AppleMusic from '../lib/appleMusic';
import * as YouTubeMusic from '../lib/youtubeMusic';
import { Friendship, LibraryPlaylist, LibraryTrack, Track, User } from '../types';
import { withTimeout } from '../lib/utils';

interface LibraryPlaylistDetailModalProps {
  playlist: LibraryPlaylist | null;
  visible: boolean;
  onClose: () => void;
}

function toTrackPayload(t: LibraryTrack): Track {
  return {
    title: t.title,
    artist: t.artist,
    spotify_id: t.service === 'spotify' ? t.id : null,
    apple_music_id: t.service === 'apple_music' ? t.id : null,
    youtube_music_id: t.service === 'youtube_music' ? t.id : null,
  };
}

function resolveFriend(friendship: Friendship, currentUserId: string): User | null {
  if (friendship.requester_id === currentUserId) return (friendship.addressee as User) ?? null;
  return (friendship.requester as User) ?? null;
}

export function LibraryPlaylistDetailModal({
  playlist,
  visible,
  onClose,
}: LibraryPlaylistDetailModalProps) {
  const { user } = useAuth();
  const { friends } = useFriends();

  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Inline friend picker state (avoids stacked Modal limitation on iOS)
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerMessage, setPickerMessage] = useState('');
  // null = share whole playlist; a track = share that single song
  const [pendingTrack, setPendingTrack] = useState<LibraryTrack | null>(null);

  useEffect(() => {
    if (!visible || !playlist || !user?.primary_service) return;

    let cancelled = false;

    (async () => {
      setLoadingTracks(true);
      setTracks([]);
      try {
        let result: LibraryTrack[] = [];
        const service = user.primary_service;
        if (service === 'spotify') {
          result = await withTimeout(Spotify.getPlaylistTracks(user.id, playlist.id), 20_000);
        } else if (service === 'apple_music') {
          result = await withTimeout(AppleMusic.getPlaylistTracks(user.id, playlist.id), 20_000);
        } else if (service === 'youtube_music') {
          result = await withTimeout(YouTubeMusic.getPlaylistTracks(user.id, playlist.id), 20_000);
        }
        if (!cancelled) setTracks(result);
      } catch (err: any) {
        if (!cancelled) {
          const msg = err?.message === 'timeout'
            ? 'Timed out loading tracks. Pull down to retry.'
            : 'Failed to load tracks.';
          console.error('[LibraryPlaylistDetailModal] load tracks:', err);
          Alert.alert('Error', msg);
        }
      } finally {
        if (!cancelled) setLoadingTracks(false);
      }
    })();

    return () => { cancelled = true; };
  }, [visible, playlist?.id, user?.id, user?.primary_service]);

  const openPickerForPlaylist = () => {
    setPendingTrack(null);
    setPickerMessage('');
    setPickerVisible(true);
  };

  const openPickerForTrack = (track: LibraryTrack) => {
    setPendingTrack(track);
    setPickerMessage('');
    setPickerVisible(true);
  };

  const closePicker = () => {
    setPickerVisible(false);
    setPickerMessage('');
    setPendingTrack(null);
  };

  const handleFriendSelected = async (friend: User) => {
    if (!user || !playlist) return;

    // Snapshot all closure values BEFORE closePicker() resets state,
    // so the async function always uses the correct values.
    const msgSnapshot = pickerMessage;
    const trackSnapshot = pendingTrack;
    const tracksSnapshot = tracks;

    closePicker();
    setSharing(true);

    const abort = new AbortController();
    const timeoutId = setTimeout(() => abort.abort(), 15_000);

    try {
      if (trackSnapshot) {
        // ── Share a single song ──────────────────────────────────────────
        const payload = toTrackPayload(trackSnapshot);
        const { error } = await supabase
          .from('shared_items')
          .insert({
            sender_id: user.id,
            recipient_id: friend.id,
            type: 'song',
            title: trackSnapshot.title,
            artist: trackSnapshot.artist,
            cover_image_url: trackSnapshot.coverUrl || '',
            spotify_id: payload.spotify_id,
            apple_music_id: payload.apple_music_id,
            youtube_music_id: payload.youtube_music_id,
            message: msgSnapshot || null,
          })
          .abortSignal(abort.signal);
        if (error) throw error;
        Alert.alert('Sent!', `Shared "${trackSnapshot.title}" with ${friend.display_name}.`);
      } else {
        // ── Share whole playlist ─────────────────────────────────────────
        const trackPayloads = tracksSnapshot.map(toTrackPayload);
        const { error } = await supabase
          .from('shared_items')
          .insert({
            sender_id: user.id,
            recipient_id: friend.id,
            type: 'playlist',
            title: playlist.name,
            artist: null,
            cover_image_url: playlist.coverUrl || '',
            spotify_playlist_id: playlist.service === 'spotify' ? playlist.id : null,
            apple_music_playlist_id: playlist.service === 'apple_music' ? playlist.id : null,
            youtube_music_playlist_id: playlist.service === 'youtube_music' ? playlist.id : null,
            tracks: trackPayloads,
            message: msgSnapshot || null,
          })
          .abortSignal(abort.signal);
        if (error) throw error;
        Alert.alert(
          'Sent!',
          `Shared "${playlist.name}" (${tracksSnapshot.length} tracks) with ${friend.display_name}.`,
        );
        onClose();
      }
    } catch (err: any) {
      const timedOut = abort.signal.aborted;
      Alert.alert(
        'Error',
        timedOut
          ? 'Share timed out. Check your connection and try again.'
          : 'Failed to share. Please try again.',
      );
      console.error('[LibraryPlaylistDetailModal] share error:', err);
    } finally {
      clearTimeout(timeoutId);
      setSharing(false);
    }
  };

  const renderTrack = ({ item: track, index }: { item: LibraryTrack; index: number }) => (
    <View style={styles.trackRow}>
      {track.coverUrl ? (
        <Image source={{ uri: track.coverUrl }} style={styles.trackCover} />
      ) : (
        <View style={[styles.trackCover, styles.trackCoverPlaceholder]}>
          <Text style={styles.trackIndexFallback}>{index + 1}</Text>
        </View>
      )}
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
        <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>
      </View>
      <TouchableOpacity
        style={styles.shareTrackButton}
        onPress={() => openPickerForTrack(track)}
        disabled={sharing}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="paper-plane-outline" size={18} color="#555" />
      </TouchableOpacity>
    </View>
  );

  if (!playlist) return null;

  const pickerTitle = pendingTrack
    ? `Share "${pendingTrack.title}"`
    : `Share "${playlist.name}"`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={pickerVisible ? closePicker : onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          {playlist.coverUrl ? (
            <Image source={{ uri: playlist.coverUrl }} style={styles.cover} />
          ) : (
            <View style={[styles.cover, styles.coverPlaceholder]}>
              <Ionicons name="musical-notes" size={28} color="#555" />
            </View>
          )}
          <View style={styles.headerInfo}>
            <Text style={styles.playlistTitle} numberOfLines={2}>{playlist.name}</Text>
            <Text style={styles.trackCount}>
              {loadingTracks
                ? 'Loading tracks…'
                : `${tracks.length} track${tracks.length !== 1 ? 's' : ''}`}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Track list */}
        {loadingTracks ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.loadingText}>Loading tracks…</Text>
          </View>
        ) : (
          <FlatList
            data={tracks}
            renderItem={renderTrack}
            keyExtractor={(t, i) => `${t.id}-${i}`}
            style={styles.list}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No tracks found in this playlist</Text>
            }
            ListFooterComponent={<View style={{ height: 20 }} />}
          />
        )}

        {/* Footer: share whole playlist */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.shareButton,
              (sharing || loadingTracks || tracks.length === 0) && styles.shareButtonDisabled,
            ]}
            onPress={openPickerForPlaylist}
            disabled={sharing || loadingTracks || tracks.length === 0}
            activeOpacity={0.8}
          >
            {sharing ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={18} color="#000" />
                <Text style={styles.shareButtonText}>Share Playlist with Friend</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Inline friend picker overlay — avoids stacking two Modals (broken on iOS) */}
        {pickerVisible && (
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle} numberOfLines={1}>{pickerTitle}</Text>
                <TouchableOpacity onPress={closePicker} style={styles.closeButton}>
                  <Text style={styles.closeText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.pickerMessageRow}>
                <TextInput
                  style={styles.pickerMessageInput}
                  placeholder="Add a message (optional)"
                  placeholderTextColor="#555"
                  value={pickerMessage}
                  onChangeText={setPickerMessage}
                  maxLength={200}
                />
              </View>

              <Text style={styles.pickerSectionLabel}>Choose a friend</Text>

              <ScrollView style={styles.pickerList}>
                {friends.length === 0 ? (
                  <Text style={styles.pickerEmptyText}>
                    No friends yet. Add some from the Friends tab!
                  </Text>
                ) : (
                  friends.map((friendship) => {
                    if (!user) return null;
                    const friend = resolveFriend(friendship, user.id);
                    if (!friend) return null;
                    const initials = (
                      friend.display_name[0] ?? friend.username[0] ?? '?'
                    ).toUpperCase();
                    return (
                      <TouchableOpacity
                        key={friendship.id}
                        style={styles.pickerFriendRow}
                        onPress={() => handleFriendSelected(friend)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.pickerAvatar}>
                          <Text style={styles.pickerAvatarText}>{initials}</Text>
                        </View>
                        <View style={styles.pickerFriendInfo}>
                          <Text style={styles.pickerFriendName}>{friend.display_name}</Text>
                          <Text style={styles.pickerFriendUsername}>@{friend.username}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
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
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  closeButton: {
    padding: 4,
  },
  closeText: {
    color: '#666',
    fontSize: 18,
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
  list: {
    flex: 1,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
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
  trackIndexFallback: {
    color: '#555',
    fontSize: 13,
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
  shareTrackButton: {
    padding: 4,
  },
  separator: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginLeft: 72,
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
  shareButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  shareButtonDisabled: {
    opacity: 0.4,
  },
  shareButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  // Inline friend picker overlay
  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#0f0f0f',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '75%',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  pickerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    marginRight: 12,
  },
  pickerMessageRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  pickerMessageInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  pickerSectionLabel: {
    color: '#555',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 6,
  },
  pickerList: {
    flexGrow: 0,
  },
  pickerEmptyText: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 32,
  },
  pickerFriendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  pickerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerAvatarText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '700',
  },
  pickerFriendInfo: {
    flex: 1,
  },
  pickerFriendName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  pickerFriendUsername: {
    color: '#666',
    fontSize: 13,
  },
});
