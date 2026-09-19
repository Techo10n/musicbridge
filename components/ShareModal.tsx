import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { makeStyles, useTheme } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { sendPushNotification } from '../lib/notifications';
import * as Spotify from '../lib/spotify';
import * as AppleMusic from '../lib/appleMusic';
import * as YouTubeMusic from '../lib/youtubeMusic';
import { extractYouTubeTrackInfo } from '../lib/youtubeMusic';
import { useAuth } from '../hooks/useAuth';
import { MusicService, SpotifyTrack, AppleMusicTrack, YouTubeTrack, User } from '../types';
import { serviceLabel } from '../lib/services';
import { useToast } from './ui';
import { resolveArtworkUrl as resolveAppleMusicArtwork } from '../lib/appleMusic';
import { cleanTitle, withTimeout } from '../lib/utils';

interface SearchResult {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  // YouTube only: true when the result came from an "Artist - Topic" channel.
  ytTopicVerified?: boolean;
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
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
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
            const channel = t.snippet.channelTitle?.toLowerCase() ?? '';
            return {
              id: t.id.videoId,
              title: cleanTitle(info.title),
              artist: info.artist,
              coverUrl: t.snippet.thumbnails.medium.url,
              ytTopicVerified: channel.endsWith(' - topic') || channel === 'topic',
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
    const isEmpty = !query.trim();
    const timeoutId = setTimeout(() => {
      if (isEmpty) {
        setResults([]);
        setSearching(false);
        return;
      }
      void handleSearch();
    }, isEmpty ? 0 : 200);

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
      // Same rule as the library share paths: only store a YouTube id that is a
      // canonical Topic-channel song. searchTracks() sorts Topic results first
      // but still returns non-Topic videos, so the flag has to be checked.
      const youtubeMusicId =
        primaryService === 'youtube_music' && result.ytTopicVerified ? result.id : null;

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

      toast.show({ kind: 'success', message: `Sent "${result.title}" to ${recipient.display_name}` });
      onShared();
      handleClose();
    } catch (err: any) {
      const msg = err instanceof Error && err.message === 'timeout'
        ? 'Share timed out. Check your connection and try again.'
        : 'Failed to share. Please try again.';
      toast.show({ kind: 'error', message: msg });
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
            <Ionicons name="close" size={22} color={colors.text3} />
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
            <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
          </View>
        )}

        {/* Search bar — pill style */}
        <View style={styles.searchPill}>
          <Ionicons name="search-outline" size={16} color={colors.text3} />
          <TextInput
            style={styles.searchPillInput}
            placeholder={primaryService ? `Search ${serviceLabel(primaryService)}…` : 'Search songs…'}
            placeholderTextColor={colors.text4}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searching && <ActivityIndicator size="small" color={colors.accent} />}
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
                  : <View style={[styles.resultCover, styles.resultCoverPlaceholder]}><Ionicons name="musical-note" size={18} color={colors.text4} /></View>
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
                    ? <ActivityIndicator size="small" color={isSent ? colors.accentInk : colors.text} />
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
            placeholderTextColor={colors.text4}
            value={message}
            onChangeText={setMessage}
            maxLength={200}
          />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing, type, elevation }) => ({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
  },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: '82%',
    paddingTop: 10,
    ...elevation.sheet,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.lineStrong,
    alignSelf: 'center', marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12,
  },
  sheetTitle: { fontSize: 22, fontWeight: '700', color: colors.text, letterSpacing: -0.4 },

  recipientCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: colors.surface, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: colors.line,
  },
  recipientAvatar: { width: 44, height: 44, borderRadius: 22 },
  recipientAvatarFallback: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.bgElev, alignItems: 'center', justifyContent: 'center',
  },
  recipientInitials: { fontSize: 16, fontWeight: '700', color: colors.text2 },
  recipientInfo: { flex: 1 },
  recipientName: { fontSize: 15, fontWeight: '600', color: colors.text },
  recipientUsername: { fontSize: 12, color: colors.text3, marginTop: 1 },

  searchPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: colors.surfaceAlt, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.line,
  },
  searchPillInput: { flex: 1, color: colors.text, fontSize: 14 },

  list: { flex: 1 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 11, gap: 12,
  },
  resultCover: {
    width: 48, height: 48, borderRadius: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  resultCoverPlaceholder: { backgroundColor: colors.surface },
  resultInfo: { flex: 1 },
  resultTitle: { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  resultArtist: { color: colors.text3, fontSize: 12 },

  sendBtn: {
    borderRadius: 999, borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  sendBtnSent: { backgroundColor: colors.accent, borderColor: colors.accent },
  sendBtnText: { fontSize: 13, fontWeight: '600', color: colors.text },
  sendBtnTextSent: { color: colors.accentInk },

  separator: { height: 1, backgroundColor: colors.line, marginLeft: 76 },
  emptyText: { color: colors.text3, fontSize: 14, textAlign: 'center', marginTop: 48 },

  bottomBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
  messageInput: {
    flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 10,
    color: colors.text, fontSize: 13,
    borderWidth: 1, borderColor: colors.line,
  },
  sendAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.accent, borderRadius: 999,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  sendAllBtnDisabled: { opacity: 0.4 },
  sendAllBtnText: { color: colors.accentInk, fontSize: 13, fontWeight: '700' },
}));
