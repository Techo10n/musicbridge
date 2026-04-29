import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { sendPushNotification } from '../lib/notifications';
import * as Spotify from '../lib/spotify';
import * as AppleMusic from '../lib/appleMusic';
import * as YouTubeMusic from '../lib/youtubeMusic';
import { extractYouTubeTrackInfo } from '../lib/youtubeMusic';
import { useAuth } from '../hooks/useAuth';
import { MusicService, SpotifyTrack, AppleMusicTrack, YouTubeTrack, User } from '../types';
import { serviceName } from './ServiceBadge';
import { resolveArtworkUrl as resolveAppleMusicArtwork } from '../lib/appleMusic';
import { withTimeout } from '../lib/utils';

interface SearchResult {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  // Raw result for resolving across services
  raw: SpotifyTrack | AppleMusicTrack | YouTubeTrack;
}

interface ShareModalProps {
  visible: boolean;
  recipient: User | null;
  onClose: () => void;
  onShared: () => void;
}

export function ShareModal({ visible, recipient, onClose, onShared }: ShareModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState('');

  const { user } = useAuth();
  const primaryService = user?.primary_service as MusicService | null;

  const handleSearch = useCallback(async () => {
    if (!query.trim() || !user || !primaryService) return;

    setSearching(true);
    setResults([]);

    try {
      let mapped: SearchResult[] = [];

      switch (primaryService) {
        case 'spotify': {
          const tracks = await Spotify.searchTracks(user.id, query.trim());
          mapped = tracks.map((t) => ({
            id: t.id,
            title: t.name,
            artist: t.artists.map((a) => a.name).join(', '),
            coverUrl: t.album.images[0]?.url ?? '',
            raw: t,
          }));
          break;
        }
        case 'apple_music': {
          const tracks = await AppleMusic.searchTracks(user.id, query.trim());
          mapped = tracks.map((t) => ({
            id: t.id,
            title: t.attributes.name,
            artist: t.attributes.artistName,
            coverUrl: t.attributes.artwork
              ? resolveAppleMusicArtwork(t.attributes.artwork.url, 300)
              : '',
            raw: t,
          }));
          break;
        }
        case 'youtube_music': {
          const tracks = await YouTubeMusic.searchTracks(user.id, query.trim());
          mapped = tracks.map((t) => {
            const info = extractYouTubeTrackInfo(t.snippet.channelTitle, t.snippet.title);
            return {
              id: t.id.videoId,
              title: info.title,
              artist: info.artist,
              coverUrl: t.snippet.thumbnails.medium.url,
              raw: t,
            };
          });
          break;
        }
      }

      setResults(mapped);
    } catch (err) {
      console.error('[ShareModal] search error:', err);
    } finally {
      setSearching(false);
    }
  }, [query, user, primaryService]);

  useEffect(() => {
    if (!visible) return;
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      void handleSearch();
    }, 200);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [handleSearch, query, visible]);

  const handleShare = async (result: SearchResult) => {
    if (!user || !recipient || !primaryService) return;

    setSharing(true);

    try {
      // The sender only provides the ID for their active primary service.
      // Other services will be lazily resolved by the recipient using their own tokens.
      const spotifyId = primaryService === 'spotify' ? result.id : null;
      const appleMusicId = primaryService === 'apple_music' ? result.id : null;
      const youtubeMusicId = primaryService === 'youtube_music' ? result.id : null;

      const { data: insertedItem, error } = await withTimeout(
        Promise.resolve(
          supabase.from('shared_items').insert({
            sender_id: user.id,
            recipient_id: recipient.id,
            type: 'song',
            title: result.title,
            artist: result.artist,
            cover_image_url: result.coverUrl,
            spotify_id: spotifyId,
            apple_music_id: appleMusicId,
            youtube_music_id: youtubeMusicId,
            message: message.trim() || null,
          }).select('id').single(),
        ),
        15_000,
      );

      if (error) throw error;

      sendPushNotification(
        recipient.id,
        'new_share',
        insertedItem.id,
      );

      Alert.alert('Sent!', `Shared "${result.title}" with ${recipient.display_name}.`);
      onShared();
      handleClose();
    } catch (err: any) {
      const msg = err instanceof Error && err.message === 'timeout'
        ? 'Share timed out. Check your connection and try again.'
        : 'Failed to share. Please try again.';
      Alert.alert('Error', msg);
      console.error('[ShareModal] share error:', err);
    } finally {
      setSharing(false);
    }
  };

  const handleClose = () => {
    setQuery('');
    setResults([]);
    setMessage('');
    onClose();
  };

  const [sentResult, setSentResult] = useState<string | null>(null);

  const handleShareAndTrack = async (result: SearchResult) => {
    setSentResult(result.id);
    await handleShare(result);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Dim overlay */}
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose} />

      {/* Bottom sheet */}
      <View style={styles.sheet}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header: Send to + close */}
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Send to</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colors.fg3} />
          </TouchableOpacity>
        </View>

        {/* Recipient card */}
        {recipient && (
          <View style={styles.recipientCard}>
            {recipient.avatar_url
              ? <Image source={{ uri: recipient.avatar_url }} style={styles.recipientAvatar} />
              : (
                <View style={styles.recipientAvatarFallback}>
                  <Text style={styles.recipientInitials}>
                    {recipient.display_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                  </Text>
                </View>
              )
            }
            <View style={styles.recipientInfo}>
              <Text style={styles.recipientName}>{recipient.display_name}</Text>
              <Text style={styles.recipientUsername}>@{recipient.username}</Text>
            </View>
            <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
          </View>
        )}

        {/* Search bar — pill style */}
        <View style={styles.searchPill}>
          <Ionicons name="search-outline" size={16} color={colors.fg3} />
          <TextInput
            style={styles.searchPillInput}
            placeholder={primaryService ? `Search ${serviceName(primaryService)}…` : 'Search songs…'}
            placeholderTextColor={colors.fg4}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searching && <ActivityIndicator size="small" color={colors.primary} />}
        </View>

        {/* Results */}
        <FlatList
          data={results}
          keyExtractor={r => r.id}
          style={styles.list}
          contentContainerStyle={{ paddingBottom: 80 }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            !searching ? (
              <Text style={styles.emptyText}>
                {query ? 'No results found' : 'Search for a song to share'}
              </Text>
            ) : null
          }
          renderItem={({ item: result }) => {
            const isSent = sentResult === result.id;
            return (
              <TouchableOpacity
                style={styles.resultRow}
                onPress={() => handleShareAndTrack(result)}
                disabled={sharing}
                activeOpacity={0.8}
              >
                {result.coverUrl
                  ? <Image source={{ uri: result.coverUrl }} style={styles.resultCover} />
                  : <View style={[styles.resultCover, styles.resultCoverPlaceholder]}><Ionicons name="musical-note" size={18} color={colors.fg4} /></View>
                }
                <View style={styles.resultInfo}>
                  <Text style={styles.resultTitle} numberOfLines={1}>{result.title}</Text>
                  <Text style={styles.resultArtist} numberOfLines={1}>{result.artist}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.sendBtn, isSent && styles.sendBtnSent]}
                  onPress={() => handleShareAndTrack(result)}
                  disabled={sharing}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {sharing && isSent
                    ? <ActivityIndicator size="small" color={isSent ? colors.primaryInk : colors.fg} />
                    : <Text style={[styles.sendBtnText, isSent && styles.sendBtnTextSent]}>{isSent ? 'Sent' : 'Send'}</Text>
                  }
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />

        {/* Fixed bottom bar: message + send */}
        <View style={styles.bottomBar}>
          <TextInput
            style={styles.messageInput}
            placeholder="Add a message…"
            placeholderTextColor={colors.fg4}
            value={message}
            onChangeText={setMessage}
            maxLength={200}
          />
          <TouchableOpacity
            style={[styles.sendAllBtn, (!results.length || sharing) && styles.sendAllBtnDisabled]}
            disabled={!results.length || sharing}
            activeOpacity={0.85}
          >
            <Ionicons name="paper-plane" size={14} color={colors.primaryInk} />
            <Text style={styles.sendAllBtnText}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: '82%',
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -20 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 20,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.line2,
    alignSelf: 'center', marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12,
  },
  sheetTitle: { fontSize: 22, fontWeight: '700', color: colors.fg, letterSpacing: -0.4 },

  recipientCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: colors.bgCard, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: colors.line,
  },
  recipientAvatar: { width: 44, height: 44, borderRadius: 22 },
  recipientAvatarFallback: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.bgElev, alignItems: 'center', justifyContent: 'center',
  },
  recipientInitials: { fontSize: 16, fontWeight: '700', color: colors.fg2 },
  recipientInfo: { flex: 1 },
  recipientName: { fontSize: 15, fontWeight: '600', color: colors.fg },
  recipientUsername: { fontSize: 12, color: colors.fg3, marginTop: 1 },

  searchPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: colors.bgInput, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.line,
  },
  searchPillInput: { flex: 1, color: colors.fg, fontSize: 14 },

  list: { flex: 1 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 11, gap: 12,
  },
  resultCover: {
    width: 48, height: 48, borderRadius: 8,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  resultCoverPlaceholder: { backgroundColor: colors.bgCard },
  resultInfo: { flex: 1 },
  resultTitle: { color: colors.fg, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  resultArtist: { color: colors.fg3, fontSize: 12 },

  sendBtn: {
    borderRadius: 999, borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  sendBtnSent: { backgroundColor: colors.primary, borderColor: colors.primary },
  sendBtnText: { fontSize: 13, fontWeight: '600', color: colors.fg },
  sendBtnTextSent: { color: colors.primaryInk },

  separator: { height: 1, backgroundColor: colors.line, marginLeft: 76 },
  emptyText: { color: colors.fg3, fontSize: 14, textAlign: 'center', marginTop: 48 },

  bottomBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
  messageInput: {
    flex: 1, backgroundColor: colors.bgInput, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 10,
    color: colors.fg, fontSize: 13,
    borderWidth: 1, borderColor: colors.line,
  },
  sendAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: 999,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  sendAllBtnDisabled: { opacity: 0.4 },
  sendAllBtnText: { color: colors.primaryInk, fontSize: 13, fontWeight: '700' },
});
